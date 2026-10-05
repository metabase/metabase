(ns metabase-enterprise.data-apps.resource-export-test
  "`POST /api/apps/export-resources`: what a data app's `resources/` files are written from."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resource-export :as resource-export]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- export!
  ([user status body]
   (export! user status body #{:data-apps}))
  ([user status body features]
   (mt/with-premium-features features
     (mt/user-http-request user :post status "apps/export-resources" body))))

(defn- export-as
  "What the export itself answers `user`, past the endpoint only a superuser reaches: it still holds each source to
  what its caller can read. `queries` are decoded, as the endpoint hands them over."
  [user queries action-ids & {:keys [features] :or {features #{:data-apps}}}]
  (mt/with-premium-features features
    (mt/with-current-user (mt/user->id user)
      (resource-export/export-resources queries action-ids))))

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
           "it names no model")
       (is (not (contains? response :models))
           "no model is exported with it")))))

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

(deftest exports-only-what-the-caller-can-read-test
  (data-apps.tu/do-with-sources!
   (fn [{:keys [action-id]}]
     (mt/with-temp [:model/Collection {collection-id :id} {:name "Private"}]
       (t2/update! :model/Action action-id {:collection_id collection-id})
       (mt/with-non-admin-groups-no-collection-perms collection-id
         (testing "an action in a collection the caller can't read"
           (is (=? {:actions [{:id action-id :error #".*does not exist, or you can't read it.*"}]}
                   (export-as :rasta [] [action-id])))))))))

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
  (testing "the export itself needs what the typed schema needs: a caller who can read the sources"
    (data-apps.tu/do-with-sources!
     (fn [{:keys [metric-id action-id]}]
       (is (=? {:queries [{:export "VenueCount" :entity map?}]
                :actions [{:id action-id :entity map?}]
                :metrics [{:id metric-id :entity map?}]}
               (export-as :rasta
                          [{:export "VenueCount"
                            :query  {:stages [{:source       {:type :table :id (mt/id :venues)}
                                               :aggregations [{:type :metric :id metric-id}]}]}}]
                          [action-id])))))))

(deftest a-table-the-caller-cannot-read-reveals-nothing-test
  (testing "a definition on a table the caller can't read gets the same answer whether or not its columns exist"
    (mt/with-no-data-perms-for-all-users!
      (is (=? {:queries [{:export "Venues" :error #"Table \d+ does not exist, or you can't read it."}
                         {:export "NoSuchColumn" :error #"Table \d+ does not exist, or you can't read it."}]}
              (export-as :rasta
                         [{:export "Venues"
                           :query  {:stages [{:source {:type :table :id (mt/id :venues)}}]}}
                          {:export "NoSuchColumn"
                           :query  {:stages [{:source {:type :table :id (mt/id :venues)}
                                              :fields [{:type :column :name "NOT_A_COLUMN"
                                                        :table-id (mt/id :venues) :source-name "VENUES"}]}]}}]
                         []))))))

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

(deftest a-table-published-to-a-collection-the-caller-reads-exports-test
  (testing "a table the caller reads only through its published collection is readable here as in the typed schema,
            which reads tables through the same per-user overlay"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Data Library" :type "library-data"}
                   :model/TableUserSettings _ {:table_id      (mt/id :venues)
                                               :is_published  true
                                               :collection_id collection-id}]
      (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted :create-queries :no}}
        (is (=? {:queries [{:export "Venues" :entity {:dataset_query {:stages [{:source-table (table-path "VENUES")}]}}}]}
                (export-as :rasta
                           [{:export "Venues" :query {:stages [{:source {:type :table :id (mt/id :venues)}}]}}]
                           []
                           :features #{:data-apps :library})))))))

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
             extract @#'resource-export/extract-by-entity-id]
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
                                    ;; decoded, as the endpoint hands a definition over
                                    [{:export "Venues" :query {:stages [{:source {:type :table :id (mt/id :venues)}}]}}]
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
