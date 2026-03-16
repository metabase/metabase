# Cross-Version Migration Testing

Tests Metabase database migrations across version upgrades and downgrades.

## Quick Start

```bash
# Test upgrade (OSS)
./test.sh --source v0.58.6 --target v0.58.7

# Test downgrade (OSS)
./test.sh --source v0.58.7 --target v0.58.6

# Test Enterprise edition (use v1.x.x)
./test.sh --source v1.58.6 --target v1.58.7
```

Edition is inferred from version prefix: `v0.x.x` = OSS, `v1.x.x` = EE.

## Requirements

- Docker
- Docker Compose v2
- Bun (for version helpers CLI)

## How It Works

### Upgrade Test
1. Start PostgreSQL container
2. Start SOURCE Metabase version, wait for healthy
3. Stop SOURCE container (PostgreSQL persists)
4. Start TARGET version - migrations run automatically
5. Verify health check passes

### Downgrade Test
1. Start PostgreSQL container
2. Start SOURCE (newer) Metabase version, wait for healthy
3. Stop SOURCE container
4. Start TARGET (older) version - expects refusal
5. Run `migrate down` command
6. Start TARGET version again
7. Verify health check passes

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `METABASE_PORT` | 3000 | Port to expose Metabase |
| `HEALTH_TIMEOUT` | 120 | Seconds to wait for health check |

## CI

The GitHub workflow (`.github/workflows/cross-version.yml`) supports:
- **Manual trigger**: Specify source/target versions
- **Nightly schedule**: Runs predefined version matrix
