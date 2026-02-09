(ns dev.search-perf
  "Performance testing utilities for search with large numbers of tables,
   users, and permission groups.

  Example usage:
    ;; Run full benchmark with default settings (10000 tables, 10 groups, 100 users)
    (run-full-benchmark!)

    ;; Run with custom settings
    (run-full-benchmark! {:num-tables 10000
                          :num-groups 10
                          :num-users 100
                          :iterations 5})

    ;; Manual setup for interactive testing
    (def test-env (create-test-environment! {:num-tables 1000
                                             :num-groups 5
                                             :num-users 50}))
    (timed-search! \"table\" :user-id (:user-id test-env))
    (cleanup-test-environment! test-env)"
  (:require
   [clojure.string :as str]
   [dev.add-load :as add-load]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.permissions.util :as perms-util]
   [metabase.request.core :as request]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util :as u]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- Setup Utilities: Database & Tables ------------------------------------

(defn- generate-table-name
  "Generate a table name with a prefix and index for identification."
  [prefix idx]
  (format "%s_table_%05d" prefix idx))

(defn create-test-database!
  "Create a test database for performance testing.
   Returns the database ID."
  []
  (let [{:keys [db-id]} (add-load/from-script
                         [[:model/Database {:?/db-id :id}
                           {:name (str "Search Perf Test DB " (u.random/random-name))
                            :engine :h2
                            :details {}}]])]
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :blocked)
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :no)
    db-id))

(defn create-tables-batch!
  "Create a batch of tables for the given database.
   Returns the number of tables created."
  [db-id prefix start-idx cnt]
  (let [script (vec
                (for [i (range start-idx (+ start-idx cnt))]
                  [:model/Table {}
                   {:db_id       db-id
                    :name        (generate-table-name prefix i)
                    :description (format "Performance test table %d for search benchmarking" i)
                    :active      true}]))]
    (add-load/from-script script)
    cnt))

(defn create-test-database-with-tables!
  "Create a test database with the specified number of tables.
   Tables are created in batches for better performance.

   Options:
     :batch-size - Number of tables per batch (default 500)
     :prefix - Prefix for table names (default \"perf_test\")

   Returns a map with :db-id and :table-ids."
  ([num-tables]
   (create-test-database-with-tables! num-tables {}))
  ([num-tables {:keys [batch-size prefix]
                :or   {batch-size 500
                       prefix     "perf_test"}}]
   (let [db-id       (create-test-database!)
         num-batches (Math/ceil (/ num-tables batch-size))]
     (println (format "Creating %d tables in %d batches of %d..."
                      num-tables (int num-batches) batch-size))
     (let [timer (u/start-timer)]
       (doseq [batch-num (range (int num-batches))]
         (let [start-idx   (* batch-num batch-size)
               batch-count (min batch-size (- num-tables start-idx))]
           (create-tables-batch! db-id prefix start-idx batch-count)
           (when (zero? (mod (inc batch-num) 10))
             (println (format "  Created %d/%d tables..." (+ start-idx batch-count) num-tables)))))
       (let [elapsed-ms (u/since-ms timer)
             ;; Get all table IDs for this database
             table-ids  (t2/select-pks-vec :model/Table :db_id db-id)]
         (println (format "Created %d tables in %.2f seconds (%.1f tables/sec)"
                          num-tables
                          (/ elapsed-ms 1000.0)
                          (/ (* num-tables 1000.0) elapsed-ms)))
         {:db-id     db-id
          :table-ids table-ids})))))

;;; -------------------------------------------- Setup Utilities: Groups & Users ---------------------------------------

(defn create-permission-groups!
  "Create n permission groups for testing.
   Returns a vector of group IDs."
  [n run-id]
  (println (format "Creating %d permission groups..." n))
  (let [timer  (u/start-timer)
        prefix (str "Search Perf Group " run-id " ")
        script (vec
                (for [i (range n)]
                  [:model/PermissionsGroup {}
                   {:name (str prefix i)}]))
        _          (add-load/from-script script)
        ;; Query for groups with our name pattern
        group-ids  (t2/select-pks-vec :model/PermissionsGroup :name [:like (str prefix "%")])
        elapsed-ms (u/since-ms timer)]
    (println (format "Created %d groups in %.2f seconds" n (/ elapsed-ms 1000.0)))
    group-ids))

(defn create-users-with-memberships!
  "Create n users and assign them to permission groups.
   Each user is assigned to a subset of groups based on their index.
   Users are also added to the All Users group automatically by the model.

   Returns a vector of user IDs."
  [n group-ids run-id]
  (println (format "Creating %d users with group memberships..." n))
  (let [timer      (u/start-timer)
        num-groups (count group-ids)
        email-domain (str "perftest" run-id ".example.com")
        ;; Create users first
        user-script (vec
                     (for [i (range n)]
                       [:model/User {}
                        {:first_name (format "PerfUser%d" i)
                         :last_name  "Test"
                         :email      (format "user%d@%s" i email-domain)
                         :password   "password123"}]))
        _        (add-load/from-script user-script)
        ;; Query for users by email pattern
        user-ids (t2/select-pks-vec :model/User :email [:like (str "%@" email-domain)])]

    ;; Create group memberships - assign each user to some groups
    ;; User i gets assigned to groups where (mod i num-groups) matches certain patterns
    (println "  Assigning users to groups...")
    (let [membership-script
          (vec
           (for [user-idx (range n)
                 group-idx (range num-groups)
                 ;; Assign user to ~30% of groups based on a deterministic pattern
                 :when (zero? (mod (+ user-idx group-idx) 3))]
             [:model/PermissionsGroupMembership {}
              {:user_id  (nth user-ids user-idx)
               :group_id (nth group-ids group-idx)}]))]
      (when (seq membership-script)
        (add-load/from-script membership-script)))

    (let [elapsed-ms (u/since-ms timer)]
      (println (format "Created %d users with memberships in %.2f seconds" n (/ elapsed-ms 1000.0))))
    user-ids))

(defn grant-table-permissions-to-groups!
  "Grant table-level permissions to groups.
   Each group gets permissions to a subset of tables based on deterministic assignment.
   This creates a realistic permission scenario where different groups have access
   to different tables.

   Assignment strategy:
   - Each group gets access to ~5% of tables
   - Tables are assigned based on (mod table-idx 20) pattern with group offset
   - This ensures overlapping but distinct permission sets"
  [table-ids group-ids]
  (println (format "Granting table-level permissions to %d groups for %d tables..."
                   (count group-ids) (count table-ids)))
  (let [timer      (u/start-timer)
        num-groups (count group-ids)
        ;; Build permission assignments
        ;; Each group gets ~5% of tables (1 in 20) with offset based on group index
        assignments (for [group-idx (range num-groups)
                          :let [group-id (nth group-ids group-idx)
                                ;; Each group gets ~5% of tables with some overlap
                                ;; Using mod 20 gives 5%, offset by group-idx for variation
                                assigned-tables (filterv
                                                 (fn [table-idx]
                                                   ;; Deterministic pattern: group gets every 20th table
                                                   ;; offset by group index to create variation between groups
                                                   (zero? (mod (+ table-idx group-idx) 20)))
                                                 (range (count table-ids)))]]
                      {:group-id        group-id
                       :group-idx       group-idx
                       :table-indices   assigned-tables
                       :num-tables      (count assigned-tables)})]

    ;; Grant permissions - batch by group for efficiency
    (doseq [{:keys [group-id table-indices]} assignments]
      (let [table-perms-view  (into {} (for [tidx table-indices]
                                         [(nth table-ids tidx) :unrestricted]))
            table-perms-query (into {} (for [tidx table-indices]
                                         [(nth table-ids tidx) :query-builder]))]
        ;; Use batch permission setting
        (when (seq table-perms-view)
          (perms/set-table-permissions! group-id :perms/view-data table-perms-view)
          (perms/set-table-permissions! group-id :perms/create-queries table-perms-query))))

    (let [elapsed-ms (u/since-ms timer)]
      (println (format "Granted table permissions in %.2f seconds" (/ elapsed-ms 1000.0))))))

;;; -------------------------------------------- Test Environment Management -------------------------------------------

(defn create-test-environment!
  "Create a complete test environment with database, tables, groups, users, and permissions.

   Options:
     :num-tables - Number of tables to create (default 10000)
     :num-groups - Number of permission groups (default 10)
     :num-users - Number of users (default 100)
     :prefix - Table name prefix (default \"perf_test\")

   Returns a map containing:
     :db-id - Database ID
     :table-ids - Vector of table IDs
     :group-ids - Vector of group IDs
     :user-ids - Vector of user IDs
     :user-id - ID of a sample non-admin user for testing
     :run-id - Unique identifier for this test run"
  ([]
   (create-test-environment! {}))
  ([{:keys [num-tables num-groups num-users prefix]
     :or   {num-tables 10000
            num-groups 10
            num-users  100
            prefix     "perf_test"}}]
   (println "\n=== Creating Test Environment ===")
   (let [timer  (u/start-timer)
         run-id (u.random/random-name)
         ;; Create database and tables
         {:keys [db-id table-ids]} (create-test-database-with-tables! num-tables {:prefix prefix})
         ;; Create permission groups
         group-ids (create-permission-groups! num-groups run-id)
         ;; Grant table-level permissions to groups
         _ (grant-table-permissions-to-groups! table-ids group-ids)
         ;; Create users with group memberships
         user-ids (create-users-with-memberships! num-users group-ids run-id)
         ;; Pick a user in the middle for testing
         test-user-id (nth user-ids (quot num-users 2))
         elapsed-ms (u/since-ms timer)]
     (println (format "Test environment created in %.2f seconds" (/ elapsed-ms 1000.0)))
     (println (format "  Run ID: %s" run-id))
     (println (format "  Database: %d" db-id))
     (println (format "  Tables: %d" num-tables))
     (println (format "  Groups: %d" num-groups))
     (println (format "  Users: %d" num-users))
     (println (format "  Test user ID: %d" test-user-id))
     {:db-id      db-id
      :table-ids  table-ids
      :group-ids  group-ids
      :user-ids   user-ids
      :user-id    test-user-id
      :run-id     run-id
      :num-tables num-tables})))

(defn cleanup-test-environment!
  "Delete all resources created by create-test-environment!"
  [{:keys [db-id group-ids user-ids]}]
  (println "\n=== Cleaning Up Test Environment ===")
  (let [timer (u/start-timer)]
    ;; Delete group memberships first (foreign key constraints)
    (when (seq user-ids)
      (println (format "Deleting memberships for %d users..." (count user-ids)))
      ;; Use raw table name to bypass before-delete guard (bulk dev cleanup, not a real user action)
      (t2/delete! (t2/table-name :model/PermissionsGroupMembership) :user_id [:in user-ids] :group_id [:<> 1]))
    ;; Delete users
    (when (seq user-ids)
      (println (format "Deleting %d users..." (count user-ids)))
      (t2/delete! :model/User :id [:in user-ids]))
    ;; Delete data permissions for groups
    (when (seq group-ids)
      (println (format "Deleting permissions for %d groups..." (count group-ids)))
      (t2/delete! :model/DataPermissions :group_id [:in group-ids]))
    ;; Delete groups
    (when (seq group-ids)
      (println (format "Deleting %d groups..." (count group-ids)))
      (t2/delete! :model/PermissionsGroup :id [:in group-ids]))
    ;; Delete tables and database
    (when db-id
      (let [table-count (t2/count :model/Table :db_id db-id)]
        (println (format "Deleting database %d and %d tables..." db-id table-count))
        (t2/delete! :model/Table :db_id db-id)
        (t2/delete! :model/Database :id db-id)))
    (let [elapsed-ms (u/since-ms timer)]
      (println (format "Cleanup completed in %.2f seconds" (/ elapsed-ms 1000.0))))))

;;; ------------------------------------------------ Search Utilities -----------------------------------------------

(defn- search-context-for-user
  "Build a search context for a specific user."
  [user-id search-string models]
  (request/with-current-user user-id
    (search.impl/search-context
     {:current-user-id       api/*current-user-id*
      :current-user-perms    @api/*current-user-permissions-set*
      :is-superuser?         api/*is-superuser?*
      :is-data-analyst       api/*is-data-analyst?*
      :is-impersonated-user? (perms-util/impersonated-user?)
      :is-sandboxed-user?    (perms-util/impersonated-user?)
      :archived              false
      :context               :default
      :search-string         search-string
      :models                models
      :model-ancestors?      false})))

(defn search!
  "Execute a search and return the results.

   Options:
     :user-id - User ID to run search as (required)
     :models - Models to search (default all models)"
  [search-string & {:keys [user-id models]
                    :or   {models search.config/all-models}}]
  (assert user-id "user-id is required for search!")
  (let [ctx (search-context-for-user user-id search-string models)]
    (search.engine/results ctx)))

(defn timed-search!
  "Execute a search and return timing information along with result count.

   Options:
     :user-id - User ID to run search as (required)
     :models - Models to search (default all models)

   Returns {:elapsed-ms <time> :result-count <count>}"
  [search-string & {:keys [user-id models]
                    :or   {models search.config/all-models}}]
  (assert user-id "user-id is required for timed-search!")
  (let [timer   (u/start-timer)
        results (search! search-string :user-id user-id :models models)
        elapsed (u/since-ms timer)]
    {:elapsed-ms   elapsed
     :result-count (count results)}))

;;; ------------------------------------------------ Benchmark Functions --------------------------------------------

(defn run-search-benchmark!
  "Run a search benchmark with the given search string.

   Options:
     :user-id - User ID to run search as (required)
     :iterations - Number of search iterations (default 5)
     :models - Models to search (default all models)
     :warmup - Number of warmup iterations (default 2)

   Returns a map with benchmark statistics."
  ([search-string opts]
   (let [{:keys [user-id iterations warmup models]
          :or   {iterations 5
                 warmup     2
                 models     search.config/all-models}} opts]
     (assert user-id "user-id is required for benchmark!")
     (println (format "\nRunning search benchmark for: \"%s\" (user-id: %d)" search-string user-id))
     (println (format "  Warmup iterations: %d" warmup))
     (println (format "  Benchmark iterations: %d" iterations))

     ;; Warmup
     (when (pos? warmup)
       (println "  Warming up...")
       (dotimes [_ warmup]
         (search! search-string :user-id user-id :models models)))

     ;; Benchmark
     (println "  Running benchmark...")
     (let [results (vec (for [i (range iterations)]
                          (let [result (timed-search! search-string :user-id user-id :models models)]
                            (println (format "    Iteration %d: %.2fms (%d results)"
                                             (inc i)
                                             (:elapsed-ms result)
                                             (:result-count result)))
                            result)))
           times   (mapv :elapsed-ms results)
           avg     (/ (reduce + times) (count times))
           min-t   (apply min times)
           max-t   (apply max times)
           sorted  (sort times)
           p50     (nth sorted (int (* 0.5 (count sorted))))
           p95     (nth sorted (int (* 0.95 (dec (count sorted)))))]
       (println "\n  Results:")
       (println (format "    Average: %.2fms" avg))
       (println (format "    Min: %.2fms" min-t))
       (println (format "    Max: %.2fms" max-t))
       (println (format "    P50: %.2fms" p50))
       (println (format "    P95: %.2fms" p95))
       {:search-string search-string
        :user-id       user-id
        :iterations    iterations
        :result-count  (:result-count (first results))
        :avg-ms        avg
        :min-ms        min-t
        :max-ms        max-t
        :p50-ms        p50
        :p95-ms        p95
        :all-times-ms  times}))))

(defn run-full-benchmark!
  "Run a full benchmark suite with multiple search queries.

   Creates a test environment with database, tables, groups, and users,
   runs benchmarks with various search patterns using a non-admin user,
   and optionally cleans up the test data.

   Options:
     :num-tables - Number of tables to create (default 10000)
     :num-groups - Number of permission groups (default 10)
     :num-users - Number of users (default 100)
     :iterations - Benchmark iterations per query (default 5)
     :cleanup? - Whether to cleanup after (default true)
     :prefix - Table name prefix (default \"perf_test\")

   Returns benchmark results for all queries."
  ([]
   (run-full-benchmark! {}))
  ([{:keys [num-tables num-groups num-users iterations cleanup? prefix]
     :or   {num-tables 10000
            num-groups 10
            num-users  100
            iterations 5
            cleanup?   true
            prefix     "perf_test"}}]
   (println (format "\n%s" (str/join (repeat 60 "="))))
   (println "SEARCH PERFORMANCE BENCHMARK (Non-Admin User)")
   (println (str/join (repeat 60 "=")))
   (println "\nConfiguration:")
   (println (format "  Tables: %d" num-tables))
   (println (format "  Permission Groups: %d" num-groups))
   (println (format "  Users: %d" num-users))
   (println (format "  Iterations per query: %d" iterations))

   (let [test-env (create-test-environment! {:num-tables num-tables
                                             :num-groups num-groups
                                             :num-users  num-users
                                             :prefix     prefix})
         user-id (:user-id test-env)
         ;; Wait for search index to update if using async indexing
         _ (binding [search.ingestion/*force-sync* true]
             (Thread/sleep 1000))
         queries [;; Exact prefix match
                  (str prefix "_table_00001")
                  ;; Partial prefix match
                  (str prefix "_table")
                  ;; Generic term that should match descriptions
                  "performance test"
                  ;; Broad search
                  "table"
                  ;; Very specific search
                  (str prefix "_table_05000")]]
     (try
       (let [results (vec (for [query queries]
                            (run-search-benchmark! query {:user-id    user-id
                                                          :iterations iterations})))]
         (println (format "\n%s" (str/join (repeat 60 "="))))
         (println "SUMMARY")
         (println (str/join (repeat 60 "=")))
         (doseq [{:keys [search-string avg-ms result-count]} results]
           (println (format "  \"%s\": %.2fms avg, %d results"
                            search-string avg-ms result-count)))
         {:results  results
          :test-env test-env})
       (finally
         (when cleanup?
           (cleanup-test-environment! test-env)))))))

(comment
  ;; Example usage:

  ;; Quick test with fewer tables/users
  (run-full-benchmark! {:num-tables 1
                        :num-groups 5
                        :num-users  4
                        :iterations 1})

  ;; Full benchmark with 10,000 tables
  (run-full-benchmark! {:num-tables 10000
                        :num-groups 25
                        :num-users  100
                        :iterations 10})

 ;; {:p95-ms 539.613833, :result-count 10000, :avg-ms 536.6528708, :min-ms 529.310541, :all-times-ms [548.471834 534.8465 538.846875 536.401583 535.707 ...], ...}
 ;; {:p95-ms 366.195458, :result-count 10000, :avg-ms 360.5523999, :min-ms 352.951208, :all-times-ms [355.839542 366.195458 352.951208 356.9155 362.09225 ...], ...}
 ;; {:p95-ms 110.475333, :result-count 4000, :avg-ms 108.0612666, :min-ms 105.713041, :all-times-ms [112.747333 108.450292 107.548208 105.93625 108.159375 ...], ...}

  ;; Manual setup for interactive testing
  (def test-env (create-test-environment! {:num-tables 1000
                                           :num-groups 35
                                           :num-users  200}))

  ;; Run individual searches with the non-admin user
  (e/explain
   (timed-search! "perf_test_table" :user-id (:user-id test-env)))
  (timed-search! "table" :user-id (:user-id test-env) :models #{"table"})

  (require '[dev.explain-analyze :as e])
  ;; Try with different users
  (e/explain
   (timed-search! "table" :user-id (first (:user-ids test-env))))
  (timed-search! "table" :user-id (last (:user-ids test-env)))

  ;; Cleanup
  (cleanup-test-environment! test-env))
