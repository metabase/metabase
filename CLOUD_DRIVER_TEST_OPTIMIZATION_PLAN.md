# Cloud Driver Test Optimization Plan

## Scope
This plan covers optimization strategies for three cloud database drivers:
- **BigQuery** (Google Cloud)
- **Snowflake**  
- **Redshift** (AWS)

Note: Redshift already has some optimizations (partitioning + fail-fast) and serves as a reference implementation.

## Goal
Reduce cloud driver test runtime from ~40 minutes to 15-20 minutes (2x speedup needed) for:
- **BigQuery**: ~40 minutes → target 15-20 minutes
- **Snowflake**: TBD (needs baseline measurement) → target 15-20 minutes  
- **Redshift**: TBD (already has partitioning) → target 15-20 minutes

## Current State Analysis

### BigQuery Driver (`be-tests-bigquery-cloud-sdk-ee`)
- **Location**: `.github/workflows/drivers.yml:136-205`
- **Timeout**: 60 minutes
- **Current Runtime**: ~40 minutes (average)
- **Test Command**: Runs all tests with `:only-tags [:mb/driver-tests]` excluding `:mb/transforms-python-test`
- **Test Count**: ~111 test functions across multiple test files
- **Current Optimizations**: None
  - ❌ No `:fail-fast? true`
  - ❌ No test partitioning
  - ❌ Single job runs all tests sequentially

### Snowflake Driver (`be-tests-snowflake-ee`)
- **Location**: `.github/workflows/drivers.yml:1214-1294`
- **Timeout**: 60 minutes
- **Current Runtime**: TBD (needs baseline measurement)
- **Test Command**: Runs all tests with `:only-tags [:mb/driver-tests]` excluding `:mb/transforms-python-test`
- **Current Optimizations**: None
  - ❌ No `:fail-fast? true`
  - ❌ No test partitioning
  - ❌ Single job runs all tests sequentially

### Redshift Driver (`be-tests-redshift-ee`)
- **Location**: `.github/workflows/drivers.yml:1124-1212`
- **Timeout**: 60 minutes
- **Current Runtime**: TBD (already has partitioning - measure partitioned runtime)
- **Test Command**: Multiple partitioned jobs with `:only-tags [:mb/driver-tests]`
- **Current Optimizations**: Already optimized
  - ✅ Has `:fail-fast? true` on all matrix jobs
  - ✅ Has test partitioning (2 partitions)
  - ✅ Multiple jobs run in parallel
- **Note**: Redshift is already optimized - may need additional partitioning or verification

### Test Structure
**BigQuery:**
- Main test file: `modules/drivers/bigquery-cloud-sdk/test/metabase/driver/bigquery_cloud_sdk_test.clj`
- Query processor tests: `modules/drivers/bigquery-cloud-sdk/test/metabase/driver/bigquery_cloud_sdk/query_processor_test.clj`
- Parameter tests: `modules/drivers/bigquery-cloud-sdk/test/metabase/driver/bigquery_cloud_sdk/params_test.clj`
- Only ~30% of tests are marked with `^:parallel` annotation

**Snowflake & Redshift:**
- Similar structure with driver-specific test files
- Test parallelism varies by driver

### Known Bottlenecks (Hypothesized - Common to All Cloud Drivers)
1. **Sync Operations**: Tests that perform `sync/sync-database!`, `describe-database`, `describe-fields` require cloud API calls
2. **Sequential Test Execution**: Many tests run sequentially without `^:parallel` annotation
3. **Cloud API Latency**: Network round-trips to cloud provider APIs for each operation
4. **Test Data Setup**: Creating databases, schemas, and tables in cloud services
5. **Query Execution**: Actual query execution time in cloud services
6. **No Test Partitioning**: Tests run in single job instead of parallel jobs (BigQuery, Snowflake)

### Resource Constraints and Limits

#### BigQuery API Limits and Connection Constraints

**API Rate Limits:**
- **Requests per second per user per method**: 100 requests/second
- **Concurrent API requests per user**: 300 concurrent requests
- **Concurrent queries**: Up to 20 concurrent queries (1 TB of concurrent queries + one additional query of unlimited size)
- **API requests per second (general)**: 10 requests/second
- **Connection API read requests**: 1,000 requests/minute
- **Connection API write requests**: 100 requests/minute

**Connection Pooling:**
- BigQuery uses Google Cloud SDK (not JDBC), so traditional connection pooling concepts don't apply
- Each test creates a BigQuery client instance (see `database-details->client` function)
- Client instances are lightweight (no persistent connections like JDBC)
- API calls are HTTP-based, limited by API quotas rather than connection pool size

**Impact on Parallelism:**
- **300 concurrent API requests** is the primary limit for parallel test execution
- With 2-3 partitions, each partition can use up to 150-100 concurrent requests (within limits)
- With 4-5 partitions, each partition gets ~75-60 concurrent requests (still workable)
- With 10+ partitions, each partition only gets ~30 concurrent requests, but you hit other limits:
  - **20 concurrent queries limit**: More partitions = higher chance of hitting query limit simultaneously
  - **Rate limiting**: 100 req/s per method means more partitions compete for same API endpoints
- Concurrent queries are limited to 20 per project, but test queries are typically small
- API rate limits (100 req/s per method) may cause throttling if too many tests hit same endpoints

**References:**
- BigQuery Quotas: https://cloud.google.com/bigquery/quotas
- Current configuration: `modules/drivers/bigquery-cloud-sdk/src/metabase/driver/bigquery_cloud_sdk.clj:77-90`

#### GitHub Actions Compute Resources

**Default Runners (`ubuntu-latest`):**
- **vCPUs**: 2 cores
- **Memory**: 7 GB RAM
- **Storage**: 14 GB SSD
- **Network**: 5 Gbps
- **Current Usage**: All driver tests use `runs-on: ubuntu-latest` (default runners)

**Larger Runners (Available but not currently used):**
- **4-core runners**: 4 vCPUs, 16 GB RAM
- **8-core runners**: 8 vCPUs, 32 GB RAM
- **16-core runners**: 16 vCPUs, 64 GB RAM
- **32-core runners**: 32 vCPUs, 128 GB RAM
- **64-core runners**: 64 vCPUs, 256 GB RAM
- **Note**: Larger runners require explicit configuration (not using `ubuntu-latest`)

**Concurrency Limits:**
- **Free tier**: 20 concurrent jobs
- **Pro/Team/Enterprise**: Higher limits (varies by plan)
- **Matrix jobs**: Each matrix job counts as a separate job
- **Parallel partitions**: Each partition runs as a separate job (within concurrency limits)

**How to Check Your Current Worker Usage:**
1. **GitHub Actions Tab (Manual Check):**
   - Go to your repository → Actions tab
   - Look at "In progress" workflows to count active jobs
   - Each job = 1 runner = counts toward concurrency limit
   - Note: This only shows current usage, not historical patterns

2. **GitHub Actions Usage Metrics (Enterprise Cloud):**
   - Navigate to your organization profile → Insights tab → Actions Usage Metrics
   - Shows total minutes, job runs, and usage patterns
   - Available for Enterprise Cloud plans

3. **Organization Settings:**
   - Go to your organization → Settings → Actions → Runners
   - Check your plan's concurrency limit
   - Free tier: 20 concurrent jobs
   - Pro/Team/Enterprise: Check your specific plan limits

4. **GitHub API (Programmatic):**
   - Use GitHub API to query active workflow runs
   - Endpoint: `GET /repos/{owner}/{repo}/actions/runs?status=in_progress`
   - Count jobs with `status=in_progress` or `status=queued`

5. **Third-Party Tools:**
   - `actions-usage` tool: https://github.com/self-actuated/actions-usage
   - Aggregates usage data across organization/user account

**Impact on Parallelism:**
- **2 vCPUs limit true parallelism**: With 2 cores, you can't truly run more than 2 CPU-intensive operations in parallel
- **I/O-bound operations benefit more**: Network calls to BigQuery can overlap on 2 cores
- **Memory (7 GB) is typically sufficient**: For Clojure/JVM tests, memory is less of a bottleneck
- **Larger runners could help**: More CPU cores would enable more true parallelism, but may not be necessary for I/O-bound tests

**Current Constraints:**
- Tests run on default 2-core runners
- With test partitioning (2-3 partitions), each partition gets its own 2-core runner
- Parallel tests within a single job share the 2-core runner
- This suggests test-level parallelism (`^:parallel`) is more about overlapping I/O than CPU parallelism

**How High Can We Turn the Dial?**

**Runner Size:**
- **Current**: 2 vCPUs, 7 GB RAM (default `ubuntu-latest`)
- **Maximum**: 64 vCPUs, 256 GB RAM (larger runners)
- **Limitation**: Requires explicit configuration (not using `ubuntu-latest`)
- **Cost**: Larger runners are charged per minute (default runners are free for public repos)

**Parallelism via Matrix Jobs (Test Partitioning):**
- **Current**: Single job (no partitioning)
- **Practical limit**: 3-4 partitions is the sweet spot (see "Why 3-4 Partitions?" section below)
- **Concurrency limit**: Depends on GitHub plan (Free: 20 jobs, Pro/Enterprise: higher)
- **Cost**: Each partition uses a separate runner (2 cores each = 6-8 cores total)
- **Recommendation**: 3-4 partitions is optimal (beyond that, diminishing returns)

**Why 3-4 Partitions is the Sweet Spot:**

1. **BigQuery API Limits (Primary Constraint):**
   - **300 concurrent API requests max** across all partitions
   - With 3 partitions: ~100 requests/partition (comfortable margin)
   - With 4 partitions: ~75 requests/partition (still workable)
   - With 10+ partitions: ~30 requests/partition (wasteful, hitting other limits)
   - **20 concurrent queries limit**: More partitions = higher chance all partitions query simultaneously
   - **Rate limiting**: 100 req/s per method means partitions compete for same endpoints

2. **Diminishing Returns from Overhead:**
   - Each partition has fixed overhead: checkout (~30s), JVM startup (~10s), test discovery (~5s)
   - With 111 tests:
     - 1 partition: 111 tests + 45s overhead = 40min total
     - 3 partitions: 37 tests + 45s overhead each = ~13min + 45s = ~14min (2.8x speedup)
     - 6 partitions: 18-19 tests + 45s overhead each = ~7min + 45s = ~8min (5x speedup, but...)
     - 10 partitions: 11 tests + 45s overhead each = ~4min + 45s = ~5min (8x theoretical, but overhead is now 45% of runtime!)

3. **Partition Imbalance:**
   - Tests aren't perfectly evenly distributed
   - Some partitions might get all the slow sync tests
   - More partitions = higher variance in partition runtime
   - Slowest partition determines total runtime (Amdahl's Law)

4. **GitHub Actions Concurrency:**
   - Free tier: 20 concurrent jobs max
   - Each partition = 1 job
   - If other tests run simultaneously, 10+ partitions could exhaust quota
   - Even with higher tiers, you don't want to hog all runners

5. **Practical Testing:**
   - Redshift uses 2 partitions (proven to work well)
   - 3-4 partitions gives near-linear speedup with manageable complexity
   - Beyond 4, you're splitting hairs for minimal gains

**Parallelism via Test Annotation (`^:parallel`):**
- **Current**: ~22 tests marked `^:parallel` (out of ~72)
- **Theoretical limit**: All tests could be parallel (if isolated)
- **Practical limit**: Limited by 2-core runner (I/O-bound tests can overlap)
- **Cost**: No additional cost (same runner)
- **Recommendation**: Add `^:parallel` to more tests (Strategy 2)
- **Important**: `^:parallel` tests run in parallel WITHIN their partition (same runner), NOT across partitions
  - Example: If Partition 1 has tests A, B, C (A and B are `^:parallel`):
    - A and B run in parallel on Runner 1
    - C runs sequentially after A/B finish on Runner 1
    - Partition 2's tests run on Runner 2 (separate runner, separate execution)

**Combined Approach:**
- **Test Partitioning (3-4 partitions)** + **Parallel Tests within partitions** = Best approach
- **3-4 partitions** × **~24 parallel tests per partition** = Significant parallelism
- **Total parallelism**: 3-4 jobs × (2 cores + parallel I/O) = Maximum practical parallelism
- **Cost**: 3-4 default runners (free for public repos)

**Recommendation:**
- **For now**: Default runners (2 cores) are sufficient for test partitioning strategy
- **Test partitioning**: Use 3-4 partitions (optimal balance of speed vs cost - see "Why 3-4 Partitions is Optimal" analysis)
- **Test-level parallelism**: Add `^:parallel` to more tests (within partition)
- **Larger runners**: Only consider if CPU becomes a bottleneck (unlikely for I/O-bound cloud tests)
- **Cost consideration**: Default runners are free for public repos; larger runners cost more

**Quick Test Options:**

**Option 1: More Runners (Recommended for I/O-bound tests)**
- **Easiest test**: Add more partitions to the matrix to get more parallel runners
  - BigQuery job (lines 144-148): Add 3-4 partition entries to the matrix
  - Each partition = 1 runner running in parallel
  - Example: 3 partitions = 3 runners running simultaneously
  - See Redshift example (lines 1138-1153) for pattern
- **Cost**: Free (default runners are free for public repos)
- **Expectation**: Linear speedup (3 partitions ≈ 3x faster, up to API limits)
- **Limits**: 
  - BigQuery API: 300 concurrent requests, 20 concurrent queries
  - GitHub concurrency limits (Free: 20 jobs)
  - Practical limit: 3-4 partitions is optimal (beyond that, diminishing returns)

**Option 2: Larger Runners (Less likely to help)**
- **Test**: Change `runs-on: ubuntu-latest` to a larger runner label (if available)
  - BigQuery job (line 139): Change to `ubuntu-latest-4-cores` or similar (requires Enterprise)
  - Note: If runner label doesn't exist, GitHub will fail with "runner not found"
  - This is a quick way to see if more CPU helps, though tests are I/O-bound (network calls)
- **Cost**: Larger runners charge per minute (not free like default runners)
- **Expectation**: May not help much since cloud tests are network I/O-bound, not CPU-bound

**References:**
- GitHub Actions Runner Specs: https://docs.github.com/en/actions/using-github-hosted-runners/about-larger-runners
- Current workflow configuration: `.github/workflows/drivers.yml` (all jobs use `runs-on: ubuntu-latest`)

## Optimization Strategies

### Strategy 1: Test Partitioning (High Impact, Low Risk)
**Status**: Proven pattern used by Redshift driver tests

**Applies To**: BigQuery, Snowflake (Redshift already has this)

**Action**: Split tests into 3-4 parallel jobs using `:partition/total` and `:partition/index`

**Why 3-4 Partitions is Optimal:**

1. **BigQuery API Limits (Primary Constraint):**
   - **300 concurrent API requests max** across all partitions
   - With 3 partitions: ~100 requests/partition (comfortable margin)
   - With 4 partitions: ~75 requests/partition (still workable)
   - With 10+ partitions: ~30 requests/partition (wasteful, hitting other limits)
   - **20 concurrent queries limit**: More partitions = higher chance all partitions query simultaneously
   - **Rate limiting**: 100 req/s per method means partitions compete for same endpoints

2. **Diminishing Returns from Overhead:**
   - Each partition has fixed overhead: checkout (~30s), JVM startup (~10s), test discovery (~5s) = ~45s total
   - With 111 tests:
     - 1 partition: 111 tests + 45s overhead = 40min total
     - 3 partitions: 37 tests + 45s overhead each = ~13min + 45s = ~14min (2.8x speedup)
     - 6 partitions: 18 tests + 45s overhead each = ~7min + 45s = ~8min (5x theoretical, but overhead is now significant)
     - 10 partitions: 11 tests + 45s overhead each = ~4min + 45s = ~5min (8x theoretical, but overhead is 45% of runtime!)

3. **Partition Imbalance:**
   - Tests aren't perfectly evenly distributed
   - Some partitions might get all the slow sync tests
   - More partitions = higher variance in partition runtime
   - Slowest partition determines total runtime (Amdahl's Law)

4. **GitHub Actions Concurrency:**
   - Free tier: 20 concurrent jobs max
   - Each partition = 1 job
   - If other tests run simultaneously, 10+ partitions could exhaust quota
   - Even with higher tiers, you don't want to hog all runners

5. **Practical Experience:**
   - Redshift uses 2 partitions (proven to work well)
   - 3-4 partitions gives near-linear speedup with manageable complexity
   - Beyond 4, you're optimizing for diminishing returns

**Implementation Steps**:
1. **BigQuery**: Modify `.github/workflows/drivers.yml:136-205` to add matrix jobs similar to Redshift pattern
2. **Snowflake**: Modify `.github/workflows/drivers.yml:1214-1294` to add matrix jobs similar to Redshift pattern
3. **Redshift**: Already implemented with 2 partitions - consider adding 3rd partition if still slow
4. Split into 3-4 partitions:
   - Part 1: First third/quarter of tests
   - Part 2: Second third/quarter of tests  
   - Part 3: Third third/quarter of tests
   - Part 4: (Optional) Fourth partition if needed
5. Each partition runs in parallel on separate GitHub Actions runners
   - **Note**: No explicit worker configuration needed! Each matrix entry automatically gets its own runner
   - GitHub Actions spins up one runner per matrix job (up to your plan's concurrency limit: 20 for free tier)
   - Example: 3 partitions = 3 matrix entries = 3 parallel jobs = 3 runners automatically

**Expected Impact**: 3-4x speedup (from 40min → 10-13min per partition)

**Risk**: Low - well-established pattern, just requires determining partition sizes

**Reference**: See Redshift implementation at `.github/workflows/drivers.yml:1144-1153`

**Database-Specific Notes**:
- **BigQuery**: Apply 2-3 partition strategy
- **Snowflake**: Apply 2-3 partition strategy
- **Redshift**: Already has 2 partitions - evaluate if 3rd partition needed

---

### Strategy 2: Enable Parallel Test Execution (Medium Impact, Medium Risk)
**Status**: Some tests already marked `^:parallel`, many are not

**Applies To**: All three drivers (BigQuery, Snowflake, Redshift)

**Action**: Identify tests that can safely run in parallel and add `^:parallel` annotation

**✅ CONFIRMED: Parallel Execution Works!**
- GitHub Actions logs show 1082 tests (46%) already running in parallel
- 1259 tests (54%) are single-threaded - these are candidates for `^:parallel` annotation
- If we can mark even 50% of single-threaded tests as parallel, we could see significant speedup

**Expected Impact**: 1.5-2x speedup for eligible tests (parallel execution within single job)

**Implementation Steps**:

**Phase 1: Identify Candidates (RECOMMENDED: Bulk Mark and Filter)**
1. **Bulk mark all tests as `^:parallel`** in a test file/namespace
   - Use find/replace: `(deftest test-name` → `(deftest ^:parallel test-name`
2. **Run clj-kondo to filter unsafe tests:**
   ```bash
   ./bin/mage kondo modules/drivers/bigquery-cloud-sdk/test
   ```
3. **Remove `^:parallel` from tests that fail linter checks**
   - Look for `:metabase/validate-deftest` errors
   - These indicate tests that CAN'T be parallel (use thread-unsafe operations)
4. **Keep `^:parallel` on tests that pass linter**
   - These are good candidates for parallel execution

**What the Linter Catches:**
- Thread-unsafe operations (`with-redefs`, `System/setProperty`, `alter-var-root`, etc.)
- Destructive functions ending in `!` (unless whitelisted in `.clj-kondo/config.edn:parallel/safe`)
- See `.clj-kondo/config.edn:parallel/unsafe` for full list

**What the Linter WON'T Catch (Requires Manual Review):**
- Tests that share mutable state (but don't use thread-unsafe operations)
- Tests with execution order dependencies
- Tests that modify global state in other ways

**Phase 2: Validate Candidates**
1. Run tests locally to check for flakiness
2. Monitor CI for race conditions
3. Consider starting with a subset and expanding

**Phase 3: Measure Impact**
1. Compare test runtime before/after adding `^:parallel`
2. Monitor CI for flakiness increases
3. Profile actual parallel execution

**Best Candidates for `^:parallel`:**
- Tests that only query data (don't modify state)
- Tests that use isolated datasets/databases (most cloud driver tests)
- Fast tests (query-only, no sync operations)
- Tests that don't use thread-unsafe operations

**Avoid `^:parallel` for:**
- Tests that perform sync operations (slow, resource-intensive)
- Tests that use `with-redefs` or other thread-unsafe operations
- Tests that share mutable state
- Tests that depend on execution order

**Constraints That Limit Parallelism:**
1. **API/Connection Limits** (Provider quotas) - Primary bottleneck
   - BigQuery: 300 concurrent API requests, 20 concurrent queries
   - Too many parallel tests could hit rate limits (429 errors)
2. **Resource Constraints** (CPU cores, memory) - Limits true parallelism
   - GitHub Actions runners: 2 vCPUs, 7 GB RAM
   - I/O-bound tests can overlap, but CPU-intensive tests are limited
3. **Setup/Teardown Costs** (Dataset creation) - Minimized by reuse
   - Tests reuse datasets when possible (`dataset-already-loaded?`)
   - Parallel tests may still create multiple datasets if needed
4. **Test Isolation** (Shared state) - Prevents some tests from being parallel
   - BigQuery: Each test uses unique dataset (via `test-dataset-id`)
   - Tests that share mutable state must run sequentially

**Tools and Commands:**
```bash
# Find parallel vs sequential tests
for driver in bigquery-cloud-sdk snowflake redshift; do
  echo "=== $driver ==="
  echo "Parallel: $(grep -rE '^\s*\(deftest\s+\^:parallel' modules/drivers/$driver/test/**/*.clj 2>/dev/null | wc -l | xargs)"
  echo "Sequential: $(grep -rE '^\s*\(deftest\s+[^:]' modules/drivers/$driver/test/**/*.clj 2>/dev/null | grep -v '^:parallel' | wc -l | xargs)"
done

# Check for thread-unsafe patterns
grep -rE "(with-redefs|System/setProperty|alter-var-root)" modules/drivers/bigquery-cloud-sdk/test/**/*.clj
```

**Risk**: Medium - Need to ensure tests are truly isolated, may require test refactoring

**Reference**: 
- Existing parallel tests like BigQuery's `sanity-check-test`, `table-rows-sample-test`
- Thread-unsafe operations list: `.clj-kondo/config.edn:parallel/unsafe`
- Parallel test validation: `.clj-kondo/src/hooks/clojure/test.clj`

**Database-Specific Notes:**
- Each driver has different test structure - analyze separately
- Cloud databases typically support isolated test databases/datasets
- BigQuery: Each test uses unique dataset (via `test-dataset-id` with hash prefix)

---

### Strategy 3: Optimize Sync Operations (Medium Impact, Medium Risk)
**Status**: Sync operations are inherently slow (require cloud API calls)

**Applies To**: All three drivers (BigQuery, Snowflake, Redshift)

**Action**: Reduce unnecessary sync operations and optimize sync calls

**Implementation Steps**:
1. Profile which tests perform sync operations for each driver
2. Identify opportunities to:
   - Reuse synced databases across multiple tests
   - Cache sync results where possible
   - Use lighter-weight sync options (e.g., schema-only syncs where appropriate)
3. Consider mocking sync operations for tests that don't actually need them
4. Batch API calls where possible

**Expected Impact**: 10-30% reduction in sync-heavy test suites

**Risk**: Medium - Need to ensure test correctness, may require careful refactoring

**Reference**: BigQuery tests like `sync-views-test`, `sync-materialized-view-test`, `full-sync-partitioned-table-test`

**Database-Specific Notes**:
- Each cloud provider has different sync characteristics
- BigQuery: Dataset/table sync operations
- Snowflake: Schema/table sync operations
- Redshift: Schema/table sync operations
- Optimization opportunities may vary by provider

---

### Strategy 4: Optimize Test Data Setup (Low-Medium Impact, Low Risk)
**Status**: Test data setup happens per-test or per-test-suite

**Applies To**: All three drivers (BigQuery, Snowflake, Redshift)

**Action**: Reuse test databases/datasets and optimize database creation

**Implementation Steps**:
1. Review test data setup code for each driver:
   - BigQuery: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj`
   - Snowflake: `modules/drivers/snowflake/test/metabase/test/data/snowflake.clj`
   - Redshift: `modules/drivers/redshift/test/metabase/test/data/redshift.clj`
2. Check if databases/datasets can be shared across tests (with unique table names)
3. Optimize database/table creation (e.g., bulk inserts, parallel creation)
4. Consider database reuse strategies similar to other drivers

**Expected Impact**: 5-15% reduction in setup time

**Risk**: Low - Mostly configuration optimization

**Reference**: BigQuery's `test-dataset-id` function in `bigquery_cloud_sdk.clj`

**Database-Specific Notes**:
- Each cloud provider has different database/schema isolation models
- BigQuery: Uses datasets (schemas)
- Snowflake: Uses databases and schemas
- Redshift: Uses databases and schemas
- Sharing strategies may differ by provider

---

### Strategy 5: Enable Fail-Fast (Low Impact, Low Risk)
**Status**: Redshift already has this, BigQuery and Snowflake do not

**Applies To**: BigQuery, Snowflake (Redshift already has this)

**Action**: Add `:fail-fast? true` to test args (like Redshift)

**Implementation Steps**:
1. **BigQuery**: Add `:fail-fast? true` to test-args in `.github/workflows/drivers.yml:146-148`
2. **Snowflake**: Add `:fail-fast? true` to test-args in `.github/workflows/drivers.yml:1224-1226`
3. **Redshift**: Already implemented - no action needed
4. This stops execution on first failure, saving time on failing test runs

**Expected Impact**: Time savings only on failed test runs (doesn't help passing runs)

**Risk**: Low - Only affects failing test runs, doesn't change success path

**Reference**: Redshift implementation at `.github/workflows/drivers.yml:1137, 1143, 1151, 1158`

---

### Strategy 6: Profile and Measure (Discovery)
**Status**: Need baseline measurements to identify specific bottlenecks

**Applies To**: All three drivers (BigQuery, Snowflake, Redshift)

**Action**: Add timing/profiling to understand where time is spent

**Implementation Steps**:
1. Run tests locally with timing enabled for each driver
2. Use Clojure profiling tools (e.g., `clj-async-profiler`, `criterium`)
3. Analyze GitHub Actions logs for timing patterns
4. Identify specific slow tests or operations per driver
5. Create test execution time reports for each driver
6. Measure Redshift's current partitioned runtime as baseline

**Expected Impact**: Informs prioritization of other strategies

**Risk**: None - Only measurement

**Reference**: `test/metabase/query_processor/perf_test.clj` shows profiling patterns

**Database-Specific Notes**:
- Each driver may have different bottlenecks
- Redshift: Measure partitioned runtime vs total runtime
- BigQuery: Measure current ~40min baseline
- Snowflake: Establish baseline measurement

---

## Recommended Implementation Order

### Phase 1: Quick Wins (Low Risk, High Impact)
**Applies To**: BigQuery, Snowflake (Redshift already has partitioning and fail-fast)

1. **Test Partitioning** (Strategy 1) - Can implement immediately for BigQuery & Snowflake
2. **Fail-Fast** (Strategy 5) - Trivial addition for BigQuery & Snowflake
3. **Profile and Measure** (Strategy 6) - Do in parallel to inform next steps for all drivers

**Expected Result for BigQuery & Snowflake**: ~2x speedup (40min → 20min) with minimal risk

**Redshift**: Already has partitioning - verify current performance and consider 3rd partition if needed

### Phase 2: Optimizations (Medium Risk, Medium Impact)
**Applies To**: All three drivers

4. **Parallel Test Execution** (Strategy 2) - Requires careful analysis per driver
5. **Optimize Sync Operations** (Strategy 3) - Requires test refactoring per driver

**Expected Result**: Additional 20-40% speedup (20min → 12-16min)

### Phase 3: Fine-tuning (Low Risk, Low-Medium Impact)
**Applies To**: All three drivers

6. **Optimize Test Data Setup** (Strategy 4) - Incremental improvements per driver

**Expected Result**: Additional 5-15% speedup (12-16min → 10-15min target)

---

## Metrics to Track

### Before Optimization

**BigQuery:**
- Total test runtime: ~40 minutes (26 minutes actual test execution + overhead)
- Number of test functions: ~2341 total tests
- Number of parallel tests: 1082 (46% - confirmed from GitHub Actions logs)
- Number of single-threaded tests: 1259 (54% - opportunity for Strategy 2)
- Test execution pattern: Parallel tests within single job (no partitioning yet)

**Snowflake:**
- Total test runtime: TBD (needs baseline measurement)
- Number of test functions: TBD
- Number of parallel tests: TBD
- Test execution pattern: Sequential (single job)

**Redshift:**
- Total test runtime: TBD (needs measurement of partitioned runtime)
- Number of test functions: TBD
- Test execution pattern: Already partitioned (2 jobs)
- Current optimizations: Has partitioning and fail-fast

### After Optimization (Target for All Drivers)
- Total test runtime per partition: Target 15-20 minutes
- Number of parallel tests: Target 50-60%+ (where applicable)
- Test execution pattern: Parallel jobs + parallel tests within jobs
- Flakiness rate: Should remain same or decrease

---

## Implementation Notes

### Test Partitioning Details
- The Clojure test runner supports `:partition/total` and `:partition/index` arguments
- Tests are distributed deterministically across partitions
- Each partition runs on a separate GitHub Actions runner (parallel execution)
- See `.github/workflows/drivers.yml:1144-1153` for Redshift example
- **BigQuery**: Implement 2-3 partition strategy
- **Snowflake**: Implement 2-3 partition strategy
- **Redshift**: Already has 2 partitions - evaluate if 3rd partition needed

### Parallel Test Safety
- Tests marked `^:parallel` must not share mutable state
- Cloud databases provide isolation:
  - BigQuery: Datasets are isolated (each test uses unique dataset IDs via `test-dataset-id`)
  - Snowflake: Databases/schemas are isolated
  - Redshift: Databases/schemas are isolated
- Need to verify tests don't interfere with each other per driver
- Review `.clj-kondo/config.edn` for parallel test rules

### How `^:parallel` Works with Partitioning
**Key Distinction:**
- **Partitioning** (`:partition/total`, `:partition/index`): Splits tests across multiple GitHub Actions jobs/runners (CI/CD level)
- **`^:parallel` annotation**: Marks tests that can run in parallel WITHIN a single job/runner (test execution level)

**Important: What Actually Controls Parallel Execution?**
- **`^:parallel` is metadata**, not a guarantee of parallel execution
- The test runner (hawk) must actually implement parallel execution
- **Current status**: It's unclear if hawk (version 1.0.13) actually executes `^:parallel` tests in parallel
- The annotation is primarily used for **validation** (clj-kondo checks that `^:parallel` tests don't use thread-unsafe operations)
- **If your tests aren't running in parallel**, it's likely because:
  1. Hawk may not implement parallel execution (runs tests sequentially regardless of annotation)
  2. There may be a configuration option that needs to be enabled
  3. The annotation may be for future use or documentation only

**Configuration Options to Check:**

**Checked-in Configuration (in repository):**
1. **`deps.edn`** - Test alias configuration:
   - `:exec-args` - Arguments passed to hawk (currently: `:only-tags`, `:exclude-tags`, `:partition/total`, `:partition/index`)
   - `:jvm-opts` - JVM options (currently: memory settings, system properties)
   - **No parallel-specific options found** in current configuration
2. **`.github/workflows/*.yml`** - Workflow files:
   - Environment variables (e.g., `CI: 'true'`, `DRIVERS: bigquery-cloud-sdk`)
   - Test arguments passed via `test-args` input
   - **No parallel-specific environment variables found**
3. **`.clj-kondo/config.edn`** - Linter configuration:
   - Validates `^:parallel` tests don't use thread-unsafe operations
   - **Does not control execution**, only validation

**GitHub UI Configuration (not in repository):**
1. **Repository Secrets** (Settings → Secrets and variables → Actions → Secrets):
   - Database credentials, API keys (e.g., `MB_BIGQUERY_TEST_PROJECT_ID`)
   - **Unlikely to control parallelism**, but worth checking
2. **Repository Variables** (Settings → Secrets and variables → Actions → Variables):
   - Configuration values (e.g., `AWS_S3_TEST_RESULTS_BUCKET`)
   - **Unlikely to control parallelism**
3. **Organization Settings** (Settings → Actions → General):
   - Concurrency limits (Free: 20 jobs, Pro/Enterprise: higher)
   - **Controls partition parallelism**, not test-level parallelism
4. **Workflow Environment Variables** (in workflow YAML):
   - Set in `.github/workflows/*.yml` files (checked-in)
   - Could potentially be overridden in GitHub UI, but not currently used for parallelism

**How to Check:**
1. **Hawk library documentation/source**: Check if `mb.hawk.core` supports parallel execution
2. **Test execution arguments**: Check if hawk accepts parallel-related `:exec-args` (e.g., `:parallel? true`, `:threads N`)
3. **Environment variables**: Check if hawk reads any environment variables for parallelism
4. **JVM options**: Check if any JVM system properties control parallelism (e.g., `-Dhawk.parallel=true`)

**Evidence from Codebase and GitHub Actions Logs:**

1. **Runtime Enforcement Exists**: `mb.hawk.parallel/assert-test-is-not-parallel` is called at runtime when thread-unsafe operations are used in `^:parallel` tests. This suggests hawk DOES support parallel execution (otherwise why runtime checks?).

2. **Test That Explicitly Tests Parallelism**: `test/metabase/test/util_test.clj:54` has a test `with-dynamic-fn-redefs-test` marked `^:parallel` that explicitly tests parallel execution with multiple threads using `future` - this suggests the test runner supports parallel execution.

3. **✅ CONFIRMED: Parallel Execution IS Working**: GitHub Actions logs show:
   ```
   Ran 2341 tests in 1558.839 seconds
   {:test 2341,
    :pass 19218,
    :fail 0,
    :error 0,
    :type :summary,
    :duration 1558839.268332,
    :single-threaded 1259,
    :parallel 1082}
   Ran 1082 tests in parallel, 1259 single-threaded.
   ```
   - **1082 tests ran in parallel** (46% of tests)
   - **1259 tests ran single-threaded** (54% of tests)
   - This proves hawk DOES execute `^:parallel` tests in parallel!
   - **Strategy 2 (add more `^:parallel` annotations) can help** - more tests can be parallelized

**✅ VERIFIED: Parallel Execution is Working!**

GitHub Actions logs confirm that hawk executes `^:parallel` tests in parallel:
- **1082 tests ran in parallel** (46% of total tests)
- **1259 tests ran single-threaded** (54% of total tests)
- This means Strategy 2 (adding more `^:parallel` annotations) can provide real speedup

**Current State for BigQuery:**
- Total tests: 2341
- Parallel tests: 1082 (46%)
- Single-threaded tests: 1259 (54%)
- **Opportunity**: ~54% of tests could potentially be marked `^:parallel` (if they're safe to parallelize)

**✅ CONFIRMED: Parallel Execution IS Working!**

GitHub Actions logs definitively prove that hawk executes `^:parallel` tests in parallel:
- **1082 tests ran in parallel** (46% of total tests)
- **1259 tests ran single-threaded** (54% of total tests)
- This means **Strategy 2 (adding more `^:parallel` annotations) can provide real speedup**
- **Opportunity**: ~54% of tests are still single-threaded and could potentially be parallelized

**Example with 3 partitions:**
- **Partition 1** (Runner 1): Tests A, B, C (A and B are `^:parallel`)
  - A and B run in parallel on Runner 1
  - C runs sequentially after A/B finish on Runner 1
- **Partition 2** (Runner 2): Tests D, E, F (D and E are `^:parallel`)
  - D and E run in parallel on Runner 2
  - F runs sequentially after D/E finish on Runner 2
- **Partition 3** (Runner 3): Tests G, H, I (all sequential)
  - G, H, I run sequentially on Runner 3

**Important Points:**
- `^:parallel` tests run in parallel WITHIN their partition (same runner)
- `^:parallel` tests do NOT run in parallel with tests from other partitions (different runners)
- Each partition is completely independent (separate GitHub Actions job, separate runner)
- Total parallelism = (Number of partitions) × (Parallel tests within each partition)

### Risk Mitigation
- Implement changes incrementally per driver
- Test changes locally before merging
- Monitor CI for flakiness increases per driver
- Keep partitioning logic simple (deterministic distribution)
- Document any test isolation requirements per driver
- Start with BigQuery and Snowflake (Redshift already optimized)

---

## Questions to Investigate

### Common to All Drivers
1. **Partitioning Strategy**: How should tests be distributed? (alphabetical, test-file-based, equal distribution)
   - **Answer**: See "Why 3-4 Partitions is Optimal" analysis in Strategy 1 section
   - **Optimal count**: 3-4 partitions balances API limits, overhead, and practical gains
   - **Distribution**: Clojure test runner handles distribution automatically via `:partition/total` and `:partition/index`
   - **Considerations**: Tests are distributed deterministically, but may not be perfectly balanced (some partitions may get more slow tests)
2. **Parallel Test Limits**: What's the maximum safe parallelism? (API rate limits, connection limits per provider)
   - **Answer**: See "Why 3-4 Partitions is Optimal" analysis in Strategy 1 section
   - **BigQuery**: 300 concurrent API requests, 20 concurrent queries (supports 3-4 partitions comfortably)
   - **GitHub Actions**: Free tier has 20 concurrent jobs limit (each partition = 1 job)
   - **Practical limit**: 3-4 partitions is optimal before hitting diminishing returns
3. **Sync Optimization**: Can we identify sync-heavy tests and optimize them specifically per driver?
4. **Test Dependencies**: Are there test execution order dependencies we need to preserve per driver?

### BigQuery-Specific
5. **BigQuery API Limits**: 
   - 300 concurrent API requests per user (primary limit)
   - 20 concurrent queries per project
   - 100 requests/second per user per method
   - **Answer**: See "Why 3-4 Partitions is Optimal" analysis in Strategy 1 section
   - **300 concurrent requests** supports 3-4 partitions comfortably (~75-100 requests/partition)
   - **20 concurrent queries** is the secondary limit (more partitions = higher chance of hitting this simultaneously)
   - **100 req/s rate limit** means partitions may compete for same API endpoints
   - **Recommendation**: 3-4 partitions is optimal (beyond that, you hit diminishing returns from overhead and API limits)
6. **Dataset Isolation**: How many datasets can be created/used simultaneously?
   - **Answer**: BigQuery allows thousands of datasets per project - not a limiting factor

### Snowflake-Specific
7. **Snowflake Quotas**: Are there API/warehouse quota limits that would affect parallelization?
8. **Database Isolation**: How many databases can be created/used simultaneously?
9. **Warehouse Limits**: Are there concurrent query limits?

### Redshift-Specific
10. **Current Performance**: What is the actual runtime with 2 partitions?
11. **Third Partition**: Would adding a 3rd partition help, or is 2 sufficient?
12. **Connection Limits**: Are there concurrent connection limits that prevent more parallelism?

---

## References

### Workflow Configuration
- Redshift test partitioning (reference implementation): `.github/workflows/drivers.yml:1124-1212`
- BigQuery test configuration: `.github/workflows/drivers.yml:136-205`
- Snowflake test configuration: `.github/workflows/drivers.yml:1214-1294`
- Test driver action: `.github/actions/test-driver/action.yml`

### Test Files
- BigQuery test files: `modules/drivers/bigquery-cloud-sdk/test/`
- Snowflake test files: `modules/drivers/snowflake/test/`
- Redshift test files: `modules/drivers/redshift/test/`
- Parallel test examples: Search for `^:parallel` in test files

### Test Data Setup
- BigQuery: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj`
- Snowflake: `modules/drivers/snowflake/test/metabase/test/data/snowflake.clj`
- Redshift: `modules/drivers/redshift/test/metabase/test/data/redshift.clj`

### Test Execution Framework
- Clojure `clojure.test` with Metabase test utilities
- Hawk test runner for finding and running tests

---

## Success Criteria

### Primary Goals
- **BigQuery**: Reduce runtime from ~40 minutes to 15-20 minutes (2x speedup)
- **Snowflake**: Reduce runtime to 15-20 minutes (needs baseline measurement first)
- **Redshift**: Maintain or improve current performance (verify partitioned runtime)

### Completion Criteria
1. ✅ Test partitioning implemented for BigQuery and Snowflake (2-3 partitions)
2. ✅ Fail-fast enabled for BigQuery and Snowflake
3. ✅ Baseline measurements established for all three drivers
4. ✅ Test runtime per partition ≤ 20 minutes (target: 15-20 minutes)
5. ✅ No increase in flakiness rate
6. ✅ All tests still passing

### Success Metrics
- **Runtime**: Per-partition runtime ≤ 20 minutes (target 15 minutes)
- **Flakiness**: Flakiness rate ≤ current baseline (monitor for 1-2 weeks)
- **Cost**: No additional cost (using default runners)
- **Reliability**: Test failure rate ≤ current baseline

---

## Next Steps / Action Items

### Immediate (Phase 1)
1. **Measure baseline** - Run BigQuery tests 3-5 times to establish current runtime average
2. **Measure Snowflake baseline** - Run Snowflake tests 3-5 times to establish current runtime
3. **Measure Redshift partitioned runtime** - Check current runtime with 2 partitions
4. **Implement test partitioning for BigQuery** - Add 2-3 partition matrix jobs (see Strategy 1)
5. **Implement test partitioning for Snowflake** - Add 2-3 partition matrix jobs (see Strategy 1)
6. **Add fail-fast to BigQuery and Snowflake** - Add `:fail-fast? true` to test-args
7. **Monitor results** - Run tests multiple times to verify speedup and check for flakiness

### Short-term (Phase 2)
8. **Analyze parallel test candidates** - Identify tests that could be marked `^:parallel`
9. **Implement parallel test annotations** - Add `^:parallel` to eligible tests (see Strategy 2)
10. **Profile slow tests** - Identify sync-heavy tests and optimization opportunities
11. **Optimize sync operations** - Reduce unnecessary sync calls (see Strategy 3)

### Long-term (Phase 3)
12. **Optimize test data setup** - Review dataset reuse and creation patterns
13. **Fine-tune partitioning** - Adjust partition count based on results (e.g., 2 → 3)
14. **Document lessons learned** - Update this document with actual results and insights

---

## Baseline Measurement Instructions

### How to Measure Current Runtime

**GitHub Actions:**
1. Go to recent workflow runs in GitHub Actions
2. Find `be-tests-bigquery-cloud-sdk-ee` job
3. Check "Duration" in job summary
4. Run multiple times (3-5 runs) to get average
5. Note any outliers or variance

**Local Measurement:**
```bash
# Run BigQuery tests locally with timing
DRIVERS=bigquery-cloud-sdk clojure -X:dev:ci:ee:ee-dev:drivers:drivers-dev:test \
  :only-tags '[:mb/driver-tests]' \
  :exclude-tags '[:mb/transforms-python-test]'

# Note: Local runtime may differ from CI due to network latency differences
```

**For Snowflake and Redshift:**
- Same process - check GitHub Actions job duration
- Redshift: Measure each partition separately (Part 1 and Part 2)

### What to Record
- **Average runtime** (mean of 3-5 runs)
- **Min/Max runtime** (range)
- **Standard deviation** (variance)
- **Number of test functions** (grep for `deftest`)
- **Number of parallel tests** (grep for `^:parallel`)
- **Any outliers** (runs that took significantly longer/shorter)

---

## Troubleshooting Guide

### Tests Take Longer After Partitioning
- **Check partition distribution**: Are tests evenly distributed?
- **Check for API rate limiting**: Monitor for 429 errors in logs
- **Check for resource contention**: Are partitions competing for same resources?
- **Review partition count**: Maybe 2 partitions is better than 3?

### Tests Become Flaky After Adding `^:parallel`
- **Verify test isolation**: Check for shared mutable state
- **Check for thread-unsafe operations**: Review `.clj-kondo/config.edn:parallel/unsafe`
- **Review test data setup**: Ensure datasets/databases are truly isolated
- **Revert `^:parallel` annotation**: Remove annotation and investigate root cause

### API Rate Limiting Errors (429)
- **Reduce parallelism**: Decrease number of partitions or parallel tests
- **Add retry logic**: Check if retries are working correctly
- **Check BigQuery quotas**: Verify you're not hitting project-level limits
- **Contact cloud provider**: Consider quota increase if needed

### Connection Pool Exhaustion
- **Check connection pool size**: Review connection pool configuration
- **Reduce parallelism**: Decrease number of concurrent tests
- **Review connection lifecycle**: Ensure connections are properly closed
- **Monitor connection usage**: Add logging to track connection usage

### Tests Fail in CI but Pass Locally
- **Check environment differences**: Network latency, API quotas, etc.
- **Review test isolation**: CI may expose race conditions not visible locally
- **Check for timing issues**: CI may run tests in different order
- **Review logs**: Look for error patterns in CI logs

---

## Quick Reference: Cost/Benefit Summary

| Strategy | Impact | Risk | Effort | Cost | Priority |
|----------|--------|------|--------|------|----------|
| **1. Test Partitioning** | 2-3x speedup | Low | Medium | Free (default runners) | **HIGH** ⭐⭐⭐ |
| **2. Parallel Test Execution** | 1.5-2x speedup | Medium | High | Free | Medium |
| **3. Optimize Sync Operations** | 10-30% speedup | Medium | High | Free | Medium |
| **4. Optimize Test Data Setup** | 5-15% speedup | Low | Medium | Free | Low |
| **5. Fail-Fast** | Time on failures | Low | Low | Free | Low |
| **6. Profile and Measure** | Informs strategy | None | Low | Free | **HIGH** ⭐⭐⭐ |

**Recommended Order:**
1. Profile and Measure (Strategy 6) - Do first
2. Test Partitioning (Strategy 1) - Highest impact, low risk
3. Fail-Fast (Strategy 5) - Quick win
4. Parallel Test Execution (Strategy 2) - Medium priority
5. Optimize Sync Operations (Strategy 3) - Medium priority
6. Optimize Test Data Setup (Strategy 4) - Fine-tuning