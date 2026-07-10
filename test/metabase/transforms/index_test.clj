(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end: indexes declared on a transform target reach the physical table when the transform runs, across
  re-runs and failures, for both transform kinds (SQL builds the table with a CTAS, Python with `create-table!`).
  Per-driver cases and helpers live in [[metabase.transforms.index-test-util]]. Each test persists real
  `:model/TableIndex` rows for its case, so the run reads them exactly like user-created requests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.index-test-util :as index-util]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query-source
  "A SQL transform source that selects the whole `transforms_products` table (built via a CTAS)."
  []
  {:type  :query
   :query (query-test-util/make-query
           {:source-table (t2/select-one-fn :name :model/Table (mt/id :transforms_products))})})

(defn- python-source
  "A Python transform source that returns `transforms_products` unchanged (built via `create-table!`)."
  []
  {:type            "python"
   :source-database (mt/id)
   :source-tables   [(transforms.tu/source-table-entry "transforms_products" (mt/id :transforms_products))]
   :body            "def transform(transforms_products):\n    return transforms_products"})

(defn- create-index-requests!
  "Persist `indexes` as `:model/TableIndex` rows for `transform-id`, so the run picks them up like real user-created
  requests. Cleaned up with the transform (FK cascade)."
  [transform-id indexes]
  (when (seq indexes)
    (t2/insert! :model/TableIndex (for [index indexes]
                                    {:transform_id transform-id
                                     :index_name   (or (:name index) (name (:kind index)))
                                     :structured   index}))))

(defn- test-declared-indexes!
  "Run a transform (source from the 0-arg `make-source`) with the driver's `:indexes` persisted as its index requests,
  then assert `:physical-indexes` reads `:expected` from the catalog. Runs twice to check they survive a rebuild."
  [{:keys [indexes expected physical-indexes]} make-source]
  (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
    (with-transform-cleanup! [{table-name :name :as target}
                              {:type     "table"
                               :schema   schema
                               :name     "idx_products"
                               :database (mt/id)}]
      (mt/with-temp [:model/Transform transform {:name   "index-transform"
                                                 :source (make-source)
                                                 :target target}]
        (create-index-requests! (:id transform) indexes)
        (testing "a full run applies the declared indexes to the physical table"
          (transforms.execute/execute! transform {:run-method :manual})
          (transforms.tu/wait-for-table table-name 10000)
          (is (= expected (physical-indexes (mt/db) schema table-name))))
        (testing "a re-run rebuilds the table and the indexes come back the same"
          (transforms.execute/execute! transform {:run-method :manual})
          (is (= expected (physical-indexes (mt/db) schema table-name))))))))

(deftest ^:synchronized declared-indexes-applied-and-replayed-test
  (mt/test-drivers (index-util/index-test-drivers)
    (mt/dataset transforms-dataset/transforms-test
      (let [test-case (index-util/driver-cases driver/*driver*)]
        (is (some? test-case) (index-util/missing-case-message driver/*driver*))
        (when test-case
          (test-declared-indexes! test-case query-source))))))

(deftest ^:synchronized ^:mb/transforms-python-test declared-indexes-applied-on-python-transform-test
  (mt/test-drivers (index-util/python-index-test-drivers)
    (mt/with-premium-features #{:transforms-basic :transforms-python}
      (mt/dataset transforms-dataset/transforms-test
        (let [test-case (index-util/driver-cases driver/*driver*)]
          (is (some? test-case) (index-util/missing-case-message driver/*driver*))
          (when test-case
            (test-declared-indexes! test-case python-source)))))))

(deftest ^:synchronized managed-indexes-verified-against-warehouse-after-run-test
  (testing "real managed index rows are created by the run and then verified :succeeded against the warehouse"
    ;; Reuses the driver create-index cases, but instead of stubbing select-applicable-for-transform it persists real
    ;; :model/TableIndex rows. The run reads them (real hydrate), applies them, and verify-managed-indexes! confirms
    ;; each landed via fetch-table-indexes -- the whole create-then-verify loop on a live warehouse.
    (mt/test-drivers (index-util/index-test-drivers)
      (mt/dataset transforms-dataset/transforms-test
        (let [{:keys [indexes]} (index-util/driver-cases driver/*driver*)
              schema            (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
          (with-transform-cleanup! [{table-name :name :as target}
                                    {:type "table" :schema schema :name "idx_verify_products" :database (mt/id)}]
            (mt/with-temp [:model/Transform {tid :id :as transform} {:name   "index-verify-transform"
                                                                     :source (query-source)
                                                                     :target target}]
              (create-index-requests! tid indexes)
              (transforms.execute/execute! transform {:run-method :manual})
              (transforms.tu/wait-for-table table-name 10000)
              (testing "every managed row is verified succeeded"
                (is (= #{:succeeded} (t2/select-fn-set :status :model/TableIndex :transform_id tid))))
              ;; the index endpoints inherit the transform's permission checks, which fail when transforms are disabled
              (testing "GET /index lists them, flagged metabase_managed"
                (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
                  (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 (str "index?transform-id=" tid))]
                    (is (= (count indexes) (count (filter :metabase_managed data))))))))))))))

(deftest ^:synchronized declared-index-failure-fails-the-run-test
  (testing "a bad index declaration fails the whole run instead of being silently skipped"
    ;; The index points at a missing column, so creation fails (inline: the CTAS; standalone: the CREATE INDEX).
    ;; Either way it runs before the run is marked succeeded, so the throw surfaces and the run is recorded :failed.
    (mt/test-drivers (index-util/index-test-drivers)
      (mt/dataset transforms-dataset/transforms-test
        (let [test-case (index-util/driver-cases driver/*driver*)]
          (is (some? test-case) (index-util/missing-case-message driver/*driver*))
          (when test-case
            (let [bogus  (index-util/bogus-indexes (:indexes test-case))
                  schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
              (with-transform-cleanup! [target {:type     "table"
                                                :schema   schema
                                                :name     "idx_fail_products"
                                                :database (mt/id)}]
                (mt/with-temp [:model/Transform transform {:name   "index-fail-transform"
                                                           :source (query-source)
                                                           :target target}]
                  (create-index-requests! (:id transform) bogus)
                  (testing "execute! throws"
                    (is (thrown? Throwable
                                 (transforms.execute/execute! transform {:run-method :manual}))))
                  (testing "and the run is recorded as failed"
                    (is (= :failed
                           (t2/select-one-fn :status :model/TransformRun
                                             :transform_id (:id transform)
                                             {:order-by [[:id :desc]]})))))))))))))

(deftest ^:synchronized declared-index-creation-is-idempotent-test
  (testing "re-applying a target's indexes is a no-op (CREATE INDEX IF NOT EXISTS), not an error"
    ;; The standalone path normally meets a fresh table; this pins that re-running it against the live table (index
    ;; already there) doesn't throw. No-op for inline-only drivers (covered by the replay test above).
    (mt/test-drivers (index-util/index-test-drivers)
      (mt/dataset transforms-dataset/transforms-test
        (let [{:keys [indexes expected physical-indexes] :as test-case} (index-util/driver-cases driver/*driver*)]
          (is (some? test-case) (index-util/missing-case-message driver/*driver*))
          (when test-case
            (let [db     (mt/db)
                  schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
              (with-transform-cleanup! [{table-name :name :as target}
                                        {:type     "table"
                                         :schema   schema
                                         :name     "idx_idempotent_products"
                                         :database (mt/id)}]
                (mt/with-temp [:model/Transform transform {:name   "index-idempotent-transform"
                                                           :source (query-source)
                                                           :target target}]
                  (create-index-requests! (:id transform) indexes)
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table table-name 10000)
                  (is (= expected (physical-indexes db schema table-name)) "indexes present after the run")
                  (testing "re-applying the same indexes leaves the catalog unchanged and does not throw"
                    (transforms-base.u/apply-target-indexes!
                     (assoc-in transform [:target :indexes] indexes))
                    (is (= expected (physical-indexes db schema table-name)))))))))))))

(defn- fetch-schema
  "Schema the fetch-correctness suite creates its table in and passes to fetch-table-indexes. nil when the connection
  has a default schema to fall back on; bigquery has no schema concept and snowflake's test connection sets none, so
  both qualify the DDL with their session schema."
  [driver]
  (when (or (= driver :snowflake)
            (not (isa? driver/hierarchy driver :sql-jdbc)))
    (sql.tx/session-schema driver)))

(defn- qualify-fetch-table
  "`schema`.`table` in the driver's own identifier quoting. Snowflake needs the double quotes: unquoted identifiers
  upper-case, and the fetch-case columns are asserted lower-case."
  [driver schema table]
  (if (= driver :snowflake)
    (format "\"%s\".\"%s\"" schema table)
    (format "`%s`.%s" schema table)))

(defn- run-fetch-ddl!
  "Run raw fetch-case DDL through execute-raw-queries! (both sql-jdbc and bigquery implement it). Each statement is
  wrapped as `[sql]` because the seam expects `[sql & params]` vectors, not bare strings."
  [driver db stmts]
  (driver/execute-raw-queries! driver (driver/connection-spec driver db) (mapv vector stmts)))

(deftest ^:synchronized fetch-table-indexes-correctness-test
  (testing "fetch-table-indexes reports each driver's popular index kinds in the normalized cross-driver shape"
    ;; The e2e tests above prove indexes Metabase *applies* land on the table; this proves the driver method the
    ;; GET /indexes API consumes reads them back correctly, including catalog shapes the apply path can't produce
    ;; (e.g. a Postgres gin or partial index). Tables are created directly from raw DDL.
    (mt/test-drivers (index-util/index-test-drivers)
      (let [db     (mt/db)
            schema (fetch-schema driver/*driver*)
            cases  (index-util/fetch-cases driver/*driver*)]
        (is (driver/database-supports? driver/*driver* :index/fetch db)
            "a driver that implements fetch-table-indexes declares :index/fetch")
        (is (some? cases) (index-util/missing-case-message driver/*driver*))
        (doseq [{:keys [label table create expected definition-contains]} cases]
          (testing label
            ;; most sql-jdbc drivers create in the connection default (schema nil, bare name); the rest qualify.
            (let [qualified (if schema (qualify-fetch-table driver/*driver* schema table) table)
                  drop-sql  (str "DROP TABLE IF EXISTS " qualified)
                  creates   (cond->> create schema (mapv #(str/replace-first % table qualified)))]
              (run-fetch-ddl! driver/*driver* db [drop-sql])
              (try
                (run-fetch-ddl! driver/*driver* db creates)
                (let [indexes (driver/fetch-table-indexes driver/*driver* db schema table)]
                  (is (nil? (mr/explain :metabase.driver/fetch-table-indexes.result indexes))
                      "result conforms to ::fetch-table-indexes.result")
                  (is (= expected (into #{} (map #(dissoc % :definition)) indexes)))
                  ;; `:definition` is dropped from the equality check above (it's driver-verbatim), so a case that hinges
                  ;; on it (e.g. Redshift INTERLEAVED vs COMPOUND, identical except for this word) asserts it explicitly.
                  (when definition-contains
                    (is (some #(str/includes? (:definition %) definition-contains) indexes)
                        (str "an index definition contains " (pr-str definition-contains)))))
                (finally
                  (run-fetch-ddl! driver/*driver* db [drop-sql]))))))
        (testing "a table that does not exist returns [] rather than throwing"
          (is (= [] (driver/fetch-table-indexes driver/*driver* db schema "mb_fetch_does_not_exist"))))))))

(deftest ^:parallel fetch-table-indexes-unsupported-driver-test
  (testing "a driver that can't introspect indexes doesn't declare :index/fetch"
    (is (not (driver/database-supports? :h2 :index/fetch nil))))
  (testing "fetch-table-indexes has no safe default: its method throws for such a driver"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"fetch-table-indexes is not implemented for driver :h2"
                          (driver/fetch-table-indexes :h2 nil "public" "t")))))

;; The reconcile logic that decides each request's outcome from the warehouse read is unit-tested purely in
;; metabase.indexes.reconcile-test/classify-index-outcomes-test (no warehouse, no stubbing). Here we cover the
;; write-back on real rows, and the whole create-then-verify loop against a live warehouse
;; (managed-indexes-verified-against-warehouse-after-run-test above).
(deftest ^:synchronized apply-index-outcomes!-writes-each-bucket-test
  (testing "each classified outcome is written back: status, error message, last_executed_at, and row removal"
    (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                               :source             {:type "query"}
                                               :source_database_id (mt/id)
                                               :target             {:database (mt/id) :type "table"
                                                                    :schema "public" :name "t"}}
                   :model/TableIndex {succeeded-id :id} {:transform_id tid :index_name "succeeded_idx"
                                                         :status :running :error_message "stale"
                                                         :structured {:kind :btree :name "succeeded_idx"
                                                                      :columns [{:name "a"}]}}
                   :model/TableIndex {failed-id :id} {:transform_id tid :index_name "failed_idx"
                                                      :status :running
                                                      :structured {:kind :btree :name "failed_idx"
                                                                   :columns [{:name "b"}]}}
                   :model/TableIndex {kept-id :id} {:transform_id tid :index_name "kept_idx"
                                                    :status :delete-pending
                                                    :structured {:kind :btree :name "kept_idx"
                                                                 :columns [{:name "c"}]}}
                   :model/TableIndex {dropped-id :id} {:transform_id tid :index_name "dropped_idx"
                                                       :status :delete-pending
                                                       :structured {:kind :btree :name "dropped_idx"
                                                                    :columns [{:name "d"}]}}]
      (#'transforms-base.u/apply-index-outcomes! {:succeeded      [{:id succeeded-id}]
                                                  :failed         [{:id failed-id}]
                                                  :delete-pending [{:id kept-id}]
                                                  :delete-row     [{:id dropped-id}]})
      (testing "succeeded: status set, stale error cleared, execution stamped"
        (is (= :succeeded (t2/select-one-fn :status :model/TableIndex succeeded-id)))
        (is (nil? (t2/select-one-fn :error_message :model/TableIndex succeeded-id)))
        (is (some? (t2/select-one-fn :last_executed_at :model/TableIndex succeeded-id))))
      (testing "failed: status set with the not-found message"
        (is (= :failed (t2/select-one-fn :status :model/TableIndex failed-id)))
        (is (re-find #"not.*found" (t2/select-one-fn :error_message :model/TableIndex failed-id))))
      (testing "a still-present delete-pending row is kept and stamped"
        (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex kept-id)))
        (is (some? (t2/select-one-fn :last_executed_at :model/TableIndex kept-id))))
      (testing "a vanished delete-pending row is removed, freeing its (transform, name) for re-create"
        (is (not (t2/exists? :model/TableIndex :id dropped-id)))
        (is (some? (t2/insert-returning-pk! :model/TableIndex
                                            {:transform_id tid :index_name "dropped_idx"
                                             :structured {:kind :btree :name "dropped_idx"
                                                          :columns [{:name "e"}]}})))))))

(deftest ^:synchronized ddl-failure-marks-row-failed-test
  (mt/with-temp [:model/Transform {tid :id} {:name (mt/random-name)
                                             :source {:type "query"}
                                             :source_database_id (mt/id)
                                             :target {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {idx-id :id} {:transform_id tid :index_name "boom_idx"
                                                 :structured {:kind :btree :name "boom_idx" :columns [{:name "x"}]}}]
    (let [transform {:id tid :target {:database (mt/id) :schema "public" :name "t"
                                      :indexes [{:kind :btree :name "boom_idx" :columns [{:name "x"}]}]}}]
      (with-redefs [driver/supported-index-methods (fn [& _] {:btree {:lifecycle :standalone}})
                    driver/connection-spec        (fn [& _] {})
                    driver/compile-create-index   (fn [& _] "CREATE INDEX boom_idx ...")
                    driver/execute-raw-queries!   (fn [& _] (throw (ex-info "ddl boom" {})))]
        (is (thrown? Throwable
                     (#'transforms-base.u/apply-standalone-indexes!
                      {:engine :postgres :id (mt/id)} (assoc (:target transform) :transform-id tid))))
        (is (= :failed (t2/select-one-fn :status :model/TableIndex idx-id)))
        (is (re-find #"ddl boom" (t2/select-one-fn :error_message :model/TableIndex idx-id)))))))
