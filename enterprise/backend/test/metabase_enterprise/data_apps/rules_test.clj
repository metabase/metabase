(ns metabase-enterprise.data-apps.rules-test
  "The Library-only rules the data-app route guards hold a data app's requests to, through the endpoints they guard."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.data-apps.guards.dashboard :as guards.dashboard]
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
           (testing "a data app's card isn't run in a dashboard, as a collection preview or from a stored result"
             (doseq [body [{:dashboard_id dashboard-id}
                           {:collection_preview true}
                           {:stored_result_id 1}]]
               (is (re-find #"as it is saved" (request :post 403 (format "card/%d/query" app-card-id) body))))
             (is (re-find #"as it is saved" (request :post 403 (format "card/pivot/%d/query" app-card-id)
                                                     {:dashboard_id dashboard-id}))))
           (testing "a data app downloads its card from a form, and not with parameters"
             (is (form-download 200 app-card-id "[]"))
             (is (re-find #"as it is saved" (form-download 403 app-card-id (json/encode [{:type   :category
                                                                                          :target [:dimension [:field (mt/id :categories :name)
                                                                                                               {:source-field (mt/id :venues :category_id)}]]
                                                                                          :value  ["Bar"]}])))))
           (testing "a card outside data apps' collections isn't read by entity ID, its metadata or its download"
             (is (re-find #"Venues elsewhere" (request :get 403 (str "card/" other-card-eid))))
             (is (re-find #"Venues elsewhere" (request :get 403 (format "card/%d/query_metadata" other-card-id))))
             (is (re-find #"Venues elsewhere" (form-download 403 other-card-id "[]"))))
           (testing "a card that doesn't exist is left to the endpoint's 404 by entity ID too"
             (request :get 404 "card/AbCdEfGhIjKlMnOpQrStU"))
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

(defn- get-as-data-app
  "The response to a data app's `GET` of `path`, expecting `status`."
  [status path]
  (mt/user-http-request :crowberto :get status path as-data-app))

(deftest table-endpoints-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (testing "a published table is read, an unpublished one is refused, and a missing one is left to the 404"
         (is (= (mt/id :venues) (:id (get-as-data-app 200 (str "table/" (mt/id :venues))))))
         (is (re-find #"not CHECKINS" (get-as-data-app 403 (format "table/%d/query_metadata" (mt/id :checkins)))))
         (get-as-data-app 404 "table/999999999"))
       (let [category-id (fn [metadata]
                           (some #(when (= (mt/id :venues :category_id) (:id %)) %) (:fields metadata)))]
         (testing "a foreign key into an unpublished table is dropped from the metadata"
           (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :venues :category_id)
                                              :name                    "Category"
                                              :type                    :external
                                              :human_readable_field_id (mt/id :categories :name)}]
             (let [field (category-id (get-as-data-app 200 (format "table/%d/query_metadata" (mt/id :venues))))]
               (is (=? {:fk_target_field_id nil :dimensions []} field))
               (is (not (contains? field :target))))
             (data-apps.tu/with-published-tables! [(mt/id :categories)]
               (is (=? {:fk_target_field_id (mt/id :categories :id)
                        :target             {:id (mt/id :categories :id)}
                        :dimensions         [{:human_readable_field_id (mt/id :categories :name)}]}
                       (category-id (get-as-data-app 200 (format "table/%d/query_metadata" (mt/id :venues))))))))))
       (testing "a foreign key from an unpublished table is dropped from a table's foreign keys"
         (is (= [] (get-as-data-app 200 (format "table/%d/fks" (mt/id :venues)))))
         (data-apps.tu/with-published-tables! [(mt/id :checkins)]
           (is (=? [{:origin_id (mt/id :checkins :venue_id)}]
                   (get-as-data-app 200 (format "table/%d/fks" (mt/id :venues)))))))
       (mt/with-temp [:model/Card {app-card-id :id} {:name          "Venues"
                                                     :collection_id collection-id
                                                     :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {other-card-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
         (testing "a card's metadata as a table is read only for a card a data app may read"
           (is (seq (:fields (get-as-data-app 200 (format "table/card__%d/query_metadata" app-card-id)))))
           (is (re-find #"Venues elsewhere" (get-as-data-app 403 (format "table/card__%d/query_metadata" other-card-id))))))))))

(deftest query-metadata-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {app-card-id :id} {:name          "Venues"
                                                     :collection_id collection-id
                                                     :dataset_query (data-apps.tu/venues-query)}
                      :model/Card {other-metric-id :id} {:name          "Venues elsewhere"
                                                         :type          :metric
                                                         :dataset_query (lib/aggregate (data-apps.tu/venues-query) (lib/count))}]
         (doseq [[label response] {"a query's metadata" (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app
                                                                              (lib/->legacy-MBQL (data-apps.tu/venues-query)))
                                   "a card's metadata"  (get-as-data-app 200 (format "card/%d/query_metadata" app-card-id))}]
           (testing (str label " holds only published tables and readable metrics")
             (is (= [(mt/id :venues)] (map :id (:tables response))))
             (is (not-any? #{other-metric-id} (map :id (mapcat :metrics (:tables response)))))))
         (testing "a query on a data app's card holds the card as a table"
           (is (= [(str "card__" app-card-id)]
                  (map :id (:tables (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app
                                                          (lib/->legacy-MBQL (card-query app-card-id)))))))))))))

(deftest table-metadata-macros-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/do-with-sources!
      (fn [{:keys [metric-id]}]
        (data-apps.tu/with-published-tables! [(mt/id :venues)]
          (let [venues   (data-apps.tu/venues-query)
                category (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns venues))]
            (mt/with-temp [:model/Card {other-metric-id :id} {:name          "Venues elsewhere"
                                                              :type          :metric
                                                              :dataset_query (lib/aggregate venues (lib/count))}
                           :model/Segment {bars-id :id} {:name       "Bars"
                                                         :table_id   (mt/id :venues)
                                                         :definition (lib/filter venues (lib/= category "Bar"))}
                           :model/Segment {cheap-id :id} {:name       "Cheap"
                                                          :table_id   (mt/id :venues)
                                                          :definition (lib/filter venues (lib/= (lib.metadata/field (mt/metadata-provider)
                                                                                                                    (mt/id :venues :price))
                                                                                                1))}]
              (let [metadata (get-as-data-app 200 (format "table/%d/query_metadata" (mt/id :venues)))]
                (testing "a table's metadata holds only the metrics a data app may read"
                  (is (contains? (set (map :id (:metrics metadata))) metric-id))
                  (is (not (contains? (set (map :id (:metrics metadata))) other-metric-id))))
                (testing "and only the segments whose definitions read only the Library"
                  (is (contains? (set (map :id (:segments metadata))) cheap-id))
                  (is (not (contains? (set (map :id (:segments metadata))) bars-id)))))
              (testing "a query on a Library metric has its metadata"
                (is (seq (:tables (mt/user-http-request :crowberto :post 200 "dataset/query_metadata" as-data-app
                                                        (lib/->legacy-MBQL (lib/aggregate venues (lib.metadata/metric (mt/metadata-provider) metric-id))))))))))))))))

(deftest field-endpoints-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (testing "a field of a published table is read, one of an unpublished table is refused, and a missing one is left to the 404"
         (is (= (mt/id :venues :name) (:id (get-as-data-app 200 (str "field/" (mt/id :venues :name))))))
         (is (get-as-data-app 200 (format "field/%d/values" (mt/id :venues :name))))
         (doseq [path ["field/%d" "field/%d/values" "field/%d/summary" "field/%d/related"]]
           (is (re-find #"not CHECKINS" (get-as-data-app 403 (format path (mt/id :checkins :date))))))
         (get-as-data-app 404 "field/999999999"))
       (testing "the values of a foreign key, read from its target, are refused while the target's table is unpublished"
         (is (=? {:fk_target_field_id nil} (get-as-data-app 200 (str "field/" (mt/id :venues :category_id)))))
         (doseq [path [(format "field/%d/values" (mt/id :venues :category_id))
                       (format "field/%d/search/%d" (mt/id :venues :category_id) (mt/id :venues :category_id))
                       (format "field/%d/search/%d" (mt/id :venues :name) (mt/id :categories :name))
                       (format "field/%d/remapping/%d" (mt/id :venues :category_id) (mt/id :categories :name))]]
           (testing path
             (is (re-find #"not CATEGORIES" (get-as-data-app 403 path))))))
       (testing "the values of a field remapped to a field of an unpublished table are refused"
         (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :venues :name)
                                            :name                    "Name"
                                            :type                    :external
                                            :human_readable_field_id (mt/id :categories :name)}]
           (is (re-find #"not CATEGORIES" (get-as-data-app 403 (format "field/%d/values" (mt/id :venues :name)))))))
       (testing "a field's related entities hold only the segments whose definitions read only the Library"
         (let [venues   (data-apps.tu/venues-query)
               category (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns venues))]
           (mt/with-temp [:model/Segment {bars-id :id} {:name       "Bars"
                                                        :table_id   (mt/id :venues)
                                                        :definition (lib/filter venues (lib/= category "Bar"))}
                          :model/Segment {cheap-id :id} {:name       "Cheap"
                                                         :table_id   (mt/id :venues)
                                                         :definition (lib/filter venues (lib/= (lib.metadata/field (mt/metadata-provider)
                                                                                                                   (mt/id :venues :price))
                                                                                               1))}]
             (let [segment-ids (set (map :id (:segments (get-as-data-app 200 (format "field/%d/related" (mt/id :venues :price))))))]
               (is (contains? segment-ids cheap-id))
               (is (not (contains? segment-ids bars-id)))))))))))

(defn- field-target
  "A parameter target on the field with `field-id`, through the foreign key with `fk-field-id` when it is non-nil."
  [field-id & [fk-field-id]]
  [:dimension [:field field-id (when fk-field-id {:source-field fk-field-id})]])

(deftest parameter-values-test
  (do-with-app-collection
   (fn [collection-id]
     (data-apps.tu/with-published-tables! [(mt/id :venues)]
       (mt/with-temp [:model/Card {app-card-id :id} {:name          "Venues"
                                                     :collection_id collection-id
                                                     :dataset_query (data-apps.tu/venues-query)
                                                     :parameters    [{:id     "price"
                                                                      :slug   "price"
                                                                      :name   "Price"
                                                                      :type   :number/=
                                                                      :target (field-target (mt/id :venues :price))}]}
                      :model/Card {other-card-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
         (let [parameter (fn [& {:as source}]
                           (merge {:id "p" :type :category} source))
               values    (fn [status body]
                           (mt/user-http-request :crowberto :post status "dataset/parameter/values" as-data-app body))]
           (testing "values of a field of a published table, or from a card a data app may read"
             (is (values 200 {:parameter (parameter) :field_ids [(mt/id :venues :name)]}))
             (is (values 200 {:parameter (parameter :values_source_type   "card"
                                                    :values_source_config {:card_id app-card-id :value_field [:field (mt/id :venues :name) nil]})})))
           (testing "values of a field of an unpublished table, or from a card a data app may not read, are refused"
             (is (re-find #"not CHECKINS" (values 403 {:parameter (parameter) :field_ids [(mt/id :checkins :date)]})))
             (is (re-find #"Venues elsewhere" (values 403 {:parameter (parameter :values_source_type   "card"
                                                                                 :values_source_config {:card_id other-card-id})}))))
           (testing "a card's parameter values are read, searched and remapped when their fields are published"
             (is (get-as-data-app 200 (format "card/%d/params/price/values" app-card-id)))
             (is (get-as-data-app 200 (format "card/%d/params/price/search/1" app-card-id)))
             (doseq [path ["dataset/parameter/search/a" "dataset/parameter/remapping"]]
               (is (mt/user-http-request :crowberto :post 200 path as-data-app
                                         (cond-> {:parameter (parameter) :field_ids [(mt/id :venues :name)]}
                                           (= path "dataset/parameter/remapping") (assoc :value "Bar"))))))
           (testing "field IDs that aren't integers are refused"
             (is (re-find #"named by their IDs" (values 403 {:parameter (parameter) :field_ids [(str (mt/id :checkins :date))]}))))
           (testing "a card source's value field reached through a foreign key into an unpublished table is refused"
             (is (re-find #"not CATEGORIES" (values 403 {:parameter (parameter :values_source_type   "card"
                                                                                :values_source_config {:card_id     app-card-id
                                                                                                       :value_field [:field (mt/id :categories :name)
                                                                                                                     {:source-field (mt/id :venues :category_id)}]})}))))
           (testing "a card's parameter on a field of an unpublished table is refused, and doesn't block its other parameters"
             (t2/update! :model/Card app-card-id {:parameters [{:id     "price"
                                                                :slug   "price"
                                                                :name   "Price"
                                                                :type   :number/=
                                                                :target (field-target (mt/id :venues :price))}
                                                               {:id     "category"
                                                                :slug   "category"
                                                                :name   "Category"
                                                                :type   :category
                                                                :target (field-target (mt/id :categories :name)
                                                                                      (mt/id :venues :category_id))}]})
             (is (re-find #"not CATEGORIES" (get-as-data-app 403 (format "card/%d/params/category/values" app-card-id))))
             (is (get-as-data-app 200 (format "card/%d/params/price/values" app-card-id))))))))))

(defn- dashboard-paths
  "A request to each data-app endpoint of the dashboard API, as `[method path]`, for the dashboard with `dashboard-id`, its
  dashcard with `dashcard-id` and that dashcard's card with `card-id`."
  [dashboard-id dashcard-id card-id]
  (for [[method route] (keys guards.dashboard/checks)]
    [method (str "dashboard"
                 (-> route
                     (str/replace #":dashboard-id|:id" (str dashboard-id))
                     (str/replace ":dashcard-id" (str dashcard-id))
                     (str/replace ":card-id" (str card-id))
                     (str/replace ":export-format" "csv")
                     (str/replace #":[a-z\-]+" "x")))]))

(deftest dashboard-endpoints-test
  (do-with-app-collection
   (fn [_collection-id]
     (data-apps.tu/do-with-library!
      (fn [{:keys [dashboards-id]}]
        (let [mp       (mt/metadata-provider)
              checkins (lib/query mp (lib.metadata/table mp (mt/id :checkins)))]
          (mt/with-temp [:model/Dashboard {library-id :id library-eid :entity_id} {:name "Checkins" :collection_id dashboards-id}
                         :model/Card {question-id :id} {:name          "Checkins"
                                                        :collection_id dashboards-id
                                                        :dashboard_id  library-id
                                                        :dataset_query checkins}
                         :model/DashboardCard {dashcard-id :id} {:dashboard_id library-id :card_id question-id}
                         :model/Dashboard {other-id :id} {:name "Elsewhere"}
                         :model/Dashboard {archived-id :id} {:name "Archived" :collection_id dashboards-id :archived true}]
            (testing "a data app uses a dashboard in the Library with everything on it, whatever it reads"
              (is (= library-id (:id (get-as-data-app 200 (str "dashboard/" library-id)))))
              (is (= library-id (:id (get-as-data-app 200 (str "dashboard/" library-eid)))))
              (is (get-as-data-app 200 (format "dashboard/%d/query_metadata" library-id)))
              (is (= "completed" (:status (mt/user-http-request :crowberto :post 202
                                                                (format "dashboard/%d/dashcard/%d/card/%d/query"
                                                                        library-id dashcard-id question-id)
                                                                as-data-app)))))
            (testing "every dashboard endpoint refuses a dashboard outside the Library, an archived one, and no dashboard"
              (doseq [dashboard-id [other-id archived-id]
                      [method path] (dashboard-paths dashboard-id dashcard-id question-id)]
                (testing (str method " " path)
                  (is (re-find #"only the dashboards in the Library"
                               (mt/user-http-request :crowberto method 403 path as-data-app))))))
            (testing "a dashboard that doesn't exist is left to the endpoint's 404"
              (get-as-data-app 404 "dashboard/999999999"))
            (testing "a request that is not a data app's still reads any dashboard"
              (is (= other-id (:id (mt/user-http-request :crowberto :get 200 (str "dashboard/" other-id)))))))))))))

(deftest database-endpoints-test
  (do-with-app-collection
   (fn [collection-id]
     (mt/with-temp [:model/Database {other-db-id :id} {:name "Other" :engine :h2}
                    :model/Table    _ {:db_id other-db-id :name "OTHER" :schema "PUBLIC" :active true}]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (let [db-path (fn [path] (format path (mt/id)))]
           (testing "only databases with published tables are listed, with only those tables"
             (let [{:keys [data total]} (get-as-data-app 200 "database?include=tables")]
               (is (= [(mt/id)] (map :id data)))
               (is (= 1 total))
               (is (= ["VENUES"] (map :name (:tables (first data)))))))
           (testing "a database is read with only its published tables, and one without any is refused"
             (is (= ["VENUES"] (map :name (:tables (get-as-data-app 200 (db-path "database/%d?include=tables.fields"))))))
             (is (re-find #"databases with tables published" (get-as-data-app 403 (str "database/" other-db-id))))
             (get-as-data-app 404 "database/999999999"))
           (testing "schemas and their tables are listed only when published"
             (is (= ["PUBLIC"] (get-as-data-app 200 (db-path "database/%d/schemas"))))
             (is (= ["VENUES"] (map :name (get-as-data-app 200 (db-path "database/%d/schema/PUBLIC"))))))
           (testing "autocomplete suggests only published tables and their fields"
             (is (= [["VENUES" "Table"]] (get-as-data-app 200 (db-path "database/%d/autocomplete_suggestions?prefix=VENUES"))))
             (mt/with-temp [:model/Card _ {:name          "Venues"
                                           :collection_id collection-id
                                           :dataset_query (data-apps.tu/venues-query)}
                            :model/Card _ {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
               (is (= ["Venues"] (map :name (get-as-data-app 200 (db-path "database/%d/card_autocomplete_suggestions?query=Venues")))))))))))))

(deftest database-schemas-test
  (do-with-app-collection
   (fn [_collection-id]
     (testing "with no table published, no database is listed"
       (is (= [] (:data (get-as-data-app 200 "database")))))
     (mt/with-temp [:model/Table {secret-id :id} {:db_id (mt/id) :name "SECRET VENUES" :schema "SECRET" :active true}
                    :model/Field _ {:table_id secret-id :name "SSN" :base_type :type/Text :database_type "VARCHAR"}]
       (data-apps.tu/with-published-tables! [(mt/id :venues)]
         (let [db-path (fn [path] (format path (mt/id)))]
           (testing "a schema holding only unpublished tables is neither listed nor read, like one that doesn't exist"
             (is (= ["PUBLIC"] (get-as-data-app 200 (db-path "database/%d/schemas"))))
             (is (= ["PUBLIC"] (:schemas (first (:data (get-as-data-app 200 "database?include=schemas"))))))
             (is (re-find #"schemas with tables published" (get-as-data-app 403 (db-path "database/%d/schema/SECRET"))))
             (is (re-find #"schemas with tables published" (get-as-data-app 403 (db-path "database/%d/schema/NOPE"))))
             (is (re-find #"schemas with tables published" (get-as-data-app 403 (db-path "database/%d/schema/?schema=SECRET")))))
           (testing "a schema named by the query param holds its published tables"
             (is (= ["VENUES"] (map :name (get-as-data-app 200 (db-path "database/%d/schema/?schema=PUBLIC"))))))
           (testing "autocomplete drops a field of an unpublished table whose name starts with a published table's"
             (mt/with-temp [:model/Table {venues-archive-id :id} {:db_id (mt/id) :name "VENUES ARCHIVE" :schema "PUBLIC" :active true}
                            :model/Field _ {:table_id venues-archive-id :name "SSN" :base_type :type/Text :database_type "VARCHAR"}]
               (is (= [] (get-as-data-app 200 (db-path "database/%d/autocomplete_suggestions?prefix=SSN"))))))
           (testing "a schema's tables hold only the measures whose definitions read only the Library"
             (let [venues   (data-apps.tu/venues-query)
                   category (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/filterable-columns venues))]
               (mt/with-temp [:model/Measure {measure-id :id} {:name       "Categories"
                                                               :table_id   (mt/id :venues)
                                                               :definition (lib/aggregate venues (lib/distinct category))}]
                 (is (not-any? #{measure-id}
                               (map :id (mapcat :measures (get-as-data-app 200 (db-path "database/%d/schema/PUBLIC?include_measures=true")))))))))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app runs nothing"
    (mt/with-premium-features #{}
      (is (re-find #"aren't available" (run-query 403 (data-apps.tu/venues-query)))))))
