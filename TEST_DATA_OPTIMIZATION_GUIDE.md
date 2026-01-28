# Test Data Optimization Guide

This guide outlines what to look for when optimizing test data setup for cloud drivers (BigQuery, Snowflake, Redshift) to reduce test runtime.

## Key Areas to Investigate

### 1. Dataset/Database Reuse Patterns

**What to Look For:**

#### ✅ Current Implementation (Already Optimized)
- **`dataset-already-loaded?` checks**: All three drivers implement this to avoid recreating datasets
  - **BigQuery**: Checks tracking table + INFORMATION_SCHEMA (`bigquery_cloud_sdk.clj:407-412`)
  - **Snowflake**: Checks tracking table + database existence (`snowflake.clj:259-270`)
  - **Redshift**: Checks if first table exists in session schema (`redshift.clj:286-315`)
- **Dataset tracking**: Uses `metabase_test_tracking` database/table to track which datasets exist
- **Hash-based dataset IDs**: Datasets are named with hash prefixes (`sha_<hash>_<name>`) to enable reuse across test runs

#### 🔍 Optimization Opportunities

1. **Check if `dataset-already-loaded?` is being called efficiently**
   - Look for tests that create datasets without checking first
   - Verify the check happens before expensive operations
   - Check if the tracking table query is optimized (indexed, etc.)

2. **Dataset sharing across tests**
   - **BigQuery**: Each test uses unique dataset via `test-dataset-id` (hash-based)
     - **Opportunity**: Tests using same dataset definition could share datasets
   - **Snowflake**: Similar hash-based naming (`qualified-db-name`)
     - **Opportunity**: Same as BigQuery
   - **Redshift**: Uses shared database with unique session schema
     - **Already optimized**: Single database, schema-based isolation

3. **Session-level vs. test-level datasets**
   - **Redshift**: Uses session schema (one per test run) - already optimal
   - **BigQuery/Snowflake**: Create per-dataset databases
     - **Opportunity**: Consider session-level datasets for tests that don't need isolation

**Where to Look:**
- `modules/drivers/*/test/metabase/test/data/*.clj` - `dataset-already-loaded?` implementations
- `test/metabase/test/data/impl/get_or_create.clj:229-251` - `load-dataset-data-if-needed!` function
- Test files that call `mt/dataset` or `mt/db` - check if they're reusing datasets

---

### 2. Sequential vs. Parallel Table Creation

**What to Look For:**

#### Current Implementation
- **BigQuery** (`bigquery_cloud_sdk.clj:427-446`):
  ```clojure
  (doseq [tabledef table-definitions]
    (load-tabledef! dataset-id tabledef))  ; Sequential!
  ```
  - Tables are created **sequentially** (one at a time)
  - Each table creation waits for previous to complete

- **Snowflake/Redshift**: Similar sequential patterns via SQL JDBC extensions

#### 🔍 Optimization Opportunities

1. **Parallel table creation**
   - **BigQuery**: Can create multiple tables in parallel (API supports concurrent requests)
   - **Snowflake**: Can create tables in parallel (connection pooling)
   - **Redshift**: Can create tables in parallel (connection pooling)
   
   **Example optimization:**
   ```clojure
   ;; Instead of:
   (doseq [tabledef table-definitions]
     (load-tabledef! dataset-id tabledef))
   
   ;; Consider:
   (->> table-definitions
        (map #(future (load-tabledef! dataset-id %)))
        (map deref))  ; Wait for all to complete
   ```

2. **Batch table creation**
   - Create multiple tables in single transaction (if supported)
   - Use bulk DDL operations where available

**Where to Look:**
- `modules/drivers/*/test/metabase/test/data/*.clj` - `create-db!` implementations
- Look for `doseq` loops over `table-definitions`
- Check if driver supports parallel DDL operations

---

### 3. Data Insertion Patterns

**What to Look For:**

#### Current Implementation

**BigQuery** (`bigquery_cloud_sdk.clj:272-311`):
- ✅ Already optimized: Batches inserts (10,000 rows per request)
- ✅ Uses `InsertAllRequest` for bulk inserts
- ⚠️ **Sequential batches**: Processes chunks sequentially
- ⚠️ **Synchronous waiting**: Waits up to 120 seconds for each table to load

**Snowflake/Redshift**: Use SQL JDBC `INSERT` statements (typically sequential)

#### 🔍 Optimization Opportunities

1. **Parallel data insertion**
   - **BigQuery**: Can insert data into multiple tables in parallel
   - **Snowflake**: Can use multiple connections for parallel inserts
   - **Redshift**: Can use COPY commands or parallel inserts
   
   **Example:**
   ```clojure
   ;; Instead of sequential:
   (doseq [tabledef table-definitions]
     (insert-data! dataset-id table-name rows))
   
   ;; Consider parallel:
   (->> table-definitions
        (map #(future (insert-data! dataset-id (:table-name %) (:rows %))))
        (map deref))
   ```

2. **Bulk load operations**
   - **BigQuery**: Already uses bulk inserts (good!)
   - **Snowflake**: Consider `COPY INTO` for large datasets
   - **Redshift**: Consider `COPY FROM S3` for large datasets

3. **Reduce wait times**
   - **BigQuery**: Currently waits up to 120 seconds per table
   - **Opportunity**: Use async operations where possible
   - **Opportunity**: Poll less frequently or use webhooks

**Where to Look:**
- `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj:272-311` - `insert-data!` function
- `modules/drivers/*/test/metabase/test/data/*.clj` - Data loading functions
- Look for `Thread/sleep` calls (indicates waiting/polling)

---

### 4. Dataset Cleanup and Garbage Collection

**What to Look For:**

#### Current Implementation

**BigQuery** (`bigquery_cloud_sdk.clj:339-353`):
- Deletes datasets older than 2 hours
- Runs once per test session (via `delete-old-datasets-if-needed!`)
- Uses tracking table to identify old datasets

**Snowflake** (`snowflake.clj:97-140`):
- Similar 2-day cleanup for old datasets
- Uses tracking database

**Redshift** (`redshift.clj:167-194`):
- Cleans up old schemas (1 hour threshold)
- Session-based cleanup

#### 🔍 Optimization Opportunities

1. **Cleanup frequency**
   - Currently runs once at start of test session
   - **Opportunity**: Run cleanup in background thread
   - **Opportunity**: Cleanup during test execution (non-blocking)

2. **Cleanup efficiency**
   - Check if cleanup queries are optimized
   - Consider batch deletion operations
   - Verify cleanup doesn't block test execution

**Where to Look:**
- `delete-old-datasets!` functions in each driver's test data file
- `delete-old-datasets-if-needed!` wrapper functions
- Check if cleanup blocks test execution

---

### 5. Connection and Client Reuse

**What to Look For:**

#### Current Implementation

**BigQuery**:
- Creates new client instance per operation (`bigquery` function)
- Client creation is lightweight (no persistent connections)

**Snowflake/Redshift**:
- Uses JDBC connection pooling
- Connections may be created/destroyed per operation

#### 🔍 Optimization Opportunities

1. **Client/connection pooling**
   - **BigQuery**: Client instances are already lightweight (probably fine)
   - **Snowflake/Redshift**: Check if connections are reused efficiently
   - Look for connection pool configuration

2. **Connection lifecycle**
   - Check if connections are closed promptly
   - Verify connection pool size is appropriate
   - Look for connection leaks

**Where to Look:**
- `modules/drivers/*/test/metabase/test/data/*.clj` - Connection/client creation
- `modules/drivers/*/src/metabase/driver/*.clj` - Driver connection code
- Look for connection pool configuration

---

### 6. Test Data Setup Timing

**What to Look For:**

#### Current Implementation

- Dataset creation happens **on-demand** when tests call `mt/db` or `mt/dataset`
- Uses locking mechanism (`dataset-lock`) to prevent concurrent creation
- First test to request dataset triggers creation; others wait

#### 🔍 Optimization Opportunities

1. **Pre-warming datasets**
   - Create common datasets before tests run
   - Use `before-run` hook to pre-create datasets
   - **Trade-off**: Faster tests vs. slower startup

2. **Lazy vs. eager loading**
   - Current: Lazy (create when needed)
   - **Opportunity**: Eager loading for common datasets
   - **Opportunity**: Background pre-loading

3. **Dataset creation timing**
   - Check if datasets are created at optimal times
   - Consider creating datasets in parallel partitions
   - Verify dataset creation doesn't block test execution unnecessarily

**Where to Look:**
- `test/metabase/test/data/impl/get_or_create.clj` - Dataset creation logic
- `test/metabase/test/data/interface.clj` - `before-run` and `after-run` hooks
- Test execution logs - look for dataset creation timing

---

### 7. Redshift-Specific Optimizations (Reference Implementation)

**What Redshift Does Well:**

1. **Session schema reuse** (`redshift.clj:64-65`):
   - Single database, unique schema per test run
   - All tests share same database (no per-dataset databases)
   - Minimal database creation overhead

2. **Schema-based isolation**:
   - Tables prefixed with database name
   - Filtered sync (only syncs tables for current dataset)
   - No dataset creation needed (tables created in shared schema)

3. **Efficient cleanup**:
   - Drops entire schema at end of test run
   - Cleans up old schemas at start

**Lessons for BigQuery/Snowflake:**

- Consider using schema/dataset-level isolation instead of database-level
- Share infrastructure where possible
- Use naming conventions for filtering instead of separate databases

---

## Measurement and Profiling

### How to Measure Current Performance

1. **Add timing logs**:
   ```clojure
   (u/profile "create-dataset" (create-dataset! dataset-id))
   (u/profile "load-table" (load-tabledef! dataset-id tabledef))
   ```

2. **Check GitHub Actions logs**:
   - Look for dataset creation messages
   - Time between "Creating dataset" and "Successfully created"
   - Count how many datasets are created vs. reused

3. **Profile locally**:
   ```bash
   # Run tests with profiling
   DRIVERS=bigquery-cloud-sdk clojure -X:dev:ci:ee:ee-dev:drivers:drivers-dev:test \
     :only-tags '[:mb/driver-tests]'
   ```

### Metrics to Track

- **Dataset creation time**: Time to create dataset + all tables
- **Dataset reuse rate**: % of tests that reuse existing datasets
- **Table creation time**: Time per table
- **Data insertion time**: Time to insert all rows
- **Total setup time**: End-to-end dataset setup time

---

## Quick Wins (Low-Hanging Fruit)

### 1. Parallel Table Creation (Medium Impact, Low Risk)
**BigQuery/Snowflake**: Change sequential `doseq` to parallel `pmap` or `future`:
```clojure
;; Current (sequential):
(doseq [tabledef table-definitions]
  (load-tabledef! dataset-id tabledef))

;; Optimized (parallel):
(->> table-definitions
     (pmap #(load-tabledef! dataset-id %))
     doall)
```

**Expected Impact**: 2-3x speedup for datasets with many tables

### 2. Verify Dataset Reuse is Working (Low Impact, Low Risk)
- Add logging to see how often `dataset-already-loaded?` returns `true`
- Verify tracking table is being used correctly
- Check if hash-based dataset IDs are working as expected

**Expected Impact**: Confirms optimization is working, may reveal bugs

### 3. Optimize Cleanup (Low Impact, Low Risk)
- Run cleanup in background thread
- Batch cleanup operations
- Reduce cleanup query time

**Expected Impact**: 5-10% speedup (cleanup happens at start of test run)

---

## High-Impact Optimizations (Higher Risk)

### 1. Parallel Data Insertion (High Impact, Medium Risk)
- Insert data into multiple tables simultaneously
- Requires careful error handling
- May hit API rate limits

**Expected Impact**: 2-4x speedup for datasets with many tables

### 2. Pre-warm Common Datasets (High Impact, Medium Risk)
- Create common datasets before tests run
- Requires identifying which datasets are most common
- May slow down test startup

**Expected Impact**: 20-40% speedup for tests using common datasets

### 3. Schema-Based Isolation (High Impact, High Risk)
- Use single database with schema-based isolation (like Redshift)
- Requires significant refactoring
- May break existing tests

**Expected Impact**: 30-50% speedup (eliminates database creation overhead)

---

## Files to Review

### BigQuery
- `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj`
  - `create-db!` (line 427) - Sequential table creation
  - `load-tabledef!` (line 322) - Table creation + data insertion
  - `insert-data!` (line 272) - Data insertion (already batched)
  - `dataset-already-loaded?` (line 407) - Dataset reuse check

### Snowflake
- `modules/drivers/snowflake/test/metabase/test/data/snowflake.clj`
  - `create-db!` (line 161) - Delegates to SQL JDBC extensions
  - `dataset-already-loaded?` (line 259) - Dataset reuse check
  - Check SQL JDBC load data implementation

### Redshift
- `modules/drivers/redshift/test/metabase/test/data/redshift.clj`
  - Reference implementation (already optimized)
  - Uses session schema approach
  - Minimal database creation overhead

### Common Infrastructure
- `test/metabase/test/data/impl/get_or_create.clj`
  - `load-dataset-data-if-needed!` (line 229) - Main dataset loading logic
  - `dataset-lock` (line 33) - Locking mechanism for parallel safety
- `test/metabase/test/data/sql_jdbc/load_data.clj`
  - SQL JDBC data loading implementation
  - Used by Snowflake and Redshift

---

## Summary Checklist

When optimizing test data setup, check:

- [ ] **Dataset reuse**: Are `dataset-already-loaded?` checks working? How often are datasets reused?
- [ ] **Sequential operations**: Are tables created sequentially? Can they be parallelized?
- [ ] **Data insertion**: Is data inserted sequentially? Can inserts be parallelized?
- [ ] **Bulk operations**: Are bulk operations used where available?
- [ ] **Cleanup efficiency**: Is cleanup blocking test execution? Can it run in background?
- [ ] **Connection reuse**: Are connections/clients reused efficiently?
- [ ] **Timing**: When are datasets created? Can common datasets be pre-warmed?
- [ ] **Measurement**: Are you tracking setup time metrics?

---

## References

- Strategy 4 in `CLOUD_DRIVER_TEST_OPTIMIZATION_PLAN.md`
- BigQuery test data: `modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj`
- Snowflake test data: `modules/drivers/snowflake/test/metabase/test/data/snowflake.clj`
- Redshift test data: `modules/drivers/redshift/test/metabase/test/data/redshift.clj`
- Test data interface: `test/metabase/test/data/interface.clj`
