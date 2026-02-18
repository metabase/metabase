(ns ^:mb/driver-tests metabase.query-processor.api-test
  "Unit tests for /api/dataset endpoints. There are additional tests for downloading XLSX/CSV/JSON results generally in
  [[metabase.query-processor.streaming-test]] and specifically for each format
  in [[metabase.query-processor.streaming.csv-test]] etc."
  {:clj-kondo/config '{:linters
                       ;; allowing `with-temp` here for now since this tests the REST API which doesn't fully use
                       ;; metadata providers.
                       {:discouraged-var {metabase.test/with-temp           {:level :off}
                                          toucan2.tools.with-temp/with-temp {:level :off}}}}}
  (:require
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.test-util :as api.test-util]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util.unique-name-generator]
   [metabase.permissions.core :as perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor.api :as api.dataset]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.pivot.test-util :as qp.pivot.test-util]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- format-response [m]
  (when-not (map? m)
    (throw (ex-info (format "Expected results to be a map! Got: %s" (u/pprint-to-str m))
                    {:results m})))
  (into
   {}
   (for [[k v] (-> m
                   (m/dissoc-in [:data :results_metadata])
                   (m/dissoc-in [:data :insights]))]
     (cond
       (contains? #{:id :started_at :running_time :hash :cache_hash} k)
       [k (boolean v)]

       (and (= :data k) (contains? v :native_form))
       [k (update v :native_form boolean)]

       :else
       [k v]))))

(defn- most-recent-query-execution-for-query [query]
  ;; it might take a fraction of a second for the QueryExecution to show up, it's saved asynchronously. So wait a bit
  ;; and retry if it's not there yet.
  (letfn [(thunk []
            (t2/select-one :model/QueryExecution
                           :hash (qp.util/query-hash query)
                           {:order-by [[:started_at :desc]]}))]
    (loop [retries 3]
      (or (thunk)
          (when (pos? retries)
            (Thread/sleep 100)
            (recur (dec retries)))))))

(def ^:private query-defaults
  {:middleware {:add-default-userland-constraints? true
                :js-int-to-string? true}})

(deftest basic-query-test
  (testing "POST /api/dataset"
    (testing "\nJust a basic sanity check to make sure Query Processor endpoint is still working correctly."
      (let [query (mt/mbql-query checkins
                    {:aggregation [[:count]]})
            result (mt/user-http-request :crowberto :post 202 "dataset" query)]
        (testing "\nAPI Response"
          (is (=?
               {:data                   {:rows             [[1000]]
                                         :cols             [(mt/obj->json->obj (qp.test-util/aggregate-col :count))]
                                         :native_form      true
                                         :results_timezone "UTC"}
                :row_count              1
                :status                 "completed"
                :context                "ad-hoc"
                :json_query             (-> (mt/mbql-query checkins
                                              {:aggregation [[:count]]})
                                            (assoc-in [:query :aggregation] [["count"]])
                                            (assoc :type "query")
                                            (merge query-defaults))
                :started_at             true
                :running_time           true
                :average_execution_time nil
                :database_id            (mt/id)}
               (format-response result))))
        (testing "\nSaved QueryExecution"
          (is (= {:hash             true
                  :row_count        1
                  :result_rows      1
                  :context          :ad-hoc
                  :executor_id      (mt/user->id :crowberto)
                  :native           false
                  :pulse_id         nil
                  :card_id          nil
                  :is_sandboxed     false
                  :dashboard_id     nil
                  :error            nil
                  :id               true
                  :action_id        nil
                  :cache_hit        false
                  :cache_hash       false
                  :parameterized    false
                  :database_id      (mt/id)
                  :started_at       true
                  :running_time     true
                  :embedding_client nil
                  :embedding_version nil}
                 (format-response (most-recent-query-execution-for-query query)))))))))

(deftest failure-test
  ;; clear out recent query executions!
  (t2/delete! :model/QueryExecution)
  (testing "POST /api/dataset"
    (testing "\nEven if a query fails we still expect a 202 response from the API"
      ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check
      ;; that it exists and contains the substring "Syntax error in SQL statement"
      (let [query  {:database (mt/id)
                    :type     "native"
                    :native   {:query "foobar"}}
            result (mt/user-http-request :crowberto :post 202 "dataset" query)]
        (testing "\nAPI Response"
          (is (malli= [:map
                       [:data        [:map
                                      [:rows [:= []]]
                                      [:cols [:= []]]]]
                       [:row_count   [:= 0]]
                       [:status      [:= "failed"]]
                       [:context     [:= "ad-hoc"]]
                       [:error       #"Syntax error in SQL statement"]
                       [:json_query  [:map
                                      [:database   [:= (mt/id)]]
                                      [:type       [:= "native"]]
                                      [:native     [:map
                                                    [:query [:= "foobar"]]]]
                                      [:middleware [:map
                                                    [:add-default-userland-constraints? [:= true]]
                                                    [:js-int-to-string?                 [:= true]]]]]]
                       [:database_id [:= (mt/id)]]
                       [:state       [:= "42000"]]
                       [:class       [:= "class org.h2.jdbc.JdbcSQLSyntaxErrorException"]]]
                      result)))
        (testing "\nSaved QueryExecution"
          (is (malli=
               [:map
                [:hash         (ms/InstanceOfClass (Class/forName "[B"))]
                [:id           ms/PositiveInt]
                [:result_rows  [:= 0]]
                [:row_count    [:= 0]]
                [:context      [:= :ad-hoc]]
                [:error        #"Syntax error in SQL statement"]
                [:database_id  [:= (mt/id)]]
                [:executor_id  [:= (mt/user->id :crowberto)]]
                [:native       [:= true]]
                [:pulse_id     nil?]
                [:card_id      nil?]
                [:dashboard_id nil?]]
               (most-recent-query-execution-for-query query))))))))

(defn- test-download-response-headers
  [url]
  (-> (client/client-full-response (test.users/username->token :rasta)
                                   :post 200 url
                                   {:query (mt/mbql-query checkins {:limit 1})})
      :headers
      (select-keys ["Cache-Control" "Content-Disposition" "Content-Type" "Expires" "X-Accel-Buffering"])
      (update "Content-Disposition" #(some-> % (str/replace #"query_result_.+(\.\w+)"
                                                            "query_result_<timestamp>$1")))))

(deftest download-response-headers-test
  (testing "Make sure CSV/etc. download requests come back with the correct headers"
    (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
            "Content-Disposition" "attachment; filename=\"query_result_<timestamp>.csv\""
            "Content-Type"        "text/csv"
            "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
            "X-Accel-Buffering"   "no"}
           (test-download-response-headers "dataset/csv")))
    (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
            "Content-Disposition" "attachment; filename=\"query_result_<timestamp>.json\""
            "Content-Type"        "application/json; charset=utf-8"
            "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
            "X-Accel-Buffering"   "no"}
           (test-download-response-headers "dataset/json")))
    (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
            "Content-Disposition" "attachment; filename=\"query_result_<timestamp>.xlsx\""
            "Content-Type"        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
            "X-Accel-Buffering"   "no"}
           (test-download-response-headers "dataset/xlsx")))))

(deftest check-that-we-can-export-the-results-of-a-nested-query
  (mt/with-temp-copy-of-db
    (mt/with-temp [:model/Card card {:dataset_query {:database (mt/id)
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM USERS;"}}}]
      (letfn [(do-test []
                (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                                   {:query {:database lib.schema.id/saved-questions-virtual-database-id
                                                            :type     :query
                                                            :query    {:source-table (str "card__" (u/the-id card))}}})]
                  (is (some? result))
                  (when (some? result)
                    (is (= 16
                           (count (csv/read-csv result)))))))]
        (mt/with-no-data-perms-for-all-users!
          (testing "with data perms"
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/download-results :one-million-rows)
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
            (do-test))
          (testing "with collection perms only"
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/download-results :one-million-rows)
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
            (do-test)))))))

(deftest native-query-with-long-column-alias
  (testing "nested native query with long column alias (#47584)"
    (let [short-col-name       "coun"
          long-col-name        "Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count"
          ;; Lightly validate the native form that comes back. Resist the urge to check for exact equality.
          validate-native-form (fn [native-form-lines]
                                 (and (some #(str/includes? % short-col-name) native-form-lines)
                                      (some #(str/includes? % long-col-name) native-form-lines)))
          ;; Disable truncate-alias when compiling the native query to ensure we don't truncate the column.
          ;; We want to simulate a user-defined query where the column name is long, but valid for the driver.
          native-sub-query     (with-redefs [metabase.lib.util.unique-name-generator/truncate-alias
                                             (fn mock-truncate-alias
                                               [ss & _] ss)]
                                 ;; make sure the schema checks don't fail for aliases > 60 characters
                                 (mu/disable-enforcement
                                   (-> (mt/mbql-query people
                                         {:source-table $$people
                                          :aggregation  [[:aggregation-options [:count] {:name short-col-name}]]
                                          :breakout     [[:field %state {:name long-col-name}]]
                                          :limit        5})
                                       qp.compile/compile
                                       :query)))
          _                    (is (not (str/includes? native-sub-query "_00028d48"))
                                   "double-check that the native-sub-query was not truncated")
          native-query         (mt/native-query {:query native-sub-query})
          ;; Let metadata-provider-with-cards-with-metadata-for-queries calculate the result-metadata.
          metadata-provider    (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries [native-query])
          metadata-card        (lib.metadata/card metadata-provider 1)]
      (mt/with-temp
        [:model/Card card {:dataset_query   native-query
                           :entity_id       (:entity-id metadata-card)
                           :result_metadata (:result-metadata metadata-card)}]
        (let [card-query {:database (mt/id)
                          :type     "query"
                          :query    {:source-table (str "card__" (u/the-id card))}}]
          (mt/with-native-query-testing-context card-query
            (testing "POST /api/dataset/native"
              (is (=? {:query  validate-native-form
                       :params nil}
                      (-> (mt/user-http-request :crowberto :post 200 "dataset/native" card-query)
                          (update :query #(str/split-lines (or (driver/prettify-native-form :h2 %)
                                                               "error: no query generated")))))))
            (testing "POST /api/dataset"
              (is (=?
                   {:data        {:rows             [["AK" 68] ["AL" 56] ["AR" 49] ["AZ" 20] ["CA" 90]]
                                  :cols             [{:name         long-col-name
                                                      :display_name long-col-name
                                                      :field_ref    ["field" long-col-name {}]
                                                      :source       "fields"}
                                                     {:name         short-col-name
                                                      :display_name short-col-name
                                                      :field_ref    ["field" short-col-name {}]
                                                      :source       "fields"}]
                                  :native_form      {:query  validate-native-form
                                                     :params nil}
                                  :results_timezone "UTC"}
                    :row_count   5
                    :status      "completed"
                    :context     "ad-hoc"
                    :json_query  (merge query-defaults card-query)
                    :database_id (mt/id)}
                   (-> (mt/user-http-request :crowberto :post 202 "dataset" card-query)
                       (update-in [:data :native_form :query]
                                  #(str/split-lines (or (driver/prettify-native-form :h2 %)
                                                        "error: no query generated")))))))))))))

(deftest formatted-results-ignore-query-constraints
  (testing "POST /api/dataset/:format"
    (testing "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints (#9831)"
      ;; even if the query comes in with `add-default-userland-constraints` (as will be the case if the query gets saved
      (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
        (doseq [:let     [query {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (mt/id :venues)}
                                 :middleware
                                 {:add-default-userland-constraints? true
                                  :userland-query?                   true}}]
                encoded? [true false]
                :let     [query (cond-> query
                                  encoded? json/encode)]]
          (let [result (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                             {:query query})]
            (is (some? result))
            (when (some? result)
              (is (= 101
                     (count (csv/read-csv result)))))))))))

(deftest ^:parallel export-with-remapped-fields
  (testing "POST /api/dataset/:format"
    (testing "Downloaded CSV/JSON/XLSX results should respect remapped fields (#18440)"
      (let [query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :venues)
                              :limit 1}
                   :middleware
                   {:add-default-userland-constraints? true
                    :userland-query?                   true}}]
        (doseq [encoded? [true false]
                :let     [query (cond-> query
                                  encoded? json/encode)]]
          (testing (format "encoded? %b" encoded?)
            (doseq [mp [(lib.tu/remap-metadata-provider
                         (mt/metadata-provider)
                         (mt/id :venues :category_id)
                         (mt/id :categories :name))
                        (lib.tu/remap-metadata-provider
                         (mt/metadata-provider)
                         (mt/id :venues :category_id)
                         (mapv first (mt/rows (qp/process-query
                                               (mt/mbql-query categories
                                                 {:fields [$name], :order-by [[:asc $id]]})))))]]
              (qp.store/with-metadata-provider mp
                (let [result (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                                   {:query query})]
                  (is (str/includes? result "Asian")))))))))))

(deftest non-download-queries-should-still-get-the-default-constraints
  (testing (str "non-\"download\" queries should still get the default constraints "
                "(this also is a sanitiy check to make sure the `with-redefs` in the test above actually works)")
    (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
      (let [{row-count :row_count, :as result}
            (mt/user-http-request :crowberto :post 202 "dataset"
                                  {:database (mt/id)
                                   :type     :query
                                   :query    {:source-table (mt/id :venues)}})]
        (is (= 10
               (or row-count result)))))))

(deftest check-permissions-test
  (testing "make sure `POST /dataset` calls check user permissions"
    (mt/with-temp-copy-of-db
      ;; give all-users *partial* permissions for the DB, so we know we're checking more than just read permissions for
      ;; the Database
      (mt/with-no-data-perms-for-all-users!
        (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
        (is (malli= [:map
                     [:status [:= "failed"]]
                     [:error  [:= "You do not have permissions to run this query."]]]
                    (mt/user-http-request :rasta :post "dataset"
                                          (mt/mbql-query venues {:limit 1}))))))))

(deftest api-card-join-permissions-test
  (testing "POST /api/dataset should error for card join permission violations"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection {accessible-collection-id :id} {}
                         :model/Collection {restricted-collection-id :id} {}]
            ;; Grant read permissions only to the accessible collection
            (perms/grant-collection-read-permissions! (perms/all-users-group) accessible-collection-id)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id accessible-collection-id
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}
                           :model/Card {categories-card-id :id} {:collection_id restricted-collection-id
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (is (malli= [:map
                             [:status [:= "failed"]]
                             [:error  [:re  "You do not have permissions to view Card"]]]
                            (mt/user-http-request :rasta :post "dataset" join-query)))))))))))

(deftest api-card-table-join-permissions-test
  (testing "POST /api/dataset should error for card-table join permission violations"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Block all access to venues table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :blocked)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
          ;; Allow access to categories table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {categories-card-id :id} {:collection_id (u/the-id collection)
                                                                 :dataset_query (mt/mbql-query categories
                                                                                  {:fields [$id $name]
                                                                                   :order-by [[:asc $id]]})}]
              (let [join-query (mt/mbql-query venues
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" categories-card-id)
                                           :alias "cat"
                                           :condition [:= $category_id
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (is (malli= [:map
                             [:status [:= "failed"]]
                             [:error  [:= "You do not have permissions to run this query."]]]
                            (mt/user-http-request :rasta :post "dataset" join-query)))))))))))

(deftest api-card-source-table-join-permissions-test
  (testing "POST /api/dataset should error for card-as-source with table join permission violations"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues table for the card
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          ;; Block all access to categories table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :blocked)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-card-id :id} {:collection_id (u/the-id collection)
                                                             :dataset_query (mt/mbql-query venues
                                                                              {:fields [$id $name $category_id]
                                                                               :order-by [[:asc $id]]
                                                                               :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :categories)
                                           :alias "cat"
                                           :condition [:= [:field (mt/id :venues :category_id) {:base-type :type/Integer}]
                                                       [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                  :limit 2})]
                (is (malli= [:map
                             [:status [:= "failed"]]
                             [:error  [:= "You do not have permissions to run this query."]]]
                            (mt/user-http-request :rasta :post "dataset" join-query)))))))))))

(deftest api-card-with-join-table-join-permissions-test
  (testing "POST /api/dataset should error for card-with-join to table permission violations"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Block all access to checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :no)
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query checkins
                                 {:joins [{:fields :all
                                           :source-table (format "card__%d" venues-with-join-card-id)
                                           :alias "venues_card"
                                           :condition [:= $venue_id
                                                       [:field (mt/id :venues :id) {:base-type :type/Integer, :join-alias "venues_card"}]]}]
                                  :limit 2})]
                (is (malli= [:map
                             [:status [:= "failed"]]
                             [:error  [:= "You do not have permissions to run this query."]]]
                            (mt/user-http-request :rasta :post "dataset" join-query)))))))))))

(deftest api-card-with-join-source-table-join-permissions-test
  (testing "POST /api/dataset should error for card-with-join as source with table join permission violations"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (mt/with-no-data-perms-for-all-users!
          ;; Allow access to venues and categories tables for the card with join
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :venues) :perms/create-queries :query-builder)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/view-data :unrestricted)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :categories) :perms/create-queries :query-builder)
          ;; Block all access to checkins table
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
          (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/create-queries :no)
          (mt/with-temp [:model/Collection collection]
            (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
            (mt/with-temp [:model/Card {venues-with-join-card-id :id} {:collection_id (u/the-id collection)
                                                                       :dataset_query (mt/mbql-query venues
                                                                                        {:fields [$id $name $category_id]
                                                                                         :joins [{:fields :all
                                                                                                  :source-table (mt/id :categories)
                                                                                                  :alias "cat"
                                                                                                  :condition [:= $category_id
                                                                                                              [:field (mt/id :categories :id) {:base-type :type/Integer, :join-alias "cat"}]]}]
                                                                                         :order-by [[:asc $id]]
                                                                                         :limit 5})}]
              (let [join-query (mt/mbql-query nil
                                 {:source-table (format "card__%d" venues-with-join-card-id)
                                  :joins [{:fields :all
                                           :source-table (mt/id :checkins)
                                           :alias "checkins"
                                           :condition [:= [:field (mt/id :venues :id) {:base-type :type/Integer}]
                                                       [:field (mt/id :checkins :venue_id) {:base-type :type/Integer, :join-alias "checkins"}]]}]
                                  :limit 2})]
                (is (malli= [:map
                             [:status [:= "failed"]]
                             [:error  [:= "You do not have permissions to run this query."]]]
                            (mt/user-http-request :rasta :post "dataset" join-query)))))))))))

(deftest ^:parallel compile-test
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\" "
                           "FROM \"PUBLIC\".\"VENUES\" "
                           "LIMIT 1048575")
              :params nil}
             (mt/user-http-request :crowberto :post 200 "dataset/native"
                                   (assoc (mt/mbql-query venues {:fields [$id $name]})
                                          :pretty false)))))))

(deftest ^:parallel compile-disable-max-results-test
  (testing "POST /api/dataset/native"
    (testing "\nWith disable-max-results? the compiled SQL should not include a LIMIT clause"
      (let [query (-> (mt/mbql-query venues {:fields [$id $name]})
                      (assoc-in [:middleware :disable-max-results?] true)
                      (assoc :pretty false))
            result (mt/user-http-request :crowberto :post 200 "dataset/native" query)]
        (is (not (re-find #"(?i)\bLIMIT\b" (:query result)))
            (str "Expected no LIMIT in SQL, got: " (:query result)))))))

(deftest ^:parallel compile-test-2
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (testing "\nMake sure parameters are spliced correctly"
        (is (= {:query  ["SELECT"
                         "  \"PUBLIC\".\"CHECKINS\".\"ID\" AS \"ID\""
                         "FROM"
                         "  \"PUBLIC\".\"CHECKINS\""
                         "WHERE"
                         "  \"PUBLIC\".\"CHECKINS\".\"DATE\" = date '2015-11-13'"
                         "LIMIT"
                         "  1048575"]
                :params nil}
               (-> (mt/user-http-request :crowberto :post 200 "dataset/native"
                                         (assoc (mt/mbql-query checkins
                                                  {:fields [$id]
                                                   :filter [:= $date "2015-11-13"]})
                                                :pretty false))
                   (update :query #(str/split-lines (driver/prettify-native-form :h2 %))))))))))

(deftest compile-test-3
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (testing "\nshould require that the user have ad-hoc native perms for the DB"
        (mt/with-temp-copy-of-db
          ;; Give All Users permissions to see the `venues` Table, but not ad-hoc native perms
          (mt/with-no-data-perms-for-all-users!
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
            (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
            (is (malli= [:map
                         [:permissions-error? [:= true]]
                         [:message            [:= "You do not have permissions to run this query."]]]
                        (mt/user-http-request :rasta :post "dataset/native"
                                              (mt/mbql-query venues
                                                {:fields [$id $name]}))))))))))

(deftest ^:parallel compile-test-4
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (testing "We should be able to format the resulting SQL query if desired"
        ;; Note that the following was tested against all driver branches of format-sql and all results were identical.
        (is (= {:query  (str "SELECT\n"
                             "  \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\",\n"
                             "  \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\"\n"
                             "FROM\n"
                             "  \"PUBLIC\".\"VENUES\"\n"
                             "LIMIT\n"
                             "  1048575")
                :params nil}
               (mt/user-http-request :crowberto :post 200 "dataset/native"
                                     (assoc
                                      (mt/mbql-query venues {:fields [$id $name]})
                                      :pretty true))))))))

(deftest ^:parallel compile-test-5
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (testing "The default behavior is to format the SQL"
        (is (= {:query  (str "SELECT\n"
                             "  \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\",\n"
                             "  \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\"\n"
                             "FROM\n"
                             "  \"PUBLIC\".\"VENUES\"\n"
                             "LIMIT\n"
                             "  1048575")
                :params nil}
               (mt/user-http-request :crowberto :post 200 "dataset/native"
                                     (mt/mbql-query venues {:fields [$id $name]}))))))))

;; historical test: don't do this going forward
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel compile-test-6
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (testing "`:now` is usable inside `:case` with mongo (#32216)"
        (mt/test-driver :mongo
          (is (= {"$switch"
                  {"branches"
                   [{"case" {"$eq" [{"$dayOfMonth" {"date" "$$NOW", "timezone" "UTC"}}
                                    {"$dayOfMonth" {"date" "$$NOW", "timezone" "UTC"}}]},
                     "then" "a"}]
                   "default" "b"}}
                 (-> (mt/user-http-request
                      :crowberto :post 200 "dataset/native"
                      (mt/mbql-query venues
                        {:expressions
                         {:E [:case [[[:= [:get-day [:now]] [:get-day [:now]]] "a"]]
                              {:default "b"}]}}))
                     :query json/decode first (get-in ["$project" "E"])))))))))

;; historical test: don't do this going forward
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest report-timezone-test
  (mt/test-driver :postgres
    (testing "expected (desired) and actual timezone should be returned as part of query results"
      (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
        (let [results (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query checkins
                                                                         {:aggregation [[:count]]}))]
          (is (= {:requested_timezone "US/Pacific"
                  :results_timezone   "US/Pacific"}
                 (-> results
                     :data
                     (select-keys [:requested_timezone :results_timezone])))))))))

;; historical test: don't do this going forward
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest databricks-stack-trace-test
  (testing "exceptions with stacktraces should have the stacktrace removed"
    (mt/test-driver :databricks
      (let [res (mt/user-http-request :rasta :post 202 "dataset"
                                      (lib/native-query (mt/metadata-provider)
                                                        "asdf;"))]
        (is (= {:error_type "invalid-query"
                :status "failed"
                :class "class com.databricks.jdbc.exception.DatabricksSQLException"}
               (select-keys res [:error_type :status :class])))
        (is (not (str/includes? (:error res) "\n\tat ")))))))

(deftest ^:parallel pivot-dataset-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :crowberto :post 202 "dataset/pivot" (qp.pivot.test-util/pivot-query))
                rows   (mt/rows result)]
            (is (= 1144 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))
            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["MD" "Twitter" nil 4 16 62] (nth rows 1000)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))))))

(deftest ^:parallel pivot-dataset-row-totals-disabled-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot with row totals disabled"
        (let [query (merge (qp.pivot.test-util/pivot-query true)
                           {:show_row_totals false
                            :show_column_totals true})
              result (mt/user-http-request :crowberto :post 202 "dataset/pivot" query)
              rows   (mt/rows result)]
          (is (= 912 (:row_count result)))
          (is (= "completed" (:status result)))
          ;; Only pivot groupings necessary for data and col totals
          (is (= [0 1 3]
                 (->> rows
                      (map #(nth % 3))
                      distinct
                      vec))))))))

(deftest ^:parallel pivot-dataset-column-totals-disabled-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot with column totals disabled"
        (let [query (merge (qp.pivot.test-util/pivot-query true)
                           {:show_row_totals true
                            :show_column_totals false})
              result (mt/user-http-request :crowberto :post 202 "dataset/pivot" query)
              rows   (mt/rows result)]
          (is (= 1114 (:row_count result)))
          (is (= "completed" (:status result)))
          ;; Only pivot groupings necessary for data and row totals
          (is (= [0 4]
                 (->> rows
                      (map #(nth % 3))
                      distinct
                      vec))))))))

(deftest ^:parallel pivot-dataset-both-totals-disabled-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot with row and column totals disabled"
        (let [query (merge (qp.pivot.test-util/pivot-query true)
                           {:show_row_totals false
                            :show_column_totals false})
              result (mt/user-http-request :crowberto :post 202 "dataset/pivot" query)
              rows   (mt/rows result)]
          (is (= 888 (:row_count result)))
          (is (= "completed" (:status result)))
          ;; Only pivot groupings necessary for data
          (is (= [0]
                 (->> rows
                      (map #(nth % 3))
                      distinct
                      vec))))))))

(deftest ^:parallel pivot-filter-dataset-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :crowberto :post 202 "dataset/pivot" (qp.pivot.test-util/filters-query))
                rows   (mt/rows result)]
            (is (= 140 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 140 (count rows)))

            (is (= ["AK" "Google" 0 119] (first rows)))
            (is (= ["AK" "Organic" 0 89] (second rows)))
            (is (= ["WA" nil 2 148] (nth rows 135)))
            (is (= [nil nil 3 7562] (last rows)))))))))

(deftest ^:parallel pivot-parameter-dataset-test
  (mt/test-drivers (qp.pivot.test-util/applicable-drivers)
    (mt/dataset test-data
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :crowberto :post 202 "dataset/pivot" (qp.pivot.test-util/parameters-query))
                rows   (mt/rows result)]
            (is (= 137 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 137 (count rows)))

            (is (= ["AK" "Google" 0 27] (first rows)))
            (is (= ["AK" "Organic" 0 25] (second rows)))
            (is (= ["VA" nil 2 29] (nth rows 130)))
            (is (= [nil nil 3 2009] (last rows)))))))))

(deftest ^:parallel parameter-values-test
  (testing "static-list"
    (let [parameter {:values_query_type "list",
                     :values_source_type "static-list",
                     :values_source_config {:values ["foo1" "foo2" "bar"]},
                     :name "Text",
                     :slug "text",
                     :id "89e8bb5f",
                     :type :string/=,
                     :sectionId "string"}]
      (testing "values"
        (is (partial= {:values [["foo1"] ["foo2"] ["bar"]]}
                      (mt/user-http-request :crowberto :post 200
                                            "dataset/parameter/values"
                                            {:parameter parameter}))))
      (testing "search"
        (is (partial= {:values [["foo1"] ["foo2"]]}
                      (mt/user-http-request :crowberto :post 200
                                            "dataset/parameter/search/fo"
                                            {:parameter parameter})))))))

(deftest ^:parallel parameter-values-test-2
  (mt/with-temp [:model/Card {card-id :id} {:database_id (mt/id)
                                            :dataset_query (mt/mbql-query products)}]
    (let [parameter {:values_query_type "list",
                     :values_source_type "card",
                     :values_source_config {:card_id card-id,
                                            :value_field
                                            [:field (mt/id :products :category) nil]},
                     :name "Text 1",
                     :slug "text_1",
                     :id "2487b568",
                     :type :string/=,
                     :sectionId "string"}]
      (testing "card"
        (testing "values"
          (let [values (-> (mt/user-http-request :crowberto :post 200
                                                 "dataset/parameter/values"
                                                 {:parameter parameter})
                           :values set)]
            (is (= #{["Gizmo"] ["Widget"] ["Gadget"] ["Doohickey"]} values))))
        (testing "search"
          (let [values (-> (mt/user-http-request :crowberto :post 200
                                                 "dataset/parameter/search/g"
                                                 {:parameter parameter})
                           :values set)]
            (is (= #{["Gizmo"] ["Widget"] ["Gadget"]} values))))))))

(deftest ^:parallel parameter-values-test-3
  (testing "nil value (current behavior of field values)"
    (let [parameter {:values_query_type "list",
                     :values_source_type nil,
                     :values_source_config {},
                     :name "Text 2",
                     :slug "text_2",
                     :id "707f4bbf",
                     :type :string/=,
                     :sectionId "string"}]
      (testing "values"
        (let [values (-> (mt/user-http-request :crowberto :post 200
                                               "dataset/parameter/values"
                                               {:parameter parameter
                                                :field_ids [(mt/id :products :category)
                                                            (mt/id :people :source)]})
                         :values set)]
          (is (set/subset? #{["Doohickey"] ["Facebook"]} values))))

      (testing "search"
        (let [values (-> (mt/user-http-request :crowberto :post 200
                                               "dataset/parameter/search/g"
                                               {:parameter parameter
                                                :field_ids [(mt/id :products :category)
                                                            (mt/id :people :source)]})
                         :values set)]
          ;; results matched on g, does not include Doohickey (which is in above results)
          (is (set/subset? #{["Widget"] ["Google"]} values))
          (is (not (contains? values ["Doohickey"])))))

      (testing "deduplicates the values returned from multiple fields"
        (let [values (-> (mt/user-http-request :crowberto :post 200
                                               "dataset/parameter/values"
                                               {:parameter parameter
                                                :field_ids [(mt/id :people :source)
                                                            (mt/id :people :source)]})
                         :values)]
          (is (= [["Twitter"] ["Organic"] ["Affiliate"] ["Google"] ["Facebook"]] values)))))))

(deftest parameter-values-test-4
  (testing "fallback to field-values"
    (let [mock-default-result {:values          [["field-values"]]
                               :has_more_values false}]
      (with-redefs [api.dataset/parameter-field-values (constantly mock-default-result)]
        (testing "if value-field not found in source card"
          (mt/with-temp [:model/Card {source-card-id :id}]
            (is (= mock-default-result
                   (mt/user-http-request :crowberto :post 200 "dataset/parameter/values"
                                         {:parameter  {:values_source_type   "card"
                                                       :values_source_config {:card_id     source-card-id
                                                                              :value_field (mt/$ids $people.source)}
                                                       :type                 :string/=,
                                                       :name                 "Text"
                                                       :id                   "abc"}})))))

        (testing "if value-field not found in source card"
          (mt/with-temp [:model/Card {source-card-id :id} {:archived true}]
            (is (= mock-default-result
                   (mt/user-http-request :crowberto :post 200 "dataset/parameter/values"
                                         {:parameter  {:values_source_type   "card"
                                                       :values_source_config {:card_id     source-card-id
                                                                              :value_field (mt/$ids $people.source)}
                                                       :type                 :string/=,
                                                       :name                 "Text"
                                                       :id                   "abc"}})))))))))

(deftest ^:parallel parameter-remapping-test
  (testing "field values"
    (let [parameter {:values_query_type    "list"
                     :values_source_type   nil
                     :values_source_config {}
                     :name                 "ID 2"
                     :slug                 "id_2"
                     :id                   "707f4bbf"
                     :type                 "id"
                     :sectionId            "string"}
          body      {:parameter parameter
                     :field_ids [(mt/id :people :id)]
                     :value     1}]
      (is (= [1 "Hudson Borer"]
             (mt/user-http-request :crowberto :post 200 "dataset/parameter/remapping" body)))))
  (testing "static list"
    (let [parameter {:name                 "Static Category label"
                     :id                   "list-param-id"
                     :type                 "category"
                     :values_source_type   "static-list"
                     :values_source_config {:values [["A frican" "Af"]
                                                     ["American" "Am"]
                                                     ["A   sian" "As"]]}}
          body      {:parameter parameter
                     :field_ids [(mt/id :people :name)]
                     :value     "A   sian"}]
      (is (= ["A   sian" "As"]
             (mt/user-http-request :crowberto :post 200 "dataset/parameter/remapping" body))))))

(deftest ^:parallel adhoc-mlv2-query-test
  (testing "POST /api/dataset"
    (testing "Should be able to run an ad-hoc MLv2 query (#39024)"
      (let [metadata-provider (mt/metadata-provider)
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            query             (-> (lib/query metadata-provider venues)
                                  (lib/order-by (lib.metadata/field metadata-provider (mt/id :venues :id)))
                                  (lib/limit 2))]
        (is (=? {:data {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]
                               [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]}}
                (mt/user-http-request :crowberto :post 202 "dataset" query)))))))

(deftest ^:parallel mlv2-query-convert-to-native-test
  (testing "POST /api/dataset/native"
    (testing "Should be able to convert an MLv2 query to native (#39024)"
      (let [metadata-provider (mt/metadata-provider)
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            query             (-> (lib/query metadata-provider venues)
                                  (lib/order-by (lib.metadata/field metadata-provider (mt/id :venues :id)))
                                  (lib/limit 2))]
        (is (=? {:query
                 ["SELECT"
                  "  \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
                  "  \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
                  "  \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
                  "  \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
                  "  \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
                  "  \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\""
                  "FROM"
                  "  \"PUBLIC\".\"VENUES\""
                  "ORDER BY"
                  "  \"PUBLIC\".\"VENUES\".\"ID\" ASC"
                  "LIMIT"
                  "  2"],
                 :params nil}
                (-> (mt/user-http-request :crowberto :post 200 "dataset/native" query)
                    (update :query (fn [s]
                                     (some->> s
                                              (driver/prettify-native-form :h2)
                                              str/split-lines))))))))))

(deftest ^:parallel mlv2-query-convert-to-native-disable-default-limit-test
  (testing "POST /api/dataset/native"
    (testing "MLv2 query with disable-default-limit should compile to SQL without a LIMIT clause"
      (let [metadata-provider (mt/metadata-provider)
            venues            (lib.metadata/table metadata-provider (mt/id :venues))
            query             (-> (lib/query metadata-provider venues)
                                  lib/disable-default-limit)]
        (is (not (re-find #"(?i)\bLIMIT\b" (:query (mt/user-http-request :crowberto :post 200 "dataset/native" query))))
            "Expected no LIMIT in SQL for query with disable-default-limit")))))

(deftest ^:parallel format-export-middleware-test
  (testing "The `:format-export?` query processor middleware has the intended effect on file exports."
    (let [q             {:database (mt/id)
                         :type     :native
                         :native   {:query "SELECT 2000 AS number, '2024-03-26'::DATE AS date;"}}
          output-helper {:csv  (fn [output] (->> output csv/read-csv last))
                         :json (fn [output] (->> output (map (juxt :NUMBER :DATE)) last))}]
      (doseq [[export-format apply-formatting? expected] [[:csv true ["2,000" "March 26, 2024"]]
                                                          [:csv false ["2000" "2024-03-26"]]
                                                          [:json true ["2,000" "March 26, 2024"]]
                                                          [:json false [2000 "2024-03-26"]]]]
        (testing (format "export_format %s yields expected output for %s exports." apply-formatting? export-format)
          (is (= expected
                 (->> (mt/user-http-request
                       :crowberto :post 200
                       (format "dataset/%s" (name export-format))
                       {:query q, :format_rows apply-formatting?})
                      ((get output-helper export-format))))))))))

(deftest pivot-exports-ignore-query-constraints
  (testing "POST /api/dataset/:format with pivot-results=true"
    (testing "Downloading pivot CSV/JSON/XLSX results shouldn't be subject to the default query constraints"
      (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
        (let [query {:database   (mt/id)
                     :type       :query
                     :query      {:source-table (mt/id :venues)
                                  :breakout     [[:field (mt/id :venues :name) nil]
                                                 [:field (mt/id :venues :category_id) nil]]
                                  :aggregation  [[:count]]}
                     :middleware {:pivot? true}}
              result (mt/user-http-request :crowberto :post 200 "dataset/csv"
                                           {:query query})]
          ;; The venues table has 100+ rows, so we should get more than default constraints (10)
          (is (> (count (csv/read-csv result)) 10)))))))

(deftest ^:parallel query-metadata-test
  (testing "MBQL query"
    (is (=? {:databases [{:id (mt/id)}]
             :tables    [{:id (mt/id :products)}]
             :fields    empty?}
            (mt/user-http-request :crowberto :post 200 "dataset/query_metadata"
                                  (mt/mbql-query products)))))
  (testing "Parameterized native query"
    (is (=? {:databases [{:id (mt/id)}]
             :tables    empty?
             :fields    [{:id (mt/id :people :id)}]}
            (mt/user-http-request :crowberto :post 200 "dataset/query_metadata"
                                  {:database (mt/id)
                                   :type     :native
                                   :native   {:query "SELECT COUNT(*) FROM people WHERE {{id}}"
                                              :template-tags
                                              {"id" {:name         "id"
                                                     :display-name "Id"
                                                     :type         :dimension
                                                     :dimension    [:field (mt/id :people :id) nil]
                                                     :widget-type  :id
                                                     :default      nil}}}})))))

(deftest dataset-query-metadata-with-archived-and-deleted-source-card-test
  (testing "Don't throw an error if source card is deleted (#48461)"
    (mt/with-temp
      [:model/Card {card-id-1 :id} {:dataset_query (mt/mbql-query products)}
       :model/Card {card-id-2 :id} {:dataset_query {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table (str "card__" card-id-1)}}}]
      (letfn [(query-metadata [expected-status card-id]
                (-> (mt/user-http-request :crowberto :post expected-status
                                          "dataset/query_metadata"
                                          {:type     :query
                                           :query    {:source-table (str "card__" card-id)}
                                           :database (mt/id)})
                    (api.test-util/select-query-metadata-keys-for-debugging)))]
        (api.test-util/before-and-after-deleted-card
         card-id-1
         #(testing "Before delete"
            (doseq [card-id [card-id-1 card-id-2]]
              (is (=?
                   {:fields    empty?
                    :tables    [{:id (str "card__" card-id)}]
                    :databases [{:id (mt/id) :engine string?}]}
                   (query-metadata 200 card-id)))))
         #(testing "After delete"
            ;; card-id-1 is deleted, so querying it as a source returns empty tables
            (is (=?
                 {:fields    empty?
                  :tables    empty?
                  :databases [{:id (mt/id) :engine string?}]}
                 (query-metadata 200 card-id-1)))
            ;; card-id-2 still exists, so querying it as a source still works
            (is (=?
                 {:fields    empty?
                  :tables    [{:id (str "card__" card-id-2)}]
                  :databases [{:id (mt/id) :engine string?}]}
                 (query-metadata 200 card-id-2)))))))))

(deftest published-table-does-not-grant-database-access-oss-test
  (testing "POST /api/dataset in OSS: published table access does NOT grant database access"
    (mt/with-premium-features #{}
      (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (mt/with-temp [:model/User       {user-id :id} {:email "oss-db-access-test@example.com"}
                         :model/Collection collection {}]
            ;; Publish the venues table into this collection
            (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id (u/the-id collection)})
            (let [all-users (perms/all-users-group)]
              ;; Set database-level permissions first to establish baseline
              (perms/set-database-permission! all-users (mt/id) :perms/view-data :unrestricted)
              (perms/set-database-permission! all-users (mt/id) :perms/create-queries :no)
              ;; Grant collection read permission - gives create-queries via published table mechanism in EE
              (perms/grant-collection-read-permissions! all-users (u/the-id collection))
              ;; Set table-level permissions
              (perms/set-table-permission! all-users (mt/id :venues) :perms/view-data :unrestricted)
              (perms/set-table-permission! all-users (mt/id :venues) :perms/create-queries :no)
              ;; In OSS: published tables don't grant database access, so user gets 403 at database check
              (testing "Query should be blocked because OSS doesn't grant database access via published tables"
                (is (= "You don't have permissions to do that."
                       (mt/with-current-user user-id
                         (mt/user-http-request user-id :post 403 "dataset"
                                               (mt/mbql-query venues {:limit 1})))))))))))))

(deftest query-metadata-sensitive-fields-test
  (testing "POST /api/dataset/query_metadata"
    (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:visibility_type :sensitive}
      (testing "sensitive fields are excluded by default"
        (let [result (mt/user-http-request :crowberto :post 200 "dataset/query_metadata"
                                           (mt/mbql-query venues))]
          (is (not (some #(= (:id %) (mt/id :venues :price))
                         (->> result :tables (mapcat :fields))))
              "Sensitive field should NOT be included by default")))
      (testing "sensitive fields are included when :settings :include-sensitive-fields is true"
        (let [result (mt/user-http-request :crowberto :post 200 "dataset/query_metadata"
                                           (assoc (mt/mbql-query venues)
                                                  :settings {:include_sensitive_fields true}))]
          (is (some #(= (:id %) (mt/id :venues :price))
                    (->> result :tables (mapcat :fields)))
              "Sensitive field SHOULD be included when :settings :include-sensitive-fields is true"))))))
