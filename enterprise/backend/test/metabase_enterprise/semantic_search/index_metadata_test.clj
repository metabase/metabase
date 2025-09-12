(ns metabase-enterprise.semantic-search.index-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

(use-fixtures :once #'semantic.tu/once-fixture)

;; NOTE: isolation tests are absent, in prod there is only one index-metadata

(deftest qualify-index-test
  (let [sut semantic.index-metadata/qualify-index]
    (testing "default qualifier sanity"
      (is (= "%s" (:index-table-qualifier semantic.index-metadata/default-index-metadata))))
    (testing "qualify-index applies table qualifier to index map"
      (is (= {:table-name "foo_bar_baz"} (sut {:table-name "bar"} {:index-table-qualifier "foo_%s_baz"})))
      (is (= {:table-name "bar"} (sut {:table-name "bar"} {:index-table-qualifier "%s"})))
      (testing "qualifier applies to derived index names"
        (is (= "foo_bar_embed_hnsw_idx" (-> (sut {:table-name "bar"} {:index-table-qualifier "foo_%s"})
                                            semantic.index/hnsw-index-name)))))))

(deftest create-tables-if-not-exists!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        ;; could use open-tables here but I chose to be explicit
        sut            #(semantic.tu/closeable
                         (semantic.index-metadata/create-tables-if-not-exists! %1 %2)
                         (fn [_] (semantic.index-metadata/drop-tables-if-exists! %1 %2)))]
    (testing "creates metadata and control tables when they don't exist"
      (with-open [_ (sut pgvector index-metadata)]
        (is (semantic.tu/table-exists-in-db? (:metadata-table-name index-metadata)))
        (is (semantic.tu/table-exists-in-db? (:control-table-name index-metadata)))
        (is (semantic.tu/table-exists-in-db? (:gate-table-name index-metadata)))))
    (testing "is idempotent when tables already exist"
      (with-open [_ (sut pgvector index-metadata)]
        (let [table-names-snap (semantic.tu/get-table-names pgvector)
              _                (sut pgvector index-metadata)]
          (is (= table-names-snap (semantic.tu/get-table-names pgvector))))))))

(defn- open-tables! [pgvector index-metadata]
  (semantic.tu/closeable
   (semantic.index-metadata/create-tables-if-not-exists! pgvector index-metadata)
   (fn [_] (semantic.tu/cleanup-index-metadata! pgvector index-metadata))))

(deftest drop-tables-if-exists!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        sut            semantic.index-metadata/drop-tables-if-exists!]
    (with-open [_ (open-tables! pgvector index-metadata)]
      (let [table-names-snap (semantic.tu/get-table-names pgvector)
            _                (sut pgvector index-metadata)
            now-expected     (remove (hash-set (:control-table-name index-metadata)
                                               (:metadata-table-name index-metadata)
                                               (:gate-table-name index-metadata))
                                     table-names-snap)]
        (is (= now-expected (semantic.tu/get-table-names pgvector)))))))

(deftest ensure-control-row-exists!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        sut            semantic.index-metadata/ensure-control-row-exists!]
    (with-open [_ (open-tables! pgvector index-metadata)]
      (testing "creates singleton control row with id=0"
        (is (= [] (semantic.tu/get-control-rows pgvector index-metadata)) "should be empty at start")
        (sut pgvector index-metadata)
        (is (= [{:id 0, :version (:version index-metadata), :active_id nil, :active_updated_at nil}]
               (semantic.tu/get-control-rows pgvector index-metadata))))
      (testing "is idempotent - doesn't create duplicate rows"
        (let [control-snap (semantic.tu/get-control-rows pgvector index-metadata)]
          (sut pgvector index-metadata)
          (is (= control-snap (semantic.tu/get-control-rows pgvector index-metadata))))))))

(deftest activate-index!-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        un-index       (semantic.index/default-index semantic.tu/mock-embedding-model)
        index1         (semantic.index-metadata/qualify-index (assoc un-index :table-name "i1") index-metadata)
        index2         (semantic.index-metadata/qualify-index (assoc un-index :table-name "i2") index-metadata)
        sut            semantic.index-metadata/activate-index!]
    (with-open [_ (open-tables! pgvector index-metadata)]
      (let [index-id1 (semantic.index-metadata/record-new-index-table! pgvector index-metadata index1)
            index-id2 (semantic.index-metadata/record-new-index-table! pgvector index-metadata index2)]
        (testing "does nothing if no control row"
          ;; note: I might recommend this to throw if no control row, this behaviour is ok for now
          (sut pgvector index-metadata index-id1)
          (is (= [] (semantic.tu/get-control-rows pgvector index-metadata))))

        (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)

        (testing "sets specified index as active"
          (sut pgvector index-metadata index-id1)
          (is (=? [{:active_id index-id1}] (semantic.tu/get-control-rows pgvector index-metadata)))
          (testing "switch again"
            (sut pgvector index-metadata index-id2)
            (is (=? [{:active_id index-id2}] (semantic.tu/get-control-rows pgvector index-metadata)))))))))

(deftest get-active-index-state-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        un-index       (semantic.index/default-index semantic.tu/mock-embedding-model)
        index          (semantic.index-metadata/qualify-index un-index index-metadata)
        sut            semantic.index-metadata/get-active-index-state]
    (with-open [_ (open-tables! pgvector index-metadata)]
      (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
      (testing "by default there is no active index"
        (is (nil? (sut pgvector index-metadata))))
      (testing "returns active index configuration when one is set"
        (let [index-id (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)]
          (semantic.index-metadata/activate-index! pgvector index-metadata index-id)
          (is (=? [{:active_id index-id}] (semantic.tu/get-control-rows pgvector index-metadata)))
          (is (=? {:index        index
                   :metadata-row (first (semantic.tu/get-metadata-rows pgvector index-metadata))}
                  (sut pgvector index-metadata))))))))

(defn- default-index [embedding-model index-metadata]
  (mt/with-dynamic-fn-redefs [semantic.index/model-table-suffix semantic.tu/mock-table-suffix]
    (-> (semantic.index/default-index embedding-model)
        (semantic.index-metadata/qualify-index index-metadata))))

(defn- add-index! [pgvector index-metadata embedding-model]
  (let [index (default-index embedding-model index-metadata)]
    (semantic.index/create-index-table-if-not-exists! pgvector index)
    {:index    index
     :index-id (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)}))

(defn- setup-scenario! [pgvector index-metadata {:keys [active inactive]}]
  (semantic.index-metadata/ensure-control-row-exists! pgvector index-metadata)
  (when active
    (let [{:keys [index-id]} (add-index! pgvector index-metadata active)]
      (semantic.index-metadata/activate-index! pgvector index-metadata index-id)))
  (run! #(add-index! pgvector index-metadata %) inactive))

(deftest find-compatible-index!-test
  (let [pgvector         (semantic.env/get-pgvector-datasource!)
        embedding-model1 semantic.tu/mock-embedding-model
        embedding-model2 (assoc semantic.tu/mock-embedding-model
                                :model-name "mock2")
        sut              semantic.index-metadata/find-compatible-index!
        ;; warning: the setup-scenario can currently only set up a happy path
        ;; other variables include:
        ;; - table not existing
        ;; - metadata not existing
        ;; - duplicate indexes with different table names
        ;; in practice early on these are not likely to be major concerns, so letting them slide for now
        scenarios        [{:desc "no metadata"}
                          {:desc   "single active model, happy path"
                           :active embedding-model1}
                          {:desc   "single active model, happy path, model 2"
                           :active embedding-model2}
                          {:desc     "active + inactive models"
                           :active   embedding-model2
                           :inactive [embedding-model1]}
                          {:desc     "multiple inactive models"
                           :inactive [embedding-model1
                                      embedding-model2]}]
        all-models       [embedding-model1 embedding-model2]]
    (doseq [{:keys [desc active inactive] :as scenario} scenarios
            :let [index-metadata (semantic.tu/unique-index-metadata)
                  index'         #(default-index % index-metadata)
                  sut'           #(sut pgvector index-metadata %)]]
      (testing (str "scenario: " desc)
        (with-open [_ (open-tables! pgvector index-metadata)]
          (setup-scenario! pgvector index-metadata scenario)
          (let [metadata-rows   (semantic.tu/get-metadata-rows pgvector index-metadata)
                model-name->row (u/index-by :model_name metadata-rows)
                model-row       (comp model-name->row :model-name)]
            (doseq [model all-models
                    :let [is-active   (= model active)
                          is-inactive (some #{model} inactive)]]
              (cond
                is-active
                (testing "is already active"
                  (is (=? {:index              (index' model)
                           :index-table-exists true
                           :metadata-row       (model-row model)
                           :active             true}
                          (sut' model))))
                is-inactive
                (testing "is inactive"
                  (is (=? {:index              (index' model)
                           :index-table-exists true
                           :metadata-row       (model-row model)
                           :active             false}
                          (sut' model))))
                :else
                (testing "no metadata"
                  (is (nil? (sut' model))))))))))))

(deftest create-new-index-spec-test
  (let [pgvector         (semantic.env/get-pgvector-datasource!)
        index-metadata   (semantic.tu/unique-index-metadata)
        embedding-model  semantic.tu/mock-embedding-model
        sut              semantic.index-metadata/create-new-index-spec]
    (testing "creates new index spec for embedding model"
      (let [result (sut pgvector index-metadata embedding-model)]
        (is (=? {:index              {:embedding-model embedding-model}
                 :index-table-exists false
                 :active             false}
                result))))))

(deftest record-new-index-table!-test
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.tu/unique-index-metadata)
        embedding-model semantic.tu/mock-embedding-model
        index           (default-index embedding-model index-metadata)
        sut             semantic.index-metadata/record-new-index-table!]
    (with-open [_ (open-tables! pgvector index-metadata)]
      (testing "empty to start"
        (is (= [] (semantic.tu/get-metadata-rows pgvector index-metadata))))
      (testing "records index metadata and returns assigned ID"
        (let [index-id (sut pgvector index-metadata index)]
          (is (int? index-id))
          (is (=? [{:id                index-id
                    :provider          (:provider embedding-model)
                    :model_name        (:model-name embedding-model)
                    :vector_dimensions (:vector-dimensions embedding-model)
                    :table_name        (:table-name index)
                    :index_version     (:version index)}]
                  (semantic.tu/get-metadata-rows pgvector index-metadata)))))

      (testing "enforces unique table-name constraint"
        (is (thrown-with-msg? Exception #"duplicate key" (sut pgvector index-metadata index)))))))
