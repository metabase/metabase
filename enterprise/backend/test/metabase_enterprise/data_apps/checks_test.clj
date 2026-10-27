(ns metabase-enterprise.data-apps.checks-test
  "The checks that hold a data app's ad-hoc queries and card runs to its own cards and the Library, and its action runs
  to its own actions, through the endpoints that run them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- as-app
  "Request options that mark a request as the data app's named `app-name`, or as an unnamed data app's when nil."
  [app-name]
  {:request-options {:headers (cond-> {"x-metabase-client" "data-app"}
                                app-name (assoc "x-metabase-client-identifier" app-name))}})

(def ^:private as-data-app
  "Request options that mark a request as from the data app of [[do-with-app-collection]]."
  (as-app "birds"))

(def ^:private error-formats
  "The format of the error message for each kind of entity a data app may not use."
  {:cards    "A data app can use only the cards in its own collection, not the cards %s."
   :metrics  "A data app can use only metrics from the Library, not the metrics %s."
   :tables   "A data app can read only tables published to the Library, not the tables %s."
   :segments "A data app can use only segments of tables published to the Library, not the segments %s."
   :measures "A data app can use only measures of tables published to the Library, not the measures %s."})

(defn- error-message
  "The error message for a data app's use of the entities of `kind` with `ids`."
  [kind & ids]
  (format (error-formats kind) (str/join ", " (sort ids))))

(defn- card-error
  "The error message for a data app's run of the card with `card-id`."
  [card-id]
  (format "A data app can run only the cards in its own collection, not the card %d." card-id))

(defn- action-error
  "The error message for a data app's run of the action with `action-id`."
  [action-id]
  (format "A data app can run only the actions in its own collection, not the action %d." action-id))

(defn- run-query
  "The response to a data app's request to run `query` through `POST /api/dataset`, expecting `status`."
  ([status query]
   (run-query status query as-data-app))
  ([status query options]
   (mt/user-http-request :crowberto :post status "dataset" options query)))

(defn- table-query
  "A query of the table named `table-key`."
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(defn- card-query
  "A query whose source is the card with `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- join
  "`query` joined to `joinable`, on the conditions the foreign keys suggest."
  [query joinable]
  (lib/join query (lib/join-clause joinable)))

(defn- do-with-app-card!
  "Call `f` with the ID of a card on the published VENUES table in the collection of the data app of
  [[do-with-app-collection]], and with that collection's ID."
  [f]
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {card-id :id} {:name          "Venues"
                                                 :collection_id collection-id
                                                 :dataset_query (data-apps.tu/venues-query)}]
         (f card-id collection-id))))))

(deftest app-card-and-published-table-run-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (doseq [[label query] [["the app's card" (lib/limit (card-query card-id) 1)]
                            ["a published table" (lib/limit (table-query :venues) 1)]]]
       (testing (str "a query on " label " runs, pivots, compiles and has metadata")
         (is (= "completed" (:status (run-query 202 query))))
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset/pivot" as-data-app
                                                           (lib/aggregate query (lib/count))))))
         (is (string? (:query (mt/user-http-request :crowberto :post 200 "dataset/native" as-data-app query))))
         (is (seq (:tables (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app query)))))
       (testing (str "an export of a query on " label ", which a form submission sends as a JSON string")
         (is (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                   (assoc-in as-data-app [:request-options :content-type]
                                             "application/x-www-form-urlencoded")
                                   {:query (json/encode (lib/->legacy-MBQL query))})))))))

(deftest request-must-name-readable-app-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a data app's request that names no app is refused"
       (is (re-find #"must name a data app" (run-query 400 (card-query card-id) (as-app nil)))))
     (testing "an app that doesn't exist is not found"
       (is (= "Not found." (run-query 404 (card-query card-id) (as-app "no-such-app")))))
     (testing "an app the user can't read is refused"
       (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :post 403 "dataset" as-data-app (card-query card-id))))))))

(deftest unpublished-tables-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "every endpoint refuses a query on an unpublished table"
       (is (= (error-message :tables (mt/id :categories)) (run-query 400 (table-query :categories))))
       (doseq [endpoint ["dataset/pivot" "dataset/native" "dataset/query_metadata"]]
         (is (= (error-message :tables (mt/id :categories)) (mt/user-http-request :crowberto :post 400 endpoint as-data-app
                                                                                  (table-query :categories)))
             endpoint))
       (is (= (error-message :tables (mt/id :categories)) (mt/user-http-request :crowberto :post 400 "dataset/csv" as-data-app
                                                                                {:query (table-query :categories)}))))
     (testing "a join of an unpublished table is refused, from a published table or the app's card"
       (doseq [query [(table-query :venues) (card-query card-id)]]
         (is (= (error-message :tables (mt/id :categories))
                (run-query 400 (join query (lib.metadata/table (mt/metadata-provider) (mt/id :categories))))))))
     (testing "the join runs once its table is published"
       (data-apps.tu/with-published-tables! [(mt/id :categories)]
         (is (= "completed" (:status (run-query 202 (-> (table-query :venues)
                                                        (join (lib.metadata/table (mt/metadata-provider)
                                                                                  (mt/id :categories)))
                                                        (lib/limit 1)))))))))))

(deftest other-cards-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/DataApp {other-collection-id :resource_collection_id} {:name         "bees"
                                                                                  :display_name "Bees"
                                                                                  :bundle_path  "bees.js"}
                    :model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}
                    :model/Card {categories-id :id} {:name "Categories elsewhere" :dataset_query (table-query :categories)}
                    :model/Card {other-app-id :id} {:name          "Venues of bees"
                                                    :collection_id other-collection-id
                                                    :dataset_query (data-apps.tu/venues-query)}]
       (testing "a card outside the app's collection, or of another app, is refused"
         (doseq [other-id [elsewhere-id other-app-id]]
           (is (= (error-message :cards other-id)
                  (run-query 400 (card-query other-id))))))
       (testing "a join of a card outside the app's collection is refused"
         (is (= (error-message :cards categories-id)
                (run-query 400 (join (card-query card-id)
                                     (lib.metadata/card (mt/metadata-provider) categories-id))))))
       (testing "the other app runs its own card"
         (is (= "completed" (:status (run-query 202 (lib/limit (card-query other-app-id) 1) (as-app "bees"))))))))))

(deftest missing-entities-are-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (testing "an ID of no entity gets the refusal an entity the app may not use gets, so it tells nothing of what exists"
       (doseq [[kind query] [[:tables {:database (mt/id) :type :query :query {:source-table 999999999}}]
                             [:cards {:database (mt/id) :type :query :query {:source-table "card__999999999"}}]
                             [:metrics {:database (mt/id) :type :query :query {:source-table (mt/id :venues)
                                                                               :aggregation  [[:metric 999999999]]}}]
                             [:segments {:database (mt/id) :type :query :query {:source-table (mt/id :venues)
                                                                                :filter       [:segment 999999999]}}]
                             [:measures {:database (mt/id) :type :query :query {:source-table (mt/id :venues)
                                                                                :aggregation  [[:measure 999999999]]}}]]]
         (is (= (error-message kind 999999999) (run-query 400 query)) (name kind)))))))

(deftest native-query-is-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (testing "in its MBQL 5, legacy and nested legacy forms"
       (doseq [query [(lib/native-query (mt/metadata-provider) "SELECT * FROM VENUES")
                      {:database (mt/id) :type :native :native {:query "SELECT * FROM VENUES"}}
                      {:database (mt/id)
                       :type     :query
                       :query    {:source-query {:native "SELECT * FROM VENUES"}}}]]
         (is (re-find #"cannot run native queries" (run-query 400 query)))))
     (testing "a request that is not a data app's still runs native SQL"
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset"
                                                         (lib/native-query (mt/metadata-provider) "SELECT 1")))))))))

(deftest internal-query-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (is (re-find #"cannot run internal queries"
                  (run-query 400 {:type :internal
                                  :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"}))))))

(deftest metrics-test
  (do-with-app-card!
   (fn [card-id collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (testing "a Library metric runs"
          (is (= "completed" (:status (run-query 202 (lib/aggregate (card-query card-id)
                                                                    (lib.metadata/metric (mt/metadata-provider)
                                                                                         metric-id)))))))
        (mt/with-temp [:model/Card {outside-id :id} {:name          "Venue count elsewhere"
                                                     :type          :metric
                                                     :database_id   (mt/id)
                                                     :dataset_query (lib/aggregate (table-query :venues) (lib/count))}]
          (testing "a metric outside the Library is refused"
            (is (= (error-message :metrics outside-id)
                   (run-query 400 (lib/aggregate (card-query card-id)
                                                 (lib.metadata/metric (mt/metadata-provider) outside-id)))))))
        (testing "a metric in the app's collection is not a Library metric either"
          (mt/with-temp [:model/Card {app-metric-id :id} {:name          "Venue count of the app"
                                                          :type          :metric
                                                          :collection_id collection-id
                                                          :database_id   (mt/id)
                                                          :dataset_query (lib/aggregate (table-query :venues)
                                                                                        (lib/count))}]
            (is (= (error-message :metrics app-metric-id)
                   (run-query 400 (lib/aggregate (table-query :venues)
                                                 (lib.metadata/metric (mt/metadata-provider)
                                                                      app-metric-id))))))))))))

(deftest segments-and-measures-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (let [categories (table-query :categories)
           name-col   (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns categories))]
       (mt/with-temp [:model/Segment {segment-id :id} {:name       "Bars"
                                                       :table_id   (mt/id :categories)
                                                       :definition (lib/filter categories (lib/= name-col "Bar"))}
                      :model/Measure {measure-id :id} {:name       "Names"
                                                       :table_id   (mt/id :categories)
                                                       :definition (lib/aggregate categories (lib/distinct name-col))}]
         (let [mp           (mt/metadata-provider)
               with-segment #(lib/filter % (lib.metadata/segment mp segment-id))
               with-measure #(lib/aggregate % (lib.metadata/measure mp measure-id))]
           (testing "a segment or measure of an unpublished table is refused, even from a published table"
             (is (= (error-message :segments segment-id) (run-query 400 (with-segment (table-query :venues)))))
             (is (= (error-message :measures measure-id) (run-query 400 (with-measure (table-query :venues))))))
           (testing "a segment or measure of a published table runs"
             (data-apps.tu/with-published-tables! [(mt/id :categories)]
               (doseq [query [(with-segment categories) (with-measure categories)]]
                 (is (= "completed" (:status (run-query 202 query)))))))))))))

(deftest card-endpoints-run-app-card-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "the app's card runs, pivots and exports"
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 (format "card/%d/query" card-id)
                                                         as-data-app))))
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 (format "card/pivot/%d/query" card-id)
                                                         as-data-app))))
       (is (some? (mt/user-http-request :crowberto :post 200 (format "card/%d/query/csv" card-id) as-data-app))))
     (testing "by its entity ID too"
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202
                                                         (format "card/%s/query"
                                                                 (t2/select-one-fn :entity_id :model/Card :id card-id))
                                                         as-data-app))))))))

(deftest card-endpoints-refuse-other-cards-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
       (testing "a card outside the app's collection is refused"
         (is (= (card-error elsewhere-id)
                (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) as-data-app)))
         (is (= (card-error elsewhere-id)
                (mt/user-http-request :crowberto :post 400 (format "card/pivot/%d/query" elsewhere-id) as-data-app)))
         (is (= (card-error elsewhere-id)
                (mt/user-http-request :crowberto :post 400 (format "card/%d/query/csv" elsewhere-id) as-data-app))))
       (testing "an app without a collection runs no card, not even one in the root collection"
         (mt/with-temp [:model/DataApp app {:name "wasps"}]
           (t2/delete! :model/Collection (:resource_collection_id app))
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) (as-app "wasps"))))))
       (testing "an ID of no card is not found, as for any request"
         (is (= "Not found." (mt/user-http-request :crowberto :post 404 "card/999999999/query" as-data-app))))
       (testing "a request that is not a data app's still runs the card"
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202
                                                           (format "card/%d/query" elsewhere-id))))))))))

(defn- do-with-rename-action!
  "Call `f` with the ID of a temp query action, on no model, that renames a category to itself, in the collection with
  `collection-id`."
  [collection-id f]
  (mt/with-temp [:model/Action      {action-id :id} {:name          "Rename category"
                                                     :type          :query
                                                     :collection_id collection-id}
                 :model/QueryAction _               {:action_id     action-id
                                                     :database_id   (mt/id)
                                                     :dataset_query (lib/native-query
                                                                     (mt/metadata-provider)
                                                                     "UPDATE categories SET name = name WHERE id = 1")}]
    (f action-id)))

(deftest action-endpoints-run-app-action-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [collection-id]
       (do-with-rename-action!
        collection-id
        (fn [action-id]
          (testing "the app's action runs, and its values endpoint answers"
            (is (= {:rows-affected 1}
                   (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" action-id) as-data-app
                                         {:parameters {}})))
            (is (= {}
                   (mt/user-http-request :crowberto :post 200 (format "action/%d/execute/values" action-id)
                                         as-data-app {:parameters {}}))))
          (testing "by its entity ID too"
            (is (= {:rows-affected 1}
                   (mt/user-http-request :crowberto :post 200
                                         (format "action/%s/execute"
                                                 (t2/select-one-fn :entity_id :model/Action :id action-id))
                                         as-data-app
                                         {:parameters {}}))))))))))

(deftest action-endpoints-refuse-other-actions-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [_collection-id]
       (mt/with-temp [:model/Collection {elsewhere-collection-id :id} {:namespace :data-actions}]
         (do-with-rename-action!
          elsewhere-collection-id
          (fn [elsewhere-id]
            (testing "an action outside the app's collection is refused"
              (is (= (action-error elsewhere-id)
                     (mt/user-http-request :crowberto :post 400 (format "action/%d/execute" elsewhere-id) as-data-app
                                           {:parameters {}})))
              (is (= (action-error elsewhere-id)
                     (mt/user-http-request :crowberto :post 400 (format "action/%d/execute/values" elsewhere-id)
                                           as-data-app {:parameters {}}))))
            (testing "an ID of no action is not found, as for any request"
              (is (= "Not found." (mt/user-http-request :crowberto :post 404 "action/999999999/execute" as-data-app
                                                        {:parameters {}}))))
            (testing "a request that is not a data app's still runs the action"
              (is (= {:rows-affected 1}
                     (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" elsewhere-id)
                                           {:parameters {}})))))))))))

(deftest dashboard-endpoints-are-outside-data-app-scope-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                    :model/DashboardCard {dashcard-id :id}  {:dashboard_id dashboard-id :card_id card-id}]
       (testing "a data app cannot read a dashboard or run its cards"
         (mt/user-http-request :crowberto :get 403 (format "dashboard/%d" dashboard-id) as-data-app)
         (mt/user-http-request :crowberto :post 403
                               (format "dashboard/%d/dashcard/%d/card/%d/query" dashboard-id dashcard-id card-id)
                               as-data-app))
       (testing "a request that is not a data app's still runs the dashboard's card"
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202
                                                           (format "dashboard/%d/dashcard/%d/card/%d/query"
                                                                   dashboard-id dashcard-id card-id))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app's queries are not checked"
    (mt/with-premium-features #{}
      (is (= "completed" (:status (run-query 202 (lib/limit (data-apps.tu/venues-query) 1))))))))
