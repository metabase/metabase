# Generate OpenAPI types

Metabase generates Enterprise API types from backend source. The OpenAPI spec
and TypeScript declarations are derived files and aren't committed.

## Use the generation commands

Run the standard freshness check:

```sh
bun run types:ensure
```

The command exits quickly when the existing types are current. Otherwise, it
generates `.tmp/openapi/openapi.json` and writes declarations to
`frontend/src/metabase-types/openapi/`.

Use the other commands when you need a specific result:

| Command                              | Result                                                             |
| ------------------------------------ | ------------------------------------------------------------------ |
| `bun run types:ensure --force-local` | Regenerates the spec and types from the checked-out Clojure source |
| `bun run openapi:generate`           | Generates only `.tmp/openapi/openapi.json`                         |
| `bun run openapi:lint`               | Validates the generated spec with Redocly                          |

`bun install` checks freshness and starts generation in the background when
needed. Background output goes to `.tmp/openapi/types-ensure.log`.

## How freshness works

`.tmp/openapi/generation.json` records hashes for the backend source, type
generator, OpenAPI spec, and generated declarations. `types:ensure` compares
those hashes with the current files before deciding whether to regenerate.

For speed, a stale run may fetch the spec from the running Enterprise backend
at `localhost:${MB_JETTY_PORT:-3000}`. Backend-generated types aren't marked as
source-fresh because the process may have loaded different source. When the
checked-out backend source changes, `types:ensure` always generates locally.
CI also uses `--force-local` before linting and type-checking.

Local generation compares source hashes before and after running Clojure and
retries when it detects an edit. Run generation while source files are stable;
an exact edit and revert during generation is outside the freshness guarantee.

## Recover from interrupted generation

Postinstall, type-checking, and manual commands can request generation at the
same time. `.tmp/openapi/types-ensure.lock` prevents those processes from
repeating the expensive Clojure and type-generation work.

The lock is only an optimization. Declarations are staged before publication,
the changing declaration file is replaced atomically, and generation state
records the staged hash. Correctness doesn't depend on holding the lock.

The lock holder refreshes its timestamp every 5 seconds. A lock with no refresh
for 30 seconds is removed automatically. Regular commands wait up to 60
seconds, then continue without the lock. Postinstall workers don't wait when
another generator is already running.

If a process appears stuck, remove the lock:

```sh
rm -rf .tmp/openapi/types-ensure.lock
```

To reset all generated state, remove the temporary directory:

```sh
rm -rf .tmp/openapi
bun run types:ensure
```
