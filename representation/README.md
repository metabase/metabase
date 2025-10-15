# Metabase Representations CLI

Babashka-based CLI tool for managing Metabase collections as YAML files for version control.

## Installation

Requires Babashka 1.12.208 or newer.

## Usage

From the `representation/` directory:

```bash
# Show help
bb export --help
bb import --help
bb lint --help

# Export collections
bb export \
  --mb-instance-url https://your-instance.metabase.com \
  --mb-instance-api-key YOUR_API_KEY \
  --manifest manifest.yml \
  --collection sales-reports,marketing-dashboards

# Import collections
bb import \
  --mb-instance-url https://your-instance.metabase.com \
  --mb-instance-api-key YOUR_API_KEY \
  --manifest manifest.yml \
  --collection sales-reports

# Lint/validate collections
bb lint \
  --mb-instance-url https://your-instance.metabase.com \
  --mb-instance-api-key YOUR_API_KEY \
  --manifest manifest.yml \
  --collection sales-reports
```

## Manifest File Format

The manifest file maps collection names to their IDs and local filesystem paths:

```clojure
{:collections
 {"sales-reports" {:id "5" :path "./exports/sales/"}
  "marketing-dashboards" {:id "8" :path "./exports/marketing/"}}}
```

Or use the simplified format (collection name is treated as ID):

```clojure
{:collections
 {"5" "./exports/sales/"
  "8" "./exports/marketing/"}}
```

## Commands

- **export** - Export collections from Metabase instance to local filesystem
- **import** - Import collections from local filesystem to Metabase instance  
- **lint** - Validate collections without importing

## Flags

- `--mb-instance-url URL` - Metabase instance URL (required)
- `--mb-instance-api-key KEY` - Metabase API key (required)
- `--manifest PATH` - Path to manifest file (default: manifest.yml)
- `--collection NAMES` - Comma-separated collection names (required)

## Architecture

- `bb.edn` - Task definitions and configuration
- `representation/` - Source code directory
  - `cli.clj` - CLI argument parsing
  - `util.clj` - Utilities (env vars, debug)
  - `color.clj` - Terminal color functions
  - `http.clj` - HTTP client (TODO: implement)
  - `manifest.clj` - Manifest file handling
  - `export.clj` - Export command
  - `import.clj` - Import command
  - `lint.clj` - Lint command

## Development Status

✅ **Complete:**
- CLI structure and argument parsing
- Help system
- Manifest file parsing
- Command routing
- Error handling with colored output
- Input validation

🚧 **TODO:**
- Implement HTTP client in `http.clj`
- Implement YAML file reading/writing
- Implement payload bundling/unbundling
- Connect to API endpoints (when available)
- Add comprehensive tests

## Debug Mode

Set `REPR_DEBUG=true` to see detailed debug output:

```bash
REPR_DEBUG=true bb export ...
```
