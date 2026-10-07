(ns metabase-enterprise.data-apps.resource-export-test
  "`POST /api/apps/export-resources`: what the files of a data app's collection are written from."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.data-apps.resource-export :as resource-export]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private app-collection "appCollectionEntity01")

(defn- with-ids
  "`queries` with an entity ID each, as a definition carries one, unless a query brings its own."
  [queries]
  (mapv #(merge {:entity_id (u/generate-nano-id)} %) queries))

(defn- export!
  "Export `body` as `user`, in the app collection `app-collection` unless `body` names one, each query with an entity
  ID unless it brings one."
  ([user status body]
   (export! user status body #{:data-apps}))
  ([user status body features]
   (mt/with-premium-features features
     (mt/user-http-request user :post status "apps/export-resources"
                           (cond-> (merge {:collection app-collection} body)
                             (:queries body) (update :queries with-ids))))))

(deftest export-needs-each-querys-entity-id-test
  (testing "the saved question is written with the definition's entity ID, so every query names one"
    (mt/with-premium-features #{:data-apps}
      (is (=? {:errors {:queries some?}}
              (mt/user-http-request :crowberto :post 400 "apps/export-resources"
                                    {:collection app-collection
                                     :queries    [{:export "Venues" :query {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}]
                                     :actions    []}))))))

(deftest export-needs-the-apps-collection-test
  (testing "the saved question is written into the app's collection, so the request names it"
    (mt/with-premium-features #{:data-apps}
      (is (=? {:errors {:collection some?}}
              (mt/user-http-request :crowberto :post 400 "apps/export-resources" {:queries [] :actions []}))))))

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
                                                         :orderBys     [{:type      "column"
                                                                         :name      "total"
                                                                         :direction "desc"}]
                                                         :limit        5}]}}]})]
    (testing "the query Metabase builds from the definition, referencing tables and fields by name"
      (let [price       (field-path "VENUES" "PRICE")
            category-id (field-path "VENUES" "CATEGORY_ID")
            category    (field-path "CATEGORIES" "NAME")]
        (is (=? {:queries [{:export        "PriceByCategory"
                            :metrics       []
                            :entity        {:dataset_query {:lib/type "mbql/query"
                                                            :database (db-name)
                                                            :stages   [{:source-table (table-path "VENUES")
                                                                        :filters      [[">" {} ["field" {} price] 1]]
                                                                        :aggregation  [["sum" {:name "total"} ["field" {} price]]]
                                                                        :breakout     [["field" {:source-field category-id} category]]
                                                                        :order-by     [["desc" {} ["aggregation"
                                                                                                   {:lib/source-name "total"}
                                                                                                   string?]]]
                                                                        :limit        5}]}}}]}
                response))))
    (testing "only the uuid the order by points at is kept, and it is the aggregation's"
      (let [stage (-> response :queries first :entity :dataset_query :stages first)]
        (is (= (get-in stage [:aggregation 0 1 :lib/uuid])
               (get-in stage [:order-by 0 2 2])))
        (is (nil? (get-in stage [:filters 0 1 :lib/uuid])))))))

(deftest only-a-superuser-exports-test
  (testing "an app's resources are written into its repository, which only an admin works with"
    (let [body {:queries [{:export "Venues" :query {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}]}]
      (is (= "You don't have permissions to do that." (export! :rasta 403 body)))
      (is (=? {:queries [{:export "Venues" :entity map?}]} (export! :crowberto 200 body))))))

(deftest lists-the-metrics-a-query-aggregates-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [metric-eid (t2/select-one-fn :entity_id :model/Card :id metric-id)]
       (is (=? {:queries [{:export        "VenueCount"
                           :metrics       [metric-eid]
                           :entity        {:dataset_query {:stages [{:aggregation [["metric" {} metric-eid]]}]}}}]
                :metrics [{:id     metric-id
                           :entity {:entity_id     metric-eid
                                    :type          "metric"
                                    :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}}]}
               (export! :crowberto 200
                        {:queries [{:export "VenueCount"
                                    :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                       :aggregations [{:type "metric" :id metric-id}]}]}}]})))))))

(deftest answers-each-query-on-its-own-test
  (is (=? {:queries [{:export "Venues" :entity {:dataset_query {:stages [{:source-table (table-path "VENUES")}]}}}
                     {:export "Broken" :error "No column found"}]}
          (export! :crowberto 200
                   {:queries [{:export "Venues"
                               :query  {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}
                              {:export "Broken"
                               :query  {:stages [{:source {:type "table" :id (mt/id :venues)}
                                                  :fields [(venues-column "NOT_A_COLUMN")]}]}}]}))))

(deftest exports-a-query-action-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (let [response (export! :crowberto 200 {:actions [action-id]})]
       (is (=? {:actions [{:id action-id
                           :entity {:entity_id (t2/select-one-fn :entity_id :model/Action :id action-id)
                                    :type      "query"
                                    :query     [{:database_id   (db-name)
                                                 :dataset_query {:database (db-name)}}]}}]}
               response))
       (is (not (contains? (-> response :actions first :entity) :model_id))
           "it names no model")))))

(deftest refuses-an-action-that-belongs-to-a-model-test
  (testing "a data app runs only actions that belong to no model, as the typed schema lists only those"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [model-action-id]}]
       (is (=? {:actions [{:id model-action-id :error #"Action \d+ belongs to a model\..*"}]}
               (export! :crowberto 200 {:actions [model-action-id]})))))))

(deftest refuses-what-a-copy-cannot-hold-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id model-id]}]
     (let [mp          (mt/metadata-provider)
           model-count (lib/aggregate (lib/query mp (lib.metadata/card mp model-id)) (lib/count))]
       (mt/with-temp [:model/Card {reading-metric-id :id} {:name          "Metric reading a model"
                                                           :type          :metric
                                                           :database_id   (mt/id)
                                                           :dataset_query model-count}]
         (let [card-sql-id  (actions/insert! {:name          "Read a card"
                                              :type          :query
                                              :database_id   (mt/id)
                                              :dataset_query (lib/native-query
                                                              mp (str "SELECT * FROM {{#" metric-id "}}"))})
               reads-metric {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                       :aggregations [{:type "metric" :id reading-metric-id}]}]}
               response     (export! :crowberto 200
                                     {:queries [{:export "ReadsMetric" :query reads-metric}]
                                      :actions [card-sql-id Integer/MAX_VALUE]})]
           (testing "a query action whose SQL reads a card"
             (is (=? {:id card-sql-id :error (re-pattern (str ".*reads card " metric-id ".*"))}
                     (nth (:actions response) 0))))
           (testing "an action that does not exist"
             (is (=? {:error #".*does not exist.*"} (nth (:actions response) 1))))
           (testing "a metric that reads a card; the query that aggregates it is still built"
             (is (=? {:queries [{:export "ReadsMetric" :entity map?}]
                      :metrics [{:id reading-metric-id :error (re-pattern (str ".*reads card " model-id ".*"))}]}
                     response)))))))))

(deftest rejects-unsupported-definitions-test
  (testing "the request accepts only what data app definitions support"
    (doseq [path [[:queries 0 :query :stages 0 :joins]
                  [:queries 0 :query :stages 0 :expressions]]]
      (testing (pr-str path)
        (export! :crowberto 400
                 (assoc-in {:queries [{:export "Venues"
                                       :query  {:stages [{:source {:type "table" :id (mt/id :venues)}}]}}]}
                           path []))))))

(deftest refuses-a-table-that-does-not-exist-test
  (is (=? {:queries [{:export "Nothing" :error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
          (export! :crowberto 200
                   {:queries [{:export "Nothing"
                               :query  {:stages [{:source {:type "table" :id Integer/MAX_VALUE}}]}}]})))
  (testing "a deactivated table is gone too, as it is from the typed schema"
    (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :active false}]
      (is (=? {:queries [{:export "Gone" :error (str "Table " table-id " does not exist.")}]}
              (export! :crowberto 200
                       {:queries [{:export "Gone"
                                   :query  {:stages [{:source {:type "table" :id table-id}}]}}]}))))))

(deftest refuses-a-column-that-reaches-a-deactivated-table-test
  (testing "types generated before categories was deactivated still select its name through venues.category_id, and
            the query would fail on the implicit join when it runs"
    (mt/with-temp-vals-in-db :model/Table (mt/id :categories) {:active false}
      (is (=? {:queries [{:export "VenueCategories" :error (str "Table " (mt/id :categories) " does not exist.")}]}
              (export! :crowberto 200
                       {:queries [{:export "VenueCategories"
                                   :query  {:stages [{:source {:type "table" :id (mt/id :venues)}
                                                      :fields [{:type "column" :name "NAME" :source-field-id (mt/id :venues :category_id)}]}]}}]}))))))

(deftest refuses-a-metric-that-reaches-a-deactivated-table-test
  (testing "a metric the query aggregates reads categories through venues.category_id in its own query, which the
            built query holds only the ID of, and the query would fail on the table when it runs"
    (let [mp         (mt/metadata-provider)
          venues     (lib/query mp (lib.metadata/table mp (mt/id :venues)))
          categories (mt/id :categories)
          category   (m/find-first (comp #{(mt/id :categories :name)} :id) (lib/filterable-columns venues))]
      (mt/with-temp [:model/Card {bars-id :id}  {:name          "Bars"
                                                 :type          :metric
                                                 :database_id   (mt/id)
                                                 :dataset_query (-> venues
                                                                    (lib/filter (lib/= category "Bar"))
                                                                    (lib/aggregate (lib/count)))}
                     :model/Card {count-id :id} {:name          "Venue count"
                                                 :type          :metric
                                                 :database_id   (mt/id)
                                                 :dataset_query (lib/aggregate venues (lib/count))}]
        (mt/with-temp-vals-in-db :model/Table categories {:active false}
          (is (=? {:queries [{:export "BarCount" :error (str "Table " categories " does not exist.")}
                             {:export "VenueCount" :entity map?}]
                   :metrics [{:id count-id :entity map?}]}
                  (export! :crowberto 200
                           {:queries [{:export "BarCount"
                                       :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                          :aggregations [{:type "metric" :id bars-id}]}]}}
                                      {:export "VenueCount"
                                       :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                          :aggregations [{:type "metric" :id count-id}]}]}}]}))))))))

(deftest refuses-a-definition-that-builds-an-invalid-query-test
  (testing "the request schema accepts what a type lets through, and lib's own checks are off in production, so the
            built query is checked: an invalid one must not export and then fail when it runs"
    (mt/with-premium-features #{:data-apps}
      (mt/with-current-user (mt/user->id :crowberto)
        (binding [mu.fn/*enforce* false]
          (is (=? {:queries [{:export "Half" :error "The definition does not build a valid query."}
                             {:export "Whole" :entity map?}]}
                  (resource-export/export-resources
                   app-collection
                   (with-ids [{:export "Half" :query {:stages [{:source {:type :table :id (mt/id :venues)} :limit 1.5}]}}
                              {:export "Whole" :query {:stages [{:source {:type :table :id (mt/id :venues)} :limit 2}]}}])
                   []))))))))

(deftest a-public-source-exports-as-the-private-copy-the-author-writes-test
  (testing "what makes a source public or embedded is left out, since the pull refuses a copy that says it is"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:public_uuid       (str (random-uuid))
                                              :made_public_by_id (mt/user->id :crowberto)
                                              :enable_embedding  true
                                              :embedding_params  {}})
       (t2/update! :model/Action :id action-id {:public_uuid       (str (random-uuid))
                                                :made_public_by_id (mt/user->id :crowberto)})
       (let [{:keys [actions metrics] :as response} (export! :crowberto 200
                                                             {:queries [{:export "VenueCount"
                                                                         :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                                            :aggregations [{:type "metric" :id metric-id}]}]}}]
                                                              :actions [action-id]})]
         (is (=? {:actions [{:id action-id :entity map?}] :metrics [{:id metric-id :entity map?}]} response))
         (doseq [{:keys [entity]} (concat actions metrics)]
           (is (not-any? (partial contains? entity)
                         [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type]))))))))

(deftest an-item-serialization-cannot-export-answers-with-the-cause-test
  (testing "one entity that fails inside its extraction comes back with the reason, which serialization wraps at each
            level, and the rest still export"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:visualization_settings {:broken true}})
       (let [export-settings (mt/original-fn #'serdes/export-visualization-settings)]
         (mt/with-dynamic-fn-redefs [serdes/export-visualization-settings (fn [settings]
                                                                            (if (:broken settings)
                                                                              (throw (ex-info "the metric is broken" {}))
                                                                              (export-settings settings)))]
           ;; called directly: the redefinition is bound on this thread, not on the one a request runs on
           (is (=? {:queries [{:export "VenueCount" :entity map?}]
                    :actions [{:id action-id :entity map?}]
                    :metrics [{:id metric-id :error (str "Serialization could not export Metric " metric-id ": the metric is broken")}]}
                   (mt/with-premium-features #{:data-apps}
                     (mt/with-current-user (mt/user->id :crowberto)
                       (resource-export/export-resources
                        app-collection
                        (with-ids [{:export "VenueCount"
                                    :query  {:stages [{:source       {:type :table :id (mt/id :venues)}
                                                       :aggregations [{:type :metric :id metric-id}]}]}}])
                        [action-id])))))))))))

(deftest an-item-serialization-leaves-out-answers-without-a-reason-test
  (testing "a card materialized by an exploration Summary is one serialization leaves out without an error"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id]}]
       (mt/with-temp [:model/Exploration {exploration-id :id} {:name "Explo" :creator_id (mt/user->id :crowberto)}
                      :model/Document    {summary-id :id}     {:name           "Summary"
                                                               :creator_id     (mt/user->id :crowberto)
                                                               :exploration_id exploration-id}]
         (t2/update! :model/Card :id metric-id {:document_id summary-id})
         (is (=? {:metrics [{:id metric-id :error (str "Serialization could not export Metric " metric-id ".")}]}
                 (export! :crowberto 200
                          {:queries [{:export "VenueCount"
                                      :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                         :aggregations [{:type "metric" :id metric-id}]}]}}]}))))))))

(deftest a-failure-of-the-export-is-logged-and-a-refusal-is-not-test
  (testing "a refusal is the author's to act on; anything else is a failure the server keeps a trace of"
    (mt/with-premium-features #{:data-apps}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-log-messages-for-level [messages [metabase-enterprise.data-apps.resource-export :warn]]
          (is (=? {:queries [{:export "Broken" :error "No column found"}
                             {:export "Nothing" :error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
                  (resource-export/export-resources
                   app-collection
                   (with-ids [{:export "Broken"
                               :query  {:stages [{:source {:type :table :id (mt/id :venues)}
                                                  :fields [{:type :column :name "NOT_A_COLUMN"}]}]}}
                              {:export "Nothing"
                               :query  {:stages [{:source {:type :table :id Integer/MAX_VALUE}}]}}])
                   [])))
          (let [logged (filter #(str/includes? (:message %) "Could not export a data app resource") (messages))]
            (is (= 1 (count logged)))
            (is (str/includes? (:message (first logged)) "Broken"))))))))

(deftest refuses-archived-sources-test
  (testing "the pull refuses an archived resource, so the export refuses an archived source"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [action-id]}]
       (t2/update! :model/Action :id action-id {:archived true})
       (is (=? {:actions [{:id action-id :error #".*is archived.*"}]}
               (export! :crowberto 200 {:actions [action-id]})))))))

(deftest refuses-an-action-whose-parameter-values-come-from-a-card-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [mp        (mt/metadata-provider)
           action-id (actions/insert! {:name          "Pick"
                                       :type          :query
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
      (is (=? {:queries [{:export "Cheap"
                          :entity {:dataset_query {:stages [{:filters [["segment" {} segment-eid]]}]}}}]}
              (export! :crowberto 200
                       {:queries [{:export "Cheap"
                                   :query  {:stages [{:source  {:type "table" :id (mt/id :venues)}
                                                      :filters [{:type "segment" :id segment-id}]}]}}]}))))))

(deftest refuses-sources-on-a-routing-destination-test
  (testing "a routing destination is reachable only through its router, so the typed schema leaves out what it backs,
            and so does the export"
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/DatabaseRouter _ {:database_id router-id :user_attribute "region"}
                   :model/Database {destination-id :id} {:router_database_id router-id}]
      (let [action-id (actions/insert! {:name          "Rename venue"
                                        :type          :query
                                        :database_id   destination-id
                                        :dataset_query {:lib/type :mbql/query
                                                        :database destination-id
                                                        :stages   [{:lib/type :mbql.stage/native
                                                                    :native   "UPDATE venues SET name = 'x'"}]}})]
        (is (=? {:actions [{:id action-id :error #".*is backed by a routing destination.*"}]}
                (export! :crowberto 200 {:actions [action-id]})))))))

(deftest refuses-a-source-whose-settings-read-a-card-test
  (testing "a copy keeps every card its export references, so a click behaviour linking a saved question is refused
            like a query reading one"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id model-id]}]
       (t2/update! :model/Card :id metric-id
                   {:visualization_settings {:click_behavior {:type "link" :linkType "question" :targetId model-id}}})
       (is (=? {:metrics [{:id metric-id :error (re-pattern (str ".*reads card " model-id ".*"))}]}
               (export! :crowberto 200
                        {:queries [{:export "VenueCount"
                                    :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                       :aggregations [{:type "metric" :id metric-id}]}]}}]})))))))

(deftest extracts-the-cards-and-the-actions-once-test
  (testing "the cards and the actions are each extracted in one serialization query, however many the app uses"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id model-action-id]}]
       (let [calls   (atom [])
             extract (mt/original-fn #'resource-export/extract-by-entity-id)]
         (mt/with-dynamic-fn-redefs [resource-export/extract-by-entity-id (fn [model-name ids]
                                                                            (swap! calls conj model-name)
                                                                            (extract model-name ids))]
           (is (=? {:actions [{:entity map?} {:error string?}] :metrics [{:entity map?}]}
                   (export! :crowberto 200
                            {:queries [{:export "VenueCount"
                                        :query  {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                           :aggregations [{:type "metric" :id metric-id}]}]}}]
                             :actions [action-id model-action-id]}))))
         (is (= {"Card" 1 "Action" 1} (frequencies @calls))))))))

(deftest exports-the-saved-question-an-author-writes-test
  (testing "a query comes back as the saved question that holds it: named after the export, in the app's collection,
            with the definition's entity ID, created by the caller, and nothing unset"
    (let [{:keys [entity]} (-> (export! :crowberto 200
                                        {:collection "appCollectionEntity01"
                                         :queries    [{:export    "VenuesList"
                                                       :entity_id "savedQuestionEntity01"
                                                       :query     {:stages [{:source {:type "table" :id (mt/id :venues)}
                                                                             :limit  5}]}}]})
                               :queries first)]
      (is (=? {:serdes/meta            [{:model "Card" :id "savedQuestionEntity01" :label "venues_list"}]
               :entity_id              "savedQuestionEntity01"
               :collection_id          "appCollectionEntity01"
               :name                   "Venues list"
               :type                   "question"
               :display                "table"
               :creator_id             "crowberto@metabase.com"
               :visualization_settings {}
               :parameters             []
               :parameter_mappings     []
               :dataset_query          {:database (db-name)
                                        :stages   [{:source-table (table-path "VENUES") :limit 5}]}}
              entity))
      (is (not-any? (partial contains? entity)
                    [:description :collection_position :public_uuid :card_schema :archived :enable_embedding])
          "what serialization leaves unset or at its default is left out, as the format omits it"))))

(deftest card-names-from-export-names-test
  (are [export card-name] (= card-name (#'resource-export/export-name->card-name export))
    "VenuesList"      "Venues list"
    "ordersByMonth"   "Orders by month"
    "top_10_products" "Top 10 products"
    "Revenue"         "Revenue"))

(deftest keys-come-in-the-order-serialization-writes-them-test
  (testing "the printed entity comes in the order serialization writes a file, so an author keeps it"
    (mt/with-premium-features #{:data-apps}
      (mt/with-current-user (mt/user->id :crowberto)
        (let [{:keys [entity]} (-> (resource-export/export-resources
                                    app-collection
                                    ;; decoded, as the endpoint hands a definition over
                                    (with-ids [{:export "Venues" :query {:stages [{:source {:type :table :id (mt/id :venues)}}]}}])
                                    [])
                                   :queries first)]
          (is (= [:database :stages :lib/type] (keys (:dataset_query entity))))
          (is (< (.indexOf ^java.util.List (vec (keys entity)) :name)
                 (.indexOf ^java.util.List (vec (keys entity)) :dataset_query))))))))

(deftest omits-the-settings-an-action-leaves-unset-test
  (testing "nulls inside an action's form settings, which the format omits, are left out of its export"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [action-id]}]
       (t2/update! :model/Action action-id
                   {:visualization_settings {:fields          {:name {:id "name" :hidden true :description nil}}
                                             :column_settings nil}})
       (let [{:keys [entity]} (-> (export! :crowberto 200 {:actions [action-id]}) :actions first)]
         (is (= {:fields {:name {:id "name" :hidden true}}} (:visualization_settings entity)))
         (is (not (contains? entity :description))))))))
