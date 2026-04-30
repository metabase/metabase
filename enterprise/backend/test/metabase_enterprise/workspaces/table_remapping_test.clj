(ns metabase-enterprise.workspaces.table-remapping-test
  "Tests for the public writer API in `metabase-enterprise.workspaces.table-remapping`.
   Exercises the round-trip between `add-mapping!`, `remap-table`, `remove-mapping!`,
   `all-mappings-for-db`, `clear-mappings-for-db!`, and `add-transform-target-mapping!`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.models.workspace-database]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver :as driver]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [f] (mt/with-premium-features #{:workspaces} (f))))

(defn- clean-db-fixture!
  "Run `f` with mappings cleared before and after so tests don't leak state."
  [db-id f]
  (ws.table-remapping/clear-mappings-for-db! db-id)
  (try (f)
       (finally (ws.table-remapping/clear-mappings-for-db! db-id))))

(defn- with-provisioned-workspace-db!
  "Set the in-process workspace atom so `db-workspace-schema` returns
   `output-schema` for `db-id`, run `f`, clear the atom on the way out."
  [db-id output-schema f]
  (try
    (ws/set-instance-workspace! {:name "table-remapping-test-ws"
                                 :databases {db-id {:input_schemas []
                                                    :output_schema output-schema}}})
    (f)
    (finally
      (ws/clear-instance-workspace!))))

(deftest remap-table-returns-nil-when-no-mapping-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (is (nil? (ws.table-remapping/remap-table (mt/id) "nope_schema" "nope_table"))))))

(deftest add-then-remap-table-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id)
      {:schema "PUBLIC" :table "ORDERS"}
      {:schema "ws_schema" :table "orders_copy"})
     (is (= ["ws_schema" "orders_copy"]
            (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest all-mappings-for-db-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_schema" :table "products_copy"})
     (is (= {["" "PUBLIC" "ORDERS"]   ["" "ws_schema" "orders_copy"]
             ["" "PUBLIC" "PRODUCTS"] ["" "ws_schema" "products_copy"]}
            (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest remove-mapping!-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/remove-mapping! (mt/id) "PUBLIC" "ORDERS")
     (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))

(deftest clear-mappings-for-db!-test
  (clean-db-fixture!
   (mt/id)
   (fn []
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_schema" :table "orders_copy"})
     (ws.table-remapping/add-mapping!
      (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_schema" :table "products_copy"})
     (ws.table-remapping/clear-mappings-for-db! (mt/id))
     (is (= {} (ws.table-remapping/all-mappings-for-db (mt/id)))))))

(deftest add-mapping!-is-idempotent-test
  (testing "duplicate inserts swallow the SQLSTATE 23505 unique-constraint violation"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"})
       (is (nil? (ws.table-remapping/add-mapping!
                  (mt/id) {:schema "PUBLIC" :table "ORDERS"} {:schema "ws_schema" :table "orders_copy"}))
           "second identical insert no-ops instead of throwing")
       (is (= {["" "PUBLIC" "ORDERS"] ["" "ws_schema" "orders_copy"]}
              (ws.table-remapping/all-mappings-for-db (mt/id)))
           "only one row persists")))))

;; ------------------------------------------------- add-transform-target-mapping! -------------------------------------------------

(deftest add-transform-target-mapping!-writes-app-db-test
  (testing "add-transform-target-mapping! writes the app-db cache using the workspace's output schema as the to-schema"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-provisioned-workspace-db!
         (mt/id) "ws_fresh"
         (fn []
           (ws.table-remapping/add-transform-target-mapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (is (= ["ws_fresh" "orders_copy"]
                  (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS")))))))))

(deftest add-transform-target-mapping!-is-idempotent-test
  (testing "calling add-transform-target-mapping! twice leaves the app-db with a single row (no duplicate-key explosion)"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-provisioned-workspace-db!
         (mt/id) "ws_idem"
         (fn []
           (ws.table-remapping/add-transform-target-mapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (ws.table-remapping/add-transform-target-mapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
           (is (= {["" "PUBLIC" "ORDERS"] ["" "ws_idem" "orders_copy"]}
                  (ws.table-remapping/all-mappings-for-db (mt/id))))))))))

(deftest workspace-remap-schema+name-redirects-sync-fetch-test
  (testing "sync's fetch-metadata hook returns [to-schema to-table-name] when a TableRemapping exists"
    (let [db-id (mt/id)]
      (clean-db-fixture!
       db-id
       (fn []
         (is (nil? (ws.table-remapping/workspace-remap-schema+name db-id "PUBLIC" "ORDERS"))
             "without a remapping, the hook returns nil so sync queries the logical table")
         (ws.table-remapping/add-mapping! db-id
                                          {:schema "PUBLIC"     :table "ORDERS"}
                                          {:schema "mb_iso_ws"  :table "orders_copy"})
         (is (= ["mb_iso_ws" "orders_copy"]
                (ws.table-remapping/workspace-remap-schema+name db-id "PUBLIC" "ORDERS"))
             "with a remapping, the hook returns the isolated warehouse location so sync asks the driver there"))))))

(deftest table-fields-metadata-honors-workspace-remapping-test
  (testing "sync/fetch-metadata/table-fields-metadata asks the driver about the remapped warehouse table"
    (let [db-id          (mt/id)
          describe-calls (atom [])]
      (clean-db-fixture!
       db-id
       (fn []
         (ws.table-remapping/add-mapping! db-id
                                          {:schema "PUBLIC"    :table "ORDERS"}
                                          {:schema "mb_iso_ws" :table "orders_copy"})
         (with-redefs [driver/describe-fields
                       (fn [_driver _db & {:keys [table-names schema-names]}]
                         (swap! describe-calls conj {:path         :describe-fields
                                                     :table-names  table-names
                                                     :schema-names schema-names})
                         #{})
                       driver/describe-table
                       (fn [_driver _db table]
                         (swap! describe-calls conj {:path   :describe-table
                                                     :schema (:schema table)
                                                     :name   (:name table)})
                         {:fields #{}})]
           (let [logical-table (t2/instance :model/Table
                                            {:id 999 :name "ORDERS" :schema "PUBLIC" :db_id db-id})]
             (fetch-metadata/table-fields-metadata
              (t2/select-one :model/Database :id db-id)
              logical-table))
           (is (= 1 (count @describe-calls)))
           (let [call (first @describe-calls)]
             (testing "driver is asked about the remapped (to_schema, to_table_name), not the logical source"
               (case (:path call)
                 :describe-fields
                 (do (is (= ["orders_copy"] (:table-names call)))
                     (is (= ["mb_iso_ws"]   (:schema-names call))))
                 :describe-table
                 (do (is (= "orders_copy" (:name call)))
                     (is (= "mb_iso_ws"   (:schema call))))
                 (is false (str "unexpected path " (:path call))))))))))))

(deftest add-transform-target-mapping!-requires-workspaced-db-test
  (testing "throws with a clear error when db is not workspaced (db-workspace-schema returns nil)"
    ;; Defensive: ensure no provisioned WorkspaceDatabase row leaks in from another test.
    (t2/delete! :model/WorkspaceDatabase :database_id (mt/id) :status :provisioned)
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [ex (try
                  (ws.table-remapping/add-transform-target-mapping! (mt/id) "PUBLIC" "ORDERS" "orders_copy")
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
         (is (some? ex) "add-transform-target-mapping! must throw when the db is not workspaced")
         (is (re-find #"not workspaced" (ex-message ex)))
         (is (= (mt/id) (:db-id (ex-data ex)))))
       (testing "no app-db row was written"
         (is (nil? (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))))))))

;;; --------------------------- Pre-sync ordering: to-side has no :model/Table yet -------------------------------
;;;
;;; A `TableRemapping` row can be inserted before sync has run on the workspace's destination schema, so the
;;; `(to_schema, to_table_name)` pair has no corresponding `:model/Table` row in the app DB yet. Every code path
;;; that consumes the remapping must operate on the schema/table strings alone — none should require a hydrated
;;; `:model/Table` for the to-side. These tests pin that contract so a future change that adds `:model/Table`
;;; lookup on the to-side surfaces immediately.

(deftest remap-table-works-without-to-side-model-table-test
  (testing "remap-table returns the [to-schema to-table-name] pair even when no :model/Table exists for it"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (testing "precondition: no :model/Table row exists for the to-side"
           (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))))
         (ws.table-remapping/add-mapping! (mt/id)
                                          {:schema "PUBLIC"   :table "ORDERS"}
                                          {:schema to-schema  :table to-table})
         (is (= [to-schema to-table]
                (ws.table-remapping/remap-table (mt/id) "PUBLIC" "ORDERS"))
             "remap-table operates on strings only — no :model/Table lookup on the to-side"))))))

(deftest workspace-remap-schema+name-works-without-to-side-model-table-test
  (testing "the sync hook returns [to-schema to-table-name] even when no :model/Table exists for it"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [to-schema "ws_unsynced"
             to-table  "orders_workspace_copy"]
         (is (nil? (t2/select-one :model/Table :db_id (mt/id) :schema to-schema :name to-table))
             "precondition: no :model/Table row exists for the to-side")
         (ws.table-remapping/add-mapping! (mt/id)
                                          {:schema "PUBLIC"   :table "ORDERS"}
                                          {:schema to-schema  :table to-table})
         (is (= [to-schema to-table]
                (ws.table-remapping/workspace-remap-schema+name (mt/id) "PUBLIC" "ORDERS"))
             "sync hook returns the remap pair regardless of to-side sync state"))))))

(deftest all-mappings-for-db-works-without-to-side-model-tables-test
  (testing "all-mappings-for-db returns rows whose to-side has no :model/Table yet"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "ORDERS"}   {:schema "ws_unsynced" :table "orders_copy"})
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "PEOPLE"}   {:schema "ws_unsynced" :table "people_copy"})
       (ws.table-remapping/add-mapping! (mt/id) {:schema "PUBLIC" :table "PRODUCTS"} {:schema "ws_unsynced" :table "products_copy"})
       (let [mappings (ws.table-remapping/all-mappings-for-db (mt/id))]
         (is (= {["" "PUBLIC" "ORDERS"]   ["" "ws_unsynced" "orders_copy"]
                 ["" "PUBLIC" "PEOPLE"]   ["" "ws_unsynced" "people_copy"]
                 ["" "PUBLIC" "PRODUCTS"] ["" "ws_unsynced" "products_copy"]}
                mappings)
             "all-mappings-for-db is purely (db, schema, name) string-based — no :model/Table required"))))))

;; ----------------------------- spec-for-table -----------------------------
;;
;; Per-driver hierarchy resolution. Verifies the {db, schema, table} shape we'd
;; persist in `:model/TableRemapping` rows for a given (database, table) pair.

(deftest spec-for-table-h2-test
  (testing "H2 (default test driver) populates :schema only"
    (let [database  (t2/select-one :model/Database :id (mt/id))
          table-row (t2/select-one :model/Table :id (mt/id :orders))
          spec      (ws.table-remapping/spec-for-table database table-row)]
      (is (= "" (:db spec)) "db slot is the empty-string sentinel for non-catalog drivers")
      (is (= "PUBLIC" (:schema spec)))
      (is (= "ORDERS" (:table spec))))))

(deftest spec-for-table-mysql-engine-test
  (testing "MySQL populates neither :db nor :schema (bare table)"
    (let [database (assoc (t2/select-one :model/Database :id (mt/id)) :engine :mysql)
          table    (t2/select-one :model/Table :id (mt/id :orders))
          {:keys [db schema]} (ws.table-remapping/spec-for-table database table)]
      (is (= "" db))
      (is (= "" schema)))))

;; The clickhouse / bigquery `spec-for-table` tests below exercise the per-driver branches
;; of `schema-position-value` / `db-position-value`. They require the driver to be loaded —
;; not for warehouse interaction, but because `(driver/qualified-name-components engine)`
;; triggers driver lazy-load via `dispatch-on-initialized-driver`. Skipped when the driver
;; isn't on the test classpath.

(defn- driver-loadable? [engine]
  (try (driver/the-initialized-driver engine) true
       (catch Throwable _ false)))

(deftest spec-for-table-clickhouse-engine-test
  (when (driver-loadable? :clickhouse)
    (testing "ClickHouse fills :schema with the database name (driver emits db.table)"
      (let [database (assoc (t2/select-one :model/Database :id (mt/id)) :engine :clickhouse)
            table    (t2/select-one :model/Table :id (mt/id :orders))
            {:keys [db schema]} (ws.table-remapping/spec-for-table database table)]
        (is (= "" db) "no catalog level on ClickHouse")
        (is (= (:name database) schema)
            "schema-position filled from database.:name on schema-less drivers")))))

(deftest spec-for-table-bigquery-engine-test
  (when (driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery fills :db from connection details :project-id"
      (let [database {:engine :bigquery-cloud-sdk
                      :name "ignored"
                      :details {:project-id "my-proj"}}
            table    {:name "orders" :schema "ds"}
            {:keys [db schema table]} (ws.table-remapping/spec-for-table database table)]
        (is (= "my-proj" db))
        (is (= "ds" schema))
        (is (= "orders" table))))))

(deftest spec-for-table-bigquery-no-project-id-test
  (when (driver-loadable? :bigquery-cloud-sdk)
    (testing "BigQuery without explicit :project-id leaves :db empty (does not leak credentials blob)"
      (let [database {:engine :bigquery-cloud-sdk
                      :name "ignored"
                      :details {:service-account-json "{\"private_key\": \"secret\"}"}}
            table    {:name "orders" :schema "ds"}
            {:keys [db]} (ws.table-remapping/spec-for-table database table)]
        (is (= "" db) "service-account-json must NOT be used as a project id")))))

;; ----------------------------- Cache invalidation hooks -----------------------------
;;
;; Inserting or deleting a TableRemapping must invalidate the QP results cache for the
;; affected database. Otherwise a query cached *before* a remap was registered would
;; silently return canonical-table results forever — Phase 2's SQL rewriter never runs
;; on cache hits, so a stale entry leaks production data into the workspace.

(defn- cache-config-invalidated-at [db-id]
  (t2/select-one-fn :invalidated_at :model/CacheConfig
                    :model    "database"
                    :model_id db-id))

(defn- with-database-cache-config!
  "Ensure a `:database` CacheConfig row exists for `db-id` with a known `invalidated_at`.
   Runs `f` with the row's actual stored `invalidated_at` (read back to avoid
   `OffsetDateTime` vs `ZonedDateTime` typing mismatches across drivers) and cleans
   up the row on the way out."
  [db-id f]
  (try
    (t2/insert! :model/CacheConfig
                {:model           "database"
                 :model_id        db-id
                 :strategy        :ttl
                 :config          {:multiplier 10 :min_duration_ms 1}
                 :invalidated_at  (t/offset-date-time 2020 1 1)})
    (f (cache-config-invalidated-at db-id))
    (finally
      (t2/delete! :model/CacheConfig :model "database" :model_id db-id))))

(deftest cache-invalidation-on-insert-test
  (testing "inserting a TableRemapping bumps cache_config.invalidated_at for the database"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-database-cache-config!
         (mt/id)
         (fn [initial-invalidated-at]
           (ws.table-remapping/add-mapping!
            (mt/id)
            {:schema "PUBLIC" :table "ORDERS"}
            {:schema "ws_schema" :table "orders_copy"})
           (let [after (cache-config-invalidated-at (mt/id))]
             (is (some? after) "cache config still exists")
             (is (t/after? after initial-invalidated-at)
                 "invalidated_at was bumped past its previous value"))))))))

(deftest cache-invalidation-on-delete-test
  (testing "deleting a TableRemapping bumps cache_config.invalidated_at for the database"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (with-database-cache-config!
         (mt/id)
         (fn [_]
           (ws.table-remapping/add-mapping!
            (mt/id)
            {:schema "PUBLIC" :table "ORDERS"}
            {:schema "ws_schema" :table "orders_copy"})
           (let [post-insert (cache-config-invalidated-at (mt/id))]
             (Thread/sleep (long 10)) ; ensure timestamp clock advances
             (ws.table-remapping/remove-mapping! (mt/id) "PUBLIC" "ORDERS")
             (let [post-delete (cache-config-invalidated-at (mt/id))]
               (is (t/after? post-delete post-insert)
                   "delete bumped invalidated_at past its post-insert value")))))))))

(deftest cache-invalidation-only-affects-target-database-test
  (testing "inserting a remap on db A doesn't invalidate db B's cache config"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [other-db-id 999999]
         (with-database-cache-config!
           (mt/id)
           (fn [_]
             (with-database-cache-config!
               other-db-id
               (fn [other-initial]
                 (ws.table-remapping/add-mapping!
                  (mt/id)
                  {:schema "PUBLIC" :table "ORDERS"}
                  {:schema "ws_schema" :table "orders_copy"})
                 (let [other-after (cache-config-invalidated-at other-db-id)]
                   (is (= (t/instant other-initial) (t/instant other-after))
                       "the other database's invalidated_at is untouched")))))))))))

;;; -------------------------- DEV-1898: filter-workspace-side-tables --------------------------

(deftest filter-workspace-side-tables-no-rows-test
  (testing "without any remap rows, the filter is identity"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (let [tuples #{{:schema "public" :name "orders"}
                      {:schema "public" :name "users"}}]
         (is (= tuples (fetch-metadata/filter-workspace-side-tables tuples (mt/id)))))))))

(deftest filter-workspace-side-tables-drops-only-to-side-test
  (testing "with a remap row, only the to-side (schema, name) tuple is dropped"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public"   :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [tuples   #{{:schema "public"   :name "orders"}
                        {:schema "public"   :name "users"}
                        {:schema "ws_alice" :name "orders"}}
             filtered (fetch-metadata/filter-workspace-side-tables tuples (mt/id))]
         (is (= #{{:schema "public" :name "orders"}
                  {:schema "public" :name "users"}}
                filtered)
             "ws_alice.orders is removed; canonical tuples pass through"))))))

(deftest filter-workspace-side-tables-scoped-by-database-test
  (testing "remappings on db A do not affect filtering on db B"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (ws.table-remapping/add-mapping!
        (mt/id)
        {:schema "public"   :table "orders"}
        {:schema "ws_alice" :table "orders"})
       (let [other-db-id 999999
             tuples      #{{:schema "ws_alice" :name "orders"}}]
         (is (= tuples (fetch-metadata/filter-workspace-side-tables tuples other-db-id))
             "another database's table-list is untouched"))))))

(deftest sync-tables-and-database-skips-workspace-side-tuples-test
  (testing "DEV-1898: sync-tables-and-database! does not create :model/Table rows for workspace-side tuples"
    (clean-db-fixture!
     (mt/id)
     (fn []
       (mt/with-temp [:model/Table _ {:db_id  (mt/id)
                                      :schema "public"
                                      :name   "dev_1898_orders"}]
         (ws.table-remapping/add-mapping!
          (mt/id)
          {:schema "public"      :table "dev_1898_orders"}
          {:schema "ws_dev_1898" :table "dev_1898_orders"})
         ;; Simulate a driver whose describe-database surfaces both the canonical
         ;; and workspace-isolation schemas.
         (let [fake-metadata {:tables #{{:schema "public"      :name "dev_1898_orders"}
                                        {:schema "ws_dev_1898" :name "dev_1898_orders"}}}]
           (with-redefs [fetch-metadata/db-metadata (constantly fake-metadata)]
             (sync-tables/sync-tables-and-database! (t2/select-one :model/Database (mt/id)))))
         (let [created-pairs (set (t2/select-fn-set (juxt :schema :name)
                                                    :model/Table
                                                    :db_id (mt/id)
                                                    :name  "dev_1898_orders"))]
           (is (contains? created-pairs ["public" "dev_1898_orders"])
               "canonical Table row exists")
           (is (not (contains? created-pairs ["ws_dev_1898" "dev_1898_orders"]))
               "workspace-side Table row is filtered out and never persisted")))))))
