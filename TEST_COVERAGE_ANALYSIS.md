# Test Coverage Analysis — E-Minded QA Pipeline v2.0

## Current State

**Test files:** 0  
**Test framework:** None configured  
**CI/CD pipeline:** None  
**Linting:** None  

The codebase currently has **zero automated tests**. Every code change is verified only by manual testing in production, which creates significant risk for a pipeline that processes real customer calls and writes to CRM records.

---

## Codebase Summary

| Module | File | Lines | Purpose | Testability |
|--------|------|-------|---------|-------------|
| Server | `server.js` | 237 | Express webhooks, pipeline orchestration | Medium — needs supertest for HTTP, mocking for async pipeline |
| Analyze | `src/analyze.js` | 176 | Claude router + QA evaluation | Medium — pure logic (prompt loading, JSON parsing) + API calls to mock |
| Transcribe | `src/transcribe.js` | 103 | Deepgram speech-to-text | Medium — `buildTranscript()` is pure; API calls need mocking |
| GHL | `src/ghl.js` | 159 | CRM integration & note formatting | **High** — `normalizePhone()` and `formatQANote()` are pure functions |
| CallTools | `src/calltools.js` | 37 | Call Tools API integration | Low — thin API wrapper, mostly mocked tests |

---

## Priority Areas for Testing

### P0 — Critical (pure functions, high business impact)

#### 1. `ghl.js` — `normalizePhone(phone)`
**Risk:** If phone normalization fails, QA notes are silently lost (contact not found in GHL).  
**What to test:**
- 10-digit US numbers → `+1XXXXXXXXXX`
- Numbers already starting with `+` → preserved
- 11-digit numbers with country code → `+XXXXXXXXXXX`
- Null/undefined/empty input → `null`
- Numbers with formatting characters `(555) 123-4567` → cleaned
- Edge cases: very short numbers, international formats

#### 2. `ghl.js` — `formatQANote(qa)`
**Risk:** Malformed notes in CRM confuse QA managers reviewing agent performance.  
**What to test:**
- Complete QA object with all fields → properly formatted note
- Missing optional fields (no `errores_criticos`, no `objeciones`) → graceful fallback
- Different `nivel` values → correct emoji mapping (`Excelente` → `🟢`, etc.)
- Unknown `nivel` → default emoji `⚪`
- Different desglose formats (`desglose_etapas`, `desglose_fases`, `desglose_pasos`) → all handled
- Errores with `detectado: false` → filtered out
- Empty arrays for puntos_fuertes/areas_mejora → no crash

#### 3. `analyze.js` — `loadPrompt(filename)`
**Risk:** If prompt loading fails or extracts wrong content, all QA evaluations are broken.  
**What to test:**
- Valid prompt file with ``` delimiters → extracts content between backticks
- Prompt file without ``` delimiters → returns full content
- Non-existent file → throws meaningful error
- Prompt map keys match expected classification outputs

#### 4. `analyze.js` — JSON extraction from Claude responses
**Risk:** Claude occasionally returns JSON wrapped in markdown or extra text. If parsing fails, the entire pipeline fails silently.  
**What to test:**
- Clean JSON response → parsed correctly
- JSON wrapped in markdown code block → extracted and parsed
- JSON with surrounding text → extracted
- No JSON in response → throws descriptive error
- Malformed JSON → throws descriptive error

### P1 — Important (API integration, mocked)

#### 5. `transcribe.js` — `buildTranscript(result)`
**Risk:** If transcript formatting is wrong, Claude evaluates garbage and scores are meaningless.  
**What to test:**
- Result with utterances → `"Speaker 0: text\nSpeaker 1: text"` format
- Result without utterances → falls back to channel transcript
- Empty utterances array → falls back correctly
- Multiple speakers properly labeled

#### 6. `transcribe.js` — `transcribeCall(recordingUrl)` (mocked)
**Risk:** Fallback logic (URL direct → buffer download) silently swallows real errors.  
**What to test:**
- Successful direct URL transcription → returns transcript
- 403/401 on direct URL → falls back to buffer download
- Timeout on direct URL → falls back to buffer download
- Other errors on direct URL → **re-throws** (not swallowed)
- Missing `DEEPGRAM_API_KEY` → throws immediately
- Both methods fail → throws descriptive error

#### 7. `analyze.js` — `analyzeCall()` orchestration (mocked)
**Risk:** Router misclassification sends calls to wrong QA prompt, producing invalid scores.  
**What to test:**
- Router returns `lead_solar` → uses `lead-solar.md` prompt
- Router returns `reagendar` → uses `reagendar.md` (no vertical suffix)
- Router returns unknown type → triggers fallback analysis
- Low confidence scores → logs warnings
- `agentName` from webhook overrides "No identificado" from Claude
- `agentName` does NOT override a valid agent name from Claude

#### 8. `calltools.js` — `getCallLog(callId)` (mocked)
**What to test:**
- Normalizes `recording_url` field from various source field names
- Returns `null` recording_url when no recording field exists
- API error handling

### P2 — Integration Tests

#### 9. `server.js` — Webhook endpoints (supertest)
**Risk:** Webhook rejects valid payloads or processes invalid ones.  
**What to test:**
- `POST /webhook/calltools` with valid payload → 200, triggers pipeline
- `POST /webhook/calltools` without `recordingUrl` → 200 response, logs error, no processing
- `POST /webhook/solar` → routes to solar campaign config
- `POST /webhook/mitigacion` → routes to mitigacion campaign config
- `GET /health` → returns status JSON with correct structure
- Multipart form data payloads (multer) handled correctly

#### 10. `server.js` — `processCall()` orchestration (mocked dependencies)
**Risk:** Pipeline silently fails at any step and doesn't report errors properly.  
**What to test:**
- Missing `recordingUrl` → aborts early
- Missing `phoneNumber` → skips GHL save but completes analysis
- Transcription failure → aborts, logs error
- Empty transcript → aborts
- Claude analysis failure → aborts, logs error
- GHL save failure → logs error but doesn't crash pipeline

### P3 — Nice to Have

#### 11. Prompt file integrity
**What to test:**
- All `.md` files in `prompts/` are valid and loadable
- All prompt files contain `{{TRANSCRIPCION}}` placeholder
- Router prompt produces valid JSON structure
- PROMPT_MAP keys align with router's possible output combinations

#### 12. Environment variable validation
**What to test:**
- Missing `DEEPGRAM_API_KEY` → caught early
- Missing `ANTHROPIC_API_KEY` → caught early
- Missing `GHL_TOKEN` → caught at save time with clear message

---

## Recommended Test Infrastructure

### Framework: Jest
- Standard for Node.js, zero-config for most cases
- Built-in mocking (`jest.mock()`) for API dependencies
- `--coverage` flag for coverage reporting

### Additional Packages
- **`supertest`** — HTTP assertions for Express endpoints without starting the server
- No other test-specific dependencies needed

### Suggested `package.json` additions
```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.0"
  }
}
```

### Suggested Directory Structure
```
__tests__/
  ghl.test.js          # P0: normalizePhone, formatQANote
  analyze.test.js       # P0/P1: loadPrompt, JSON parsing, orchestration
  transcribe.test.js    # P1: buildTranscript, transcribeCall (mocked)
  calltools.test.js     # P1: getCallLog (mocked)
  server.test.js        # P2: webhook endpoints (supertest)
```

---

## Risk Assessment

| Failure Mode | Impact | Likelihood Without Tests | Priority |
|---|---|---|---|
| Phone normalization bug → notes lost | **High** — QA data silently disappears | Medium | P0 |
| Prompt loading breaks → all evals fail | **Critical** — entire pipeline down | Low | P0 |
| JSON parsing fails → pipeline crash | **High** — call not evaluated | Medium | P0 |
| Transcript formatting wrong → bad scores | **High** — misleading QA scores | Low | P1 |
| Webhook rejects valid payloads | **Critical** — calls not processed | Low | P2 |
| GHL note formatting breaks | **Medium** — unreadable notes | Low | P0 |
| Deepgram fallback swallows real errors | **Medium** — silent failures | Medium | P1 |

---

## Estimated Coverage After Implementation

| Module | Current | After P0 | After P0+P1 | After All |
|--------|---------|----------|-------------|-----------|
| `ghl.js` | 0% | ~60% | ~75% | ~85% |
| `analyze.js` | 0% | ~30% | ~65% | ~80% |
| `transcribe.js` | 0% | 0% | ~55% | ~70% |
| `calltools.js` | 0% | 0% | ~70% | ~80% |
| `server.js` | 0% | 0% | 0% | ~60% |
| **Overall** | **0%** | **~20%** | **~45%** | **~70%** |
