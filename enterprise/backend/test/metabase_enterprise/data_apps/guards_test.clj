(ns metabase-enterprise.data-apps.guards-test
  "The rules the data-app route guards hold a data app's requests to, the resources of its own app, through the
  endpoints they guard."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

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

(defn- join-on-id
  "`query` with a join of `joinable` on equal `ID` columns."
  [query joinable]
  (let [id-column (fn [columns] (some #(when (= "ID" (:name %)) %) columns))]
    (lib/join query (lib/join-clause joinable [(lib/= (id-column (lib/join-condition-lhs-columns query joinable nil nil))
                                                      (id-column (lib/join-condition-rhs-columns query joinable nil nil)))]))))

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
   (fn [card-id _collection-id]
     (let [query (lib/limit (card-query card-id) 1)]
       (testing "a query on the app's question runs, pivots and has metadata"
         (is (= "completed" (:status (run-query 202 query))))
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset/pivot" as-data-app
                                                           (lib/aggregate query (lib/count))))))
         (is (seq (:tables (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app query)))))
       (testing "an export, which a form submission sends with its query as a JSON string"
         (is (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                   (assoc-in as-data-app [:request-options :content-type]
                                             "application/x-www-form-urlencoded")
                                   {:query (json/encode (lib/->legacy-MBQL query))})))
       (testing "a join of another question of the app runs"
         (is (= "completed" (:status (run-query 202 (-> (card-query card-id)
                                                        (join-on-id (lib.metadata/card (mt/metadata-provider) card-id))
                                                        (lib/limit 1)))))))))))

(deftest app-must-be-named-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a data app's request that names no app, or an app that doesn't exist, is refused"
       (doseq [options [(as-app nil) (as-app "no-such-app")]]
         (is (re-find #"must name a data app" (run-query 403 (card-query card-id) options))))))))

(deftest tables-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a query on a table, even one the app's questions read, is refused"
       (is (re-find #"not tables" (run-query 403 (data-apps.tu/venues-query)))))
     (testing "a join of a table is refused"
       (is (re-find #"not tables" (run-query 403 (join-on-id (card-query card-id)
                                                             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))))))))

(deftest other-questions-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/DataApp {other-collection-id :resource_collection_id} {:name         "bees"
                                                                                  :display_name "Bees"
                                                                                  :bundle_path  "bees.js"}
                    :model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}
                    :model/Card {other-app-id :id} {:name          "Venues of bees"
                                                    :collection_id other-collection-id
                                                    :dataset_query (data-apps.tu/venues-query)}]
       (testing "a question outside the app's collection, or of another app, is refused"
         (doseq [[other-id label] [[elsewhere-id "Venues elsewhere"]
                                   [other-app-id "Venues of bees"]]]
           (is (= (format "A data app can use only the cards of its own app, not \"%s\" (%d)." label other-id)
                  (run-query 403 (card-query other-id))))))
       (testing "the other app runs its own question"
         (is (= "completed" (:status (run-query 202 (lib/limit (card-query other-app-id) 1) (as-app "bees"))))))
       (testing "a join of a question outside the app's collection is refused"
         (is (re-find #"Venues elsewhere"
                      (run-query 403 (join-on-id (card-query card-id)
                                                 (lib.metadata/card (mt/metadata-provider) elsewhere-id))))))))))

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
     (let [parameters [{:type   :category
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
     (testing "a query on a database that doesn't exist, or that isn't a query, is refused"
       (doseq [query [(assoc (data-apps.tu/venues-query) :database 999999999)
                      {:database (mt/id) :stages "nonsense"}]]
         (is (re-find #"on a database|valid queries" (run-query 403 query))))))))

(deftest metrics-outside-the-app-are-refused-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (testing "a Library metric that isn't a question of the app is refused"
          (is (re-find #"Venue count"
                       (run-query 403 (lib/aggregate (card-query card-id)
                                                     (lib.metadata/metric (mt/metadata-provider) metric-id)))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app runs nothing"
    (mt/with-premium-features #{}
      (is (re-find #"aren't available" (run-query 403 (data-apps.tu/venues-query)))))))
