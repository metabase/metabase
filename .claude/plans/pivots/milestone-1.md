# Milestone 1: Optimize Pivot Queries for Totals

This milestone focuses on modifying the standalone pivot visualization to take row and column totals settings into account when generating queries, improving performance by eliminating unnecessary queries.

## Implementation Steps

1. **Analyze Current Query Generation Process**
   - Examine `generate-queries` function in `/src/metabase/query_processor/pivot.clj`
   - Understand how `breakout-combinations` determines the query combinations
   - Map out how totals settings relate to the generated queries

2. **Extract Totals Settings**
   - Modify `pivot-options` function to extract totals settings:
     - `pivot.show_row_totals`
     - `pivot.show_column_totals`
   - Add these to the pivot options map 

3. **Modify Breakout Combinations Function**
   - Update `breakout-combinations` to consider totals settings
   - Skip generating "row total" combinations when row totals are disabled
   - Skip generating "column total" combinations when column totals are disabled
   - Skip generating "grand total" combinations when both are disabled

4. **Update Query Generation Logic**
   - Modify `generate-queries` to filter the breakout combinations based on totals settings
   - Ensure queries for subtotals are only generated when needed

5. **Handle Edge Cases**
   - Ensure backwards compatibility for queries without specified totals settings
   - Add appropriate defaults (likely with totals enabled for backward compatibility)
   - Handle cases where pivot options might be incomplete or malformed

6. **Optimize Performance**
   - Add early-exit optimization to avoid generating unnecessary breakout combinations
   - Consider caching intermediate results if applicable

## Testing Strategy

### Unit Tests

Add new unit tests in `/test/metabase/query_processor/pivot_test.clj`:

1. **Test Modified Breakout Combinations Function**
   - Test with row totals disabled
   - Test with column totals disabled
   - Test with both totals disabled
   - Test with both totals enabled (should match current behavior)

2. **Test End-to-End Query Generation**
   - Test that generated queries exclude appropriate queries when totals are disabled
   - Verify correct number of queries generated in each configuration

3. **Test Results Processing**
   - Ensure the result processing still works correctly with fewer queries

### Integration Tests

Add integration tests in `/test/metabase/api/dataset_test.clj`:

1. **Test API Response**
   - Test pivot endpoint with different totals settings
   - Verify response format is correct with fewer queries
   - Check that results match expected pivot structure

2. **Test Performance Improvement**
   - Add benchmarking tests to verify query count reduction
   - Measure response time differences with and without totals

### Frontend Integration Tests

Verify frontend still works correctly with the backend changes:

1. **Test in `/frontend/test/metabase/visualizations/visualizations/PivotTable.unit.spec.js`**
   - Ensure pivot visualization correctly displays data with different totals settings
   - Verify totals rows/columns appear only when settings are enabled

## Expected Outcome

After implementation, a query with both row and column totals disabled should generate only one backend query instead of multiple queries. This should significantly improve performance for pivot tables where totals are not needed.

## Metrics for Success

- Number of queries generated with totals disabled vs. enabled
- Performance improvement measured in query execution time
- No regression in functionality or display of pivot tables