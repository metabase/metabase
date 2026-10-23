(ns metabase-enterprise.data-apps.rules-test
  "The Library-only rules the data-app route guards hold a data app's requests to, through the endpoints they guard."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private as-data-app
  "Request options that mark a request as a data app's."
  {:request-options {:headers {"x-metabase-client" "data-app"}}})

(defn- run-query
  "The response to a data app's request to run `query` through `POST /api/dataset`, expecting `status`."
  [status query]
  (mt/user-http-request :crowberto :post status "dataset" as-data-app query))

(defn- card-query
  "A query whose source is the card with `card-id`."
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(deftest query-on-library-tables-runs-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (is (= "completed" (:status (run-query 202 (data-apps.tu/venues-query)))))))))

(deftest native-query-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (testing "in its MBQL 5, legacy and nested legacy forms"
         (doseq [query [(lib/native-query (mt/metadata-provider) "SELECT * FROM VENUES")
                        {:database (mt/id) :type :native :native {:query "SELECT * FROM VENUES"}}
                        {:database (mt/id)
                         :type     :query
                         :query    {:source-query {:native "SELECT * FROM VENUES"}}}]]
           (is (re-find #"not SQL" (run-query 403 query)))))
       (testing "a request that is not a data app's still runs native SQL"
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset"
                                                           (lib/native-query (mt/metadata-provider) "SELECT 1"))))))))))

(deftest unpublished-table-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (testing "read directly"
         (let [mp (mt/metadata-provider)]
           (is (= "A data app can read only tables published to the Library, not CHECKINS."
                  (run-query 403 (lib/query mp (lib.metadata/table mp (mt/id :checkins))))))))
       (testing "reached through a foreign key"
         (let [query    (data-apps.tu/venues-query)
               category (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns query))]
           (is (re-find #"not CATEGORIES" (run-query 403 (lib/filter query (lib/= category "Bar")))))))))))

(deftest query-with-parameters-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (let [parameters [{:type   :category
                          :target [:dimension (lib/->legacy-MBQL
                                               (lib/ref (lib.metadata/field (mt/metadata-provider) (mt/id :venues :name))))]
                          :value  ["Bar"]}]]
         (testing "at the top of the query"
           (is (re-find #"without parameters"
                        (run-query 403 (assoc (lib/->legacy-MBQL (data-apps.tu/venues-query)) :parameters parameters)))))
         (testing "on a stage"
           (is (re-find #"without parameters"
                        (run-query 403 (assoc-in (data-apps.tu/venues-query) [:stages 0 :parameters] parameters))))))))))

(deftest query-on-no-database-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (testing "a query on a database that doesn't exist, or that isn't a query, is refused"
       (doseq [query [(assoc (data-apps.tu/venues-query) :database 999999999)
                      {:database (mt/id) :stages "nonsense"}]]
         (is (re-find #"on a database|valid queries" (run-query 403 query))))))))

(deftest cards-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {app-card-id :id} {:name          "Venues"
                                                     :collection_id collection-id
                                                     :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {other-card-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
         (testing "a data app's card runs as a source"
           (is (= "completed" (:status (run-query 202 (lib/limit (card-query app-card-id) 1))))))
         (testing "a card outside data apps' collections is refused"
           (is (= (format "A data app can read only the cards of data apps and the metrics in the Library, not \"Venues elsewhere\" (%d)."
                          other-card-id)
                  (run-query 403 (card-query other-card-id)))))
         (testing "a data app's card whose table is no longer published is refused"
           (t2/update! :model/TableUserSettings :table_id (mt/id :venues) {:is_published false})
           (is (re-find #"not VENUES" (run-query 403 (card-query app-card-id))))))))))

(deftest library-metric-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id model-id]}]
        (data-apps.tu/with-published-tables! [(mt/id :venues)]
          (let [mp (mt/metadata-provider)]
            (testing "a Library metric is aggregated"
              (is (= "completed" (:status (run-query 202 (lib/aggregate (data-apps.tu/venues-query)
                                                                        (lib.metadata/metric mp metric-id)))))))
            (testing "a model outside data apps' collections is refused"
              (is (re-find #"Venues model" (run-query 403 (card-query model-id)))))))
        (testing "an archived Library metric is refused"
          (data-apps.tu/with-published-tables! [(mt/id :venues)]
            (t2/update! :model/Card metric-id {:archived true})
            (is (re-find #"Venue count" (run-query 403 (lib/aggregate (data-apps.tu/venues-query)
                                                                      (lib.metadata/metric (mt/metadata-provider) metric-id)))))
            (t2/update! :model/Card metric-id {:archived false})))
        (testing "a Library metric on a table that isn't published is refused"
          (is (re-find #"not VENUES" (run-query 403 (lib/aggregate (data-apps.tu/venues-query)
                                                                   (lib.metadata/metric (mt/metadata-provider) metric-id)))))))))))

(defn- export
  "The response to a data app's form submission of `query` to `POST /api/dataset/csv`, expecting `status`."
  [status query]
  (mt/user-http-request :crowberto :post status "dataset/csv"
                        (assoc-in as-data-app [:request-options :content-type] "application/x-www-form-urlencoded")
                        {:query (json/encode (lib/->legacy-MBQL query))}))

(deftest other-query-endpoints-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (let [mp       (mt/metadata-provider)
             checkins (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
             venues   (lib/limit (data-apps.tu/venues-query) 1)]
         (testing "an export, which a form submission sends with its query as a JSON string"
           (is (export 200 venues))
           (is (re-find #"not CHECKINS" (export 403 checkins))))
         (testing "a pivot, the metadata and the SQL of a query on published tables"
           (is (mt/user-http-request :crowberto :post 202 "dataset/pivot" as-data-app
                                     (lib/aggregate venues (lib/count))))
           (is (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app
                                     (lib/->legacy-MBQL venues)))
           (is (mt/user-http-request :crowberto :post 200 "dataset/native" as-data-app
                                     (assoc (lib/->legacy-MBQL venues) :pretty false))))
         (doseq [endpoint ["dataset/pivot" "dataset/native" "dataset/query_metadata"]]
           (testing endpoint
             (is (re-find #"not CHECKINS" (mt/user-http-request :crowberto :post 403 endpoint as-data-app
                                                                (lib/->legacy-MBQL checkins)))))))))))

(defn- form-download
  "The response to a data app's form submission to `POST /api/card/:id/query/csv` for the card with `card-id`, with
  `parameters` as a JSON string, expecting `status`."
  [status card-id parameters]
  (mt/user-http-request :crowberto :post status (format "card/%d/query/csv" card-id)
                        (assoc-in as-data-app [:request-options :content-type] "application/x-www-form-urlencoded")
                        {:parameters parameters}))

(deftest card-endpoints-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {app-card-id :id app-card-eid :entity_id} {:name          "Venues"
                                                                             :collection_id collection-id
                                                                             :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {other-card-id :id other-card-eid :entity_id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}
                      :model/Dashboard {dashboard-id :id} {:name "Venues"}]
         (let [request (fn [method status path & [body]]
                         (if body
                           (mt/user-http-request :crowberto method status path as-data-app body)
                           (mt/user-http-request :crowberto method status path as-data-app)))]
           (testing "a data app's card is read, by ID or entity ID, and run"
             (is (= app-card-id (:id (request :get 200 (str "card/" app-card-id)))))
             (is (= app-card-id (:id (request :get 200 (str "card/" app-card-eid)))))
             (is (request :get 200 (format "card/%d/query_metadata" app-card-id)))
             (is (= "completed" (:status (request :post 202 (format "card/%d/query" app-card-id))))))
           (testing "a card outside data apps' collections is neither read nor run"
             (is (re-find #"Venues elsewhere" (request :get 403 (str "card/" other-card-id))))
             (is (re-find #"Venues elsewhere" (request :post 403 (format "card/%d/query" other-card-id))))
             (is (re-find #"Venues elsewhere" (request :post 403 (format "card/pivot/%d/query" other-card-id)))))
           (testing "a card that doesn't exist is left to the endpoint's 404"
             (request :get 404 "card/999999999"))
           (testing "a data app's card isn't run with parameters, in a dashboard, as a collection preview or from a stored result"
             (doseq [body [{:dashboard_id dashboard-id}
                           {:collection_preview true}
                           {:stored_result_id 1}
                           {:parameters [{:type :category :target [:variable [:template-tag "x"]] :value "Bar"}]}]]
               (is (re-find #"as it is saved" (request :post 403 (format "card/%d/query" app-card-id) body))))
             (is (re-find #"as it is saved" (request :post 403 (format "card/pivot/%d/query" app-card-id)
                                                     {:dashboard_id dashboard-id}))))
           (testing "a data app downloads its card from a form, and not with parameters"
             (is (form-download 200 app-card-id "[]"))
             (is (re-find #"as it is saved" (form-download 403 app-card-id (json/encode [{:type   :category
                                                                                          :target [:variable [:template-tag "x"]]
                                                                                          :value  "Bar"}])))))
           (testing "a card outside data apps' collections isn't read by entity ID, its metadata or its download"
             (is (re-find #"Venues elsewhere" (request :get 403 (str "card/" other-card-eid))))
             (is (re-find #"Venues elsewhere" (request :get 403 (format "card/%d/query_metadata" other-card-id))))
             (is (re-find #"Venues elsewhere" (form-download 403 other-card-id "[]"))))
           (testing "a card that doesn't exist is left to the endpoint's 404 by entity ID too"
             (request :get 404 "card/AbCdEfGhIjKlMnOpQrStU"))
           (testing "a card's parameter values are refused until their rule comes"
             (request :get 403 (format "card/%d/params/x/values" app-card-id)))
           (testing "a data app's card whose table is no longer published is refused"
             (t2/update! :model/TableUserSettings :table_id (mt/id :venues) {:is_published false})
             (is (re-find #"not VENUES" (request :get 403 (str "card/" app-card-id)))))))))))

(deftest library-metric-card-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (data-apps.tu/with-published-tables! [(mt/id :venues)]
          (testing "a data app reads a Library metric"
            (is (= metric-id (:id (mt/user-http-request :crowberto :get 200 (str "card/" metric-id) as-data-app))))
            (is (mt/user-http-request :crowberto :get 200 (format "card/%d/query_metadata" metric-id) as-data-app)))
          (mt/with-temp [:model/Card {app-card-id :id} {:name          "Venue count"
                                                        :collection_id collection-id
                                                        :dataset_query (lib/aggregate (data-apps.tu/venues-query)
                                                                                      (lib.metadata/metric (mt/metadata-provider) metric-id))}]
            (testing "a data app's card on a metric that leaves the Library is refused"
              (t2/update! :model/Card metric-id {:collection_id nil})
              (is (re-find #"Venue count" (mt/user-http-request :crowberto :get 403 (str "card/" app-card-id) as-data-app)))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app runs nothing"
    (mt/with-premium-features #{}
      (is (re-find #"aren't available" (run-query 403 (data-apps.tu/venues-query)))))))
