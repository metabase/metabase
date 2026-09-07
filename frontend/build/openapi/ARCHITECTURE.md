# OpenAPI generation internals

`types:ensure` uses three supporting modules to coordinate generation, detect
changes, and decide whether the existing declarations are current:

```text
types:ensure
  ├─ generation-lock       coordinates concurrent runs
  ├─ source-fingerprint    describes the current inputs
  └─ generation-state      records what produced the current output
```

The command acquires the generation lock, fingerprints the current inputs, and
compares them with the saved generation state. It exits when everything
matches. Otherwise, it acquires a current spec, generates and publishes the
declarations, and writes new state.

## `source-fingerprint.ts` detects relevant input changes

The source fingerprint covers the backend files that can affect the OpenAPI
spec:

- `src/**`
- `enterprise/backend/src/**`
- relevant `deps.edn` files
- selected resource files
- the Enterprise generation command and settings

A separate generator fingerprint covers `openapi-ts.config.ts`, `package.json`,
and `bun.lock`.

Fingerprints use sorted paths, file types, and file contents rather than
modification times. This makes the result deterministic and detects changes to
both the source and its generation environment.

**Importance:** high for incremental generation. Without fingerprints,
`types:ensure` would need to regenerate every time or risk reusing declarations
from older source. Always regenerating would remain correct, but would make the
command much more expensive.

## `generation-state.ts` identifies current output

`.tmp/openapi/generation.json` records:

- `sourceDigest`: the backend source that produced the spec
- `generatorDigest`: the configuration and dependencies used to generate types
- `specHash`: the exact OpenAPI document used as input
- `outputsHash`: the resulting declaration files
- `version`: the state format version

State from a running backend omits `sourceDigest` because the source loaded by
another process can't be observed. Those declarations aren't considered fresh
for the checked-out source.

The module validates state before trusting it, treats missing or malformed
state as stale, checks the generated files for changes, and writes new state
with an atomic rename. It also distinguishes a complete Enterprise spec from
an OSS spec.

**Importance:** high. The state connects current inputs to current output.
Without it, `types:ensure` couldn't reliably distinguish current declarations
from missing, modified, incomplete, backend-origin, or outdated declarations.

## `generation-lock.ts` avoids duplicate work

Postinstall, type-checking, and manual commands can invoke `types:ensure` at the
same time. The generation lock prevents those processes from unnecessarily
running Clojure and hey-api in parallel.

`proper-lockfile` provides atomic acquisition, heartbeat updates, stale-lock
recovery, and release. It represents the lock as a directory. The wrapper in
`generation-lock.ts` adds the Metabase policy: regular commands wait for a
bounded time before continuing without the lock, while postinstall workers
never wait. A compromised lock doesn't interrupt generation.

Manually removing and immediately reacquiring the lock can confuse the previous
holder because `proper-lockfile` doesn't attach ownership tokens. That can
allow redundant generation, but it can't corrupt published output.

**Importance:** medium operationally, but low for correctness. Removing the
lock would allow redundant, resource-intensive generation. Correctness instead
comes from staging output, atomically replacing changing files, and checking
output against generation state.

## Relative importance

| Module                  | Responsibility                                | Importance                                |
| ----------------------- | --------------------------------------------- | ----------------------------------------- |
| `generation-state.ts`   | Decide whether existing output can be trusted | High                                      |
| `source-fingerprint.ts` | Detect relevant changes without regenerating  | High for incremental generation           |
| `generation-lock.ts`    | Avoid duplicate concurrent work               | Medium operationally; low for correctness |

The final correctness boundary remains in `ensure-types.ts`: generate from a
stable spec snapshot, stage complete output, publish it, and only then record
the resulting state.
