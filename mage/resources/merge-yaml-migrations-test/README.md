# Tests for merge-yaml-migrations

This directory contains tests for the custom git merge driver `merge-yaml-migrations`.

## Running Tests

From the repository root:

```bash
./bin/merge-yaml-migrations-test/test_merge.clj
```

Or using babashka:

```bash
bb bin/merge-yaml-migrations-test/test_merge.clj
```

## Test Coverage

The tests cover:

1. **Clean merge scenarios:**
   - Both branches add different changesets
   - Only one branch adds changesets

2. **Conflict scenarios:**
   - Both branches modify the same changeset differently

3. **Deletion scenarios:**
   - One branch deletes a changeset while the other keeps it

4. **Formatting preservation:**
   - Single blank lines between changesets (not double)
   - Footer warning preserved from the "ours" file
   - 2-space indentation maintained
   - objectQuotingStrategy header preserved

## Test Structure

Tests use temporary files and the `clojure.test` framework. Each test:
1. Creates temporary YAML files for base, ours, and theirs versions
2. Runs the merge driver
3. Verifies the exit code and merged result
4. Cleans up temp files automatically
