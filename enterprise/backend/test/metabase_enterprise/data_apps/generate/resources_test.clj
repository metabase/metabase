(ns metabase-enterprise.data-apps.generate.resources-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.data-apps.generate.resources :as generate.resources]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private app-collection "appCollectionEntity01")

(def ^:private other-collection "otherCollectionEnt001")

(defn- do-with-collections!
  "Call `f` with the collections `app-collection` and `other-collection` in place."
  [f]
  (mt/with-temp [:model/Collection _ {:entity_id app-collection :name "App collection" :namespace "data-apps"}
                 :model/Collection _ {:entity_id other-collection :name "Other collection" :namespace "data-apps"}]
    (f)))

(defn- query-item
  "A query to serialize named `query-name`, in `app-collection` with a fresh entity ID unless `extra` says otherwise."
  [query-name definition & {:as extra}]
  (merge {:name query-name :query definition :entity_id (u/generate-nano-id) :collection_id app-collection} extra))

(defn- action-item
  "An action to serialize, in `app-collection` with a fresh entity ID unless `action` is a map saying otherwise."
  [action]
  (merge {:entity_id (u/generate-nano-id) :collection_id app-collection}
         (if (map? action) action {:action_id action})))

(defn- request-body [{:keys [queries actions]}]
  {:queries (vec queries) :actions (mapv action-item actions)})

(defn- generate!
  "Generate the files of `body` as `user` over HTTP, with the collections in place."
  ([user status body]
   (generate! user status body #{:data-apps}))
  ([user status body features]
   (do-with-collections!
    (fn []
      (mt/with-premium-features features
        (mt/user-http-request user :post status "apps/generate/resources" (request-body body)))))))

(defn- generate-directly!
  "Generate the files of `body` as a superuser by calling the function, for a test that redefines what runs on the request thread,
  with the types of its definitions as keywords, as the endpoint hands them over."
  [body]
  (do-with-collections!
   (fn []
     (mt/with-premium-features #{:data-apps}
       (mt/with-current-user (mt/user->id :crowberto)
         (generate.resources/generate
          (walk/postwalk #(cond-> % (and (map? %) (string? (:type %))) (update :type keyword))
                         (request-body body))))))))

(defn- file-entity
  "The entity a serialization `file` holds."
  [{:keys [yaml]}]
  (yaml/parse-string yaml))

(defn- db-name []
  (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-path [table]
  [(db-name) "PUBLIC" table])

(defn- field-path [table field]
  [(db-name) "PUBLIC" table field])

(defn- venues-column [field-name & {:as extra}]
  (merge {:type "column" :name field-name :tableId (mt/id :venues) :sourceName "VENUES"} extra))

(defn- venues-definition [& {:as stage}]
  {:stages [(merge {:source {:type "table" :id (mt/id :venues)}} stage)]})

(defn- metric-count-definition [metric-id]
  (venues-definition :aggregations [{:type "metric" :id metric-id}]))

(deftest serialization-needs-each-items-entity-id-name-and-collection-test
  (testing "the saved question is written with the given entity ID, name and collection, so every query names them"
    (mt/with-premium-features #{:data-apps}
      (doseq [missing [:name :entity_id :collection_id]]
        (testing (pr-str missing)
          (is (=? {:errors {:queries some?}}
                  (mt/user-http-request :crowberto :post 400 "apps/generate/resources"
                                        {:queries [(dissoc (query-item "Venues" (venues-definition)) missing)]
                                         :actions []}))))))))

(deftest serialization-needs-each-actions-entity-id-and-collection-test
  (mt/with-premium-features #{:data-apps}
    (doseq [missing [:entity_id :collection_id]]
      (testing (pr-str missing)
        (is (=? {:errors {:actions some?}}
                (mt/user-http-request :crowberto :post 400 "apps/generate/resources"
                                      {:queries []
                                       :actions [(dissoc (action-item 1) missing)]})))))))

(deftest serializes-into-a-collection-absent-from-the-instance-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (let [response (generate! :crowberto 200
                               {:queries [(query-item "Gone" (venues-definition) :collection_id "noSuchCollectionEnt01")]
                                :actions [{:action_id action-id :collection_id "noSuchCollectionEnt01"}]})]
       (is (=? {:queries [{:file "gone.yaml"}] :actions [{:file string?}]} response))
       (doseq [file (concat (:queries response) (:actions response))]
         (is (= "noSuchCollectionEnt01" (:collection_id (file-entity file)))))))))

(deftest names-files-after-their-entities-and-deduplicates-them-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (is (=? {:queries [{:file "orders.yaml"} {:file "orders_2.yaml"} {:file "venue_count.yaml"}]
              :metrics [{:file string?}]}
             (generate! :crowberto 200
                        {:queries [(query-item "Orders" (venues-definition))
                                   (query-item "Orders" (venues-definition))
                                   (query-item "Venue count" (metric-count-definition metric-id))]}))))))

(deftest serializes-a-query-with-every-reference-portable-test
  (let [response (generate! :crowberto 200
                            {:queries [(query-item "PriceByCategory"
                                                   (venues-definition
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
                                                    :limit        5))]})
        entity   (file-entity (first (:queries response)))]
    (testing "the query Metabase builds from the definition, referencing tables and fields by name"
      (let [price       (field-path "VENUES" "PRICE")
            category-id (field-path "VENUES" "CATEGORY_ID")
            category    (field-path "CATEGORIES" "NAME")]
        (is (=? {:dataset_query {:lib/type "mbql/query"
                                 :database (db-name)
                                 :stages   [{:source-table (table-path "VENUES")
                                             :filters      [[">" {} ["field" {} price] 1]]
                                             :aggregation  [["sum" {:name "total"} ["field" {} price]]]
                                             :breakout     [["field" {:source-field category-id} category]]
                                             :order-by     [["desc" {} ["aggregation"
                                                                        {:lib/source-name "total"}
                                                                        string?]]]
                                             :limit        5}]}}
                entity))
        (is (empty? (:metrics response)))))
    (testing "only the uuid the order by points at is kept, and it is the aggregation's"
      (let [stage (-> entity :dataset_query :stages first)]
        (is (= (get-in stage [:aggregation 0 1 :lib/uuid])
               (get-in stage [:order-by 0 2 2])))
        (is (nil? (get-in stage [:filters 0 1 :lib/uuid])))))))

(deftest only-a-superuser-generates-test
  (testing "an app's resources are written into its repository, which only an admin works with"
    (let [body {:queries [(query-item "Venues" (venues-definition))]}]
      (is (= "You don't have permissions to do that." (generate! :rasta 403 body)))
      (is (=? {:queries [{:file string? :yaml string?}]} (generate! :crowberto 200 body))))))

(deftest lists-the-metrics-a-query-aggregates-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [metric-eid (t2/select-one-fn :entity_id :model/Card :id metric-id)
           response   (generate! :crowberto 200
                                 {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})
           metric     (file-entity (first (:metrics response)))
           question   (file-entity (first (:queries response)))]
       (is (= 1 (count (:metrics response))))
       (is (=? {:type          "metric"
                :collection_id app-collection
                :dataset_query {:stages [{:source-table (table-path "VENUES")}]}}
               metric))
       (testing "the copy has its own entity ID, and the question reads the copy rather than the source metric"
         (is (not= metric-eid (:entity_id metric)))
         (is (= (:entity_id metric) (get-in question [:dataset_query :stages 0 :aggregation 0 2])))
         (is (not= metric-eid (get-in question [:dataset_query :stages 0 :aggregation 0 2]))))
       (testing "the copy's entity ID is the same every time"
         (is (= (:entity_id metric)
                (-> (generate! :crowberto 200 {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})
                    :metrics first file-entity :entity_id))))))))

(deftest copies-a-metric-once-per-collection-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id]}]
     (let [definition (metric-count-definition metric-id)
           response   (generate! :crowberto 200
                                 {:queries [(query-item "A" definition)
                                            (query-item "B" definition)
                                            (query-item "C" definition :collection_id other-collection)]})
           metrics    (mapv file-entity (:metrics response))
           references (mapv #(get-in (file-entity %) [:dataset_query :stages 0 :aggregation 0 2]) (:queries response))]
       (is (= 2 (count metrics)))
       (is (= #{app-collection other-collection} (set (map :collection_id metrics))))
       (is (apply distinct? (map :entity_id metrics)))
       (is (= (first references) (second references)))
       (is (= (set references) (set (map :entity_id metrics))))))))

(deftest answers-each-query-on-its-own-test
  (let [response (generate! :crowberto 200
                            {:queries [(query-item "Venues" (venues-definition))
                                       (query-item "Broken" (venues-definition :fields [(venues-column "NOT_A_COLUMN")]))]})]
    (is (=? [{:file string? :yaml string?} {:error "No column found"}]
            (:queries response)))
    (is (=? {:dataset_query {:stages [{:source-table (table-path "VENUES")}]}}
            (file-entity (first (:queries response)))))))

(deftest serializes-a-query-action-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (let [response (generate! :crowberto 200 {:actions [{:action_id action-id :entity_id "actionCopyEntity00001"}]})
           entity   (file-entity (first (:actions response)))]
       (is (=? {:entity_id     "actionCopyEntity00001"
                :collection_id app-collection
                :type          "query"
                :query         [{:database_id   (db-name)
                                 :dataset_query {:database (db-name)}}]}
               entity))
       (is (not (contains? entity :model_id))
           "it names no model")))))

(deftest refuses-an-action-that-belongs-to-a-model-test
  (testing "a data app runs only actions that belong to no model, as the typed schema lists only those"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [model-action-id]}]
       (is (=? {:actions [{:error #"Action \d+ belongs to a model\..*"}]}
               (generate! :crowberto 200 {:actions [model-action-id]})))))))

(deftest refuses-what-a-copy-cannot-hold-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [metric-id model-id]}]
     (let [mp          (mt/metadata-provider)
           model-count (lib/aggregate (lib/query mp (lib.metadata/card mp model-id)) (lib/count))]
       (mt/with-temp [:model/Card {reading-metric-id :id} {:name          "Metric reading a model"
                                                           :type          :metric
                                                           :database_id   (mt/id)
                                                           :dataset_query model-count}]
         (let [card-sql-id (actions/insert! {:name          "Read a card"
                                             :type          :query
                                             :database_id   (mt/id)
                                             :dataset_query (lib/native-query
                                                             mp (str "SELECT * FROM {{#" metric-id "}}"))})
               response    (generate! :crowberto 200
                                      {:queries [(query-item "ReadsMetric" (metric-count-definition reading-metric-id))]
                                       :actions [card-sql-id Integer/MAX_VALUE]})]
           (testing "a query action whose SQL reads a card"
             (is (=? {:error (re-pattern (str ".*reads card " metric-id ".*"))}
                     (nth (:actions response) 0))))
           (testing "an action that does not exist"
             (is (=? {:error #".*does not exist.*"} (nth (:actions response) 1))))
           (testing "a metric that reads a card; the query that aggregates it is still built"
             (is (=? {:queries [{:file string?}]
                      :metrics [{:error (re-pattern (str ".*reads card " model-id ".*"))}]}
                     response)))))))))

(deftest rejects-unsupported-definitions-test
  (testing "the request accepts only what data app definitions support"
    (doseq [path [[:queries 0 :query :stages 0 :joins]
                  [:queries 0 :query :stages 0 :expressions]]]
      (testing (pr-str path)
        (do-with-collections!
         (fn []
           (mt/with-premium-features #{:data-apps}
             (mt/user-http-request :crowberto :post 400 "apps/generate/resources"
                                   (assoc-in {:queries [(query-item "Venues" (venues-definition))] :actions []}
                                             path [])))))))))

(deftest refuses-a-table-that-does-not-exist-test
  (is (=? {:queries [{:error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
          (generate! :crowberto 200
                     {:queries [(query-item "Nothing" {:stages [{:source {:type "table" :id Integer/MAX_VALUE}}]})]})))
  (testing "a deactivated table is gone too, as it is from the typed schema"
    (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :active false}]
      (is (=? {:queries [{:error (str "Table " table-id " does not exist.")}]}
              (generate! :crowberto 200
                         {:queries [(query-item "Gone" {:stages [{:source {:type "table" :id table-id}}]})]}))))))

(deftest refuses-a-column-that-reaches-a-deactivated-table-test
  (testing "types generated before categories was deactivated still select its name through venues.category_id, and
            the query would fail on the implicit join when it runs"
    (mt/with-temp-vals-in-db :model/Table (mt/id :categories) {:active false}
      (is (=? {:queries [{:error (str "Table " (mt/id :categories) " does not exist.")}]}
              (generate! :crowberto 200
                         {:queries [(query-item "VenueCategories"
                                                (venues-definition
                                                 :fields [{:type "column" :name "NAME"
                                                           :sourceFieldId (mt/id :venues :category_id)}]))]}))))))

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
          (is (=? {:queries [{:error (str "Table " categories " does not exist.")}
                             {:file string?}]
                   :metrics [{:file string?}]}
                  (generate! :crowberto 200
                             {:queries [(query-item "BarCount" (metric-count-definition bars-id))
                                        (query-item "VenueCount" (metric-count-definition count-id))]}))))))))

(deftest refuses-a-column-remapped-to-a-deactivated-table-test
  (testing "venues.category_id displays categories.name, a join the query processor adds only when the query runs, so
            the built query never names categories"
    (let [categories (mt/id :categories)]
      (mt/with-column-remappings [venues.category_id categories.name]
        (mt/with-temp-vals-in-db :model/Table categories {:active false}
          (is (=? {:queries [{:error (str "Table " categories " does not exist.")}
                             {:file string?}]}
                  (generate! :crowberto 200
                             {:queries [(query-item "VenueCategoryIds"
                                                    (venues-definition :fields [{:type "column" :name "CATEGORY_ID"}]))
                                        (query-item "VenuePrices"
                                                    (venues-definition :fields [{:type "column" :name "PRICE"}]))]}))))))))

(deftest refuses-a-definition-that-builds-an-invalid-query-test
  (testing "the request schema accepts what a type lets through, and lib's own checks are off in production, so the
            built query is checked: an invalid one must not serialize and then fail when it runs"
    (binding [mu.fn/*enforce* false]
      (is (=? {:queries [{:error "The definition does not build a valid query."}
                         {:file string?}]}
              (generate-directly!
               {:queries [(query-item "Half" {:stages [{:source {:type :table :id (mt/id :venues)} :limit 1.5}]})
                          (query-item "Whole" {:stages [{:source {:type :table :id (mt/id :venues)} :limit 2}]})]}))))))

(deftest a-public-source-serializes-as-the-private-copy-the-author-writes-test
  (testing "what makes a source public or embedded is left out, since the pull refuses a copy that says it is"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:public_uuid       (str (random-uuid))
                                              :made_public_by_id (mt/user->id :crowberto)
                                              :enable_embedding  true
                                              :embedding_params  {}})
       (t2/update! :model/Action :id action-id {:public_uuid       (str (random-uuid))
                                                :made_public_by_id (mt/user->id :crowberto)})
       (let [{:keys [actions metrics] :as response}
             (generate! :crowberto 200
                        {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                         :actions [action-id]})]
         (is (=? {:actions [{:file string?}] :metrics [{:file string?}]} response))
         (doseq [file (concat actions metrics)]
           (is (not-any? (partial contains? (file-entity file))
                         [:public_uuid :made_public_by_id :enable_embedding :embedding_params :embedding_type]))))))))

(deftest an-item-serialization-cannot-extract-answers-with-the-cause-test
  (testing "one entity that fails inside its extraction comes back with the reason, which serialization wraps at each
            level, and the rest still serialize"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (t2/update! :model/Card :id metric-id {:visualization_settings {:broken true}})
       (let [export-settings (mt/original-fn #'serdes/export-visualization-settings)]
         (mt/with-dynamic-fn-redefs [serdes/export-visualization-settings (fn [settings]
                                                                            (if (:broken settings)
                                                                              (throw (ex-info "the metric is broken" {}))
                                                                              (export-settings settings)))]
           (is (=? {:queries [{:file string?}]
                    :actions [{:file string?}]
                    :metrics [{:error (str "Could not serialize Metric " metric-id ": the metric is broken")}]}
                   (generate-directly!
                    {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                     :actions [action-id]})))))))))

(deftest an-item-serialization-leaves-out-answers-without-a-reason-test
  (testing "a card materialized by an exploration Summary is one serialization leaves out without an error"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id]}]
       (mt/with-temp [:model/Exploration {exploration-id :id} {:name "Explo" :creator_id (mt/user->id :crowberto)}
                      :model/Document    {summary-id :id}     {:name           "Summary"
                                                               :creator_id     (mt/user->id :crowberto)
                                                               :exploration_id exploration-id}]
         (t2/update! :model/Card :id metric-id {:document_id summary-id})
         (is (=? {:metrics [{:error (str "Could not serialize Metric " metric-id ".")}]}
                 (generate! :crowberto 200
                            {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]}))))))))

(deftest a-failure-of-the-serialization-is-logged-and-a-refusal-is-not-test
  (testing "a refusal is the author's to act on; anything else is a failure the server keeps a trace of"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.data-apps.generate.resources :warn]]
      (is (=? {:queries [{:error "No column found"}
                         {:error (str "Table " Integer/MAX_VALUE " does not exist.")}]}
              (generate-directly!
               {:queries [(query-item "Broken"
                                      {:stages [{:source {:type :table :id (mt/id :venues)}
                                                 :fields [{:type :column :name "NOT_A_COLUMN"}]}]})
                          (query-item "Nothing" {:stages [{:source {:type :table :id Integer/MAX_VALUE}}]})]})))
      (let [logged (filter #(str/includes? (:message %) "Could not serialize a data app resource") (messages))]
        (is (= 1 (count logged)))
        (testing "naming the query by its entity ID, without its definition"
          (is (str/includes? (:message (first logged)) ":query"))
          (is (not (str/includes? (:message (first logged)) "NOT_A_COLUMN")))
          (is (not (str/includes? (:message (first logged)) "Broken"))))))))

(deftest refuses-archived-sources-test
  (testing "the pull refuses an archived resource, so the serialization refuses an archived source"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [action-id]}]
       (t2/update! :model/Action :id action-id {:archived true})
       (is (=? {:actions [{:error #".*is archived.*"}]}
               (generate! :crowberto 200 {:actions [action-id]})))))))

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
       (is (=? {:actions [{:error (re-pattern (str ".*reads card " metric-id ".*"))}]}
               (generate! :crowberto 200 {:actions [action-id]})))))))

(deftest serializes-a-segment-reference-by-entity-id-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Segment {segment-id :id, segment-eid :entity_id}
                   {:name       "Cheap"
                    :table_id   (mt/id :venues)
                    :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                    (lib/filter (lib/< (lib.metadata/field mp (mt/id :venues :price)) 3)))}]
      (is (=? {:dataset_query {:stages [{:filters [["segment" {} segment-eid]]}]}}
              (-> (generate! :crowberto 200
                             {:queries [(query-item "Cheap"
                                                    (venues-definition :filters [{:type "segment" :id segment-id}]))]})
                  :queries first file-entity))))))

(deftest refuses-sources-on-a-routing-destination-test
  (testing "a routing destination is reachable only through its router, so the typed schema leaves out what it backs,
            and so does the serialization"
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
        (is (=? {:actions [{:error #".*is backed by a routing destination.*"}]}
                (generate! :crowberto 200 {:actions [action-id]})))))))

(deftest refuses-a-source-whose-settings-read-a-card-test
  (testing "a copy keeps every card its serialization references, so a click behaviour linking a saved question is refused
            like a query reading one"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id model-id]}]
       (t2/update! :model/Card :id metric-id
                   {:visualization_settings {:click_behavior {:type "link" :linkType "question" :targetId model-id}}})
       (is (=? {:metrics [{:error (re-pattern (str ".*reads card " model-id ".*"))}]}
               (generate! :crowberto 200
                          {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]})))))))

(deftest extracts-the-cards-and-the-actions-once-test
  (testing "the cards and the actions are each extracted in one serialization query, however many the app uses"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id model-action-id]}]
       (let [calls   (atom [])
             extract (mt/original-fn #'generate.resources/extract-by-entity-id)]
         (mt/with-dynamic-fn-redefs [generate.resources/extract-by-entity-id (fn [model-name ids]
                                                                               (swap! calls conj model-name)
                                                                               (extract model-name ids))]
           (is (=? {:actions [{:file string?} {:error string?}] :metrics [{:file string?}]}
                   (generate-directly!
                    {:queries [(query-item "VenueCount" (metric-count-definition metric-id))]
                     :actions [action-id model-action-id]}))))
         (is (= {"Card" 1 "Action" 1} (frequencies @calls))))))))

(deftest serializes-the-saved-question-an-author-writes-test
  (testing "a query comes back as the saved question that holds it: named as given, in the given collection, with the
            given entity ID, created by the caller, and nothing unset"
    (let [{:keys [file yaml] :as item} (-> (generate! :crowberto 200
                                                      {:queries [(query-item "Venues list" (venues-definition :limit 5)
                                                                             :entity_id "savedQuestionEntity01")]})
                                           :queries first)
          entity                       (file-entity item)]
      (is (= "venues_list.yaml" file))
      (is (string? yaml))
      (is (=? {:serdes/meta            [{:model "Card"}]
               :entity_id              "savedQuestionEntity01"
               :collection_id          app-collection
               :name                   "Venues list"
               :type                   "question"
               :display                "table"
               :creator_id             "crowberto@metabase.com"
               :visualization_settings {:column_settings nil}
               :parameters             []
               :parameter_mappings     []
               :dataset_query          {:database (db-name)
                                        :stages   [{:source-table (table-path "VENUES") :limit 5}]}}
              entity))
      (is (not-any? (partial contains? entity)
                    [:description :collection_position :public_uuid :card_schema :archived :enable_embedding])
          "what serialization leaves unset or at its default is left out, as the format omits it"))))

(deftest keys-come-in-the-order-serialization-writes-them-test
  (testing "the printed entity comes in the order serialization writes a file, so an author keeps it"
    (let [{:keys [yaml] :as file} (-> (generate-directly! {:queries [(query-item "Venues" (venues-definition))]})
                                      :queries first)]
      (is (= [:database :stages :lib/type] (keys (:dataset_query (file-entity file)))))
      (is (< (str/index-of yaml "name:") (str/index-of yaml "\ndataset_query:"))))))

(defn- venues-sum
  [column-name]
  {:type "operator" :operator "sum" :args [{:type "column" :name column-name}]})

(deftest refuses-aggregations-sharing-column-name-test
  (testing "aggregations named alike would be read as one by a later stage or a result row, so the author names them"
    (is (=? {:queries [{:error "Aggregations need unique column names: Sum of Price, Sum of Latitude share the column name \"sum\". Name them apart with the `name` option of an aggregation helper, or with `aggregations.measure` or `aggregations.metric` for a measure or metric."}]}
            (generate! :crowberto 200
                       {:queries [(query-item "Sums" {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                :aggregations [(venues-sum "PRICE") (venues-sum "LATITUDE")]}]})]})))))

(deftest accepts-named-aggregations-test
  (let [{[file] :queries} (generate! :crowberto 200
                                     {:queries [(query-item "Sums" {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                              :aggregations [(assoc (venues-sum "PRICE") :name "price")
                                                                                             (venues-sum "LATITUDE")]}]})]})]
    (is (=? [["sum" {:name "price"} some?] ["sum" {} some?]]
            (get-in (file-entity file) [:dataset_query :stages 0 :aggregation])))))

(deftest names-measure-test
  (testing "measure wrapped as `{name, value}` gets that column name, and its own `name` is left out"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :venues)
                                                      :name       "Revenue"
                                                      :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                      (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))}]
        (let [measure {:type "measure" :id measure-id :name "Revenue" :tableId (mt/id :venues)}
              body    (fn [measure]
                        {:queries [(query-item "Revenue" {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                    :aggregations [measure (venues-sum "LATITUDE")]}]})]})]
          (testing "unnamed, it shares the column name of the sum beside it"
            (is (=? {:queries [{:error #".*share the column name \"sum\".*"}]}
                    (generate! :crowberto 200 (body measure)))))
          (let [{[file] :queries} (generate! :crowberto 200 (body {:name "revenue" :value measure :columns [{:name "revenue"}]}))]
            (is (=? [["measure" {:name "revenue"} some?] ["sum" {} some?]]
                    (get-in (file-entity file) [:dataset_query :stages 0 :aggregation])))))))))

(deftest refuses-order-by-on-shared-column-name-test
  (testing "order-by naming a column two aggregations share gets the same refusal, not Lib's ambiguity error"
    (is (=? {:queries [{:error #"Aggregations need unique column names: Sum of Price, Sum of Latitude share the column name \"sum\"\..*"}]}
            (generate! :crowberto 200
                       {:queries [(query-item "Sums" {:stages [{:source       {:type "table" :id (mt/id :venues)}
                                                                :aggregations [(venues-sum "PRICE") (venues-sum "LATITUDE")]
                                                                :order-bys    [{:type "column" :name "sum"}]}]})]})))))
