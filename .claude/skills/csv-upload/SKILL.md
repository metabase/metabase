---
name: csv-upload
description: Upload CSV files to Metabase via MCP tools, with automatic chunking for large files
---

# CSV Upload via MCP

Upload CSV data to Metabase using the `upload_csv` and `append_csv` MCP tools.
These tools accept CSV content as a string — no shell commands or curl needed.

## Step 1: Assess the file

```bash
wc -l < /path/to/file.csv    # line count
wc -c < /path/to/file.csv    # byte count
head -1 /path/to/file.csv    # inspect the header row
```

## Step 2: Choose strategy

- **Small file (< 50,000 lines)**: read the file contents and pass to `upload_csv` in one call.
- **Large file**: split into chunks and upload the first chunk with `upload_csv`, then append the rest with `append_csv`.

## Step 3a: Small file — single upload

1. Read the file contents.
2. Call `upload_csv` with `csv_content` (the full file as a string) and optional `collection_id`.
3. Note the `model_id` and `table_id` in the response.

## Step 3b: Large file — chunked upload

### Splitting rules

- **Every chunk MUST start with the original header row** (line 1 of the CSV).
- Data rows are split evenly across chunks. No data row appears in more than one chunk.
- Target ~30,000 data rows per chunk (adjust down if rows are very wide).

### Split procedure

```bash
FILE="/path/to/file.csv"
CHUNK_DIR="/tmp/csv-chunks-$$"
ROWS_PER_CHUNK=30000

mkdir -p "$CHUNK_DIR"

# Extract header
HEADER=$(head -1 "$FILE")

# Split data rows (everything after the header) into numbered files
tail -n +2 "$FILE" | split -l "$ROWS_PER_CHUNK" -d -a 4 - "$CHUNK_DIR/data_"

# Prepend header to each chunk
for chunk in "$CHUNK_DIR"/data_*; do
  chunk_file="$CHUNK_DIR/chunk_$(basename "$chunk").csv"
  printf '%s\n' "$HEADER" > "$chunk_file"
  cat "$chunk" >> "$chunk_file"
  rm "$chunk"
done

ls -la "$CHUNK_DIR"/chunk_*.csv
```

### Upload procedure

1. **First chunk** — call `upload_csv`:
   - `csv_content`: contents of the first chunk file (read it with the Read tool)
   - `collection_id`: target collection (optional)
   - **Save the `table_id` from the response** — you need it for appends

2. **Remaining chunks** — call `append_csv` for each:
   - `csv_content`: contents of the next chunk file
   - `table_id`: the table ID from step 1
   - Verify `{"status": "ok"}` before proceeding to the next chunk

3. **Cleanup**:
   ```bash
   rm -rf "$CHUNK_DIR"
   ```

### Error handling

- If an `append_csv` call fails, do NOT skip it. Diagnose the error first.
- Common issues: column mismatch (headers don't match the original upload), encoding problems.
- On auth errors, re-authenticate and retry.

## Available tools reference

| Tool | Input | Purpose |
|------|-------|---------|
| `upload_csv` | `csv_content`, `filename?`, `collection_id?` | Create new table + model |
| `append_csv` | `csv_content`, `table_id`, `filename?` | Append rows to existing upload table |
| `replace_csv` | `csv_content`, `table_id`, `filename?` | Replace all data (destructive) |
