(ns ^:mb/driver-tests metabase.transforms.index-test
  "End-to-end: indexes declared on a transform target reach the physical table when the transform runs, across
  re-runs and failures, for both transform kinds (SQL builds the table with a CTAS, Python with `create-table!`).
  Per-driver cases and helpers live in [[metabase.transforms.index-test-util]]. Each test stubs
  [[metabase.transforms.execute/hydrate-transform-indexes]] to inject its case."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
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
              (testing "GET /indexes lists them, flagged metabase_managed"
                (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 (str "indexes?transform-id=" tid))]
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

(deftest ^:synchronized fetch-table-indexes-correctness-test
  (testing "fetch-table-indexes reports each driver's popular index kinds in the normalized cross-driver shape"
    ;; The e2e tests above prove indexes Metabase *applies* land on the table; this proves the driver method the
    ;; GET /indexes API consumes reads them back correctly, including catalog shapes the apply path can't produce
    ;; (e.g. a Postgres gin or partial index). Indexes are created directly; nil schema uses the connection default.
    (mt/test-drivers (index-util/index-test-drivers)
      (let [spec  (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            cases (index-util/fetch-cases driver/*driver*)]
        (is (driver/database-supports? driver/*driver* :index/fetch (mt/db))
            "a driver that implements fetch-table-indexes declares :index/fetch")
        (is (some? cases) (index-util/missing-case-message driver/*driver*))
        (doseq [{:keys [label table create expected definition-contains]} cases]
          (testing label
            (jdbc/execute! spec [(str "DROP TABLE IF EXISTS " table)])
            (try
              (doseq [stmt create]
                (jdbc/execute! spec [stmt]))
              (let [indexes (driver/fetch-table-indexes driver/*driver* (mt/db) nil table)]
                (is (nil? (mr/explain :metabase.driver/fetch-table-indexes.result indexes))
                    "result conforms to ::fetch-table-indexes.result")
                (is (= expected (into #{} (map #(dissoc % :definition)) indexes)))
                ;; `:definition` is dropped from the equality check above (it's driver-verbatim), so a case that hinges
                ;; on it (e.g. Redshift INTERLEAVED vs COMPOUND, identical except for this word) asserts it explicitly.
                (when definition-contains
                  (is (some #(str/includes? (:definition %) definition-contains) indexes)
                      (str "an index definition contains " (pr-str definition-contains)))))
              (finally
                (jdbc/execute! spec [(str "DROP TABLE IF EXISTS " table)])))))
        (testing "a table that does not exist returns [] rather than throwing"
          (is (= [] (driver/fetch-table-indexes driver/*driver* (mt/db) nil "mb_fetch_does_not_exist"))))))))

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
                   :model/TableIndex _ {:transform_id tid :index_name "b_idx"
                                        :structured {:kind :btree :name "b_idx" :columns [{:name "x"}]}}
                   :model/TableIndex _ {:transform_id tid :index_name "a_idx"
                                        :structured {:kind :btree :name "a_idx" :columns [{:name "y"}]}}
                   :model/TableIndex _ {:transform_id tid :index_name "deleted_idx"
                                        :status :deletion-pending
                                        :structured {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}]
      (is (= ["a_idx" "b_idx"]
             (map :name (transforms.execute/hydrate-transform-indexes {:id tid})))))))

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

(deftest ^:synchronized verify-managed-indexes!-removes-deletion-pending-row-when-absent-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {applicable-id :id} {:transform_id tid :index_name "active_idx"
                                                        :structured {:kind :btree :name "active_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :deletion-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [(warehouse-btree "active_idx" "x")])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :succeeded (t2/select-one-fn :status :model/TableIndex applicable-id)))
      (is (not (t2/exists? :model/TableIndex :id deleted-id)))
      (is (some? (t2/insert-returning-pk! :model/TableIndex
                                          {:transform_id tid
                                           :index_name   "deleted_idx"
                                           :structured   {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}))))))

(deftest ^:synchronized verify-managed-indexes!-keeps-deletion-pending-row-when-present-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :deletion-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [(warehouse-btree "deleted_idx" "y")])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :deletion-pending (t2/select-one-fn :status :model/TableIndex deleted-id)))
      (is (some? (t2/select-one-fn :last_executed_at :model/TableIndex deleted-id))))))

(deftest ^:synchronized verify-managed-indexes!-removes-deletion-pending-absent-rows-test
  (mt/with-temp [:model/Transform {tid :id} {:name               (mt/random-name)
                                             :source             {:type "query"}
                                             :source_database_id (mt/id)
                                             :target             {:database (mt/id) :type "table" :schema "public" :name "t"}}
                 :model/TableIndex {applicable-id :id} {:transform_id tid :index_name "active_idx"
                                                        :structured {:kind :btree :name "active_idx" :columns [{:name "x"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id tid :index_name "deleted_idx"
                                                     :status :deletion-pending
                                                     :structured {:kind :btree :name "deleted_idx" :columns [{:name "y"}]}}]
    (with-redefs [driver/fetch-table-indexes (fn [& _] [])]
      (transforms-base.u/verify-managed-indexes! (t2/select-one :model/Transform tid))
      (is (= :create-pending (t2/select-one-fn :status :model/TableIndex applicable-id)))
      (is (not (t2/exists? :model/TableIndex :id deleted-id)))
      (is (some? (t2/insert-returning-pk! :model/TableIndex
                                          {:transform_id tid
                                           :index_name   "deleted_idx"
                                           :structured   {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}))))))

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
