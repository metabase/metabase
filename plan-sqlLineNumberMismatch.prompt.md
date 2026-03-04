# Plan: Fix SQL Error Line Number Mismatch After v52→v56 Upgrade

## Issue Summary

After upgrading from Metabase v52 to v56, error messages from failed SQL queries now reference line numbers that do not match the lines in the SQL editor. This appears to be due to:

1. **Newly compiled SQL differing from user-written SQL** - Changes in the query processor and migration to HoneySQL 2
2. **Query remarks prepended for tracking** - Metabase adds comments at the beginning for debugging
3. **SQL formatting changes** - Parentheses around FROM clauses, multiline formatting differences
4. **Incomplete error position adjustment logic** - Frontend only handles old remark formats, not HoneySQL 2 formatting changes

This makes debugging and correcting errors much more difficult, since the line referenced in the error does not correspond to the source SQL in the editor.

## Root Cause Analysis

### 1. Query Remarks Shift Line Numbers
- Location: `src/metabase/query_processor/util.clj` - `query->remark` multimethod
- Location: `src/metabase/driver/sql_jdbc/execute.clj` - `inject-remark` function
- When a query is executed, Metabase prepends remarks like `-- Metabase:: userID: 1 queryType: native queryHash: ...`
- This shifts all subsequent line numbers down by at least 1-2 lines
- Frontend tries to adjust for this in `frontend/src/metabase/query_builder/components/VisualizationError/utils.ts` - `adjustPositions()`

### 2. HoneySQL 2 Formatting Changes
- Location: `src/metabase/driver/sql/query_processor.clj` - `format-honeysql-2` function
- The migration from HoneySQL 1 to HoneySQL 2 changed how SQL is formatted:
  - Subqueries are now wrapped in parentheses via `make-nestable-sql()`
  - FROM clauses may have different formatting
  - Whitespace and line breaks differ
- These formatting changes add/remove lines from the compiled SQL

### 3. Source Query Wrapping
- Location: `src/metabase/driver/sql/query_processor.clj` - `apply-source-query` function
- Native queries used as source queries are wrapped: `(SELECT ...) AS source`
- This wrapping introduces additional parentheses and formatting that shifts positions

### 4. Frontend Adjustment Logic Limitations
- Location: `frontend/src/metabase/query_builder/components/VisualizationError/utils.ts` - `adjustPositions()`
- Current logic only adjusts for:
  - Multiline `/* ... */` comments (Redshift style)
  - Single-line `--` comments (regular remarks)
- Does NOT account for:
  - HoneySQL 2 formatting differences
  - Parentheses wrapping around subqueries
  - Different line break handling between original and compiled SQL

## Solution Options

### Option A: Backend Source Mapping (Most Robust)

**Approach:** Create a mapping layer during query compilation that tracks original SQL positions → compiled SQL positions.

**Implementation Steps:**
1. Modify `format-honeysql` in `query_processor.clj` to optionally return both SQL and position mapping metadata
2. Track line/column transformations during:
   - Remark injection via `inject-remark`
   - HoneySQL formatting via `format-honeysql-2`
   - Subquery wrapping via `apply-source-query`
3. Pass position mapping through exception `ex-data` so frontend can translate error positions
4. Frontend uses mapping to display error at correct line in editor

**Pros:**
- Accurate line/column mapping regardless of complexity
- Scales to handle arbitrary SQL formatting changes
- Provides foundation for future enhancements (debugger, query analysis tools)

**Cons:**
- More complex backend changes
- Need to maintain mapping logic as SQL compilation evolves
- Performance overhead to track positions

**Files to Modify:**
- `src/metabase/driver/sql/query_processor.clj`
- `src/metabase/driver/sql_jdbc/execute.clj`
- `src/metabase/query_processor/middleware/catch_exceptions.clj`
- `frontend/src/metabase/query_builder/components/VisualizationError/utils.ts`

---

### Option B: Improved Frontend Adjustment Logic (Quick Win)

**Approach:** Enhance frontend `adjustPositions()` to account for HoneySQL 2 formatting changes in addition to remarks.

**Implementation Steps:**
1. Parse the original user SQL and compiled SQL in the frontend
2. Detect and account for:
   - Parentheses wrapping around subqueries
   - Extra/different line breaks
   - FROM clause formatting changes
3. Build a diff/mapping of line shifts and apply it to error positions
4. Fall back to current remark-based adjustment if no parsing available

**Pros:**
- Minimal backend changes required
- Can be implemented quickly
- Lightweight and performant

**Cons:**
- Heuristic-based (may not handle all edge cases)
- Fragile to future SQL formatting changes
- Logic complexity lives in frontend
- Requires access to both original and compiled SQL in error response

**Files to Modify:**
- `frontend/src/metabase/query_builder/components/VisualizationError/utils.ts`
- `src/metabase/query_processor/middleware/catch_exceptions.clj` (may need to pass compiled SQL to frontend)

---

### Option C: Query Normalization (Preserve Structure)

**Approach:** Modify how SQL is compiled to maintain consistent line structure with user-written SQL.

**Implementation Steps:**
1. Create a "preserve-lineage" mode for `format-honeysql` that:
   - Minimizes unnecessary reformatting
   - Preserves original line breaks when possible
   - Avoids wrapping subqueries in extra parentheses when not needed
2. Modify `inject-remark` to use inline comments that don't shift line numbers
   - E.g., place remarks at the end of the first line instead of on a separate line
3. Handle subquery wrapping more intelligently to avoid line shifts

**Pros:**
- Solves problem at source - compiled SQL matches original structure
- Doesn't require complex mapping logic
- Simple from user perspective

**Cons:**
- May conflict with SQL formatting requirements for some databases
- Could affect query optimization if certain formatting is relied upon
- Requires careful testing across all supported databases
- May limit ability to customize SQL output for specific drivers

**Files to Modify:**
- `src/metabase/driver/sql/query_processor.clj`
- `src/metabase/driver/sql_jdbc/execute.clj`
- `src/metabase/query_processor/util.clj`

---

## Recommended Approach

**Start with Option B (Improved Frontend Adjustment), then layer in Option A (Backend Source Mapping) for long-term robustness.**

**Rationale:**
1. Option B provides immediate relief with minimal risk
2. Option A provides scalable long-term solution
3. Both can coexist - frontend can use mapping if available, fall back to heuristics otherwise
4. Demonstrates problem can be solved without massive refactoring

## Implementation Phases

### Phase 1: Quick Fix (Option B)
1. Analyze common formatting differences between v52 and v56 SQL output
2. Enhance `adjustPositions()` in frontend to detect and compensate for these patterns
3. Add tests with real query examples that fail
4. Deploy as patch release

### Phase 2: Long-term Solution (Option A)
1. Design position mapping data structure
2. Implement mapping tracking in backend during query compilation
3. Pass mapping through error responses
4. Update frontend to use mapping when available
5. Add comprehensive tests across all SQL dialects

### Phase 3: Future Optimization (Option C - if needed)
1. Monitor whether Phases 1-2 adequately solve the problem
2. If performance concerns arise, implement query normalization
3. Requires careful validation across all database drivers

## Testing Strategy

### Test Cases to Add

1. **Simple query with syntax error**
   - User SQL: `SELECT * FROM table WHERE id = ???`
   - Error should point to the `???` token, not to a shifted line

2. **Multi-line query with error in WHERE clause**
   - User SQL:
     ```sql
     SELECT id, name
     FROM users
     WHERE department = 'sales'
     AND invalid_column = 5
     ```
   - Error should point to `invalid_column` line

3. **Nested query with error in subquery**
   - User SQL with nested FROM clause containing error
   - Error should point to correct nested location

4. **Query with parameter template tags**
   - Error in template tag handling should point to correct line

5. **Complex JOIN with error**
   - Multi-table JOIN with error should reference correct line

### Test Implementation
- Add tests to `frontend/src/metabase/query_builder/components/VisualizationError/tests/utils.unit.spec.ts`
- Add integration tests in `e2e/test/scenarios/` for end-to-end error display
- Test against multiple database backends (PostgreSQL, MySQL, H2, etc.)

## Key Files Involved

### Backend
- `src/metabase/query_processor/util.clj` - Query remark generation
- `src/metabase/driver/sql/query_processor.clj` - HoneySQL compilation and formatting
- `src/metabase/driver/sql_jdbc/execute.clj` - Remark injection
- `src/metabase/query_processor/middleware/catch_exceptions.clj` - Error response formatting

### Frontend
- `frontend/src/metabase/query_builder/components/VisualizationError/utils.ts` - Error position adjustment
- `frontend/src/metabase/query_builder/components/VisualizationError/VisualizationError.tsx` - Error display
- `frontend/src/metabase/query_builder/components/VisualizationError/tests/utils.unit.spec.ts` - Tests

### Supporting
- `src/metabase/native_query_snippets/` - Native query handling
- `resources/python-sources/sql_tools.py` - Python SQL validation (if needed for validation errors)

## Known Challenges

1. **Database-specific error formats** - PostgreSQL uses `Line:`, others use `Position:`; we need to handle both
2. **Multi-line vs single-line compilation** - Some databases prefer compact SQL, others multi-line
3. **Template tag substitution** - Parameter replacement may further shift positions
4. **Driver-specific formatting** - Different SQL drivers may compile differently
5. **Backwards compatibility** - Solution must work for existing queries and error messages

## Success Criteria

1. ✅ Error line numbers match user-visible SQL editor lines for common query patterns
2. ✅ Solution works across supported SQL databases (PostgreSQL, MySQL, H2, Snowflake, BigQuery, etc.)
3. ✅ Error messages remain helpful and correctly point to problematic SQL
4. ✅ No performance regression in query compilation or error handling
5. ✅ Comprehensive test coverage prevents regressions
6. ✅ Solution scales for future SQL formatting improvements

## Timeline Estimate

- **Phase 1 (Option B):** 2-3 days
  - Analysis: 0.5 days
  - Implementation: 1 day
  - Testing: 1 day
  - Code review & polish: 0.5 days

- **Phase 2 (Option A):** 5-7 days
  - Design: 1 day
  - Backend implementation: 2 days
  - Frontend implementation: 1.5 days
  - Testing: 1.5 days
  - Code review & polish: 1 day

- **Total:** 7-10 days for full solution

## Open Questions for Refinement

1. Should we target line numbers only, or both line and column accuracy?
2. What's the acceptable performance overhead for position mapping?
3. Should we preserve backwards compatibility with v52 error response formats?
4. Are there specific database backends we should prioritize for testing?
5. Should position mapping be included in production error logs for debugging?

