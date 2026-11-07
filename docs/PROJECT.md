# Project record: chat-transcript-format

## Objective

Provide a robust, lossless, and strict conversion utility for chat transcripts between OpenAI, Anthropic, and Gemini formats. This tool ensures that role, system prompt, and content integrity are maintained, specifically for developers who need to switch model providers without manual rewriting.

## Scope

In scope:

- Parsing and rendering for `openai`, `anthropic`, and `gemini` formats.
- Preservation of text and base64 inline images.
- Hoisting of OpenAI system/developer messages into a unified system prompt.
- Merging of consecutive Anthropic messages to ensure turn alternation.
- Strict validation of input against predefined limits (`maxMessages`, `maxChars`).
- CLI runner implementation.

Out of scope:

- Handling of tool calls, tool results, audio parts, or file parts.
- Streaming support or chunk-based processing.
- Native token counting (this library uses character counts as a proxy).

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Measured values only. Leave "pending measurement" until a real figure is recorded; never estimate here.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 145575 / 17153 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.0562 | factory ledger |

## Factory run u107 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4421 | 14405 | 0 | 0 | 0.0287 |
| audit | gemini-3.1-flash-lite | no | 32646 | 197 | 0 | 28523 | 0.0092 |
| fix-1 | gemini-3.1-flash-lite | no | 20268 | 248 | 0 | 10172 | 0.0057 |
| fix-2 | gemini-3.1-flash-lite | no | 17751 | 200 | 0 | 14154 | 0.0051 |
| docs | gemini-3.1-flash-lite | no | 17640 | 2103 | 0 | 0 | 0.0076 |

Total: $0.0562. Prices: Anthropic list prices.
