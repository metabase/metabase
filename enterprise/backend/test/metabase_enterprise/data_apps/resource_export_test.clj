(ns metabase-enterprise.data-apps.resource-export-test
  "`POST /api/apps/export-resources`: what a data app's `resources/` files are written from."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- export! [user status body]
  (mt/with-premium-features #{:data-apps}
    (mt/user-http-request user :post status "apps/export-resources" body)))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-path [table]
  [(db-name) "PUBLIC" table])

(defn- field-path [table field]
  [(db-name) "PUBLIC" table field])

(defn- venues-column [field-name & {:as extra}]
  (merge {:type "column" :name field-name :tableId (mt/id :venues) :sourceName "VENUES"} extra))

(deftest exports-a-query-with-every-reference-portable-test
  (let [response (export! :crowberto 200
                          {:queries [{:export "PriceByCategory"
                                      :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                         :filters      [{:type "operator" :operator ">"
                                                                         :args [(venues-column "PRICE")
                                                                                {:type "literal" :value 1}]}]
                                                         :aggregations [{:type "operator" :operator "sum" :name "total"
                                                                         :args [(venues-column "PRICE")]}]
                                                         :breakouts    [{:type          "column"
                                                                         :name          "NAME"
                                                                         :sourceName    "CATEGORIES"
                                                                         :sourceFieldId (mt/id :venues :category_id)}]
                                                         :orderBys     [{:type "column" :name "total" :direction "desc"}]
                                                         :limit        5}]}}]})]
    (testing "the query Metabase builds from the definition, referencing tables and fields by name"
      (is (=? {:queries [{:export        "PriceByCategory"
                          :metrics       []
                          :dataset_query {:lib/type "mbql/query"
                                          :database (db-name)
                                          :stages   [{:source-table (table-path "VENUES")
                                                      :filters      [[">" {} ["field" {} (field-path "VENUES" "PRICE")] 1]]
                                                      :aggregation  [["sum" {:name "total"}
                                                                      ["field" {} (field-path "VENUES" "PRICE")]]]
                                                      :breakout     [["field" {:source-field (field-path "VENUES" "CATEGORY_ID")}
                                                                      (field-path "CATEGORIES" "NAME")]]
                                                      :order-by     [["desc" {} ["aggregation" {:lib/source-name "total"}
                                                                                 string?]]]
                                                      :limit        5}]}}]}
              response)))
    (testing "only the uuid the order by points at is kept, and it is the aggregation's"
      (let [stage (-> response :queries first :dataset_query :stages first)]
        (is (= (get-in stage [:aggregation 0 1 :lib/uuid])
               (get-in stage [:order-by 0 2 2])))
        (is (nil? (get-in stage [:filters 0 1 :lib/uuid])))))))

(deftest lists-the-metrics-a-query-aggregates-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [metric-eid (t2/select-one-fn :entity_id :model/Card :id metric-id)]
       (is (=? {:queries [{:export        "VenueCount"
                           :metrics       [metric-eid]
                           :dataset_query {:stages [{:aggregation [["metric" {} metric-eid]]}]}}]
                :metrics [{:id     metric-id
                           :entity {:entity_id     metric-eid
                                    :type          "metric"
                                    :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}}]}
               (export! :crowberto 200
                        {:queries [{:export "VenueCount"
                                    :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                       :aggregations [{:type "metric" :id metric-id}]}]}}]})))))))

(deftest answers-each-query-on-its-own-test
  (is (=? {:queries [{:export "Venues" :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}
                     {:export "Broken" :error "No column found"}]}
          (export! :crowberto 200
                   {:queries [{:export "Venues"
                               :query  {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}
                              {:export "Broken"
                               :query  {:stages [{:source {:type "table" :id (mt/id :venues)}
                                                  :fields [(venues-column "NOT_A_COLUMN")]}]}}]}))))

(deftest exports-actions-with-their-model-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [model-id implicit-id query-action-id]}]
     (let [model-eid (t2/select-one-fn :entity_id :model/Card :id model-id)
           response  (export! :crowberto 200 {:actions [implicit-id query-action-id]})]
       (testing "each action references its model by entity ID"
         (is (=? {:actions [{:id implicit-id
                             :entity {:entity_id (t2/select-one-fn :entity_id :model/Action :id implicit-id)
                                      :type      "implicit"
                                      :model_id  model-eid
                                      :implicit  [{:kind "row/create"}]}}
                            {:id query-action-id
                             :entity {:type     "query"
                                      :model_id model-eid
                                      :query    [{:database_id   (db-name)
                                                  :dataset_query {:database (db-name)}}]}}]}
                 response)))
       (testing "the model both actions belong to is exported once"
         (is (=? {:models [{:id model-id
                            :entity {:entity_id     model-eid
                                     :type          "model"
                                     :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}}]}
                 response))
         (is (= 1 (count (:models response)))))))))

(deftest refuses-what-a-copy-cannot-hold-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id model-id]}]
     (let [mp (mt/metadata-provider)]
       (mt/with-temp [:model/Card {reading-model-id :id} {:name          "Model reading a metric"
                                                          :type          :model
                                                          :database_id   (mt/id)
                                                          :dataset_query (lib/query mp (lib.metadata/card mp metric-id))}
                      :model/Card {reading-metric-id :id} {:name          "Metric reading a model"
                                                           :type          :metric
                                                           :database_id   (mt/id)
                                                           :dataset_query (-> (lib/query mp (lib.metadata/card mp model-id))
                                                                              (lib/aggregate (lib/count)))}]
         (let [http-id           (actions/insert! {:name "Ping" :type :http :model_id model-id
                                                   :template {:method "GET" :url "https://example.com"}})
               card-sql-id       (actions/insert! {:name          "Read a card"
                                                   :type          :query
                                                   :model_id      model-id
                                                   :database_id   (mt/id)
                                                   :dataset_query (lib/native-query
                                                                   mp (str "SELECT * FROM {{#" metric-id "}}"))})
               on-reading-model  (actions/insert! {:name "Create" :type :implicit :kind :row/create
                                                   :model_id reading-model-id})
               response          (export! :crowberto 200
                                          {:queries [{:export "ReadsMetric"
                                                      :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                         :aggregations [{:type "metric" :id reading-metric-id}]}]}}]
                                           :actions [http-id card-sql-id on-reading-model Integer/MAX_VALUE]})]
           (testing "an HTTP action"
             (is (=? {:id http-id :error #".*is an HTTP action.*"} (nth (:actions response) 0))))
           (testing "a query action whose SQL reads a card"
             (is (=? {:id card-sql-id :error (re-pattern (str ".*reads card " metric-id ".*"))}
                     (nth (:actions response) 1))))
           (testing "an action whose model reads a card, with the model's reason"
             (is (=? {:id on-reading-model :error #".*because its model can't: Model \d+ reads card.*"}
                     (nth (:actions response) 2)))
             (is (=? {:id reading-model-id :error (re-pattern (str ".*reads card " metric-id ".*"))}
                     (some #(when (= reading-model-id (:id %)) %) (:models response)))))
           (testing "an action that does not exist"
             (is (=? {:error #".*does not exist.*"} (nth (:actions response) 3))))
           (testing "a metric that reads a card; the query that aggregates it is still built"
             (is (=? {:queries [{:export "ReadsMetric" :dataset_query map?}]
                      :metrics [{:id reading-metric-id :error (re-pattern (str ".*reads card " model-id ".*"))}]}
                     response)))))))))

(deftest exports-only-what-the-caller-can-read-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [implicit-id model-id]}]
     (mt/with-temp [:model/Collection {collection-id :id} {:name "Private"}]
       (t2/update! :model/Card model-id {:collection_id collection-id})
       (mt/with-non-admin-groups-no-collection-perms collection-id
         (testing "an action on a model in a collection the caller can't read"
           (is (=? {:actions [{:id implicit-id :error #".*does not exist, or you can't read it.*"}]}
                   (export! :rasta 200 {:actions [implicit-id]})))))))))

(deftest rejects-unsupported-definitions-test
  (testing "the request accepts only what data app definitions support"
    (doseq [path [[:queries 0 :query :stages 0 :joins]
                  [:queries 0 :query :stages 0 :expressions]]]
      (testing (pr-str path)
        (export! :crowberto 400
                 (assoc-in {:queries [{:export "Venues"
                                       :query  {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}]}
                           path []))))))

(deftest a-reader-of-the-sources-exports-them-test
  (testing "the export needs what the typed schema needs: that the caller can read the sources, not that they are an admin"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id implicit-id model-id]}]
       (is (=? {:queries [{:export "VenueCount" :dataset_query map? :metrics [string?]}]
                :actions [{:id implicit-id :entity map?}]
                :models  [{:id model-id :entity map?}]
                :metrics [{:id metric-id :entity map?}]}
               (export! :rasta 200
                        {:queries [{:export "VenueCount"
                                    :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                       :aggregations [{:type "metric" :id metric-id}]}]}}]
                         :actions [implicit-id]})))))))

(deftest a-table-the-caller-cannot-read-reveals-nothing-test
  (testing "a definition on a table the caller can't read gets the same answer whether or not its columns exist"
    (mt/with-no-data-perms-for-all-users!
      (is (=? {:queries [{:export "Venues" :error #"Table \d+ does not exist, or you can't read it."}
                         {:export "NoSuchColumn" :error #"Table \d+ does not exist, or you can't read it."}]}
              (export! :rasta 200
                       {:queries [{:export "Venues"
                                   :query  {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}
                                  {:export "NoSuchColumn"
                                   :query  {:stages [{:source {:type "table" :id (mt/id :venues)}
                                                      :fields [(venues-column "NOT_A_COLUMN")]}]}}]}))))))

(deftest refuses-archived-sources-test
  (testing "the pull refuses an archived resource, so the export refuses an archived source"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [model-id implicit-id]}]
       (t2/update! :model/Action :id implicit-id {:archived true})
       (is (=? {:actions [{:id implicit-id :error #".*is archived.*"}]}
               (export! :crowberto 200 {:actions [implicit-id]})))
       (t2/update! :model/Action :id implicit-id {:archived false})
       (t2/update! :model/Card :id model-id {:archived true})
       (is (=? {:actions [{:id implicit-id :error #".*because its model can't: Model \d+ is archived.*"}]
                :models  [{:id model-id :error #".*is archived.*"}]}
               (export! :crowberto 200 {:actions [implicit-id]})))))))

(deftest refuses-an-action-whose-parameter-values-come-from-a-card-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [model-id metric-id]}]
     (let [mp        (mt/metadata-provider)
           action-id (actions/insert! {:name          "Pick"
                                       :type          :query
                                       :model_id      model-id
                                       :database_id   (mt/id)
                                       :dataset_query (lib/native-query mp "UPDATE venues SET name = {{name}}")
                                       :parameters    [{:id "name" :slug "name" :type :string/=
                                                        :values_source_type   :card
                                                        :values_source_config {:card_id metric-id}}]})]
       (is (=? {:actions [{:id action-id :error (re-pattern (str ".*reads card " metric-id ".*"))}]}
               (export! :crowberto 200 {:actions [action-id]})))))))

(deftest exports-a-segment-reference-by-entity-id-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Segment {segment-id :id, segment-eid :entity_id}
                   {:name       "Cheap"
                    :table_id   (mt/id :venues)
                    :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                    (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 3)))}]
      (is (=? {:queries [{:export        "Cheap"
                          :dataset_query {:stages [{:filters [["segment" {} segment-eid]]}]}}]}
              (export! :crowberto 200
                       {:queries [{:export "Cheap"
                                   :query  {:stages [{:source  {:type "table" :id (mt/id :venues)}
                                                      :filters [{:type "segment" :id segment-id}]}]}}]}))))))
