(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end: indexes declared on a transform target reach the physical table when the transform runs, across
  re-runs and failures, for both transform kinds (SQL builds the table with a CTAS, Python with `create-table!`).
  Per-driver cases and helpers live in [[metabase.transforms.index-test-util]]. Each test stubs
  [[metabase.transforms.execute/hydrate-transform-indexes]] to inject its case."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.indexes.reconcile :as reconcile]
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

(defn- test-declared-indexes!
  "Run a transform (source from the 0-arg `make-source`) with the driver's `:indexes` hydrated onto its target, then
  assert `:physical-indexes` reads `:expected` from the catalog. Runs twice to check they survive a rebuild."
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
        (with-redefs [transforms.execute/hydrate-transform-indexes (constantly indexes)]
          (testing "a full run applies the declared indexes to the physical table"
            (transforms.execute/execute! transform {:run-method :manual})
            (transforms.tu/wait-for-table table-name 10000)
            (is (= expected (physical-indexes (mt/db) schema table-name))))
          (testing "a re-run rebuilds the table and the indexes come back the same"
            (transforms.execute/execute! transform {:run-method :manual})
            (is (= expected (physical-indexes (mt/db) schema table-name)))))))))

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
    ;; Reuses the driver create-index cases, but instead of stubbing hydrate-transform-indexes it persists real
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
              (doseq [idx indexes]
                (t2/insert! :model/TableIndex {:transform_id tid
                                               :index_name   (or (:name idx) (name (:kind idx)))
                                               :structured   idx}))
              (transforms.execute/execute! transform {:run-method :manual})
              (transforms.tu/wait-for-table table-name 10000)
              (testing "every managed row is verified succeeded"
                (is (= #{:succeeded} (t2/select-fn-set :status :model/TableIndex :transform_id tid))))
              (testing "GET /index lists them, flagged metabase_managed"
                (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 (str "index?transform-id=" tid))]
                  (is (= (count indexes) (count (filter :metabase_managed data)))))))))))))

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
                  (with-redefs [transforms.execute/hydrate-transform-indexes (constantly bogus)]
                    (testing "execute! throws"
                      (is (thrown? Throwable
                                   (transforms.execute/execute! transform {:run-method :manual}))))
                    (testing "and the run is recorded as failed"
                      (is (= :failed
                             (t2/select-one-fn :status :model/TransformRun
                                               :transform_id (:id transform)
                                               {:order-by [[:id :desc]]}))))))))))))))

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
                  (with-redefs [transforms.execute/hydrate-transform-indexes (constantly indexes)]
                    (transforms.execute/execute! transform {:run-method :manual})
                    (transforms.tu/wait-for-table table-name 10000)
                    (is (= expected (physical-indexes db schema table-name)) "indexes present after the run")
                    (testing "re-applying the same indexes leaves the catalog unchanged and does not throw"
                      (transforms-base.u/apply-target-indexes!
                       (assoc-in transform [:target :indexes] indexes))
                      (is (= expected (physical-indexes db schema table-name))))))))))))))

(defn- fetch-schema
  "Schema the fetch-correctness suite creates its table in and passes to fetch-table-indexes. nil for sql-jdbc drivers
  (the connection default); bigquery has none, so it uses its session dataset and qualifies the DDL with it."
  [driver]
  (when-not (isa? driver/hierarchy driver :sql-jdbc)
    (sql.tx/session-schema driver)))

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
            ;; sql-jdbc drivers create in the connection default (schema nil, bare name); bigquery needs the dataset.
            (let [qualified (if schema (format "`%s`.%s" schema table) table)
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

(deftest ^:parallel hydrate-transform-indexes-test
  (testing "returns the structured defs of a transform's managed indexes, ordered by name"
    (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                               :source             {:type "query"}
                                               :source_database_id (mt/id)
                                               :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                   :model/TableIndex {b-id :id} {:transform_id tid :index_name "b_idx"
                                                 :structured {:kind :btree :name "b_idx" :columns [{:name "x"}]}}
                   :model/TableIndex {a-id :id} {:transform_id tid :index_name "a_idx"
                                                 :structured {:kind :btree :name "a_idx" :columns [{:name "y"}]}}
                   :model/TableIndex _ {:transform_id tid :index_name "deleted_idx"
                                        :status :delete-pending
                                        :structured {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}]
      (is (= ["a_idx" "b_idx"]
             (map :name (transforms.execute/hydrate-transform-indexes {:id tid}))))
      (is (= [a-id b-id]
             (transforms.execute/hydrate-transform-index-ids {:id tid}))))))

(deftest ^:synchronized verify-managed-indexes!-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {present-id :id} {:transform_id tid :index_name "present_idx"
                                                     :structured {:kind :btree :name "present_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {missing-id :id} {:transform_id tid :index_name "missing_idx"
                                                     :structured {:kind :btree :name "missing_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes
                  (fn [& _] [{:name "present_idx" :kind :btree :access-method "btree" :is-unique false
                              :is-primary false :is-valid true :key-columns ["x"] :include-columns []
                              :partial-predicate nil :definition "..."}])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :succeeded (t2/select-one-fn :status :model/TableIndex present-id)))
      (is (= :failed (t2/select-one-fn :status :model/TableIndex missing-id)))
      (is (some? (t2/select-one-fn :last_executed_at :model/TableIndex present-id))))))

(defn- warehouse-btree
  [name column]
  {:name name :kind :btree :access-method "btree" :is-unique false
   :is-primary false :is-valid true :key-columns [column] :include-columns []
   :partial-predicate nil :definition "..."})

(deftest ^:synchronized verify-managed-indexes!-removes-delete-pending-row-when-absent-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {applicable-id :id} {:transform_id tid :index_name "active_idx"
                                                        :structured {:kind :btree :name "active_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :delete-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [(warehouse-btree "active_idx" "x")])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :succeeded (t2/select-one-fn :status :model/TableIndex applicable-id)))
      (is (not (t2/exists? :model/TableIndex :id deleted-id)))
      (is (some? (t2/insert-returning-pk! :model/TableIndex
                                          {:transform_id tid
                                           :index_name   "deleted_idx"
                                           :structured   {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}))))))

(deftest ^:synchronized verify-managed-indexes!-only-verifies-hydrated-indexes-test
  (mt/with-temp [:model/Transform {tid :id :as transform} {:name               (mt/random-name)
                                                           :source             {:type "query"}
                                                           :source_database_id (mt/id)
                                                           :target             {:database (mt/id)
                                                                                :type     "table"
                                                                                :schema   "public"
                                                                                :name     "t"}}
                 :model/TableIndex {hydrated-id :id} {:transform_id tid :index_name "hydrated_idx"
                                                      :status :running
                                                      :structured {:kind :btree :name "hydrated_idx"
                                                                   :columns [{:name "x"}]}}
                 :model/TableIndex {concurrent-id :id} {:transform_id tid :index_name "concurrent_idx"
                                                        :structured {:kind :btree :name "concurrent_idx"
                                                                     :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [(warehouse-btree "hydrated_idx" "x")])]
      (transforms-base.u/verify-managed-indexes!
       (-> transform
           (assoc-in [:target :indexes] [{:kind :btree :name "hydrated_idx" :columns [{:name "x"}]}])
           (assoc-in [:target :index-request-ids] [hydrated-id])))
      (is (= :succeeded (t2/select-one-fn :status :model/TableIndex hydrated-id)))
      (is (= :create-pending (t2/select-one-fn :status :model/TableIndex concurrent-id))))))

(deftest ^:synchronized verify-managed-indexes!-keeps-delete-pending-row-when-present-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :delete-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [(warehouse-btree "deleted_idx" "y")])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id)))
      (is (some? (t2/select-one-fn :last_executed_at :model/TableIndex deleted-id))))))

(deftest ^:synchronized verify-managed-indexes!-reconciles-successful-empty-index-list-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {applicable-id :id} {:transform_id tid :index_name "active_idx"
                                                        :structured {:kind :btree :name "active_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :delete-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :failed (t2/select-one-fn :status :model/TableIndex applicable-id)))
      (is (not (t2/exists? :model/TableIndex :id deleted-id)))
      (is (some? (t2/insert-returning-pk! :model/TableIndex
                                          {:transform_id tid
                                           :index_name   "deleted_idx"
                                           :structured   {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}))))))

(deftest ^:synchronized verify-managed-indexes!-leaves-rows-unchanged-when-index-fetch-fails-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {applicable-id :id} {:transform_id tid :index_name "active_idx"
                                                        :structured {:kind :btree :name "active_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :delete-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] (throw (ex-info "boom" {})))]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :create-pending (t2/select-one-fn :status :model/TableIndex applicable-id)))
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id))))))

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

(deftest apply-pending-standalone-index-creates!-test
  (testing "on an append run, applies standalone create-pending requests in place and marks them succeeded;
            inline create-pending requests are left for the next rebuild"
    (mt/with-temp [:model/Transform {tid :id} {:name (mt/random-name)
                                               :source {:type "query" :query {:database (mt/id)}}
                                               :target {:database (mt/id) :type "table-incremental"
                                                        :schema "public" :name (mt/random-name)}}
                   :model/TableIndex {standalone-id :id} {:transform_id tid :index_name "standalone_idx"
                                                          :structured {:kind :btree :name "standalone_idx"
                                                                       :columns [{:name "x"}]}}
                   :model/TableIndex {inline-id :id} {:transform_id tid :index_name "inline_idx"
                                                      :structured {:kind :sortkey :style :compound
                                                                   :columns [{:name "y"}]}}]
      (let [compiled (atom [])]
        (with-redefs [driver/supported-index-methods (fn [& _] {:btree   {:lifecycle :standalone}
                                                                :sortkey {:lifecycle :inline}})
                      driver/connection-spec        (fn [& _] {})
                      driver/compile-create-index   (fn [_ _ _ idx] (swap! compiled conj idx) ["CREATE INDEX ..."])
                      driver/execute-raw-queries!   (fn [& _] nil)]
          (transforms-base.u/apply-pending-standalone-index-creates!
           {:id tid :source {:type "query" :query {:database (mt/id)}}
            :target {:database (mt/id) :schema "public" :name "t"}})
          (is (= [:btree] (map :kind @compiled)) "only the standalone request's DDL was compiled and executed")
          (is (= :succeeded (t2/select-one-fn :status :model/TableIndex standalone-id)))
          (is (= :create-pending (t2/select-one-fn :status :model/TableIndex inline-id)))))))
  (testing "a no-op on a full-create run -- those indexes are applied by apply-target-indexes! instead"
    (mt/with-temp [:model/Transform {tid :id} {:name (mt/random-name)
                                               :source {:type "query" :query {:database (mt/id)}}
                                               :target {:database (mt/id) :type "table"
                                                        :schema "public" :name (mt/random-name)}}
                   :model/TableIndex {standalone-id :id} {:transform_id tid :index_name "standalone_idx"
                                                          :structured {:kind :btree :name "standalone_idx"
                                                                       :columns [{:name "x"}]}}]
      (with-redefs [driver/execute-raw-queries! (fn [& _] (throw (ex-info "should not be called" {})))]
        (transforms-base.u/apply-pending-standalone-index-creates!
         {:id tid :target {:type "table" :database (mt/id) :schema "public" :name "t"}})
        (is (= :create-pending (t2/select-one-fn :status :model/TableIndex standalone-id)))))))

(deftest mark-inline-index-requests-failed!-test
  (testing "on a full-create run, marks only unsettled inline-kind requests failed with the message"
    (mt/with-temp [:model/Transform {tid :id} {:name (mt/random-name)
                                               :source {:type "query" :query {:database (mt/id)}}
                                               :target {:database (mt/id) :type "table"
                                                        :schema "public" :name (mt/random-name)}}
                   :model/TableIndex {inline-id :id} {:transform_id tid :index_name "inline_idx"
                                                      :structured {:kind :sortkey :style :compound
                                                                   :columns [{:name "x"}]}}
                   :model/TableIndex {standalone-id :id} {:transform_id tid :index_name "standalone_idx"
                                                          :structured {:kind :btree :name "standalone_idx"
                                                                       :columns [{:name "y"}]}}
                   :model/TableIndex {settled-id :id} {:transform_id tid :index_name "settled_idx"
                                                       :status :succeeded
                                                       :structured {:kind :sortkey :style :compound
                                                                    :columns [{:name "z"}]}}]
      (with-redefs [driver/supported-index-methods (fn [& _] {:sortkey {:lifecycle :inline}
                                                              :btree   {:lifecycle :standalone}})]
        (transforms-base.u/mark-inline-index-requests-failed!
         {:id tid :source {:type "query" :query {:database (mt/id)}} :target {:type "table"}}
         [inline-id standalone-id settled-id]
         "ctas boom")
        (is (= :failed (t2/select-one-fn :status :model/TableIndex inline-id)))
        (is (= "ctas boom" (t2/select-one-fn :error_message :model/TableIndex inline-id)))
        (is (= :create-pending (t2/select-one-fn :status :model/TableIndex standalone-id))
            "a standalone request is not attributed a CTAS failure -- it applies in a later, separate DDL step")
        (is (= :succeeded (t2/select-one-fn :status :model/TableIndex settled-id))
            "an already-settled request is left alone"))))
  (testing "a no-op when not a full-create run (an append)"
    (mt/with-temp [:model/Transform {tid :id} {:name (mt/random-name)
                                               :source {:type "query" :query {:database (mt/id)}}
                                               :target {:database (mt/id) :type "table-incremental"
                                                        :schema "public" :name (mt/random-name)}}
                   :model/TableIndex {inline-id :id} {:transform_id tid :index_name "inline_idx"
                                                      :structured {:kind :sortkey :style :compound
                                                                   :columns [{:name "x"}]}}]
      ;; No `:id` on the transform passed in: an append run's own `full-incremental-run?` check never
      ;; looks up pending rows, matching the caller in `run-cancelable-transform!`, which passes the same
      ;; in-memory transform it started the run with.
      (transforms-base.u/mark-inline-index-requests-failed!
       {:target {:type "table-incremental"} :last_checkpoint_value "100"}
       [inline-id]
       "should not apply")
      (is (= :create-pending (t2/select-one-fn :status :model/TableIndex inline-id))))))

(deftest ^:synchronized verify-managed-indexes!-returns-false-when-warehouse-unreadable-test
  (testing "returns false, and leaves a :running row running, when the warehouse can't be read"
    (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                               :source             {:type "query"}
                                               :source_database_id (mt/id)
                                               :target             {:database (mt/id) :type "table"
                                                                    :schema "public" :name "t"}}
                   :model/TableIndex {running-id :id} {:transform_id tid :index_name "running_idx"
                                                       :status :running
                                                       :structured {:kind :btree :name "running_idx"
                                                                    :columns [{:name "x"}]}}]
      (with-redefs [reconcile/fetch-warehouse-indexes (fn [& _] nil)]
        (is (false? (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))))
        (is (= :running (t2/select-one-fn :status :model/TableIndex running-id)))))))

(deftest ^:synchronized verify-managed-indexes!-returns-true-test
  (testing "returns true when the warehouse could be read, including when there's nothing to verify"
    (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                               :source             {:type "query"}
                                               :source_database_id (mt/id)
                                               :target             {:database (mt/id) :type "table"
                                                                    :schema "public" :name "t"}}]
      (is (true? (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid)))
          "nothing to verify")
      (mt/with-temp [:model/TableIndex {present-id :id} {:transform_id tid :index_name "present_idx"
                                                         :structured {:kind :btree :name "present_idx"
                                                                      :columns [{:name "x"}]}}]
        (with-redefs [driver/fetch-table-indexes
                      (fn [& _] [(warehouse-btree "present_idx" "x")])]
          (is (true? (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))))
          (is (= :succeeded (t2/select-one-fn :status :model/TableIndex present-id))))))))
