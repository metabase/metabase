#!/usr/bin/env bats

# Test suite for merge-yaml-migrations script

setup() {
  SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"
  MERGE_SCRIPT="$SCRIPT_DIR/../merge-yaml-migrations"
  FIXTURES_DIR="$SCRIPT_DIR/fixtures"
  TEMP_DIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TEMP_DIR"
}

@test "clean merge: both branches add different changesets" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-simple.yaml" \
    "$FIXTURES_DIR/ours-adds-one.yaml" \
    "$FIXTURES_DIR/theirs-adds-one.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Clean merge"* ]]

  # Should have 3 changesets total
  changeset_count=$(grep -c "^  - changeSet:" "$TEMP_DIR/result.yaml")
  [ "$changeset_count" -eq 3 ]
}

@test "clean merge: only our branch adds a changeset" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-simple.yaml" \
    "$FIXTURES_DIR/ours-adds-one.yaml" \
    "$FIXTURES_DIR/base-simple.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]

  # Should have 2 changesets
  changeset_count=$(grep -c "^  - changeSet:" "$TEMP_DIR/result.yaml")
  [ "$changeset_count" -eq 2 ]
}

@test "conflict: both branches modify the same changeset differently" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-conflict.yaml" \
    "$FIXTURES_DIR/ours-modifies.yaml" \
    "$FIXTURES_DIR/theirs-modifies.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Merge conflicts detected"* ]]

  grep -q "MERGE CONFLICT" "$TEMP_DIR/result.yaml"
}

@test "deletion: changeset deletion is respected" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-two-changesets.yaml" \
    "$FIXTURES_DIR/ours-deletes-second.yaml" \
    "$FIXTURES_DIR/base-two-changesets.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]

  # Should have only 1 changeset (deletion respected)
  changeset_count=$(grep -c "^  - changeSet:" "$TEMP_DIR/result.yaml")
  [ "$changeset_count" -eq 1 ]
}

@test "preserves footer warning" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-with-footer.yaml" \
    "$FIXTURES_DIR/ours-adds-with-footer.yaml" \
    "$FIXTURES_DIR/base-with-footer.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]

  # Footer should be preserved
  grep -q "# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE!" "$TEMP_DIR/result.yaml"
  grep -q "# ADVICE:" "$TEMP_DIR/result.yaml"
}

@test "preserves formatting and blank lines" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-simple.yaml" \
    "$FIXTURES_DIR/ours-adds-one.yaml" \
    "$FIXTURES_DIR/theirs-adds-one.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]

  # Should preserve quoting strategy line
  grep -q "  - objectQuotingStrategy: QUOTE_ALL_OBJECTS" "$TEMP_DIR/result.yaml"

  # Should not have consecutive blank lines
  ! grep -Pzo '\n\n\n' "$TEMP_DIR/result.yaml"
}

@test "sorts changesets by ID chronologically" {
  run "$MERGE_SCRIPT" \
    "$FIXTURES_DIR/base-sort.yaml" \
    "$FIXTURES_DIR/ours-adds-later.yaml" \
    "$FIXTURES_DIR/theirs-adds-between.yaml" \
    7 \
    "$TEMP_DIR/result.yaml"

  [ "$status" -eq 0 ]

  # Extract changeset IDs in order
  ids=$(grep "id: v58" "$TEMP_DIR/result.yaml" | sed 's/.*id: //' | tr '\n' ' ')

  # Should be sorted chronologically
  [[ "$ids" == *"v58.2025-10-30T09:00:00"* ]]
  [[ "$ids" == *"v58.2025-10-31T10:00:00"* ]]
  [[ "$ids" == *"v58.2025-11-01T12:00:00"* ]]

  # Verify order by checking the "between" changeset comes before "later"
  between_line=$(grep -n "v58.2025-10-31T10:00:00" "$TEMP_DIR/result.yaml" | cut -d: -f1)
  later_line=$(grep -n "v58.2025-11-01T12:00:00" "$TEMP_DIR/result.yaml" | cut -d: -f1)
  [ "$between_line" -lt "$later_line" ]
}
