# Cross-Version Migration Testing

Tests that Metabase data survives database migrations across version upgrades and downgrades.

Uses Cypress e2e tests to create data on a **source** version, then verify it's intact on a **target** version after migration. The application database is PostgreSQL (matching production), and state is preserved between versions via a Docker volume.

## Scripts

### `test.sh` — CI / production runs

Runs the full migration test end-to-end. Starts source, runs `@source` specs, stops it, starts target, runs `@target` specs.

```bash
./test.sh --source v1.57.6 --target v1.58.3       # upgrade
./test.sh --source v1.58.3 --target v1.57.6       # downgrade
```

We only test Enterprise Edition (`v1.x`) for now. Direction is inferred from version comparison.

For **downgrades**, the script expects the target to refuse startup, then runs cascading `migrate down` (one step per major version) before retrying.

### `dev.sh` — local development

Starts a single Metabase version in Docker with H2 and opens Cypress interactively. Snapshot/restore works via `/api/testing/*` endpoints, controlled by the `CROSS_VERSION_DEV_MODE` env var.

```bash
./dev.sh --version v1.57.6
./dev.sh --version v1.58.3 --port 3001
```

## E2E test specs

Specs live in `e2e/cross-version/` and are organized by major version:

```
e2e/cross-version/
  56/           # specs for v56
  57/           # specs for v57
  latest/       # specs for HEAD / newest versions
```

Each spec file uses `@source` and `@target` tags (via `cypress-grep`) to separate setup from verification. Each folder also contains a `helpers.ts` with version-specific utility functions used by the specs.

### When to create a new versioned folder

The `latest/` folder is the working copy — it targets the current development branch and is used for local dev with `dev.sh`. When a Metabase release introduces a breaking change that makes existing specs fail on older versions (e.g., a renamed UI element, a changed API response), copy `latest/` into a new numbered folder (e.g., `58/`). That snapshot covers all future versions until the next breaking change requires a new folder.

In short: versioned folders are frozen snapshots, `latest/` is the living version.

### Spec resolution

Both `test.sh` and `dev.sh` resolve which spec folder to use for a given version:

1. **Exact match** — `e2e/cross-version/{major}/` if it exists
2. **Closest newer** — the lowest numbered folder >= the major version
3. **Fallback** — `e2e/cross-version/latest/`

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `METABASE_PORT` | `3000` (`3077` in dev) | Port to expose Metabase |
| `HEALTH_TIMEOUT` | `120` | Seconds to wait for health check |
| `CROSS_VERSION_DEV_MODE` | — | Set automatically by `dev.sh`; enables snapshot/restore helpers in specs |

## Requirements

- Docker and Docker Compose v2
- Bun (for `cli.ts` version helpers)
- Node.js with `bunx` (for Cypress)
