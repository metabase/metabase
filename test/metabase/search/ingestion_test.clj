(ns metabase.search.ingestion-test
  (:require
   [clojure.core.cache :as cache]
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest extract-model-and-id
  (is (= ["action" "1895"] (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.id]])))
  (is (= ["action" "2000"] (#'search.ingestion/extract-model-and-id ["action" [:= :this.id 2000]])))
  (is (nil? (#'search.ingestion/extract-model-and-id ["action" [:= 1895 :this.model_id]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= 1901 :this.id] [:= true true] [:= "Card" "Card"]]])))
  (is (= ["dataset" "1901"] (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["dataset" [:and [:= true true] [:= :this.model_id 1901] [:= "Card" "Card"]]])))
  (is (= nil (#'search.ingestion/extract-model-and-id ["indexed-entity" [:and [:= 26 :this.model_index_id] [:= 38004300 :this.model_pk]]]))))

(deftest searchable-text-test
  (testing "searchable-text with vector format (legacy)"
    (let [spec-fn (constantly {:search-terms [:name :description]})
          record  {:model       "test"
                   :name        "Test Name"
                   :description "Test Description"
                   :other-field "Other Value"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "Test Name Test Description"
               (#'search.ingestion/searchable-text record))))))
  (testing "searchable-text with map format and transforms"
    (let [spec-fn              (constantly {:search-terms {:name        search.spec/explode-camel-case
                                                           :description true}})
          record               {:model       "test"
                                :name        "CamelCaseTest"
                                :description "Simple description"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "CamelCaseTest Camel Case Test Simple description"
               (#'search.ingestion/searchable-text record))))))
  (testing "searchable-text filters out blank values"
    (let [spec-fn (constantly {:search-terms [:name :description :empty-field]})
          record  {:model       "test"
                   :name        "Test Name"
                   :description "  " ;; whitespace only
                   :empty-field nil}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "Test Name"
               (#'search.ingestion/searchable-text record)))))))

(deftest embeddable-text-test
  (testing "embeddable-text with vector format"
    (let [spec-fn (constantly {:search-terms [:name :description]})
          record  {:model       "card"
                   :name        "Sales Dashboard"
                   :description "Shows quarterly sales data"
                   :other-field "Other Value"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[card]\nname: Sales Dashboard\ndescription: Shows quarterly sales data"
               (#'search.ingestion/embeddable-text record))))))
  (testing "embeddable-text with map format"
    (let [spec-fn (constantly {:search-terms {:name        true
                                              :description true}})
          record  {:model       "dashboard"
                   :name        "Test Dashboard"
                   :description "A test dashboard"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[dashboard]\nname: Test Dashboard\ndescription: A test dashboard"
               (#'search.ingestion/embeddable-text record))))))
  (testing "embeddable-text filters out blank values"
    (let [spec-fn (constantly {:search-terms [:name :description :empty-field]})
          record  {:model       "card"
                   :name        "Test Card"
                   :description "  "
                   :empty-field nil}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[card]\nname: Test Card"
               (#'search.ingestion/embeddable-text record))))))
  (testing "embeddable-text does not apply transform functions"
    (let [spec-fn (constantly {:search-terms {:name search.spec/explode-camel-case}})
          record  {:model "table"
                   :name  "CamelCaseTest"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[table]\nname: CamelCaseTest"
               (#'search.ingestion/embeddable-text record))
            "Transformation functions should not be applied to embeddable text for semantic search"))))
  (testing "embeddable-text omits fields listed in :embedding-exclude"
    (let [spec-fn (constantly {:search-terms      {:name true :document str}
                               :embedding-exclude #{:document}})
          record  {:model    "document"
                   :name     "Q3 Planning"
                   :document "the full document body"}]
      (with-redefs [search.spec/spec spec-fn]
        (is (= "[document]\nname: Q3 Planning"
               (#'search.ingestion/embeddable-text record))
            "Excluded fields must not appear in the semantic-search embedding text")
        (is (= "Q3 Planning the full document body"
               (#'search.ingestion/searchable-text record))
            "Excluded fields remain in full-text searchable-text")))))

(deftest execute-all-function-attrs-test
  (testing "function-attr result is written under the snake_case attr-key"
    (let [spec {:attrs {:native-query {:fn (constantly "SELECT 1")}}}]
      (is (= {:native_query "SELECT 1"}
             (#'search.ingestion/execute-all-function-attrs spec {})))))
  (testing "function-attr receives only the record keys declared in :fields"
    (let [spec {:attrs {:native-query {:fn     #(vec (sort (keys %)))
                                       :fields [:dataset_query :query_type]}}}]
      (is (= {:native_query [:dataset_query :query_type]}
             (#'search.ingestion/execute-all-function-attrs
              spec
              {:dataset_query "{}" :query_type "native" :name "ignored"})))))
  (testing "a throwing function-attr leaves its column nil"
    (let [spec {:attrs {:native-query {:fn (fn [_] (throw (ex-info "boom" {})))}}}]
      (is (= {:native_query nil}
             (#'search.ingestion/execute-all-function-attrs spec {}))))))

(deftest execute-all-function-attrs-metric-reference-cycle-test
  (testing "a card whose metric references form a cycle yields a document without temporal keys, instead of throwing (#74954)"
    (letfn [(metric-query [metric-id]
              {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :orders)
                          :aggregation  [["metric" metric-id]]}})]
      ;; keep the cyclic cards out of the shared ingestion queue, where concurrently-running tests would index them
      (binding [search.ingestion/*disable-updates* true]
        (mt/with-temp
          [:model/Card
           {a-id :id}
           {:name "Metric A"
            :type :metric
            :dataset_query (let [mp (mt/metadata-provider)]
                             (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                 (lib/aggregate (lib/count))
                                 lib.convert/->legacy-MBQL))}
           :model/Card
           {b-id :id}
           {:name "Metric B"
            :type :metric
            :dataset_query (metric-query a-id)}]
          ;; close the cycle A -> B -> A; nothing rejects reference cycles at write time
          (t2/update! :model/Card a-id {:dataset_query (metric-query b-id)})
          (let [result (#'search.ingestion/execute-all-function-attrs
                        (search.spec/spec "card")
                        {:dataset_query (json/encode (metric-query a-id))
                         :query_type    "query"})]
            (is (map? result))
            (is (not (contains? result :has_temporal_dim)))
            (is (not (contains? result :non_temporal_dim_ids)))))))))

(deftest search-term-columns-test
  (testing "search-term-columns with vector format"
    (is (= #{:name :description}
           (set (#'search.ingestion/search-term-columns [:name :description])))))
  (testing "search-term-columns with map format"
    (is (= #{:name :description}
           (set (#'search.ingestion/search-term-columns {:name identity
                                                         :description nil}))))))

(deftest search-items-count-test
  (testing "search-items-count returns correct count with various searchable items"
    (mt/with-empty-h2-app-db!
      (with-redefs [search.spec/search-models #{"card" "dashboard"}]
        (mt/with-temp [:model/Collection coll {:name "Test Collection"}
                       :model/Card       _    {:name "Test Card 1"  :collection_id (:id coll)}
                       :model/Card       _    {:name "Test Card 2"  :collection_id (:id coll)}
                       :model/Dashboard  _    {:name "Test Dashboard 1" :collection_id (:id coll)}
                       :model/Dashboard  _    {:name "Test Dashboard 2" :collection_id (:id coll)}]
          (let [n (search.ingestion/search-items-count)]
            (is (= 4 n))))))))

(def ^:private fake-provider
  (reify lib.metadata.protocols/MetadataProvider
    (database [_this] nil)
    (metadatas [_this _metadata-spec] nil)
    (setting [_this _setting-name] nil)))

(defn- counting-factory
  "Returns a factory fn that counts calls in `counter-atom` and returns `fake-provider`."
  [counter-atom]
  (fn [_db-id]
    (swap! counter-atom inc)
    fake-provider))

(defn- simulate-metadata-lookups
  "Simulates what happens during indexing: the engine function calls
   `application-database-metadata-provider` several times for the same database-id,
   as it would when processing multiple cards from the same database."
  []
  ;; Three lookups for the same db — mimics processing multiple cards from one database.
  (metadata.jvm/application-database-metadata-provider 1)
  (metadata.jvm/application-database-metadata-provider 1)
  (metadata.jvm/application-database-metadata-provider 1)
  {"card" 3})

(deftest bulk-ingest!-caches-metadata-providers-test
  (testing "bulk-ingest! caches metadata providers so the factory is only called once per database-id"
    (let [factory-calls (atom 0)]
      (with-redefs [search.engine/active-engines                                (fn []
                                                                                  (simulate-metadata-lookups)
                                                                                  nil)
                    metadata.jvm/application-database-metadata-provider-factory (counting-factory factory-calls)]
        (search.ingestion/bulk-ingest! [])
        (is (= 1 @factory-calls)
            "Factory should be called once, not once per metadata-provider lookup")))))

(deftest bulk-ingest!-preserves-existing-cache-test
  (testing "bulk-ingest! reuses an outer cache and does not rebuild providers already in it"
    (let [factory-calls  (atom 0)
          existing-cache (atom (cache/basic-cache-factory {}))]
      (with-redefs [search.engine/active-engines (fn []
                                                   (simulate-metadata-lookups)
                                                   nil)
                    metadata.jvm/application-database-metadata-provider-factory (counting-factory factory-calls)]
        (binding [metadata.jvm/*metadata-provider-cache* existing-cache]
          (metadata.jvm/application-database-metadata-provider 1)
          (let [pre-calls @factory-calls]
            (search.ingestion/bulk-ingest! [])
            (is (= pre-calls @factory-calls)
                "Factory should not be called again — the provider was already cached")))))))

(deftest multiple-databases-cached-separately-test
  (testing "Within a single indexing operation, each database-id gets its own cached provider"
    (let [factory-calls (atom 0)]
      (with-redefs [search.engine/active-engines (constantly [:search.engine/appdb])
                    search.engine/init!          (fn [_engine _opts]
                                                   ;; Simulate cards from 3 different databases, 2 lookups each
                                                   (metadata.jvm/application-database-metadata-provider 1)
                                                   (metadata.jvm/application-database-metadata-provider 2)
                                                   (metadata.jvm/application-database-metadata-provider 3)
                                                   (metadata.jvm/application-database-metadata-provider 1)
                                                   (metadata.jvm/application-database-metadata-provider 2)
                                                   (metadata.jvm/application-database-metadata-provider 3)
                                                   {"card" 6})
                    metadata.jvm/application-database-metadata-provider-factory (counting-factory factory-calls)]
        (search/init-index!)
        (is (= 3 @factory-calls)
            "Factory should be called once per unique database-id, not once per lookup")))))

(deftest ^:synchronized curation-signals-surfaced-in-results-test
  ;; Search capture hands off only after commit, so this integration test needs real commits rather than
  ;; with-temp's usual rollback-only transaction. with-temp still deletes both rows afterward.
  (mt/test-helpers-set-global-values!
    (testing "curated (all models) and table data_layer ride through legacy_input to appdb search results,
              so Metabot can render them (BOT-1570) — not just stored in the filtering column"
      (search.tu/with-appdb-search-if-available-without-fallback
        (mt/with-temp [:model/Database {db-id :id} {}
                       :model/Table _ {:db_id          db-id
                                       :name           "Curatedgoldtbl"
                                       :active         true
                                       :data_authority :authoritative
                                       :data_layer     :final}]
          (let [result (->> (search.tu/search-results "Curatedgoldtbl")
                            (filter (comp #{"table"} :model))
                            first)]
            (is (=? {:model "table" :curated true :data_authority "authoritative" :data_layer "final"}
                    result))))))))
