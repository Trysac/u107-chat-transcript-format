# Stack

## Used

| Tool | Purpose | Why |
|---|---|---|
| TypeScript (strict) | Language and type checking | Ensures the internal model and API are type-safe and consistent. |
| Node.js 20+ | Runtime | Native ESM support with long-term maintenance. |
| Vitest | Testing | Fast, ESM-native test runner. |
| Biome | Lint/Format | Combines linting and formatting in a single, high-performance tool. |
| GitHub Actions | CI | Runs gates and tests in a Linux/Windows environment. |

## Discarded

| Tool | Why not |
|---|---|
| ESLint + Prettier | Redundant; Biome covers both with less configuration. |
| Jest | Slower and requires complex configuration for ESM/TypeScript support. |
| Bundlers | Unnecessary for a simple, dependency-free library; `tsc` suffices. |