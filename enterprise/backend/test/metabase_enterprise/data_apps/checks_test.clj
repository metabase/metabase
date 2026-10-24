(ns metabase-enterprise.data-apps.checks-test
  "The checks that hold a data app's requests to the resources of its own app, through the endpoints that run them."
  (:require
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
  "Request options that mark a request as the data app's of [[do-with-app-collection]]."
  (as-app "birds"))

(defn- run-query
  "The response to a data app's request to run `query` through `POST /api/dataset`, expecting `status`."
  ([status query]
   (run-query status query as-data-app))
  ([status query options]
   (mt/user-http-request :crowberto :post status "dataset" options query)))

(defn- card-query
  "A query whose source is the card with `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- categories-query
  "A query of the CATEGORIES table, which VENUES points to through a foreign key."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :categories)))))

(defn- join
  "`query` joined to `joinable`, on the conditions the foreign keys suggest."
  [query joinable]
  (lib/join query (lib/join-clause joinable)))

(defn- do-with-app-card!
  "Call `f` with the ID of a card on VENUES in the collection of the data app of [[do-with-app-collection]], and with
  that collection's ID."
  [f]
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {card-id :id} {:name          "Venues"
                                                 :collection_id collection-id
                                                 :dataset_query (data-apps.tu/venues-query)}]
         (f card-id collection-id))))))

(deftest app-question-runs-test
  (do-with-app-card!
   (fn [card-id collection-id]
     (let [query (lib/limit (card-query card-id) 1)]
       (testing "a query on the app's card runs, pivots and has metadata"
         (is (= "completed" (:status (run-query 202 query))))
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset/pivot" as-data-app
                                                           (lib/aggregate query (lib/count))))))
         (is (seq (:tables (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app query)))))
       (testing "an export, which a form submission sends with its query as a JSON string"
         (is (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                   (assoc-in as-data-app [:request-options :content-type]
                                             "application/x-www-form-urlencoded")
                                   {:query (json/encode (lib/->legacy-MBQL query))})))
       (testing "a join of another card of the app runs"
         (data-apps.tu/with-published-tables! [(mt/id :categories)]
           (mt/with-temp [:model/Card {categories-id :id} {:name          "Categories"
                                                           :collection_id collection-id
                                                           :dataset_query (categories-query)}]
             (is (= "completed" (:status (run-query 202 (-> (card-query card-id)
                                                            (join (lib.metadata/card (mt/metadata-provider) categories-id))
                                                            (lib/limit 1)))))))))))))

(deftest app-must-be-named-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a data app's request that names no app, or an app that doesn't exist, is refused"
       (doseq [options [(as-app nil) (as-app "no-such-app")]]
         (is (re-find #"must name a data app" (run-query 403 (card-query card-id) options))))))))

(deftest tables-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a query on a table, even one the app's cards read, is refused"
       (is (re-find #"not tables" (run-query 403 (data-apps.tu/venues-query)))))
     (testing "a join of a table is refused"
       (is (re-find #"not tables" (run-query 403 (join (card-query card-id)
                                                       (lib.metadata/table (mt/metadata-provider) (mt/id :categories))))))))))

(deftest other-questions-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/DataApp {other-collection-id :resource_collection_id} {:name         "bees"
                                                                                  :display_name "Bees"
                                                                                  :bundle_path  "bees.js"}
                    :model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}
                    :model/Card {categories-id :id} {:name "Categories elsewhere" :dataset_query (categories-query)}
                    :model/Card {other-app-id :id} {:name          "Venues of bees"
                                                    :collection_id other-collection-id
                                                    :dataset_query (data-apps.tu/venues-query)}]
       (testing "a card outside the app's collection, or of another app, is refused"
         (doseq [[other-id label] [[elsewhere-id "Venues elsewhere"]
                                   [other-app-id "Venues of bees"]]]
           (is (= (format "A data app can use only the cards of its own app, not \"%s\" (%d)." label other-id)
                  (run-query 403 (card-query other-id))))))
       (testing "the other app runs its own card"
         (is (= "completed" (:status (run-query 202 (lib/limit (card-query other-app-id) 1) (as-app "bees"))))))
       (testing "a join of a card outside the app's collection is refused"
         (is (re-find #"Categories elsewhere"
                      (run-query 403 (join (card-query card-id)
                                           (lib.metadata/card (mt/metadata-provider) categories-id))))))))))

(deftest native-query-is-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (testing "in its MBQL 5, legacy and nested legacy forms"
       (doseq [query [(lib/native-query (mt/metadata-provider) "SELECT * FROM VENUES")
                      {:database (mt/id) :type :native :native {:query "SELECT * FROM VENUES"}}
                      {:database (mt/id)
                       :type     :query
                       :query    {:source-query {:native "SELECT * FROM VENUES"}}}]]
         (is (re-find #"not SQL" (run-query 403 query)))))
     (testing "a request that is not a data app's still runs native SQL"
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset"
                                                         (lib/native-query (mt/metadata-provider) "SELECT 1")))))))))

(deftest query-with-parameters-is-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (let [parameters [{:id     "x"
                        :type   :category
                        :target [:dimension (lib/->legacy-MBQL
                                             (lib/ref (lib.metadata/field (mt/metadata-provider) (mt/id :venues :name))))]
                        :value  ["Bar"]}]]
       (testing "at the top of the query"
         (is (re-find #"without parameters"
                      (run-query 403 (assoc (lib/->legacy-MBQL (card-query card-id)) :parameters parameters)))))
       (testing "on a stage"
         (is (re-find #"without parameters"
                      (run-query 403 (assoc-in (card-query card-id) [:stages 0 :parameters] parameters)))))))))

(deftest query-on-no-database-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (testing "a query on a database that doesn't exist is refused"
       (is (re-find #"on a database" (run-query 403 (assoc (data-apps.tu/venues-query) :database 999999999))))))))

(deftest metrics-outside-the-app-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (testing "a Library metric that isn't a question of the app is refused"
          (is (re-find #"Venue count"
                       (run-query 403 (lib/aggregate (card-query card-id)
                                                     (lib.metadata/metric (mt/metadata-provider) metric-id)))))))))))

(defn- form-download
  "The response to a data app's form submission to `POST /api/card/:id/query/csv` for the card with `card-id`, with
  `parameters` as a JSON string, expecting `status`."
  [status card-id parameters]
  (mt/user-http-request :crowberto :post status (format "card/%d/query/csv" card-id)
                        (assoc-in as-data-app [:request-options :content-type] "application/x-www-form-urlencoded")
                        {:parameters parameters}))

(deftest card-endpoints-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/Card {other-id :id other-eid :entity_id} {:name          "Venues elsewhere"
                                                                     :dataset_query (data-apps.tu/venues-query)}
                    :model/Dashboard {dashboard-id :id} {:name "Venues"}]
       (let [card-eid (t2/select-one-fn :entity_id :model/Card :id card-id)
             request  (fn [method status path & [body]]
                        (if body
                          (mt/user-http-request :crowberto method status path as-data-app body)
                          (mt/user-http-request :crowberto method status path as-data-app)))]
         (testing "the app's question is read, by ID or entity ID, with its metadata, and run, pivoted and downloaded"
           (is (= card-id (:id (request :get 200 (str "card/" card-id)))))
           (is (= card-id (:id (request :get 200 (str "card/" card-eid)))))
           (is (request :get 200 (format "card/%d/query_metadata" card-id)))
           (is (= "completed" (:status (request :post 202 (format "card/%d/query" card-id)))))
           (is (= "completed" (:status (request :post 202 (format "card/pivot/%d/query" card-id)))))
           (is (form-download 200 card-id "[]")))
         (testing "a question outside the app's collection is neither read nor run, by ID or entity ID"
           (doseq [[method path] [[:get (str "card/" other-id)]
                                  [:get (str "card/" other-eid)]
                                  [:get (format "card/%d/query_metadata" other-id)]
                                  [:post (format "card/%d/query" other-id)]
                                  [:post (format "card/pivot/%d/query" other-id)]]]
             (is (re-find #"Venues elsewhere" (request method 403 path)) path))
           (is (re-find #"Venues elsewhere" (form-download 403 other-id "[]"))))
         (testing "a card that doesn't exist is left to the endpoint's 404, by ID or entity ID"
           (request :get 404 "card/999999999")
           (request :get 404 "card/AbCdEfGhIjKlMnOpQrStU"))
         (testing "the app's question isn't run with parameters, in a dashboard, as a collection preview or from a stored result"
           (doseq [body [{:dashboard_id dashboard-id}
                         {:collection_preview true}
                         {:stored_result_id 1}
                         {:parameters [{:id "x" :type :category :target [:variable [:template-tag "x"]] :value "Bar"}]}]]
             (is (re-find #"as it is saved" (request :post 403 (format "card/%d/query" card-id) body))))
           (is (re-find #"as it is saved" (form-download 403 card-id (json/encode [{:id     "x"
                                                                                    :type   :category
                                                                                    :target [:variable [:template-tag "x"]]
                                                                                    :value  "Bar"}]))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app runs nothing"
    (mt/with-premium-features #{}
      (is (re-find #"aren't available" (run-query 403 (data-apps.tu/venues-query)))))))
