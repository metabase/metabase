# Bug Fix Summary: Issue #62191

## Issue Description
GUI Questions referencing column aliases in the same SELECT clause were causing SQL query failures. When creating custom columns (expressions) that reference fields from the same query stage, the generated SQL incorrectly used column aliases instead of the original column names.

### Problematic SQL Pattern
```sql
SELECT
  "source"."column name" AS "column alias",
  CASE
    WHEN (
      "source"."column alias" IS NULL  -- ERROR: Cannot reference alias in same SELECT
    )
    THEN 'output A'
    ELSE 'output B'
  END AS "custom column"
FROM ...
```

### Correct SQL Pattern
```sql
SELECT
  "source"."column name" AS "column alias", 
  CASE
    WHEN (
      "source"."column name" IS NULL  -- CORRECT: Reference original column
    )
    THEN 'output A'
    ELSE 'output B'
  END AS "custom column"
FROM ...
```

## Root Cause Analysis
The issue was in the `add-source-to-field-ref` function in `src/metabase/query_processor/util/add_alias_info.clj`. When processing field references within expressions, the function was using the `escaped-source-alias` which would look up the desired alias for columns from previous stages. However, when a field reference within an expression refers to a column that is being selected with an alias in the same stage, SQL requires using the original column name, not the alias.

## Solution Implemented

### Changes Made

#### 1. Modified `add-source-to-field-ref` function
- Added optional `context` parameter to detect when processing field refs inside expressions
- Added conditional logic to use original column name when inside expressions referencing previous-stage columns

#### 2. Modified `add-source-aliases` function  
- Added detection of when we're processing fields inside expressions using `&parents` path information
- Pass context information to `add-source-to-field-ref` when inside expressions

#### 3. Added test case
- Created `column-alias-in-same-select-clause-test` in `test/metabase/driver/sql/query_processor_test.clj`
- Test verifies that field references in expressions use original column names, not aliases

### Key Changes in Code

**File: `src/metabase/query_processor/util/add_alias_info.clj`**

1. **Function signature change** (line 202):
   ```clojure
   (defn- add-source-to-field-ref [query path field-ref col & [context]])
   ```

2. **Conditional alias logic** (lines 206-211):
   ```clojure
   ::source-alias (if (and (= :inside-expression (:context context))
                          (= (:lib/source col) :source/previous-stage))
                   ;; When inside an expression and referencing a column from previous stage,
                   ;; use the original column name, not its desired alias
                   (:lib/source-column-alias col)
                   (escaped-source-alias query path (:metabase.lib.join/join-alias col) (:lib/source-column-alias col)))
   ```

3. **Expression context detection** (lines 233-236):
   ```clojure
   (let [col (resolve-field-ref query path &match)
         inside-expression? (some #{:expressions} &parents)
         context (when inside-expression? {:context :inside-expression})]
     (-> (add-source-to-field-ref query path &match col context)
   ```

**File: `test/metabase/driver/sql/query_processor_test.clj`**

Added comprehensive test case `column-alias-in-same-select-clause-test` that reproduces the bug scenario and verifies the fix works correctly.

## Impact
- Fixes SQL generation errors when custom columns reference fields from the same query stage
- Maintains compatibility with existing functionality (join conditions, aggregations, etc.)
- Follows existing code patterns and conventions
- Includes proper test coverage

## Testing
The fix includes a test case that reproduces the original issue and verifies the correct SQL generation. The test ensures that field references within CASE expressions use the original column names rather than aliases from the same SELECT clause.

## Files Modified
1. `src/metabase/query_processor/util/add_alias_info.clj` - Core fix implementation
2. `test/metabase/driver/sql/query_processor_test.clj` - Added test case

The fix is targeted and minimal, only affecting the specific scenario described in the bug report while preserving all existing functionality.