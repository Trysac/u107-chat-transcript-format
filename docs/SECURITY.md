# Security

## Threat Model

### Defended

- **Remote Code & Data Exfiltration**: The library contains zero network I/O and zero dependencies. Remote URLs are explicitly rejected; only local `data:` base64 URI schemes are processed.
- **Denial of Service (DoS)**: The library enforces strict default limits of 10,000 messages and 1,000,000 UTF-16 code units. Inputs exceeding these thresholds trigger a `TranscriptError` immediately.
- **Sensitive Information Leakage**: Exception messages truncate the problematic input to under 200 characters, preventing full prompts or secrets from appearing in error logs.

### Not Defended

- **Input Injection**: The library treats provided string content as opaque data. Users are responsible for sanitizing content before passing it to downstream LLM APIs.
- **Resource Exhaustion (Memory)**: While message counts are limited, the library does not enforce hard memory limits beyond what the Node.js runtime imposes on the heap.