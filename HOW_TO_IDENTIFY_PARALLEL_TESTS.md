# How to Identify Parallel vs Sequential Tests

## Current State (What We Can Know)

### 1. Tests Marked with `^:parallel` Annotation (Static Analysis)

**How to find them:**
```bash
# Count tests marked ^:parallel in BigQuery
grep -E '^\s*\(deftest\s+\^:parallel' modules/drivers/bigquery-cloud-sdk/test/metabase/driver/bigquery_cloud_sdk_test.clj | wc -l

# List tests marked ^:parallel
grep -E '^\s*\(deftest\s+\^:parallel' modules/drivers/bigquery-cloud-sdk/test/**/*.clj

# Count tests NOT marked ^:parallel  
grep -E '^\s*\(deftest\s+[^:]' modules/drivers/bigquery-cloud-sdk/test/**/*.clj | wc -l
```

**BigQuery Current Stats:**
- **22 tests** marked with `^:parallel` annotation
- **50 tests** NOT marked (run sequentially)
- **Total: ~72 tests** (in main test file)

**What this means:**
- `^:parallel` is a **metadata annotation** that tells the test runner "this test is safe to run in parallel"
- The annotation is **enforced by clj-kondo** - tests marked `^:parallel` cannot use thread-unsafe operations
- The test runner (hawk) **uses this annotation** to decide execution strategy

### 2. Tests That Actually Run in Parallel (Runtime Behavior)

**The Challenge:**
We can't easily determine this from static analysis alone. The `^:parallel` annotation is an **intent** marker, but actual parallel execution depends on:
- Test runner configuration
- Available CPU cores
- Test runner implementation (hawk library)
- Whether tests are actually scheduled in parallel

**How to verify actual parallel execution:**
1. **Runtime profiling**: Add logging/timing to see test execution overlap
2. **Thread analysis**: Check if tests run on different threads
3. **Performance measurement**: Compare sequential vs parallel execution times
4. **Test runner documentation**: Check hawk library docs for how `^:parallel` is used

**Current Assumption:**
- Tests marked `^:parallel` are **intended** to run in parallel
- Tests NOT marked `^:parallel` run **sequentially**
- The test runner (hawk) respects this annotation based on code in `metabase.test.redefs`

### 3. Tests That Theoretically Could Be Parallel (Requires Code Analysis)

**How to identify:**

1. **Manual code review:**
   - Check if test uses thread-unsafe operations (see `.clj-kondo/config.edn:parallel/unsafe`)
   - Check if test shares mutable state with other tests
   - Check if test depends on execution order
   - Check if test uses isolated resources (databases, datasets, etc.)

2. **Automated analysis:**
   ```bash
   # Find tests that don't use thread-unsafe operations
   # (would require more sophisticated analysis)
   
   # Check for common thread-unsafe patterns
   grep -E "(with-redefs|System/setProperty|alter-var-root)" modules/drivers/bigquery-cloud-sdk/test/**/*.clj
   ```

3. **Clj-kondo validation (RECOMMENDED APPROACH):**
   - **Bulk mark all tests as `^:parallel` and let the linter filter out unsafe ones**
   - The linter will flag tests that use thread-unsafe operations
   - Tests that DON'T get flagged are good candidates for parallel execution
   - **How to do it:**
     ```bash
     # 1. Bulk add ^:parallel to all tests (use find/replace or script)
     # Find all deftest declarations without ^:parallel
     # Replace: (deftest test-name
     # With:    (deftest ^:parallel test-name
     
     # 2. Run clj-kondo to see which ones fail
     ./bin/mage kondo modules/drivers/bigquery-cloud-sdk/test
     
     # 3. Look for :metabase/validate-deftest errors
     # These indicate tests that CAN'T be parallel
     
     # 4. Remove ^:parallel from tests that fail linter checks
     # Keep ^:parallel on tests that pass
     ```
   - **What the linter catches:**
     - Thread-unsafe operations (with-redefs, System/setProperty, etc.)
     - Destructive functions ending in `!` (unless whitelisted)
     - See `.clj-kondo/config.edn:parallel/unsafe` for full list
   - **What the linter WON'T catch (requires manual review):**
     - Tests that share mutable state (but don't use thread-unsafe operations)
     - Tests with execution order dependencies
     - Tests that modify global state in other ways
   - **After linter filtering:**
     - Run tests locally to check for flakiness
     - Monitor CI for race conditions
     - Consider starting with a subset and expanding

**BigQuery-Specific Considerations:**
- Each test uses isolated datasets (via `test-dataset-id`)
- Cloud databases support multiple concurrent connections
- Tests that don't use `with-redefs`, `System/setProperty`, etc. are candidates
- Tests that only query data (don't mutate state) are good candidates

## What We Don't Know (Requires Investigation)

1. **Does hawk actually run `^:parallel` tests in parallel?**
   - Need to check hawk library implementation
   - Need runtime profiling to verify

2. **How many tests run concurrently?**
   - Depends on test runner configuration
   - May be limited by CPU cores or configuration

3. **What's the actual performance benefit?**
   - Would require before/after measurements
   - Depends on I/O bound vs CPU bound operations

## Recommendations for Strategy 2 (Enable Parallel Test Execution)

### Phase 1: Identify Candidates
1. List all tests NOT marked `^:parallel`
2. For each test, check if it:
   - Uses thread-unsafe operations (from `.clj-kondo/config.edn:parallel/unsafe`)
   - Shares mutable state
   - Depends on execution order
   - Uses isolated resources (BigQuery datasets, etc.)

### Phase 2: Validate Candidates (RECOMMENDED: Bulk Approach)
**Option A: Bulk Mark and Filter (Fastest)**
1. Bulk add `^:parallel` to all tests in a file/namespace
2. Run `./bin/mage kondo <file>` to see which ones fail
3. Remove `^:parallel` from tests that fail linter checks
4. Keep `^:parallel` on tests that pass linter
5. Test locally to ensure no flakiness

**Option B: Incremental Approach (Safer)**
1. Add `^:parallel` to one test at a time
2. Run `./bin/mage kondo <file>` after each addition
3. Check for linter errors
4. Test locally to ensure no flakiness

### Phase 3: Measure Impact
1. Compare test runtime before/after adding `^:parallel`
2. Monitor CI for flakiness
3. Profile actual parallel execution

## Tools and Commands

### Find Parallel vs Sequential Tests
```bash
# All driver tests
for driver in bigquery-cloud-sdk snowflake redshift; do
  echo "=== $driver ==="
  echo "Parallel: $(grep -rE '^\s*\(deftest\s+\^:parallel' modules/drivers/$driver/test/**/*.clj 2>/dev/null | wc -l | xargs)"
  echo "Sequential: $(grep -rE '^\s*\(deftest\s+[^:]' modules/drivers/$driver/test/**/*.clj 2>/dev/null | grep -v '^:parallel' | wc -l | xargs)"
done
```

### Check for Thread-Unsafe Patterns
```bash
# Find tests using thread-unsafe operations
grep -rE "(with-redefs|System/setProperty|alter-var-root)" modules/drivers/bigquery-cloud-sdk/test/**/*.clj
```

### Run Tests Locally with Profiling
```bash
# Run tests with timing
clojure -X:dev:ci:ee:ee-dev:drivers:drivers-dev:test :only-tags '[:mb/driver-tests]' :only 'metabase.driver.bigquery-cloud-sdk-test'
```

## References

- `.clj-kondo/config.edn:77-144` - Thread-unsafe operations list
- `.clj-kondo/src/hooks/clojure/test.clj` - Parallel test validation logic
- `test/metabase/test/redefs.clj` - Runtime parallel test enforcement
- `test/metabase/test_runner.clj` - Test runner entry point
