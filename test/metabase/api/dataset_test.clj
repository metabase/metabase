(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints. There are additional tests for downloading XLSX/CSV/JSON results generally in
  [[metabase.query-processor.streaming-test]] and specifically for each format
  in [[metabase.query-processor.streaming.csv-test]] etc."
  (:require
   [cheshire.core :as json]
   [clojure.data.csv :as csv]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.api.dataset :as api.dataset]
   [metabase.api.pivots :as api.pivots]
   [metabase.driver :as driver]
   [metabase.http-client :as client]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.card :refer [Card]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
            (t2/select-one QueryExecution
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
            result (mt/user-http-request :rasta :post 202 "dataset" query)]
        (testing "\nAPI Response"
          (is (partial=
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
          (is (= {:hash         true
                  :row_count    1
                  :result_rows  1
                  :context      :ad-hoc
                  :executor_id  (mt/user->id :rasta)
                  :native       false
                  :pulse_id     nil
                  :card_id      nil
                  :is_sandboxed false
                  :dashboard_id nil
                  :error        nil
                  :id           true
                  :action_id    nil
                  :cache_hit    false
                  :cache_hash   false
                  :database_id  (mt/id)
                  :started_at   true
                  :running_time true}
                 (format-response (most-recent-query-execution-for-query query)))))))))

(deftest failure-test
  ;; clear out recent query executions!
  (t2/delete! QueryExecution)
  (testing "POST /api/dataset"
    (testing "\nEven if a query fails we still expect a 202 response from the API"
      ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check
      ;; that it exists and contains the substring "Syntax error in SQL statement"
      (let [query  {:database (mt/id)
                    :type     "native"
                    :native   {:query "foobar"}}
            result (mt/user-http-request :rasta :post 202 "dataset" query)]
        (testing "\nAPI Response"
          (is (malli= [:map
                       [:data        [:fn #(= % {:rows [] :cols []})]]
                       [:row_count   [:= 0]]
                       [:status      [:= "failed"]]
                       [:context     [:= "ad-hoc"]]
                       [:error       #"Syntax error in SQL statement"]
                       [:json_query  [:fn #(= % (merge
                                                  query-defaults
                                                  {:database (mt/id)
                                                   :type     "native"
                                                   :native   {:query "foobar"}}))]]
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
                [:executor_id  [:= (mt/user->id :rasta)]]
                [:native       [:= true]]
                [:pulse_id     nil?]
                [:card_id      nil?]
                [:dashboard_id nil?]]
               (most-recent-query-execution-for-query query))))))))

(defn- test-download-response-headers
  [url]
  (-> (client/client-full-response (test.users/username->token :rasta)
                                   :post 200 url
                                   :query (json/generate-string (mt/mbql-query checkins {:limit 1})))
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
    (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                        :type     :native
                                                        :native   {:query "SELECT * FROM USERS;"}}}]
      (letfn [(do-test []
                (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                                   :query (json/generate-string
                                                           {:database lib.schema.id/saved-questions-virtual-database-id
                                                            :type     :query
                                                            :query    {:source-table (str "card__" (u/the-id card))}}))]
                  (is (some? result))
                  (when (some? result)
                    (is (= 16
                           (count (csv/read-csv result)))))))]
        (testing "with data perms"
          (do-test))
        (testing "with collection perms only"
          (perms/revoke-data-perms! (perms-group/all-users) (mt/db))
          (do-test))))))

(deftest formatted-results-ignore-query-constraints
  (testing "POST /api/dataset/:format"
    (testing "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints (#9831)"
      ;; even if the query comes in with `add-default-userland-constraints` (as will be the case if the query gets saved
      (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
        (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                           :query (json/generate-string
                                                   {:database (mt/id)
                                                    :type     :query
                                                    :query    {:source-table (mt/id :venues)}
                                                    :middleware
                                                    {:add-default-userland-constraints? true
                                                     :userland-query?                   true}}))]
          (is (some? result))
          (when (some? result)
            (is (= 101
                   (count (csv/read-csv result))))))))))

(deftest export-with-remapped-fields
  (testing "POST /api/dataset/:format"
    (testing "Downloaded CSV/JSON/XLSX results should respect remapped fields (#18440)"
      (let [query (json/generate-string {:database (mt/id)
                                         :type     :query
                                         :query    {:source-table (mt/id :venues)
                                                    :limit 1}
                                         :middleware
                                         {:add-default-userland-constraints? true
                                          :userland-query?                   true}})]
        (mt/with-column-remappings [venues.category_id categories.name]
          (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                             :query query)]
            (is (str/includes? result "Asian"))))
        (mt/with-column-remappings [venues.category_id (values-of categories.name)]
          (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                             :query query)]
            (is (str/includes? result "Asian"))))))))

(deftest non--download--queries-should-still-get-the-default-constraints
  (testing (str "non-\"download\" queries should still get the default constraints "
                "(this also is a sanitiy check to make sure the `with-redefs` in the test above actually works)")
    (with-redefs [qp.constraints/default-query-constraints (constantly {:max-results 10, :max-results-bare-rows 10})]
      (let [{row-count :row_count, :as result}
            (mt/user-http-request :rasta :post 202 "dataset"
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
      (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
      (perms/grant-permissions! (perms-group/all-users) (mt/id) "schema_that_does_not_exist")
      (is (malli= [:map
                   [:status [:= "failed"]]
                   [:error  [:= "You do not have permissions to run this query."]]]
                  (mt/user-http-request :rasta :post "dataset"
                                        (mt/mbql-query venues {:limit 1})))))))

(deftest compile-test
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\" "
                           "FROM \"PUBLIC\".\"VENUES\" "
                           "LIMIT 1048575")
              :params nil}
             (mt/user-http-request :rasta :post 200 "dataset/native"
                                   (assoc (mt/mbql-query venues {:fields [$id $name]})
                                     :pretty false))))

      (testing "\nMake sure parameters are spliced correctly"
        (is (= {:query  (str "SELECT \"PUBLIC\".\"CHECKINS\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"CHECKINS\" "
                             "WHERE (\"PUBLIC\".\"CHECKINS\".\"DATE\" >= timestamp with time zone '2015-11-13 00:00:00.000Z')"
                             " AND (\"PUBLIC\".\"CHECKINS\".\"DATE\" < timestamp with time zone '2015-11-14 00:00:00.000Z') "
                             "LIMIT 1048575")
                :params nil}
               (mt/user-http-request :rasta :post 200 "dataset/native"
                                     (assoc (mt/mbql-query checkins
                                                           {:fields [$id]
                                                            :filter [:= $date "2015-11-13"]})
                                       :pretty false)))))

      (testing "\nshould require that the user have ad-hoc native perms for the DB"
        (mt/with-temp-copy-of-db
          ;; Give All Users permissions to see the `venues` Table, but not ad-hoc native perms
          (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
          (perms/grant-permissions! (perms-group/all-users) (mt/id) "PUBLIC" (mt/id :venues))
          (is (malli= [:map
                       [:permissions-error? [:= true]]
                       [:message            [:= "You do not have permissions to run this query."]]]
                      (mt/user-http-request :rasta :post "dataset/native"
                                            (mt/mbql-query venues
                                                           {:fields [$id $name]})))))))
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
             (mt/user-http-request :rasta :post 200 "dataset/native"
                                   (assoc
                                    (mt/mbql-query venues {:fields [$id $name]})
                                    :pretty true)))))
    (testing "The default behavior is to format the SQL"
      (is (= {:query  (str "SELECT\n"
                           "  \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\",\n"
                           "  \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\"\n"
                           "FROM\n"
                           "  \"PUBLIC\".\"VENUES\"\n"
                           "LIMIT\n"
                           "  1048575")
              :params nil}
             (mt/user-http-request :rasta :post 200 "dataset/native"
                                   (mt/mbql-query venues {:fields [$id $name]})))))
    (testing "`:now` is usable inside `:case` with mongo (#32216)"
      (mt/test-driver :mongo
        (is (= {:$switch
                {:branches
                 [{:case {:$eq [{:$dayOfMonth {:date "$$NOW", :timezone "UTC"}}
                                {:$dayOfMonth {:date "$$NOW", :timezone "UTC"}}]},
                   :then "a"}]
                 :default "b"}}
               (-> (mt/user-http-request
                    :rasta :post 200 "dataset/native"
                    (mt/mbql-query venues
                      {:expressions
                       {:E [:case [[[:= [:get-day [:now]] [:get-day [:now]]] "a"]]
                            {:default "b"}]}}))
                   :query first :$project :E)))))))

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

(deftest pivot-dataset-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (api.pivots/pivot-query))
                rows   (mt/rows result)]
            (is (= 1144 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1144 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["WV" "Facebook" nil 4 45 292] (nth rows 1000)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))

        ;; this only works on a handful of databases -- most of them don't allow you to ask for a Field that isn't in
        ;; the GROUP BY expression
        (when (#{:mongo :h2 :sqlite} driver/*driver*)
          (testing "with an added expression"
            ;; the added expression is coming back in this query because it is explicitly included in `:fields` -- see
            ;; comments on [[metabase.query-processor.pivot-test/pivots-should-not-return-expressions-test]].
            (let [query  (-> (api.pivots/pivot-query)
                             (assoc-in [:query :fields] [[:expression "test-expr"]])
                             (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]}))
                  result (mt/user-http-request :rasta :post 202 "dataset/pivot" query)
                  rows   (mt/rows result)]
              (is (= 1144 (:row_count result)))
              (is (= 1144 (count rows)))

              (let [cols (mt/cols result)]
                (is (= ["User → State"
                        "User → Source"
                        "Product → Category"
                        "pivot-grouping"
                        "Count"
                        "Sum of Quantity"
                        "test-expr"]
                       (map :display_name cols)))
                (is (= {:base_type       "type/Integer"
                        :effective_type  "type/Integer"
                        :name            "pivot-grouping"
                        :display_name    "pivot-grouping"
                        :expression_name "pivot-grouping"
                        :field_ref       ["expression" "pivot-grouping"]
                        :source          "breakout"}
                       (nth cols 3))))

              (is (= [nil nil nil 7 18760 69540 "wheeee"] (last rows))))))))))

(deftest pivot-filter-dataset-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (api.pivots/filters-query))
                rows   (mt/rows result)]
            (is (= 140 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 140 (count rows)))

            (is (= ["AK" "Google" 0 119] (first rows)))
            (is (= ["AK" "Organic" 0 89] (second rows)))
            (is (= ["WA" nil 2 148] (nth rows 135)))
            (is (= [nil nil 3 7562] (last rows)))))))))

(deftest pivot-parameter-dataset-test
  (mt/test-drivers (api.pivots/applicable-drivers)
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (api.pivots/parameters-query))
                rows   (mt/rows result)]
            (is (= 137 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 137 (count rows)))

            (is (= ["AK" "Google" 0 27] (first rows)))
            (is (= ["AK" "Organic" 0 25] (second rows)))
            (is (= ["VA" nil 2 29] (nth rows 130)))
            (is (= [nil nil 3 2009] (last rows)))))))))

(deftest parameter-values-test
  (mt/dataset sample-dataset
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
                        (mt/user-http-request :rasta :post 200
                                              "dataset/parameter/values"
                                              {:parameter parameter}))))
        (testing "search"
          (is (partial= {:values [["foo1"] ["foo2"]]}
                        (mt/user-http-request :rasta :post 200
                                              "dataset/parameter/search/fo"
                                              {:parameter parameter}))))))
    (mt/with-temp [Card {card-id :id} {:database_id (mt/id)
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
            (let [values (-> (mt/user-http-request :rasta :post 200
                                                   "dataset/parameter/values"
                                                   {:parameter parameter})
                             :values set)]
              (is (= #{["Gizmo"] ["Widget"] ["Gadget"] ["Doohickey"]} values))))
          (testing "search"
            (let [values (-> (mt/user-http-request :rasta :post 200
                                                   "dataset/parameter/search/g"
                                                   {:parameter parameter})
                             :values set)]
              (is (= #{["Gizmo"] ["Widget"] ["Gadget"]} values)))))))

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
          (let [values (-> (mt/user-http-request :rasta :post 200
                                                 "dataset/parameter/values"
                                                 {:parameter parameter
                                                  :field_ids [(mt/id :products :category)
                                                              (mt/id :people :source)]})
                           :values set)]
            (is (set/subset? #{["Doohickey"] ["Facebook"]} values))))

        (testing "search"
          (let [values (-> (mt/user-http-request :rasta :post 200
                                                 "dataset/parameter/search/g"
                                                 {:parameter parameter
                                                  :field_ids [(mt/id :products :category)
                                                              (mt/id :people :source)]})
                           :values set)]
            ;; results matched on g, does not include Doohickey (which is in above results)
            (is (set/subset? #{["Widget"] ["Google"]} values))
            (is (not (contains? values ["Doohickey"])))))

        (testing "deduplicates the values returned from multiple fields"
          (let [values (-> (mt/user-http-request :rasta :post 200
                                                 "dataset/parameter/values"
                                                 {:parameter parameter
                                                  :field_ids [(mt/id :people :source)
                                                              (mt/id :people :source)]})
                           :values)]
            (is (= [["Twitter"] ["Organic"] ["Affiliate"] ["Google"] ["Facebook"]] values))))))

    (testing "fallback to field-values"
      (let [mock-default-result {:values          [["field-values"]]
                                 :has_more_values false}]
        (with-redefs [api.dataset/parameter-field-values (constantly mock-default-result)]
          (testing "if value-field not found in source card"
            (t2.with-temp/with-temp [Card {source-card-id :id}]
              (is (= mock-default-result
                     (mt/user-http-request :rasta :post 200 "dataset/parameter/values"
                                           {:parameter  {:values_source_type   "card"
                                                         :values_source_config {:card_id     source-card-id
                                                                                :value_field (mt/$ids $people.source)}
                                                         :type                 :string/=,
                                                         :name                 "Text"
                                                         :id                   "abc"}})))))

          (testing "if value-field not found in source card"
            (t2.with-temp/with-temp [Card {source-card-id :id} {:archived true}]
              (is (= mock-default-result
                     (mt/user-http-request :rasta :post 200 "dataset/parameter/values"
                                           {:parameter  {:values_source_type   "card"
                                                         :values_source_config {:card_id     source-card-id
                                                                                :value_field (mt/$ids $people.source)}
                                                         :type                 :string/=,
                                                         :name                 "Text"
                                                         :id                   "abc"}}))))))))))
