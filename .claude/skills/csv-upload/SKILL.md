---
name: csv-upload
description: Upload CSV files to Metabase via MCP tools, with automatic chunking for large files
---

# CSV Upload via MCP

Upload CSV files to Metabase using the `upload_csv` and `append_csv` MCP tools.
These tools return curl commands that you execute in a shell.

## Step 1: Assess the file

```bash
wc -l < /path/to/file.csv    # line count
wc -c < /path/to/file.csv    # byte count
head -1 /path/to/file.csv    # inspect the header row
```

## Step 2: Choose strategy

- **Small file (< 50,000 lines or < 5 MB)**: upload in one shot with `upload_csv`.
- **Large file**: split into chunks and upload the first chunk with `upload_csv`, then append the rest with `append_csv`.

## Step 3a: Small file — single upload

1. Call the `upload_csv` tool with `file_path` and optional `collection_id`.
2. Execute the returned curl command.
3. Note the model ID (response body) and table ID (`metabase-table-id` header).

## Step 3b: Large file — chunked upload

### Splitting rules

- Every chunk file MUST start with the original header row (line 1).
- Data rows are split evenly across chunks. No data row appears in more than one chunk.
- Target ~30,000 data rows per chunk (adjust if rows are very wide).

### Split procedure

```bash
# Configuration
FILE="/path/to/file.csv"
CHUNK_DIR="/tmp/csv-chunks-$$"
ROWS_PER_CHUNK=30000

mkdir -p "$CHUNK_DIR"

# Extract header
head -1 "$FILE" > "$CHUNK_DIR/header.csv"

# Split data rows (everything after the header) into numbered files
tail -n +2 "$FILE" | split -l "$ROWS_PER_CHUNK" -d -a 4 - "$CHUNK_DIR/data_"

# Prepend header to each chunk
for chunk in "$CHUNK_DIR"/data_*; do
  chunk_file="$CHUNK_DIR/chunk_$(basename "$chunk").csv"
  cat "$CHUNK_DIR/header.csv" "$chunk" > "$chunk_file"
  rm "$chunk"
done

rm "$CHUNK_DIR/header.csv"
ls -la "$CHUNK_DIR"/chunk_*.csv
```

### Upload procedure

1. **First chunk** — use `upload_csv` tool:
   - `file_path`: path to the first chunk file
   - `collection_id`: target collection (optional)
   - Execute the returned curl command
   - **Save the `metabase-table-id` header from the response** — you need it for appends

2. **Remaining chunks** — use `append_csv` tool for each:
   - `file_path`: path to the next chunk file
   - `table_id`: the table ID from step 1
   - Execute each returned curl command sequentially
   - Verify HTTP 200 before proceeding to the next chunk

3. **Cleanup**:
   ```bash
   rm -rf "$CHUNK_DIR"
   ```

### Error handling

- If an `append_csv` fails, do NOT skip it. Diagnose the error first.
- Common issues: schema mismatch (columns don't match the original), encoding problems, or auth token expired.
- If the session expired mid-upload, get a new session and re-run the `append_csv` tool to get a fresh curl command.

## Available tools reference

| Tool | Input | Purpose |
|------|-------|---------|
| `upload_csv` | `file_path`, `collection_id?` | Create new table + model |
| `append_csv` | `file_path`, `table_id` | Append rows to existing upload table |
| `replace_csv` | `file_path`, `table_id` | Replace all data (destructive) |
