# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suites in `test/`.
- Coverage is collected with V8 (`@vitest/coverage-v8`) over `src/`.

## Tests

- `test/cli.test.ts`: Validates CLI execution patterns. Covers usage errors (missing arguments, unexpected arguments), IO failures (non-existent file, invalid JSON), and verifies that valid conversions return code 0 and proper JSON output.
- `test/index.test.ts`: Acceptance tests for the library core. Covers:
  - Deep equality of conversions (OpenAI to Gemini).
  - Round-trip fidelity (Anthropic -> OpenAI -> Anthropic).
  - Correct handling of image parts (data URLs).
  - Error code validation (`UNSUPPORTED_PART`, `UNSUPPORTED_ROLE`, `INVALID_INPUT`, `TOO_MANY_MESSAGES`, `TOO_LARGE`).
  - Edge case handling: empty messages, assistant-first transcripts, system-only transcripts, unicode support, and mixed text/image parts order.
  - Immutability of the input transcript.
  - Custom limit enforcement.