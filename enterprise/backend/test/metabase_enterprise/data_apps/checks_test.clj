(ns metabase-enterprise.data-apps.checks-test
  "The checks on the requests through which a data app runs queries and actions: a dev preview builds on no card, and an
  app builds only on the cards and runs only the actions in its collection."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu :refer [do-with-app-collection]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.test-util :as search.tu]
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

(def ^:private as-preview
  "Request options that mark a request as from a data app's dev preview."
  (assoc-in as-data-app [:request-options :headers "x-metabase-data-app-dev"] "true"))

(def ^:private error-formats
  "The format of the error message for each kind of entity a data app may not use."
  {:cards    "A data app can use only the cards in its own collection, not the cards %s."
   :tables   "A data app cannot read tables, not the tables %s."
   :segments "A data app cannot use segments, not the segments %s."
   :measures "A data app cannot use measures, not the measures %s."
   :metrics  "A data app cannot use metrics, not the metrics %s."})

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

(defn- category-name
  "The CATEGORIES.NAME column `query` on VENUES reaches through its foreign key."
  [query]
  (some #(when (= (mt/id :categories :name) (:id %)) %) (lib/breakoutable-columns query)))

(defn- do-with-app-card!
  "Call `f` with the ID of a card on the VENUES table in the collection of the data app of [[do-with-app-collection]],
  and with that collection's ID."
  [f]
  (do-with-app-collection
   (fn [collection-id]
     (mt/with-temp [:model/Card {card-id :id} {:name          "Venues"
                                               :collection_id collection-id
                                               :dataset_query (data-apps.tu/venues-query)}]
       (f card-id collection-id)))))

(deftest app-card-runs-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (let [query (lib/limit (card-query card-id) 1)]
       (testing "a query on the app's card runs and pivots"
         (is (= "completed" (:status (run-query 202 query))))
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset/pivot" as-data-app
                                                           (lib/aggregate query (lib/count)))))))
       (testing "an export of it, which a form submission sends as a JSON string"
         (is (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                   (assoc-in as-data-app [:request-options :content-type]
                                             "application/x-www-form-urlencoded")
                                   {:query (json/encode (lib/->legacy-MBQL query))})))
       (testing "a custom column on it runs"
         (is (= "completed" (:status (run-query 202 (lib/expression query "Double price"
                                                                    (lib/* (lib.metadata/field (mt/metadata-provider)
                                                                                               (mt/id :venues :price))
                                                                           2)))))))))))

(deftest request-must-name-readable-app-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a data app's request that names no app, or an app that doesn't exist, is not found"
       (doseq [options [(as-app nil) (as-app "no-such-app")]]
         (is (= "Not found." (run-query 404 (card-query card-id) options)))))
     (testing "a dev preview's request reads the Library alone, whether its app exists or not"
       (doseq [app-name ["no-such-app" "birds"]
               :let [options (assoc-in (as-app app-name) [:request-options :headers "x-metabase-data-app-dev"] "true")]]
         (is (= "completed" (:status (run-query 202 (-> (table-query :venues) (lib/limit 1)) options))))
         (is (= (format "A data app's dev preview cannot build on cards, not the cards %d." card-id)
                (run-query 400 (card-query card-id) options)))))
     (testing "an app the user can't read is refused"
       (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :post 403 "dataset" as-data-app (card-query card-id))))))))

(deftest foreign-keys-are-followed-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (testing "a dev preview reads any table, and both reach a table through a foreign key of a table or the app's card"
       (is (= "completed" (:status (run-query 202 (lib/limit (table-query :categories) 1) as-preview))))
       (doseq [[options query] [[as-preview (table-query :venues)] [as-data-app (card-query card-id)]]]
         (is (= "completed" (:status (run-query 202 (-> query (lib/breakout (category-name query)) (lib/limit 1))
                                                options)))))))))

(deftest app-reads-no-table-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (let [mp (mt/metadata-provider)]
       (testing "an app reads no table, as its source or in a join"
         (is (= (error-message :tables (mt/id :venues)) (run-query 400 (table-query :venues))))
         (is (= (error-message :tables (mt/id :categories))
                (run-query 400 (lib/join (card-query card-id)
                                         (lib/join-clause (lib.metadata/table mp (mt/id :categories))))))))))))

(deftest other-cards-are-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/DataApp {other-collection-id :resource_collection_id} {:slug         "bees"
                                                                                  :name         "Bees"
                                                                                  :bundle_path  "bees.js"}
                    :model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}
                    :model/Card {other-app-id :id} {:name          "Venues of bees"
                                                    :collection_id other-collection-id
                                                    :dataset_query (data-apps.tu/venues-query)}]
       (testing "a card outside the app's collection, or of another app, is refused"
         (doseq [other-id [elsewhere-id other-app-id]]
           (is (= (error-message :cards other-id)
                  (run-query 400 (card-query other-id))))))
       (testing "the other app runs its own card"
         (is (= "completed" (:status (run-query 202 (lib/limit (card-query other-app-id) 1) (as-app "bees"))))))))))

(deftest app-without-collection-uses-no-card-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/DataApp app             {:slug "wasps"}
                    :model/Card    {elsewhere-id :id} {:dataset_query (data-apps.tu/venues-query)}]
       (t2/delete! :model/Collection :id (:resource_collection_id app))
       (testing "an app without a collection can use no card, not even one in the root collection"
         (is (= (error-message :cards elsewhere-id)
                (run-query 400 (card-query elsewhere-id) (as-app "wasps")))))))))

(deftest missing-card-is-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (testing "an ID of no card gets the refusal a card the app may not use gets, so it tells nothing of what exists"
       (is (= (error-message :cards 999999999)
              (run-query 400 {:database (mt/id) :type :query :query {:source-table "card__999999999"}})))))))

(deftest native-query-is-refused-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (testing "an app and its dev preview run no native query, in its MBQL 5, legacy and nested legacy forms"
       (doseq [options [as-data-app as-preview]
               query   [(lib/native-query (mt/metadata-provider) "SELECT * FROM VENUES")
                        {:database (mt/id) :type :native :native {:query "SELECT * FROM VENUES"}}
                        {:database (mt/id)
                         :type     :query
                         :query    {:source-query {:native "SELECT * FROM VENUES"}}}]]
         (is (= "A data app cannot run native queries." (run-query 400 query options)))))
     (testing "a request that is not a data app's still runs native SQL"
       (is (= "completed" (:status (mt/user-http-request :crowberto :post 202 "dataset"
                                                         (lib/native-query (mt/metadata-provider) "SELECT 1")))))))))

(deftest internal-query-is-refused-test
  (do-with-app-collection
   (fn [_collection-id]
     (testing "an app and its dev preview run no internal query"
       (doseq [options [as-data-app as-preview]]
         (is (= "A data app cannot run internal queries."
                (run-query 400 {:type :internal
                                :fn   "metabase-enterprise.audit-app.pages.dashboards/most-popular-with-avg-speed"}
                           options))))))))

(deftest metrics-test
  (do-with-app-card!
   (fn [card-id _collection-id]
     (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                 :type          :metric
                                                 :database_id   (mt/id)
                                                 :dataset_query (lib/aggregate (table-query :venues) (lib/count))}]
       (let [metric (lib.metadata/metric (mt/metadata-provider) metric-id)]
         (testing "a dev preview runs a metric outside the Library"
           (is (= "completed" (:status (run-query 202 (lib/aggregate (table-query :venues) metric) as-preview)))))
         (testing "an app uses no metric"
           (is (= (error-message :metrics metric-id)
                  (run-query 400 (lib/aggregate (card-query card-id) metric))))))))))

(deftest segments-and-measures-test
  (do-with-app-card!
   (fn [card-id _collection-id]
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
           (testing "a dev preview runs a segment or measure of a table not published to the Library"
             (doseq [query [(with-segment categories) (with-measure categories)]]
               (is (= "completed" (:status (run-query 202 query as-preview))))))
           (testing "an app uses no segment or measure"
             (is (= (error-message :segments segment-id) (run-query 400 (with-segment (card-query card-id)))))
             (is (= (error-message :measures measure-id) (run-query 400 (with-measure (card-query card-id))))))))))))

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
         (mt/with-temp [:model/DataApp app {:slug "wasps"}]
           (t2/delete! :model/Collection :id (:resource_collection_id app))
           (is (= (card-error elsewhere-id)
                  (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) (as-app "wasps"))))))
       (testing "a dev preview runs no saved card"
         (is (= (format "A data app's dev preview cannot run saved cards, not the card %d." elsewhere-id)
                (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) as-preview))))
       (testing "an ID of no card is not found, as for any request"
         (is (= "Not found." (mt/user-http-request :crowberto :post 404 "card/999999999/query" as-data-app))))
       (testing "a request that is not a data app's still runs the card"
         (is (= "completed" (:status (mt/user-http-request :crowberto :post 202
                                                           (format "card/%d/query" elsewhere-id))))))))))

(deftest card-read-endpoints-are-not-checked-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/Card {elsewhere-id :id} {:name "Venues elsewhere" :dataset_query (data-apps.tu/venues-query)}]
       (testing "an app and its dev preview read a card outside the app's collection and its metadata"
         (doseq [options [as-data-app as-preview]
                 url     ["card/%d" "card/%d/query_metadata"]]
           (is (map? (mt/user-http-request :crowberto :get 200 (format url elsewhere-id) options)) url)))))))

(deftest out-of-scope-endpoints-test
  (testing "parameter values, dashboards, the native editor's snippets and autocompletion, and timelines are no part of a
            data app's surface"
    (do-with-app-card!
     (fn [card-id _collection-id]
       (mt/with-temp [:model/Dashboard {dashboard-id :id} {}]
         (doseq [[method url body] [[:get (format "card/%d/params/kind/values" card-id)]
                                    [:get (format "card/%d/params/kind/search/caf" card-id)]
                                    [:get (format "card/%d/params/kind/remapping?value=bar" card-id)]
                                    [:post "dataset/parameter/values" {:parameter {:id "kind" :type :string/=}}]
                                    [:post "dataset/parameter/search/caf" {:parameter {:id "kind" :type :string/=}}]
                                    [:post "dataset/parameter/remapping" {:parameter {:id "kind" :type :string/=} :value "bar"}]
                                    [:get (format "dashboard/%d" dashboard-id)]
                                    [:get (format "dashboard/%d/query_metadata" dashboard-id)]
                                    [:get "native-query-snippet"]
                                    [:get (format "database/%d/autocomplete_suggestions?prefix=ven" (mt/id))]
                                    [:get (format "database/%d/card_autocomplete_suggestions?query=ven" (mt/id))]
                                    [:get "timeline"]]]
           (is (= "scope_not_permitted"
                  (:error (if body
                            (mt/user-http-request :crowberto method 403 url as-data-app body)
                            (mt/user-http-request :crowberto method 403 url as-data-app))))
               url)))))))

(deftest refusal-names-large-id-without-grouping-test
  (do-with-app-card!
   (fn [_card-id _collection-id]
     (mt/with-temp [:model/Card {elsewhere-id :id} {:id 1234567 :dataset_query (data-apps.tu/venues-query)}]
       (testing "an ID of a thousand or more appears as it is, not as 1,234,567"
         (is (= "A data app can run only the cards in its own collection, not the card 1234567."
                (mt/user-http-request :crowberto :post 400 (format "card/%d/query" elsewhere-id) as-data-app))))))))

(defn- do-with-rename-action!
  "Call `f` with the ID of a temp implicit action, on no model, that updates a category, in the collection with
  `collection-id`."
  [collection-id f]
  (mt/with-temp [:model/Action         {action-id :id} {:name          "Update category"
                                                        :type          :implicit
                                                        :collection_id collection-id}
                 :model/ImplicitAction _               {:action_id action-id
                                                        :kind      "row/update"
                                                        :table_id  (mt/id :categories)}]
    (f action-id)))

(def ^:private category-parameters
  {:id 1 :name "African"})

(deftest action-endpoints-run-app-action-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [collection-id]
       (do-with-rename-action!
        collection-id
        (fn [action-id]
          (testing "the app's action runs, and its values endpoint answers"
            (is (= {:rows-updated 1}
                   (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" action-id) as-data-app
                                         {:parameters category-parameters})))
            (is (= category-parameters
                   (mt/user-http-request :crowberto :post 200 (format "action/%d/execute/values" action-id)
                                         as-data-app {:parameters category-parameters}))))
          (testing "by its entity ID too"
            (is (= {:rows-updated 1}
                   (mt/user-http-request :crowberto :post 200
                                         (format "action/%s/execute"
                                                 (t2/select-one-fn :entity_id :model/Action :id action-id))
                                         as-data-app
                                         {:parameters category-parameters}))))))))))

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
                                           {:parameters category-parameters})))
              (is (= (action-error elsewhere-id)
                     (mt/user-http-request :crowberto :post 400 (format "action/%d/execute/values" elsewhere-id)
                                           as-data-app {:parameters category-parameters}))))
            (testing "an ID of no action is not found, as for any request"
              (is (= "Not found." (mt/user-http-request :crowberto :post 404 "action/999999999/execute" as-data-app
                                                        {:parameters category-parameters}))))
            (testing "a request that is not a data app's still runs the action"
              (is (= {:rows-updated 1}
                     (mt/user-http-request :crowberto :post 200 (format "action/%d/execute" elsewhere-id)
                                           {:parameters category-parameters})))))))))))

(deftest preview-runs-only-adhoc-implicit-actions-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [collection-id]
       (let [adhoc {:name "Rename" :type "implicit" :kind "row/update" :table_id (mt/id :categories)}]
         (do-with-rename-action!
          collection-id
          (fn [action-id]
            (testing "a dev preview runs an ad-hoc implicit action on a table not published to the Library"
              (is (=? {:rows-updated some?}
                      (mt/user-http-request :crowberto :post 200 "action/execute" as-preview
                                            {:action adhoc :parameters category-parameters}))))
            (testing "nor a saved one, even the app's"
              (is (= (format "A data app's dev preview can run only ad-hoc actions, not the action %d." action-id)
                     (mt/user-http-request :crowberto :post 400 (format "action/%d/execute" action-id) as-preview
                                           {:parameters category-parameters}))))
            (testing "an app runs no ad-hoc action"
              (is (= "A data app can run only the actions in its own collection, not ad-hoc ones."
                     (mt/user-http-request :crowberto :post 400 "action/execute" as-data-app
                                           {:action adhoc :parameters category-parameters})))))))))))

(deftest action-read-endpoints-are-not-checked-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [collection-id]
       (do-with-rename-action!
        collection-id
        (fn [action-id]
          (mt/with-temp [:model/Collection {elsewhere-collection-id :id} {:namespace :data-actions}]
            (do-with-rename-action!
             elsewhere-collection-id
             (fn [elsewhere-id]
               (testing "an app lists and reads its actions and the others"
                 (is (= #{action-id elsewhere-id}
                        (set (filter #{action-id elsewhere-id}
                                     (map :id (mt/user-http-request :crowberto :get 200 "action" as-data-app))))))
                 (is (=? {:id elsewhere-id}
                         (mt/user-http-request :crowberto :get 200 (format "action/%d" elsewhere-id) as-data-app)))))))))))))

(deftest app-without-collection-runs-no-action-test
  (mt/with-actions-test-data-and-actions-enabled
    (do-with-app-collection
     (fn [_collection-id]
       (mt/with-temp [:model/DataApp    app                          {:slug "wasps"}
                      :model/Collection {elsewhere-collection-id :id} {:namespace :data-actions}]
         (do-with-rename-action!
          elsewhere-collection-id
          (fn [elsewhere-id]
            (t2/delete! :model/Collection :id (:resource_collection_id app))
            (testing "an app without a collection runs no action"
              (is (= (action-error elsewhere-id)
                     (mt/user-http-request :crowberto :post 400 (format "action/%d/execute" elsewhere-id) (as-app "wasps")
                                           {:parameters category-parameters})))))))))))

(deftest table-and-field-endpoints-read-unpublished-tables-test
  (do-with-app-collection
   (fn [_collection-id]
     (let [users (mt/id :users)
           id    (mt/id :users :id)
           uname (mt/id :users :name)]
       (testing "a data app reads a table not published to the Library and its fields"
         (doseq [url [(format "table/%d" users)
                      (format "table/%d/query_metadata" users)
                      (format "table/%d/fks" users)
                      (format "field/%d" uname)
                      (format "field/%d/summary" uname)
                      (format "field/%d/values" uname)
                      (format "field/%d/search/%d?value=Re" uname uname)
                      (format "field/%d/remapping/%d?value=1" id uname)
                      (format "field/%d/related" uname)]]
           (mt/user-http-request :crowberto :get 200 url as-data-app)))))))

(deftest database-endpoints-list-unpublished-tables-test
  (do-with-app-collection
   (fn [_collection-id]
     (mt/with-temp [:model/Database db    {:engine :h2 :details {}}
                    :model/Table    table {:db_id (:id db) :name "UNPUBLISHED" :schema "PUBLIC"}]
       (let [listed (fn [url] (some #(when (= (:id db) (:id %)) %)
                                    (:data (mt/user-http-request :crowberto :get 200 url as-data-app))))]
         (testing "the database list holds a database whose tables are not published to the Library, with them"
           (is (= [(:id table)] (map :id (:tables (listed "database?include=tables")))))
           (is (= ["PUBLIC"] (:schemas (listed "database?include=schemas"))))))
       (testing "the database endpoints read it and list its table and schema"
         (is (= [(:id table)]
                (map :id (:tables (mt/user-http-request :crowberto :get 200 (format "database/%d?include=tables" (:id db))
                                                        as-data-app)))))
         (is (= ["PUBLIC"] (mt/user-http-request :crowberto :get 200 (format "database/%d/schemas" (:id db)) as-data-app)))
         (is (= [(:id table)]
                (map :id (mt/user-http-request :crowberto :get 200 (format "database/%d/schema/PUBLIC" (:id db))
                                               as-data-app)))))))))

(deftest search-is-not-narrowed-test
  (search.tu/with-appdb-search-and-legacy-search
    (search.tu/with-sync-search-indexing
      (do-with-app-collection
       (fn [_collection-id]
         (mt/with-premium-features #{:data-apps :library}
           (data-apps.tu/do-with-library!
            (fn [_library]
              (mt/with-temp [:model/Database db     {:engine :h2 :details {}}
                             :model/Table    table  {:db_id (:id db) :name "ZEBRA_UNPUBLISHED" :display_name "Zebra unpublished"}
                             :model/Card     metric {:name          "Zebra outside metric"
                                                     :type          :metric
                                                     :dataset_query (lib/aggregate (data-apps.tu/venues-query) (lib/count))}]
                (testing "a data app finds a table not published to the Library and a metric outside it"
                  (let [found (set (map (juxt :model :id)
                                        (:data (mt/user-http-request :crowberto :get 200 "search" as-data-app :q "zebra"))))]
                    (is (contains? found ["table" (:id table)]))
                    (is (contains? found ["metric" (:id metric)])))))))))))))

(deftest user-key-value-endpoints-are-not-checked-test
  (do-with-app-collection
   (fn [_collection-id]
     (let [url "user-key-value/namespace/user_acknowledgement/key/seen"]
       (testing "a data app reads, writes and clears any key"
         (mt/user-http-request :crowberto :put 200 url as-data-app {:value true})
         (is (true? (mt/user-http-request :crowberto :get 200 url as-data-app)))
         (mt/user-http-request :crowberto :delete 200 url as-data-app))))))

(defn- item-ids
  "The `[model id]` pairs of the items that the request to `endpoint` with `options` finds."
  [options endpoint]
  (set (map (juxt :model :id) (:data (mt/user-http-request :crowberto :get 200 endpoint options)))))

(deftest collection-endpoints-are-not-checked-test
  (do-with-app-collection
   (fn [_collection-id]
     (mt/with-temp [:model/Collection outside   {:name "Birds outside"}
                    :model/Card       root-card {:name "Birds root card"}]
       (testing "a data app finds a collection outside the Library and a root card"
         (let [found (item-ids as-data-app "collection/root/items")]
           (is (contains? found ["collection" (:id outside)]))
           (is (contains? found ["card" (:id root-card)])))
         (is (contains? (set (map :id (mt/user-http-request :crowberto :get 200 "collection" as-data-app))) (:id outside))))
       (testing "and reads it and its items"
         (is (= (:id outside) (:id (mt/user-http-request :crowberto :get 200 (str "collection/" (:id outside)) as-data-app))))
         (is (map? (mt/user-http-request :crowberto :get 200 (str "collection/" (:id outside) "/items") as-data-app))))))))

(deftest without-data-apps-feature-test
  (testing "without the data-apps feature a data app's queries are not checked"
    (mt/with-premium-features #{}
      (is (= "completed" (:status (run-query 202 (lib/limit (data-apps.tu/venues-query) 1))))))))
