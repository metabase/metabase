# SQL Fixing Test Cases

This directory contains test cases for the SQL fixing benchmark, organized by database engine and complexity. Each test case consists of a broken SQL query and its corresponding fixed version, designed to test various SQL error detection and correction capabilities.

## Directory Structure

Test cases are organized by database engine in subdirectories:

- **`postgres/`** - PostgreSQL-specific test cases (currently the main test suite)
  - `simple_queries.json` - Basic SELECT queries with single table
  - `simple_agg_queries.json` - Queries with GROUP BY and aggregations
  - `intermediate_queries.json` - Queries with JOINs, CTEs, and subqueries
  - `postgres_queries.json` - PostgreSQL-specific features (window functions, type casts, etc.)
  - `ambiguous_queries.json` - Queries where the correct fix is unclear or ambiguous
  - `multiple_errors.json` - Test cases with multiple simultaneous errors
  - `regression_tests.json` - Complex regression tests for specific edge cases and bugs
- (Future: additional directories for other database engines)

## Performance Considerations

Most queries (approximately 80%) include a `LIMIT` clause to reduce benchmark runtime by limiting the number of rows returned. A small subset of queries (~20%) do not include `LIMIT` clauses to ensure the benchmark tests a variety of query patterns.

## Test Case Format

See the file `CLAUDE.md` in this directory for details on the test case JSON file format.

## Editing or Viewing Test Cases

Use the `edit_sql_fixing_test_case.py` script to interactively edit or view individual test cases:

```bash
poetry run python3 scripts/edit_sql_fixing_test_case.py \
  --description "substring to match" \
  src/benchmarks/e2e/sql_fixing/test_cases/postgres/*.json
```

### How it works

1. The script searches for a test case whose description contains the provided substring
2. If a match is found, it extracts the test case to a temporary directory:
   - `fixed.sql` - the fixed query
   - `broken.sql` - the broken query
   - `error_message.txt` - the error message
   - `test_case.json` - other test case fields (description, used_tables, etc.)
3. You can edit these files in your editor
4. Press Enter to continue, and the script merges your changes back into the original JSON file
5. Optionally, the script can run a validation script to update the `error_message` field

### Options

- `--view-only` - Extract and view files without updating the original test case
- `--validate` - Automatically run validation without prompting

## Adding Test Cases for Other Databases

To add test cases for other database engines:

1. Create a new subdirectory under `test_cases/` (e.g., `test_cases/mysql/`)
2. Add JSON test case files following the same format as PostgreSQL
3. Update the `load_test_cases_from_json()` function in `__init__.py` to load from the new directory:
   ```python
   # Example for MySQL
   mysql_test_cases = load_test_cases_from_json("test_cases/mysql")
   ```
4. Create a new benchmark instance with an appropriate name (e.g., "SQL Fix: MySQL")
