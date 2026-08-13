(ns dev.search-perf
  "Performance testing utilities for search.

  This namespace is organized into three categories:

  ## 1. Setup
  [[create-test-environment!]] — create a reproducible dataset scaled by :data-scale or explicit counts.
  Idempotent per run-id; safe to call repeatedly.

  ## 2. Search Latency Benchmarks
  [[run-full-benchmark!]] — set up environment and run a latency benchmark suite in one call.
  [[run-search-benchmark!]] — time repeated searches against a live engine.
  [[timed-search!]] — single timed search.

  ## 3. Ingestion Memory Benchmarks
  [[bench-ingestion!]] — read the full searchable-documents pipeline and measure peak/retained heap.
  [[bench-reindex!]] — full appdb reindex (read + write to index) and measure peak/retained heap.
  [[bench-ingestion-profile!]] — same pipeline but prints heap delta every N items. Use this to
    watch the 'sawtooth' pattern: heap climbs between GC cycles then drops when GC fires. This
    is NORMAL for a streaming pipeline — it means GC is reclaiming rows as they are processed,
    not that there is a memory leak.
  [[bench-pipeline-layers!]] — isolate pipeline layers (raw query / realize / ->document / all-models)
    to find which layer increases memory. Layers 4 and 5 call ->document which evaluates search spec
    :fn attrs; these require a live Metabase backend with the metadata provider available.
  [[bench-ingestion-by-model!]] — per-model breakdown of peak and retained heap.
  [[heap-histogram!]] / [[heap-histogram-diff!]] — JVM object histogram before/after comparison.

  ## Memory Measurement Notes
  - [[measure-heap-baseline]] forces System/gc + sleeps 500ms before reading heap. Use this to
    establish before/after snapshots for 'retained' memory — it gives the true post-GC steady state.
  - [[current-heap-used]] is an instantaneous snapshot that INCLUDES GC-eligible garbage not yet
    collected. Reading it immediately after a large reduce will show inflated values. Never use it
    alone to conclude that memory was retained.
  - 'Peak delta' (from MemoryPoolMXBean peak tracking) measures the allocation watermark during an
    operation. Capture it BEFORE calling measure-heap-baseline, since forcing GC resets the watermark.
  - The sawtooth pattern seen in bench-ingestion-profile! output is expected and correct for
    streaming pipelines. A flat or gently-rising post-GC floor is the sign that streaming works."
  (:require
   [clojure.string :as str]
   [dev.add-load :as add-load]
   [metabase.api.common :as api]
   [metabase.app-db.query :as mdb.query]
   [metabase.lib-be.core :as lib-be]
   [metabase.logger.core :as logger]
   [metabase.permissions.core :as perms]
   [metabase.permissions.util :as perms-util]
   [metabase.request.core :as request]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.search.impl :as search.impl]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.lang.management ManagementFactory MemoryPoolMXBean MemoryType)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- Scale Multipliers ------------------------------------------------

(def ^:private model-scale-multipliers
  "Multipliers applied to data-scale. Cards are the most numerous at 1x."
  {:cards       1.0
   :tables      1.0
   :dashboards  0.3
   :collections 0.1
   :datasets    0.1
   :metrics     0.05
   :documents   0.05
   :segments    0.02
   :measures    0.02
   :actions     0.02
   :databases   0.005
   :groups      0.005
   :users       0.01})

(def ^:private model-minimums
  "Minimum counts for each model type."
  {:databases   1
   :groups      2
   :users       5
   :collections 1
   :tables      1
   :cards       1
   :datasets    1
   :metrics     1
   :dashboards  1
   :documents   1
   :segments    1
   :measures    1
   :actions     1})

(defn- scale->counts
  "Compute entity counts from a data-scale value using multipliers and minimums."
  [data-scale]
  (into {}
        (map (fn [[k mult]]
               (let [minimum (get model-minimums k 1)]
                 [k (max minimum (long (* data-scale mult)))])))
        model-scale-multipliers))

;;; -------------------------------------------- Setup Utilities: Database & Tables ------------------------------------

(defn- generate-table-name
  "Generate a table name with a prefix and index for identification."
  [prefix idx]
  (format "%s_table_%05d" prefix idx))

(defn create-test-database!
  "Create a test database for performance testing.
   Returns the database ID."
  [run-id]
  (let [{:keys [db-id]} (add-load/from-script
                         [[:model/Database {:?/db-id :id}
                           {:name (str "Perf DB " run-id)
                            :engine :h2
                            :details {}}]])]
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :blocked)
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/create-queries :no)
    db-id))

(defn- create-test-databases!
  "Create n test databases. Returns a vector of database IDs."
  [n run-id]
  (println (format "Creating %d databases..." n))
  (let [timer (u/start-timer)
        db-ids (mapv (fn [_] (create-test-database! run-id)) (range n))
        elapsed-ms (u/since-ms timer)]
    (println (format "Created %d databases in %.2f seconds" n (/ elapsed-ms 1000.0)))
    db-ids))

;;; -------------------------------------------- Batch Creation Helpers -----------------------------------------------

(defn- create-in-batches!
  "Create entities in batches, printing progress. Calls `batch-fn` with [start-idx cnt] for each batch."
  [label total batch-size batch-fn]
  (let [num-batches (int (Math/ceil (/ (double total) batch-size)))]
    (println (format "Creating %d %s..." total label))
    (let [timer (u/start-timer)]
      (doseq [batch-num (range num-batches)]
        (let [start-idx   (* batch-num batch-size)
              batch-count (min batch-size (- total start-idx))]
          (batch-fn start-idx batch-count)
          (when (zero? (mod (inc batch-num) 10))
            (println (format "  Created %d/%d %s..." (+ start-idx batch-count) total label)))))
      (let [elapsed-ms (u/since-ms timer)]
        (println (format "Created %d %s in %.2f seconds" total label (/ elapsed-ms 1000.0)))))))

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
  ([num-tables run-id]
   (create-test-database-with-tables! num-tables run-id {}))
  ([num-tables run-id {:keys [batch-size prefix]
                       :or   {batch-size 500
                              prefix     "perf_test"}}]
   (let [db-id (create-test-database! run-id)]
     (create-in-batches! "tables" num-tables batch-size
                         (fn [start-idx cnt]
                           (create-tables-batch! db-id prefix start-idx cnt)))
     (let [table-ids (t2/select-pks-vec :model/Table :db_id db-id)]
       {:db-id     db-id
        :table-ids table-ids}))))

(defn- create-collections!
  "Create n collections with run-id in the name. Returns vector of collection IDs."
  [n run-id]
  (println (format "Creating %d collections..." n))
  (let [timer  (u/start-timer)
        prefix (str "Perf Collection " run-id " ")
        script (vec
                (for [i (range n)]
                  [:model/Collection {}
                   {:name (format "%s%05d" prefix i)}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Collection :name [:like (str prefix "%")])]
      (println (format "Created %d collections in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-cards!
  "Create n cards of the given type, distributed across collections round-robin.
   card-type is \"question\", \"model\", or \"metric\"."
  [n db-id collection-ids card-type run-id]
  (println (format "Creating %d cards (type=%s)..." n card-type))
  (let [timer   (u/start-timer)
        label   (str "Perf " (str/capitalize card-type) " " run-id " ")
        num-colls (count collection-ids)
        script  (vec
                 (for [i (range n)]
                   [:model/Card {}
                    {:name                   (format "%s%05d" label i)
                     :database_id            db-id
                     :dataset_query          {}
                     :type                   card-type
                     :display                :table
                     :visualization_settings {}
                     :collection_id          (nth collection-ids (mod i num-colls))}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Card :name [:like (str label "%")])]
      (println (format "Created %d %s cards in %.2f seconds" (count ids) card-type (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-dashboards!
  "Create n dashboards distributed across collections round-robin."
  [n collection-ids run-id]
  (println (format "Creating %d dashboards..." n))
  (let [timer     (u/start-timer)
        prefix    (str "Perf Dashboard " run-id " ")
        num-colls (count collection-ids)
        script    (vec
                   (for [i (range n)]
                     [:model/Dashboard {}
                      {:name          (format "%s%05d" prefix i)
                       :collection_id (nth collection-ids (mod i num-colls))}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Dashboard :name [:like (str prefix "%")])]
      (println (format "Created %d dashboards in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-documents!
  "Create n documents distributed across collections round-robin."
  [n collection-ids run-id]
  (println (format "Creating %d documents..." n))
  (let [timer     (u/start-timer)
        prefix    (str "Perf Document " run-id " ")
        num-colls (count collection-ids)
        script    (vec
                   (for [i (range n)]
                     [:model/Document {}
                      {:name          (format "%s%05d" prefix i)
                       :collection_id (nth collection-ids (mod i num-colls))
                       :document      {:type    "doc"
                                       :content [{:attrs   {:_id (str (random-uuid))}
                                                  :type    "paragraph"
                                                  :content [{:type "text"
                                                             :text (format "Perf document content %d" i)}]}]}
                       :content_type  "application/json+vnd.prose-mirror"}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Document :name [:like (str prefix "%")])]
      (println (format "Created %d documents in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-segments!
  "Create n segments distributed across tables round-robin."
  [n table-ids run-id]
  (println (format "Creating %d segments..." n))
  (let [timer      (u/start-timer)
        prefix     (str "Perf Segment " run-id " ")
        num-tables (count table-ids)
        script     (vec
                    (for [i (range n)]
                      [:model/Segment {}
                       {:name       (format "%s%05d" prefix i)
                        :table_id   (nth table-ids (mod i num-tables))
                        :definition {}}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Segment :name [:like (str prefix "%")])]
      (println (format "Created %d segments in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-measures!
  "Create n measures distributed across tables round-robin."
  [n table-ids run-id]
  (println (format "Creating %d measures..." n))
  (let [timer      (u/start-timer)
        prefix     (str "Perf Measure " run-id " ")
        num-tables (count table-ids)
        script     (vec
                    (for [i (range n)]
                      [:model/Measure {}
                       {:name       (format "%s%05d" prefix i)
                        :table_id   (nth table-ids (mod i num-tables))
                        :definition {}}]))]
    (add-load/from-script script)
    (let [ids (t2/select-pks-vec :model/Measure :name [:like (str prefix "%")])]
      (println (format "Created %d measures in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

(defn- create-actions!
  "Create n actions, each backed by a model card from model-card-ids (round-robin).
   Each action requires an Action row + a QueryAction row."
  [n model-card-ids db-id run-id]
  (let [timer      (u/start-timer)
        prefix     (str "Perf Action " run-id " ")
        num-models (count model-card-ids)]
    ;; Create actions one batch at a time using from-script bindings
    ;; Each action needs 2 script entries: Action + QueryAction
    (create-in-batches! "actions" n 250
                        (fn [start-idx cnt]
                          (let [script (vec
                                        (mapcat
                                         (fn [i]
                                           (let [bind-kw (keyword "?" (str "action-" i))]
                                             [[:model/Action {bind-kw :id}
                                               {:name     (format "%s%05d" prefix (+ start-idx i))
                                                :model_id (nth model-card-ids (mod (+ start-idx i) num-models))
                                                :type     :query}]
                                              [:model/QueryAction {}
                                               {:action_id     bind-kw
                                                :database_id   db-id
                                                :dataset_query {}}]]))
                                         (range cnt)))]
                            (add-load/from-script script))))
    (let [ids (t2/select-pks-vec :model/Action :name [:like (str prefix "%")])]
      (println (format "Created %d actions in %.2f seconds" (count ids) (/ (u/since-ms timer) 1000.0)))
      ids)))

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

(def ^:private max-tables-for-table-perms
  "Table-level permission grants via set-table-permissions! are very slow per call.
   Above this threshold we skip table-level grants and use database-level permissions instead."
  10000)

(defn grant-table-permissions-to-groups!
  "Grant permissions to groups for tables. For small table counts, grants table-level
   permissions (5% of tables per group). For large counts, grants database-level
   permissions instead since table-level grants are too slow."
  [table-ids group-ids]
  (let [timer      (u/start-timer)
        num-tables (count table-ids)
        num-groups (count group-ids)]
    (if (> num-tables max-tables-for-table-perms)
      ;; Large scale: grant database-level permissions instead of table-level
      (do
        (println (format "Granting database-level permissions to %d groups (too many tables (%d) for table-level grants)..."
                         num-groups num-tables))
        (let [db-ids (t2/select-fn-vec :db_id [:model/Table :db_id]
                                       {:group-by [:db_id]})]
          (doseq [[idx group-id] (map-indexed vector group-ids)]
            (doseq [db-id db-ids]
              (perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
              (perms/set-database-permission! group-id db-id :perms/create-queries :query-builder))
            (when (zero? (mod (inc idx) 50))
              (println (format "  Granted permissions for %d/%d groups..." (inc idx) num-groups))))))
      ;; Small scale: table-level permissions for realistic filtering
      (do
        (println (format "Granting table-level permissions to %d groups for %d tables..."
                         num-groups num-tables))
        (let [;; Build permission assignments
              ;; Each group gets ~5% of tables (1 in 20) with offset based on group index
              assignments (for [group-idx (range num-groups)
                                :let [group-id (nth group-ids group-idx)
                                      assigned-tables (filterv
                                                       (fn [table-idx]
                                                         (zero? (mod (+ table-idx group-idx) 20)))
                                                       (range num-tables))]]
                            {:group-id      group-id
                             :table-indices assigned-tables})
              ;; Batch the table->db lookup to avoid exceeding PostgreSQL's 65535 param limit
              table-id->db-id (reduce (fn [acc batch]
                                        (merge acc (into {} (t2/select-fn->fn :id :db_id
                                                                              :model/Table
                                                                              :id [:in batch]))))
                                      {}
                                      (partition-all 10000 table-ids))]
          (doseq [{:keys [group-id table-indices]} assignments]
            (let [assigned-tids (mapv #(nth table-ids %) table-indices)
                  tids-by-db   (group-by table-id->db-id assigned-tids)]
              (doseq [[_db-id db-tids] tids-by-db]
                (let [table-perms-view  (into {} (map (fn [tid] [tid :unrestricted])) db-tids)
                      table-perms-query (into {} (map (fn [tid] [tid :query-builder])) db-tids)]
                  (perms/set-table-permissions! group-id :perms/view-data table-perms-view)
                  (perms/set-table-permissions! group-id :perms/create-queries table-perms-query))))))))
    (let [elapsed-ms (u/since-ms timer)]
      (println (format "Granted permissions in %.2f seconds" (/ elapsed-ms 1000.0))))))

;;; -------------------------------------------- Test Environment Management -------------------------------------------

(defn- create-all-model-types!
  "Create all searchable model types using data-scale multipliers.
   Returns a map of created entity IDs."
  [data-scale run-id prefix]
  (let [counts        (scale->counts data-scale)
        _             (println "\nScaled entity counts:")
        _             (doseq [[k v] (sort-by val > counts)]
                        (println (format "  %-15s %d" (name k) v)))
        ;; 1. Databases
        db-ids        (create-test-databases! (:databases counts) run-id)
        primary-db-id (first db-ids)
        ;; 2. Collections
        collection-ids (do (println)
                           (create-collections! (:collections counts) run-id))
        ;; 3. Tables — distributed across databases
        _             (create-in-batches! "tables" (:tables counts) 500
                                          (fn [start-idx cnt]
                                            (let [script (vec
                                                          (for [i (range start-idx (+ start-idx cnt))]
                                                            [:model/Table {}
                                                             {:db_id       (nth db-ids (mod i (count db-ids)))
                                                              :name        (generate-table-name prefix i)
                                                              :description (format "Performance test table %d" i)
                                                              :active      true}]))]
                                              (add-load/from-script script))))
        table-ids     (t2/select-pks-vec :model/Table :db_id [:in db-ids])
        ;; Cap dependent model counts by parent counts
        seg-count     (min (:segments counts) (count table-ids))
        meas-count    (min (:measures counts) (count table-ids))
        ;; 4. Cards (questions)
        card-ids      (create-cards! (:cards counts) primary-db-id collection-ids "question" run-id)
        ;; 5. Cards (models/datasets)
        dataset-ids   (create-cards! (:datasets counts) primary-db-id collection-ids "model" run-id)
        ;; 6. Cards (metrics)
        metric-ids    (create-cards! (:metrics counts) primary-db-id collection-ids "metric" run-id)
        ;; 7. Dashboards
        dashboard-ids (create-dashboards! (:dashboards counts) collection-ids run-id)
        ;; 8. Documents
        document-ids  (create-documents! (:documents counts) collection-ids run-id)
        ;; 9. Segments
        segment-ids   (create-segments! seg-count table-ids run-id)
        ;; 10. Measures
        measure-ids   (create-measures! meas-count table-ids run-id)
        ;; 11. Actions (need model cards from step 5)
        action-ids    (if (seq dataset-ids)
                        (do
                          (create-actions! (min (:actions counts) (count dataset-ids))
                                           dataset-ids primary-db-id run-id)
                          (t2/select-pks-vec :model/Action
                                             :name [:like (str "Perf Action " run-id " %")]))
                        [])
        ;; 12. Permission groups & users
        group-ids     (create-permission-groups! (:groups counts) run-id)
        _             (when (seq table-ids)
                        (grant-table-permissions-to-groups! table-ids group-ids))
        user-ids      (create-users-with-memberships! (:users counts) group-ids run-id)
        test-user-id  (nth user-ids (quot (count user-ids) 2))]
    {:db-id          primary-db-id
     :user-id        test-user-id
     :counts         {:databases   (count db-ids)
                      :collections (count collection-ids)
                      :tables      (count table-ids)
                      :cards       (count card-ids)
                      :datasets    (count dataset-ids)
                      :metrics     (count metric-ids)
                      :dashboards  (count dashboard-ids)
                      :documents   (count document-ids)
                      :segments    (count segment-ids)
                      :measures    (count measure-ids)
                      :actions     (count action-ids)
                      :groups      (count group-ids)
                      :users       (count user-ids)}}))

(defn create-test-environment!
  "Create a complete test environment with database, tables, groups, users, and permissions.

   When :data-scale is provided, creates all searchable model types with realistic
   distribution. When not provided, uses legacy behavior (tables/groups/users only).

   Options:
     :data-scale - Scale factor for all model types (e.g. 100, 10000)
     :num-tables - Number of tables to create (default 10000, legacy mode)
     :num-groups - Number of permission groups (default 10, legacy mode)
     :num-users - Number of users (default 100, legacy mode)
     :prefix - Table name prefix (default \"perf_test\")

   Returns a map with :run-id, :user-id, :db-id, :data-scale, :prefix, and :counts."
  ([]
   (create-test-environment! {}))
  ([{:keys [data-scale num-tables num-groups num-users prefix]
     :or   {prefix "perf_test"}}]
   (println "\n=== Creating Test Environment ===")
   (let [original-log-level (logger/ns-log-level 'metabase)
         _      (logger/set-ns-log-level! 'metabase :warn)
         timer  (u/start-timer)
         run-id (u.random/random-name)
         result (try
                  (if data-scale
                    ;; New: create all model types scaled
                    (create-all-model-types! data-scale run-id prefix)
                    ;; Legacy: just tables/groups/users
                    (let [num-tables (or num-tables 10000)
                          num-groups (or num-groups 10)
                          num-users  (or num-users 100)
                          {:keys [db-id table-ids]} (create-test-database-with-tables!
                                                     num-tables run-id {:prefix prefix})
                          group-ids    (create-permission-groups! num-groups run-id)
                          _            (grant-table-permissions-to-groups! table-ids group-ids)
                          user-ids     (create-users-with-memberships! num-users group-ids run-id)
                          test-user-id (nth user-ids (quot num-users 2))]
                      {:db-id  db-id
                       :user-id test-user-id
                       :counts {:tables (count table-ids)
                                :groups (count group-ids)
                                :users  (count user-ids)}}))
                  (finally
                    (logger/set-ns-log-level! 'metabase original-log-level)))
         elapsed-ms (u/since-ms timer)]
     (println (format "\nTest environment created in %.2f seconds" (/ elapsed-ms 1000.0)))
     (println (format "  Run ID: %s" run-id))
     (when (:db-id result)
       (println (format "  Primary Database: %d" (:db-id result))))
     (doseq [[k v] (sort-by val > (:counts result))]
       (println (format "  %-15s %d" (name k) v)))
     (assoc result
            :run-id     run-id
            :data-scale data-scale
            :prefix     (or prefix "perf_test")))))

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
   then runs benchmarks with various search patterns using a non-admin user.

   Options:
     :num-tables - Number of tables to create (default 10000)
     :num-groups - Number of permission groups (default 10)
     :num-users - Number of users (default 100)
     :iterations - Benchmark iterations per query (default 5)
     :prefix - Table name prefix (default \"perf_test\")

   Returns benchmark results for all queries."
  ([]
   (run-full-benchmark! {}))
  ([{:keys [num-tables num-groups num-users iterations prefix]
     :or   {num-tables 10000
            num-groups 10
            num-users  100
            iterations 5
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
                  (str prefix "_table_05000")]
         results (vec (for [query queries]
                        (run-search-benchmark! query {:user-id    user-id
                                                      :iterations iterations})))]
     (println (format "\n%s" (str/join (repeat 60 "="))))
     (println "SUMMARY")
     (println (str/join (repeat 60 "=")))
     (doseq [{:keys [search-string avg-ms result-count]} results]
       (println (format "  \"%s\": %.2fms avg, %d results"
                        search-string avg-ms result-count)))
     {:results  results
      :test-env test-env})))

;;; ----------------------------------------- Memory Measurement Helpers ------------------------------------------

(defn- heap-pool-beans
  "Return all heap-type MemoryPoolMXBeans."
  []
  (filter #(= (.getType ^MemoryPoolMXBean %) MemoryType/HEAP)
          (ManagementFactory/getMemoryPoolMXBeans)))

(defn- current-heap-used
  "Sum of used bytes across all heap memory pools."
  []
  (reduce + (map #(.getUsed (.getUsage ^MemoryPoolMXBean %))
                 (heap-pool-beans))))

(defn- measure-heap-baseline
  "Force GC and return current heap used bytes. Use this to establish before/after snapshots
  for 'retained' memory. Each call adds ~500ms of wall time."
  []
  (System/gc)
  (Thread/sleep 500)
  (current-heap-used))

;; When measuring memory around an operation:
;; 1. Call measure-heap-baseline BEFORE the operation (forces GC, removes prior garbage).
;; 2. Run the operation.
;; 3. Call peak-heap-used IMMEDIATELY after (before any GC, to capture the allocation watermark).
;; 4. Call measure-heap-baseline AGAIN for the retained value (forces GC, shows true steady state).
;;
;; Do NOT use current-heap-used for retained conclusions — it reads unreclaimed garbage as live
;; memory and will overstate retention by hundreds of MB after a large streaming operation.

(defn- reset-peak-usage!
  "Reset peak usage tracking on all heap memory pools."
  []
  (doseq [^MemoryPoolMXBean pool (heap-pool-beans)]
    (.resetPeakUsage pool)))

(defn- peak-heap-used
  "Return the sum of peak usage across all heap memory pools."
  []
  (reduce + (map #(.getUsed (.getPeakUsage ^MemoryPoolMXBean %))
                 (heap-pool-beans))))

(defn- mb->str
  "Format bytes as MB string."
  [bytes]
  (format "%.1f MB" (/ (double bytes) 1048576.0)))

(defn- print-bench-result
  "Print individual benchmark result details."
  [{:keys [label rows duration-ms heap-before delta peak retained]}]
  (println (format "\n--- %s ---" label))
  (println (format "  Rows:        %,d" rows))
  (println (format "  Duration:    %.1f ms" duration-ms))
  (println (format "  Heap before: %s" (mb->str heap-before)))
  (println (format "  Peak delta:  %s (allocation watermark, not retained)" (mb->str delta)))
  (when retained
    (println (format "  Retained:    %s (after GC)" (mb->str retained))))
  (println (format "  Peak heap:   %s" (mb->str peak))))

;;; ----------------------------------------- Ingestion Memory Benchmark ------------------------------------------

(defn bench-ingestion!
  "Benchmark search ingestion memory usage.
   Reduces searchable-documents (the full pipeline: search-items-reducible -> query->documents),
   measuring heap before/after/peak and duration.

   Reports both peak delta (allocation watermark, affected by GC timing) and
   retained delta (actual memory held after GC — the meaningful metric).

   Re-run this after making changes to the ingestion code to compare memory impact."
  []
  (println "\n============================================================")
  (println "  Search Ingestion Memory Benchmark")
  (println "============================================================")
  (search.engine/init! :search.engine/appdb {})
  (println "  Engine initialized: :search.engine/appdb")
  (let [heap-before (measure-heap-baseline)
        _           (reset-peak-usage!)
        timer       (u/start-timer)
        row-count   (reduce (fn [cnt doc]
                              (doseq [v (vals doc)]
                                (when (string? v)
                                  (.length ^String v)))
                              (inc cnt))
                            0
                            (search.ingestion/searchable-documents))
        duration-ms (u/since-ms timer)
        peak        (peak-heap-used)
        heap-after  (current-heap-used)
        delta       (- peak heap-before)
        ;; Measure retained memory: force GC and check what's actually held
        heap-retained (measure-heap-baseline)
        retained      (- heap-retained heap-before)
        result      {:rows        row-count
                     :heap-before heap-before
                     :heap-after  heap-after
                     :delta       delta
                     :retained    retained
                     :peak        peak
                     :duration-ms duration-ms}]
    (print-bench-result (assoc result :label "searchable-documents"))
    result))

(defn bench-reindex!
  "Benchmark a full synchronous reindex of the appdb search engine,
   measuring heap before/after/peak and duration."
  []
  (println "\n============================================================")
  (println "  Search Reindex Memory Benchmark")
  (println "============================================================")
  (search.engine/init! :search.engine/appdb {})
  (println "  Engine initialized: :search.engine/appdb")
  (let [heap-before  (measure-heap-baseline)
        _            (reset-peak-usage!)
        timer        (u/start-timer)
        index-counts (search.engine/reindex! :search.engine/appdb {:in-place? true})
        duration-ms  (u/since-ms timer)
        peak         (peak-heap-used)
        heap-after   (current-heap-used)
        delta        (- peak heap-before)
        heap-retained (measure-heap-baseline)
        retained      (- heap-retained heap-before)
        row-count    (reduce + (vals index-counts))
        result       {:rows        row-count
                      :heap-before heap-before
                      :heap-after  heap-after
                      :delta       delta
                      :retained    retained
                      :peak        peak
                      :duration-ms duration-ms}]
    (print-bench-result (assoc result :label "reindex! (in-place)"))
    (println "\n  Index counts by model:")
    (doseq [[model cnt] (sort-by val > index-counts)]
      (println (format "    %-25s %,d" (name model) cnt)))
    result))

;;; ---------------------------------- Instrumented Ingestion Profiling ------------------------------------------

(defn bench-ingestion-profile!
  "Instrumented ingestion benchmark that reports heap usage every `report-every` items.
   Shows whether memory grows linearly (leak) or stays flat (streaming works, GC handles it).

   Options:
     :report-every - Print heap stats every N items (default 5000)"
  ([] (bench-ingestion-profile! {}))
  ([{:keys [report-every] :or {report-every 5000}}]
   (println "\n============================================================")
   (println "  Search Ingestion Memory Profile")
   (println (format "  Reporting every %,d items" report-every))
   (println "============================================================")
   (search.engine/init! :search.engine/appdb {})
   (let [heap-before (measure-heap-baseline)
         _           (reset-peak-usage!)
         timer       (u/start-timer)
         result      (lib-be/with-metadata-provider-cache
                       (reduce
                        (fn [{:keys [count current-model] :as state} doc]
                          ;; Touch values to prevent lazy-seq optimization
                          (doseq [v (vals doc)]
                            (when (string? v)
                              (.length ^String v)))
                          (let [cnt       (inc count)
                                doc-model (:model doc)]
                            (when (not= doc-model current-model)
                              (println (format "  >>> Model switch: %s -> %s at item %,d"
                                               current-model doc-model cnt)))
                            (when (zero? (mod cnt report-every))
                              (let [heap-now (current-heap-used)
                                    delta    (- heap-now heap-before)]
                                (println (format "  %,8d items | heap: %s | delta: %s | peak: %s | elapsed: %.1fs"
                                                 cnt
                                                 (mb->str heap-now)
                                                 (mb->str delta)
                                                 (mb->str (peak-heap-used))
                                                 (/ (u/since-ms timer) 1000.0)))
                                (flush)))
                            (assoc state :count cnt :current-model doc-model)))
                        {:count 0 :current-model nil}
                        (search.ingestion/searchable-documents)))
         duration-ms (u/since-ms timer)
         peak        (peak-heap-used)
         delta       (- peak heap-before)
         total       (:count result)
         heap-after  (measure-heap-baseline)
         retained    (- heap-after heap-before)]
     (println "\n--- Summary ---")
     (println (format "  Total items: %,d" total))
     (println (format "  Duration:    %.1f ms" duration-ms))
     (println (format "  Heap before: %s" (mb->str heap-before)))
     (println (format "  Peak delta:  %s" (mb->str delta)))
     (println (format "  Retained:    %s (after GC)" (mb->str retained)))
     {:total       total
      :duration-ms duration-ms
      :heap-before heap-before
      :peak        peak
      :peak-delta  delta
      :retained    retained})))

(defn- counting-reduce
  "Reduce a reducible, touching string values to prevent lazy optimization.
   Returns {:rows N :duration-ms M :heap-before B :peak-delta D}."
  [label reducible]
  (println (format "\n--- %s ---" label))
  (let [heap-before (measure-heap-baseline)
        _           (reset-peak-usage!)
        timer       (u/start-timer)
        row-count   (reduce (fn [cnt row]
                              (doseq [v (vals row)]
                                (when (string? v)
                                  (.length ^String v)))
                              (inc cnt))
                            0
                            reducible)
        duration-ms (u/since-ms timer)
        peak        (peak-heap-used)
        peak-delta  (- peak heap-before)
        heap-after  (measure-heap-baseline)
        retained    (- heap-after heap-before)]
    (println (format "  Rows:        %,d" row-count))
    (println (format "  Duration:    %.1f ms" duration-ms))
    (println (format "  Peak delta:  %s" (mb->str peak-delta)))
    (println (format "  Retained:    %s" (mb->str retained)))
    {:label       label
     :rows        row-count
     :duration-ms duration-ms
     :heap-before heap-before
     :peak-delta  peak-delta
     :retained    retained}))

(defn bench-pipeline-layers!
  "Test each pipeline layer independently to isolate where memory accumulates.

   Layers tested:
   1. Raw query (no transforms)
   2. With realize only
   3. With realize + assoc model
   4. With realize + assoc model + ->document
   5. Full pipeline (searchable-documents, all models)

   Options:
     :model              - model to benchmark (default 'card')
     :query-fn           - fn from HoneySQL map -> reducible (default mdb.query/streaming-reducible-query)
     :compare-streaming? - when true, run layers 1 and 4 with BOTH streaming and t2/reducible-query
                           so you can see the streaming impact through ->document (default false)

   Layers 4 and 5 call ->document which evaluates search spec :fn attrs (e.g. has-temporal-dimension?)
   via the metadata provider. They require a running Metabase backend."
  ([] (bench-pipeline-layers! {}))
  ([{:keys [model query-fn compare-streaming?]
     :or   {model "card" query-fn mdb.query/streaming-reducible-query}}]
   (println "\n============================================================")
   (println "  Pipeline Layer Memory Isolation")
   (println (format "  Model: %s" model))
   (println (format "  Query fn: %s" (if compare-streaming? "streaming vs non-streaming" query-fn)))
   (println "============================================================")
   (let [query     (#'search.ingestion/spec-index-query model)
         streaming mdb.query/streaming-reducible-query
         non-streaming t2/reducible-query

         doc-eduction (fn [qfn]
                        (eduction (comp (map t2.realize/realize)
                                        (map #(assoc % :model model))
                                        (map #'search.ingestion/->document))
                                  (qfn query)))

         ;; Layer 1: Raw query only
         layer1 (counting-reduce
                 (str "Layer 1: " (if compare-streaming? "streaming-reducible-query" query-fn))
                 (query-fn query))

         ;; Layer 1b (compare mode only): non-streaming raw query
         layer1b (when compare-streaming?
                   (counting-reduce
                    "Layer 1b: t2/reducible-query (no streaming)"
                    (non-streaming query)))

         ;; Layer 2: query + realize
         layer2 (counting-reduce
                 "Layer 2: query + realize"
                 (eduction (map t2.realize/realize) (query-fn query)))

         ;; Layer 3: query + realize + assoc model
         layer3 (counting-reduce
                 "Layer 3: query + realize + assoc model"
                 (eduction (comp (map t2.realize/realize)
                                 (map #(assoc % :model model)))
                           (query-fn query)))

         ;; Layer 4: query + realize + assoc model + ->document
         ;; Requires lib-be/with-metadata-provider-cache because ->document evaluates search spec
         ;; :fn attrs (e.g. has-temporal-dimension?) that use the metadata provider. Without it
         ;; the call will block indefinitely in a cold REPL session.
         layer4 (lib-be/with-metadata-provider-cache
                  (counting-reduce
                   (str "Layer 4: " (if compare-streaming? "streaming" query-fn) " + ->document")
                   (doc-eduction (if compare-streaming? streaming query-fn))))

         ;; Layer 4b (compare mode only): non-streaming through ->document
         layer4b (when compare-streaming?
                   (lib-be/with-metadata-provider-cache
                     (counting-reduce
                      "Layer 4b: t2/reducible-query + ->document (no streaming)"
                      (doc-eduction non-streaming))))

         ;; Layer 5: Full pipeline (all models) — also needs the metadata provider cache
         layer5 (lib-be/with-metadata-provider-cache
                  (counting-reduce
                   "Layer 5: Full pipeline (searchable-documents)"
                   (search.ingestion/searchable-documents)))

         results (remove nil? [layer1 layer1b layer2 layer3 layer4 layer4b layer5])]

     (println "\n\n============================================================")
     (println "  COMPARISON")
     (println "============================================================")
     (println (format "| %-54s | %10s | %12s | %12s |"
                      "Layer" "Rows" "Peak Delta" "Retained"))
     (println (str/join (repeat 99 "-")))
     (doseq [{:keys [label rows peak-delta retained]} results]
       (println (format "| %-54s | %,10d | %12s | %12s |"
                        label rows (mb->str peak-delta) (mb->str retained))))
     (println (str/join (repeat 99 "-")))
     results)))

(defn bench-ingestion-by-model!
  "Benchmark each search model independently to isolate per-model memory behavior.
   Calls spec-index-reducible per model (same path as production), measuring
   heap before/after/peak for each model with forced GC between models.

   This reveals whether individual models load eagerly (large peak delta)
   or stream properly (small peak delta)."
  []
  (println "\n============================================================")
  (println "  Per-Model Memory Benchmark")
  (println "============================================================")
  (search.engine/init! :search.engine/appdb {})
  (let [models  (search.spec/search-models)
        results (vec
                 (for [model models]
                   (let [heap-before (measure-heap-baseline)
                         _           (reset-peak-usage!)
                         timer       (u/start-timer)
                         row-count   (reduce (fn [cnt row]
                                               (doseq [v (vals row)]
                                                 (when (string? v)
                                                   (.length ^String v)))
                                               (inc cnt))
                                             0
                                             (#'search.ingestion/spec-index-reducible model))
                         duration-ms (u/since-ms timer)
                         peak        (peak-heap-used)
                         peak-delta  (- peak heap-before)
                         heap-retained (measure-heap-baseline)
                         retained    (- heap-retained heap-before)]
                     (println (format "  %-25s | %,8d rows | peak delta: %12s | retained: %12s | %.1fs"
                                      model row-count (mb->str peak-delta) (mb->str retained)
                                      (/ duration-ms 1000.0)))
                     {:model       model
                      :rows        row-count
                      :duration-ms duration-ms
                      :heap-before heap-before
                      :peak-delta  peak-delta
                      :retained    retained})))]
    (println "\n\n============================================================")
    (println "  COMPARISON")
    (println "============================================================")
    (println (format "| %-25s | %10s | %12s | %12s | %10s |"
                     "Model" "Rows" "Peak Delta" "Retained" "Duration"))
    (println (str/join (repeat 85 "-")))
    (doseq [{:keys [model rows peak-delta retained duration-ms]} results]
      (println (format "| %-25s | %,10d | %12s | %12s | %8.1fs |"
                       model rows (mb->str peak-delta) (mb->str retained)
                       (/ duration-ms 1000.0))))
    (println (str/join (repeat 85 "-")))
    results))

(defn heap-histogram!
  "Print a JVM heap histogram (top N classes by instance count).
   Useful for before/after comparison to see what object types grew.

   Usage:
     (heap-histogram!)              ;; top 20
     (heap-histogram! 50)           ;; top 50
     (def before (heap-histogram!))
     ;; ... run operation ...
     (def after (heap-histogram!))
     (heap-histogram-diff! before after)"
  ([] (heap-histogram! 20))
  ([n]
   (System/gc)
   (Thread/sleep 200)
   (let [pid    (.getName (ManagementFactory/getRuntimeMXBean))
         pid    (first (str/split pid #"@"))
         ^Process result (-> (Runtime/getRuntime)
                             (.exec ^"[Ljava.lang.String;" (into-array String ["jcmd" pid "GC.class_histogram"])))]
     (with-open [rdr (clojure.java.io/reader (.getInputStream result))]
       (let [lines (vec (line-seq rdr))
             ;; Skip header lines (first 3), take top N
             data-lines (take n (drop 3 lines))]
         (doseq [line (take 3 lines)]
           (println line))
         (doseq [line data-lines]
           (println line))
         ;; Return parsed data for diffing
         (mapv (fn [line]
                 (let [parts (str/split (str/trim line) #"\s+")]
                   (when (>= (count parts) 4)
                     {:rank      (str/replace (first parts) #":" "")
                      :instances (parse-long (str/replace (nth parts 1) #"," ""))
                      :bytes     (parse-long (str/replace (nth parts 2) #"," ""))
                      :class     (nth parts 3)})))
               data-lines))))))

(defn heap-histogram-diff!
  "Compare two heap histograms and show classes with the biggest growth.
   Use with `heap-histogram!`:
     (def before (heap-histogram!))
     ;; ... run operation ...
     (def after (heap-histogram!))"
  ([before after] (heap-histogram-diff! before after 20))
  ([before after n]
   (let [before-map (into {} (keep (fn [entry]
                                     (when entry
                                       [(:class entry) entry])))
                          before)
         after-map  (into {} (keep (fn [entry]
                                     (when entry
                                       [(:class entry) entry])))
                          after)
         all-classes (set (concat (keys before-map) (keys after-map)))
         diffs       (->> all-classes
                          (map (fn [cls]
                                 (let [b (get before-map cls {:instances 0 :bytes 0})
                                       a (get after-map cls {:instances 0 :bytes 0})]
                                   {:class          cls
                                    :instance-delta (- (:instances a) (:instances b))
                                    :bytes-delta    (- (:bytes a) (:bytes b))})))
                          (sort-by :bytes-delta >)
                          (take n))]
     (println (format "| %-60s | %15s | %15s |" "Class" "Instance Delta" "Bytes Delta"))
     (println (str/join (repeat 100 "-")))
     (doseq [{:keys [class instance-delta bytes-delta]} diffs]
       (println (format "| %-60s | %,15d | %,15d |"
                        class instance-delta bytes-delta)))
     diffs)))

(comment
  ;; --- Search Latency Benchmarks ---

  ;; Quick sanity check (small data)
  (run-full-benchmark! {:num-tables 1
                        :num-groups 5
                        :num-users  4
                        :iterations 1})

  ;; Realistic latency benchmark
  (run-full-benchmark! {:num-tables 10000
                        :num-groups 25
                        :num-users  100
                        :iterations 10})

  ;; Manual setup for repeated interactive testing
  (def test-env (create-test-environment! {:num-tables 1000
                                           :num-groups 35
                                           :num-users  200}))
  (timed-search! "table" :user-id (:user-id test-env) :models #{"table"})

  (require '[dev.explain-analyze :as e])
  (e/explain (timed-search! "perf_test_table" :user-id (:user-id test-env)))

  ;; --- Ingestion Memory Benchmarks ---
  ;;
  ;; These functions read peak and retained heap during the ingestion pipeline.
  ;;
  ;; 'Peak delta'  = allocation watermark during the operation (includes GC-eligible garbage).
  ;; 'Retained'    = heap delta after a forced GC — the true steady-state cost.
  ;;
  ;; For reproducible results, create a test environment first so the dataset is consistent:
  (create-test-environment! {:data-scale 1000})

  ;; Read the full ingestion pipeline; measures peak and retained heap.
  (bench-ingestion!)

  ;; Same as bench-ingestion! but also writes to the search index.
  (bench-reindex!)

  ;; Prints heap delta every N items so you can see the GC sawtooth pattern live.
  ;; The sawtooth (heap climbs, GC fires, drops, climbs again) is NORMAL for streaming —
  ;; it means rows are being reclaimed. A continuously rising floor after each GC is a leak.
  (bench-ingestion-profile!)
  (bench-ingestion-profile! {:report-every 10000})

  ;; Isolate which pipeline layer uses the most memory.
  ;; Layers 1-3: raw streaming query, realize, assoc model — all very low overhead.
  ;; Layer 4: adds ->document (evaluates :fn attrs like has-temporal-dimension?).
  ;; Layer 5: full pipeline over all models.
  ;; Layers 4 and 5 call ->document and require a live backend with metadata available.
  (bench-pipeline-layers!)
  (bench-pipeline-layers! {:model "table"})

  ;; Per-model breakdown — useful to identify which model type is the outlier.
  (bench-ingestion-by-model!)

  ;; --- Heap Histogram Comparison ---
  ;; Use this to see exactly which object types grew during an operation.
  (def before (heap-histogram!))
  (bench-ingestion!)
  (def after (heap-histogram!))
  (heap-histogram-diff! before after))
