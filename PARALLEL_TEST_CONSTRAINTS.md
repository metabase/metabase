# What Limits Parallel Test Execution?

## Your Hypothesis: Setup/Teardown Costs

**You're absolutely right!** Setup and teardown costs are a major constraint, but there are several other factors as well.

## Major Constraints

### 1. **Dataset/Database Creation Costs (Setup/Teardown)**

**BigQuery Example:**
- Each test uses isolated datasets via `test-dataset-id` function (line 58-64 in `bigquery_cloud_sdk.clj`)
- Creating a BigQuery dataset requires a **cloud API call** (`create-dataset!`)
- Creating tables and loading test data requires **multiple API calls**
- Destroying datasets requires **API calls** (`destroy-dataset!`)

**The Tradeoff:**
- **More parallelism** = More datasets created in parallel = More API calls = Slower setup
- **Less parallelism** = Fewer datasets = Faster setup but slower overall execution

**Current Optimization:**
- Tests use `dataset-already-loaded?` to **reuse existing datasets** when possible (line 407-412)
- Datasets are tracked and cleaned up after 2 hours (line 339-353)
- This suggests the codebase tries to **minimize setup costs** by reusing datasets

**Impact:**
- If every parallel test creates its own dataset, setup time scales with parallelism
- Dataset creation in BigQuery is relatively fast (API call), but creating tables + loading data is slower
- For 22 parallel tests, you'd need 22 datasets (or reuse shared ones)

---

### 2. **Cloud Provider API Limits**

**BigQuery Limits:**
- **API rate limits**: BigQuery has per-project API quotas
- **Concurrent queries**: Limited by BigQuery quota tiers
- **Connection limits**: Service account connection limits
- **Dataset limits**: Per-project dataset limits (unlikely to be hit)

**Snowflake Limits:**
- **Warehouse concurrency**: Limited by warehouse size
- **API rate limits**: Snowflake API quotas
- **Connection limits**: Per-user/per-warehouse connection limits

**Redshift Limits:**
- **Connection limits**: Per-cluster connection limits
- **Query concurrency**: Limited by cluster size
- **API rate limits**: AWS API quotas

**Impact:**
- Too many parallel tests could hit API rate limits (throttling)
- Connection pool exhaustion could cause test failures
- Provider quotas may limit maximum parallelism

---

### 3. **Resource Constraints (Memory, CPU, Network)**

**JVM/Application Level:**
- **Thread pool size**: Test runner (hawk) likely has a thread pool limit
- **Memory**: Each parallel test thread consumes memory
- **CPU**: Limited by runner machine CPU cores
- **Network bandwidth**: All parallel tests share network connection

**GitHub Actions Runner:**
- **CPU cores**: `ubuntu-latest` runners have limited CPU cores (typically 2-4)
- **Memory**: Limited RAM (typically 7-14 GB)
- **Network**: Shared network bandwidth to cloud providers

**Impact:**
- True parallelism is limited by CPU cores (context switching overhead)
- Memory pressure can cause GC pauses or OOM errors
- Network bandwidth can become a bottleneck

---

### 4. **Shared State and Test Isolation**

**Thread-Unsafe Operations:**
- Tests using `with-redefs`, `System/setProperty`, `alter-var-root` cannot run in parallel
- See `.clj-kondo/config.edn:parallel/unsafe` for the full list
- These tests MUST run sequentially

**Database State:**
- Tests that modify shared database state cannot run in parallel
- Tests using shared fixtures cannot run in parallel
- Tests with execution order dependencies cannot run in parallel

**Current Isolation Strategy:**
- **BigQuery**: Each test uses unique dataset (via `test-dataset-id` with hash prefix)
- **Snowflake/Redshift**: Similar isolation via unique database/schema names
- This enables parallelism IF tests don't share other mutable state

**Impact:**
- Only tests that are truly isolated can run in parallel
- Tests that share mutable state must run sequentially

---

### 5. **Test Runner Limitations (hawk)**

**Unknown Constraints:**
- **Thread pool size**: How many threads does hawk use for parallel tests?
- **Execution model**: Does it use a thread pool or spawn threads per test?
- **Resource management**: How does it manage connections, memory, etc.?

**What We Know:**
- `^:parallel` annotation is enforced (tests marked parallel cannot use thread-unsafe operations)
- `mb.hawk.parallel/assert-test-is-not-parallel` suggests runtime enforcement
- But actual execution model is unclear from code inspection

**Impact:**
- Test runner may limit parallelism regardless of annotation
- Thread pool size may be smaller than number of parallel tests

---

### 6. **Test Execution Time Variability**

**Problem:**
- Some tests are fast (query-only tests)
- Some tests are slow (sync operations, full table scans)
- If tests run in parallel, overall time = longest test, not sum
- But if slow tests dominate, parallelism doesn't help much

**Impact:**
- Parallelism helps when tests have similar execution times
- If one test takes 10 minutes and 20 tests take 1 minute each, parallelism doesn't help much
- Need to balance slow tests across parallel partitions

---

## The Actual Tradeoff

### Your Hypothesis (Partially Correct):
**Setup/teardown costs ARE a constraint**, but it's more nuanced:

1. **Dataset creation is optimized**: Tests reuse datasets when possible
2. **But parallel tests may still create multiple datasets**: If tests need different schemas
3. **API limits may be hit before setup costs become prohibitive**: Provider quotas are likely the bottleneck

### The Real Constraints (In Order of Impact):

1. **API/Connection Limits** (Provider quotas) - Likely the primary bottleneck
2. **Resource Constraints** (CPU cores, memory) - Limits true parallelism
3. **Test Runner Limitations** (Thread pool size) - May limit parallelism
4. **Setup/Teardown Costs** (Dataset creation) - Minimized by reuse, but still a factor
5. **Test Isolation** (Shared state) - Prevents some tests from being parallel

---

## Implications for Strategy 2 (Enable Parallel Test Execution)

**Before adding `^:parallel` to more tests:**

1. **Verify API limits won't be hit**: Check BigQuery quotas, connection limits
2. **Measure actual parallelism**: Profile test execution to see if tests actually run in parallel
3. **Start small**: Add `^:parallel` to a few tests first, measure impact
4. **Monitor for failures**: Watch for rate limiting, connection exhaustion, memory issues

**Best Candidates for `^:parallel`:**
- Tests that only query data (don't modify state)
- Tests that use isolated datasets (most BigQuery tests)
- Fast tests (query-only, no sync operations)
- Tests that don't use thread-unsafe operations

**Avoid `^:parallel` for:**
- Tests that perform sync operations (slow, resource-intensive)
- Tests that use `with-redefs` or other thread-unsafe operations
- Tests that share mutable state
- Tests that depend on execution order

---

## How to Measure These Constraints

1. **API Rate Limits**: Monitor for 429 (Too Many Requests) errors
2. **Connection Limits**: Monitor for connection pool exhaustion errors
3. **Setup Costs**: Time dataset creation operations
4. **Actual Parallelism**: Profile test execution (thread analysis, timing overlap)
5. **Resource Usage**: Monitor CPU, memory, network usage during test runs

---

## References

- BigQuery dataset creation: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj:427-446`
- Dataset reuse: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj:407-425`
- Thread-unsafe operations: `.clj-kondo/config.edn:86-139`
- Test isolation: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj:58-64`
