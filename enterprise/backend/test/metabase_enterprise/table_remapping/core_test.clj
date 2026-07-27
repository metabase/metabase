(ns metabase-enterprise.table-remapping.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.table-remapping.core :as table-remapping]
   [metabase-enterprise.table-remapping.middleware :as table-remapping.middleware]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ End-to-end -----------------------------------------------------

(deftest with-table-remapping-mbql-query-test
  (testing "an MBQL query against a remapped table reads from the remapping target"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                    (lib/aggregate (lib/count)))]
      (testing "sanity check: without remapping the query hits venues"
        (is (= [[100]]
               (mt/rows (qp/process-query query)))))
      (testing "with remapping the same query hits checkins"
        (table-remapping/with-table-remapping [{:from-schema "PUBLIC" :from-table "VENUES"
                                                :to-schema   "PUBLIC" :to-table   "CHECKINS"}]
          (is (= [[1000]]
                 (mt/rows (qp/process-query query)))))))))

(deftest with-table-remapping-native-query-test
  (testing "a native query referencing a table that doesn't exist runs against the remapping target"
    (let [mp    (mt/metadata-provider)
          query (lib/native-query mp "SELECT count(*) FROM FAKE_VENUES")]
      (table-remapping/with-table-remapping [{:from-table "FAKE_VENUES"
                                              :to-schema  "PUBLIC" :to-table "VENUES"}]
        (is (= [[100]]
               (mt/rows (qp/process-query query))))))))

;;; --------------------------------------- Phase 1: metadata provider swap -----------------------------------------

(deftest phase-1-metadata-swap-test
  (testing "Phase 1 overrides :schema/:name on matching table metadata in the QP store"
    (qp.store/with-metadata-provider (mt/id)
      (let [venues (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
            query  (-> (lib/query (qp.store/metadata-provider) venues)
                       (assoc :database (mt/id)))]
        (table-remapping/with-table-remapping [{:from-schema (:schema venues) :from-table (:name venues)
                                                :to-schema   "WS"             :to-table   "VENUES_COPY"}]
          (table-remapping.middleware/apply-table-remapping query)
          (let [table-after (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))]
            (is (= "WS" (:schema table-after)))
            (is (= "VENUES_COPY" (:name table-after)))))))))

(deftest phase-1-no-remapping-passthrough-test
  (testing "Phase 1 leaves the metadata provider alone when no remappings are bound"
    (qp.store/with-metadata-provider (mt/id)
      (let [venues (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))
            query  (-> (lib/query (qp.store/metadata-provider) venues)
                       (assoc :database (mt/id)))]
        (is (= query (table-remapping.middleware/apply-table-remapping query)))
        (is (= venues (lib.metadata/table (qp.store/metadata-provider) (mt/id :venues))))))))

;;; --------------------------------------- Phase 2: compiled SQL rewrite -------------------------------------------

(deftest phase-2-rewrites-compiled-sql-test
  (testing "Phase 2 rewrites table references in compiled SQL and preserves params"
    (binding [driver/*driver* :h2]
      (table-remapping/with-table-remapping [{:from-schema "PUBLIC" :from-table "VENUES"
                                              :to-schema   "WS"     :to-table   "VENUES_COPY"}]
        (let [captured (atom nil)
              mock-qp  (fn [query _rff] (reset! captured query) :ok)
              wrapped  (table-remapping.middleware/apply-table-sql-remapping mock-qp)]
          (wrapped {:database    1
                    :qp/compiled {:query  "SELECT * FROM PUBLIC.VENUES WHERE id = ?"
                                  :params [42]}}
                   identity)
          (is (re-find #"(?i)ws\W+venues_copy" (get-in @captured [:qp/compiled :query])))
          (is (= [42] (get-in @captured [:qp/compiled :params]))))))))

(deftest phase-2-no-remapping-passthrough-test
  (testing "Phase 2 passes the query through untouched when no remappings are bound"
    (binding [driver/*driver* :h2]
      (let [original-sql "SELECT * FROM PUBLIC.VENUES"
            captured     (atom nil)
            mock-qp      (fn [query _rff] (reset! captured query) :ok)
            wrapped      (table-remapping.middleware/apply-table-sql-remapping mock-qp)]
        (wrapped {:database 1, :qp/compiled {:query original-sql}} identity)
        (is (= original-sql (get-in @captured [:qp/compiled :query])))))))

(deftest phase-2-fails-closed-on-unparseable-sql-test
  (testing "Phase 2 throws instead of running the query un-remapped when the SQL cannot be parsed"
    (binding [driver/*driver* :h2]
      (table-remapping/with-table-remapping [{:from-schema "PUBLIC" :from-table "VENUES"
                                              :to-schema   "WS"     :to-table   "VENUES_COPY"}]
        (let [mock-qp (fn [_query _rff] :ok)
              wrapped (table-remapping.middleware/apply-table-sql-remapping mock-qp)]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Table remapping failed: cannot parse SQL"
               (wrapped {:database 1, :qp/compiled {:query "SELECT ((("}} identity))))))))
