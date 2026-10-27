(ns metabase-enterprise.data-apps.checks-test
  "The checks that hold a data app's ad-hoc queries and card runs to its own cards and the Library, and its action runs
  to its own actions, through the endpoints that run them."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.collections.core :as collections]
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
   :measures "A data app can use only measures of tables published to the Library, not the measures %s."
   :actions  "A data app can run only the actions of its own app, not the actions %s."})

(defn- error-message
  "The error message for a data app's use of the entities of `kind` with `ids`."
  [kind & ids]
  (format (error-formats kind) (str/join ", " (sort ids))))

(defn- card-error
  "The error message for a data app's run of the card with `card-id`."
  [card-id]
  (format "A data app can use only the cards in its own collection and in the Library, not the card %d." card-id))

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
     (testing "a data app's request that names no app, or an app that doesn't exist, is not found"
       (doseq [options [(as-app nil) (as-app "no-such-app")]]
         (is (= "Not found." (run-query 404 (card-query card-id) options)))))
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

(deftest app-without-collection-uses-no-card-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/DataApp app             {:name "wasps"}
                    :model/Card    {elsewhere-id :id} {:dataset_query (data-apps.tu/venues-query)}]
       (t2/delete! :model/Collection (:resource_collection_id app))
       (testing "an app without a collection can use no card, not even one in the root collection"
         (is (= (error-message :cards elsewhere-id)
                (run-query 400 (card-query elsewhere-id) (as-app "wasps")))))
       (testing "it still reads published tables"
         (is (= "completed" (:status (run-query 202 (lib/limit (table-query :venues) 1) (as-app "wasps"))))))))))

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
   (fn [card-id _collection-id]
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
                                                 (lib.metadata/metric (mt/metadata-provider) outside-id))))))))))))

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

(deftest card-read-endpoints-check-card-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
       (testing "the app's card and its metadata are readable"
         (is (=? {:id card-id} (mt/user-http-request :crowberto :get 200 (format "card/%d" card-id) as-data-app)))
         (is (map? (mt/user-http-request :crowberto :get 200 (format "card/%d/query_metadata" card-id) as-data-app)))
         (is (=? {:id (str "card__" card-id)}
                 (mt/user-http-request :crowberto :get 200 (format "table/card__%d/query_metadata" card-id) as-data-app))))
       (testing "a card outside the app's collection is refused"
         (doseq [url ["card/%d" "card/%d/query_metadata" "table/card__%d/query_metadata"]]
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :get 400 (format url elsewhere-id) as-data-app))
               url)))
       (testing "a request that is not a data app's still reads it"
         (is (=? {:id elsewhere-id} (mt/user-http-request :crowberto :get 200 (format "card/%d" elsewhere-id)))))))))

(def ^:private static-parameter
  "A parameter whose values are a static list, so loading them runs no query."
  {:id                   "kind"
   :slug                 "kind"
   :name                 "Kind"
   :type                 :string/=
   :values_source_type   :static-list
   :values_source_config {:values ["bar" "cafe"]}})

(deftest card-parameter-endpoints-check-card-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {app-card-id :id}   {:collection_id collection-id
                                                       :parameters    [static-parameter]
                                                       :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {elsewhere-id :id} {:parameters    [static-parameter]
                                                      :dataset_query (data-apps.tu/venues-query)}]
         (testing "the app's card loads its parameter values"
           (is (=? {:values [["bar"] ["cafe"]]}
                   (mt/user-http-request :crowberto :get 200 (format "card/%d/params/kind/values" app-card-id) as-data-app)))
           (is (=? {:values [["cafe"]]}
                   (mt/user-http-request :crowberto :get 200 (format "card/%d/params/kind/search/caf" app-card-id)
                                         as-data-app))))
         (testing "a card outside the app's collection is refused"
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :get 400 (format "card/%d/params/kind/values" elsewhere-id) as-data-app)))
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :get 400 (format "card/%d/params/kind/search/caf" elsewhere-id)
                                        as-data-app)))
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :get 400 (format "card/%d/params/kind/remapping?value=bar" elsewhere-id)
                                        as-data-app))))
         (testing "a request that is not a data app's still loads the card's parameter values"
           (is (=? {:values [["bar"] ["cafe"]]}
                   (mt/user-http-request :crowberto :get 200 (format "card/%d/params/kind/values" elsewhere-id))))))))))

(defn- legacy-field-ref
  "The legacy ref of the field with `field-id`, as parameters store it."
  [field-id]
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (lib/ref (lib.metadata/field mp field-id)))))

(defn- card-source-parameter
  "A parameter whose values come from the names of the venues card with `card-id`."
  [card-id]
  {:id                   "venue"
   :slug                 "venue"
   :name                 "Venue"
   :type                 :string/=
   :values_source_type   :card
   :values_source_config {:card_id card-id :value_field (legacy-field-ref (mt/id :venues :name))}})

(deftest card-endpoints-allow-library-metrics-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (testing "a Library metric, its metadata and its run are open to a data app"
          (is (=? {:id metric-id} (mt/user-http-request :crowberto :get 200 (format "card/%d" metric-id) as-data-app)))
          (is (map? (mt/user-http-request :crowberto :get 200 (format "card/%d/query_metadata" metric-id) as-data-app)))
          (is (=? {:id (str "card__" metric-id)}
                  (mt/user-http-request :crowberto :get 200 (format "table/card__%d/query_metadata" metric-id) as-data-app)))
          (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 (format "card/%d/query" metric-id)
                                                            as-data-app)))))
        (mt/with-temp [:model/Card {outside-id :id} {:name          "Venue count elsewhere"
                                                     :type          :metric
                                                     :database_id   (mt/id)
                                                     :dataset_query (lib/aggregate (data-apps.tu/venues-query) (lib/count))}]
          (testing "a metric outside the Library is refused"
            (doseq [url ["card/%d" "card/%d/query_metadata" "table/card__%d/query_metadata"]]
              (is (= (card-error outside-id)
                     (mt/user-http-request :crowberto :get 400 (format url outside-id) as-data-app))
                  url))))
        (let [library-id    (:id (collections/library-collection))
              dashboards-id (t2/select-one-pk :model/Collection
                                              :location (str "/" library-id "/")
                                              :type     collections/library-dashboards-collection-type)]
          (mt/with-temp [:model/Dashboard dashboard     {:collection_id dashboards-id}
                         :model/Card      {question-id :id} {:collection_id dashboards-id
                                                             :dashboard_id  (:id dashboard)
                                                             :dataset_query (data-apps.tu/venues-query)}]
            (testing "a dashboard question in the Library is open to the card endpoints"
              (is (=? {:id question-id} (mt/user-http-request :crowberto :get 200 (format "card/%d" question-id) as-data-app)))
              (is (=? {:id (str "card__" question-id)}
                      (mt/user-http-request :crowberto :get 200 (format "table/card__%d/query_metadata" question-id)
                                            as-data-app))))
            (testing "but not as a source of parameter values"
              (is (= (format "A data app cannot take parameter values from the dashboard question %d." question-id)
                     (mt/user-http-request :crowberto :post 400 "dataset/parameter/values" as-data-app
                                           {:parameter (card-source-parameter question-id)}))))
            (testing "nor as a source card of a query"
              (is (= (error-message :cards question-id)
                     (run-query 400 (card-query question-id))))))))))))

(deftest adhoc-parameter-endpoints-check-values-source-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {source-id :id}    {:collection_id collection-id
                                                      :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {elsewhere-id :id} {:dataset_query (data-apps.tu/venues-query)}]
         (testing "a static list loads as is"
           (is (=? {:values [["bar"] ["cafe"]]}
                   (mt/user-http-request :crowberto :post 200 "dataset/parameter/values" as-data-app
                                         {:parameter static-parameter}))))
         (testing "values from a card of the app load, from any other card are refused"
           (is (seq (:values (mt/user-http-request :crowberto :post 200 "dataset/parameter/values" as-data-app
                                                   {:parameter (card-source-parameter source-id)}))))
           (doseq [[url body] [["dataset/parameter/values" {}]
                               ["dataset/parameter/search/Red" {}]
                               ["dataset/parameter/remapping" {:value "Red"}]]]
             (is (= (card-error elsewhere-id)
                    (mt/user-http-request :crowberto :post 400 url as-data-app
                                          (assoc body :parameter (card-source-parameter elsewhere-id))))
                 url)))
         (let [parameter {:id "name" :type :string/=}]
           (testing "values from a field of a published table load, from any other field are refused"
             (is (seq (:values (mt/user-http-request :crowberto :post 200 "dataset/parameter/values" as-data-app
                                                     {:parameter parameter :field_ids [(mt/id :venues :name)]}))))
             (doseq [[url body] [["dataset/parameter/values" {}]
                                 ["dataset/parameter/search/Red" {}]
                                 ["dataset/parameter/remapping" {:value "Red"}]]]
               (is (= (format "A data app can read only fields of tables published to the Library, not the field %d."
                              (mt/id :categories :name))
                      (mt/user-http-request :crowberto :post 400 url as-data-app
                                            (assoc body :parameter parameter :field_ids [(mt/id :categories :name)])))
                   url)))
           (testing "a request that is not a data app's still loads the values of any field"
             (is (seq (:values (mt/user-http-request :crowberto :post 200 "dataset/parameter/values"
                                                     {:parameter parameter :field_ids [(mt/id :categories :name)]})))))))))))

(deftest card-parameter-endpoints-check-values-source-card-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {source-id :id} {:collection_id collection-id
                                                   :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {card-id :id}   {:collection_id collection-id
                                                   :parameters    [(card-source-parameter source-id)]
                                                   :dataset_query (data-apps.tu/venues-query)}]
         (testing "a parameter whose values come from a card of the app loads them"
           (is (seq (:values (mt/user-http-request :crowberto :get 200 (format "card/%d/params/venue/values" card-id)
                                                   as-data-app)))))
         (testing "a parameter whose values come from a card outside the app's collection is refused"
           (t2/update! :model/Card source-id {:collection_id nil})
           (doseq [url ["card/%d/params/venue/values" "card/%d/params/venue/search/Red" "card/%d/params/venue/remapping?value=Red"]]
             (is (= (card-error source-id)
                    (mt/user-http-request :crowberto :get 400 (format url card-id) as-data-app))
                 url))))))))

(defn- field-parameter
  "A parameter whose values come from the field with `field-id`."
  [field-id]
  {:id     "field"
   :slug   "field"
   :name   "Field"
   :type   :string/=
   :target [:dimension (legacy-field-ref field-id)]})

(deftest card-parameter-endpoints-check-values-source-field-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {published-id :id}   {:collection_id collection-id
                                                        :parameters    [(field-parameter (mt/id :venues :name))]
                                                        :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {unpublished-id :id} {:collection_id collection-id
                                                        :parameters    [(field-parameter (mt/id :checkins :date))]
                                                        :dataset_query (data-apps.tu/venues-query)}]
         (testing "a parameter whose values come from a field of a published table loads them"
           (is (seq (:values (mt/user-http-request :crowberto :get 200 (format "card/%d/params/field/values" published-id)
                                                   as-data-app)))))
         (testing "a parameter whose values come from a field of an unpublished table is refused"
           (is (= (format "A data app can read only fields of tables published to the Library, not the field %d."
                          (mt/id :checkins :date))
                  (mt/user-http-request :crowberto :get 400 (format "card/%d/params/field/values" unpublished-id)
                                        as-data-app)))))))))

(deftest refusal-names-large-id-without-grouping-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/Card {elsewhere-id :id} {:id 1234567 :dataset_query (data-apps.tu/venues-query)}]
       (testing "an ID of a thousand or more appears as it is, not as 1,234,567"
         (is (= "A data app can use only the cards in its own collection and in the Library, not the card 1234567."
                (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) as-data-app))))))))

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

(deftest app-action-runs-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [collection-id]
       (do-with-rename-action!
        collection-id
        (fn [action-id]
          (testing "the app's action runs, and its values load"
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

(deftest other-action-runs-are-refused-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [_collection-id]
       (mt/with-temp [:model/Collection {elsewhere-collection-id :id} {:namespace :data-actions}]
         (do-with-rename-action!
          elsewhere-collection-id
          (fn [elsewhere-id]
            (testing "an action outside the app's collection, or of no action at all, is refused alike"
              (doseq [other-id [elsewhere-id 999999999]]
                (is (= (error-message :actions other-id)
                       (mt/user-http-request :crowberto :post 400 (format "action/%d/execute" other-id) as-data-app
                                             {:parameters {}})))
                (is (= (error-message :actions other-id)
                       (mt/user-http-request :crowberto :post 400 (format "action/%d/execute/values" other-id)
                                             as-data-app {:parameters {}})))))
            (testing "a request that is not a data app's still runs the action"
              (is (= {:rows-affected 1}
                     (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" elsewhere-id)
                                           {:parameters {}})))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app's queries are not checked"
    (mt/with-premium-features #{}
      (is (= "completed" (:status (run-query 202 (lib/limit (data-apps.tu/venues-query) 1))))))))
