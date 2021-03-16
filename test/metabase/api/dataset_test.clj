(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [cheshire.core :as json]
            [cheshire.generate :as generate]
            [clojure.data.csv :as csv]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase.api.pivots :as pivots]
            [metabase.http-client :as http-client]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.query-processor.util :as qp-util]
            [metabase.test :as mt]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.test.data.users :as test-users]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.fasterxml.jackson.core.JsonGenerator))

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
       (contains? #{:id :started_at :running_time :hash} k)
       [k (boolean v)]

       (and (= :data k) (contains? v :native_form))
       [k (update v :native_form boolean)]

       :else
       [k v]))))

(defn- most-recent-query-execution-for-query [query]
  ;; it might take a fraction of a second for the QueryExecution to show up, it's saved asynchronously. So wait a bit
  ;; and retry if it's not there yet.
  (letfn [(thunk []
            (db/select-one QueryExecution
                           :hash (qp-util/query-hash query)
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
          (is (= {:data                   {:rows             [[1000]]
                                           :cols             [(mt/obj->json->obj (qp.test/aggregate-col :count))]
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
                  :dashboard_id nil
                  :error        nil
                  :id           true
                  :database_id  (mt/id)
                  :started_at   true
                  :running_time true}
                 (format-response (most-recent-query-execution-for-query query)))))))))

(deftest failure-test
  ;; clear out recent query executions!
  (db/delete! QueryExecution)
  (testing "POST /api/dataset"
    (testing "\nEven if a query fails we still expect a 202 response from the API"
      ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check
      ;; that it exists and contains the substring "Syntax error in SQL statement"
      (let [check-error-message (fn [output]
                                  (update output :error (fn [error-message]
                                                          (some->>
                                                           error-message
                                                           (re-find #"Syntax error in SQL statement")
                                                           boolean))))
            query               {:database (mt/id)
                                 :type     "native"
                                 :native   {:query "foobar"}}
            result              (mt/suppress-output
                                  (mt/user-http-request :rasta :post 202 "dataset" query))]
        (testing "\nAPI Response"
          (is (= {:data         {:rows []
                                 :cols []}
                  :row_count    0
                  :status       "failed"
                  :context      "ad-hoc"
                  :error        true
                  :json_query   (merge
                                 query-defaults
                                 {:database (mt/id)
                                  :type     "native"
                                  :native   {:query "foobar"}})
                  :database_id  (mt/id)
                  :state        "42001"
                  :class        "class org.h2.jdbc.JdbcSQLException"
                  :started_at   true
                  :running_time true}
                 (check-error-message (dissoc (format-response result) :stacktrace)))))
        (testing "\nSaved QueryExecution"
          (is (= {:hash         true
                  :id           true
                  :result_rows  0
                  :row_count    0
                  :context      :ad-hoc
                  :error        true
                  :database_id  (mt/id)
                  :started_at   true
                  :running_time true
                  :executor_id  (mt/user->id :rasta)
                  :native       true
                  :pulse_id     nil
                  :card_id      nil
                  :dashboard_id nil}
                 (check-error-message (format-response (most-recent-query-execution-for-query query))))))))))


;;; Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in XLSX (#5145,
;;; #5220, #5459)
(defrecord ^:private SampleNastyClass [^String v])

(generate/add-encoder
 SampleNastyClass
 (fn [obj, ^JsonGenerator json-generator]
   (.writeString json-generator (str (:v obj)))))

(defrecord ^:private AnotherNastyClass [^String v])

(deftest export-spreadsheet
  (is (= [{"Values" "values"}
          {"Values" "Hello XLSX World!"}       ; should use the JSON encoding implementation for object
          {"Values" "{:v \"No Encoder\"}"} ; fall back to the implementation of `str` for an object if no JSON encoder exists rather than barfing
          {"Values" "ABC"}]
         (->> (spreadsheet/create-workbook "Results" [["values"]
                                                      [(SampleNastyClass. "Hello XLSX World!")]
                                                      [(AnotherNastyClass. "No Encoder")]
                                                      ["ABC"]])
              (spreadsheet/select-sheet "Results")
              (spreadsheet/select-columns {:A "Values"})))))

(defn- parse-and-sort-csv [response]
  (assert (some? response))
  (sort-by
   ;; ID in CSV is a string, parse it and sort it to get the first 5
   (comp #(Integer/parseInt %) first)
   ;; First row is the header
   (rest (csv/read-csv response))))

(deftest date-columns-should-be-emitted-without-time
  (is (= [["1" "2014-04-07" "5" "12"]
          ["2" "2014-09-18" "1" "31"]
          ["3" "2014-09-15" "8" "56"]
          ["4" "2014-03-11" "5" "4"]
          ["5" "2013-05-05" "3" "49"]]
         (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                            (json/generate-string (mt/mbql-query checkins)))]
           (take 5 (parse-and-sort-csv result))))))

(deftest download-response-headers-test
  (testing "Make sure CSV/etc. download requests come back with the correct headers"
    (is (= {"Cache-Control"       "max-age=0, no-cache, must-revalidate, proxy-revalidate"
            "Content-Disposition" "attachment; filename=\"query_result_<timestamp>.csv\""
            "Content-Type"        "text/csv"
            "Expires"             "Tue, 03 Jul 2001 06:00:00 GMT"
            "X-Accel-Buffering"   "no"}
           (-> (http-client/client-full-response (test-users/username->token :rasta)
                                                 :post 200 "dataset/csv"
                                                 :query (json/generate-string (mt/mbql-query checkins {:limit 1})))
               :headers
               (select-keys ["Cache-Control" "Content-Disposition" "Content-Type" "Expires" "X-Accel-Buffering"])
               (update "Content-Disposition" #(some-> % (str/replace #"query_result_.+(\.\w+)"
                                                                                   "query_result_<timestamp>$1"))))))))

(deftest check-an-empty-date-column
  (mt/dataset defs/test-data-with-null-date-checkins
    (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                       (json/generate-string (mt/mbql-query checkins)))]
      (is (= [["1" "2014-04-07" "" "5" "12"]
              ["2" "2014-09-18" "" "1" "31"]
              ["3" "2014-09-15" "" "8" "56"]
              ["4" "2014-03-11" "" "5" "4"]
              ["5" "2013-05-05" "" "3" "49"]]
             (take 5 (parse-and-sort-csv result)))))))

(deftest sqlite-datetime-test
  (mt/test-driver :sqlite
    (testing "SQLite doesn't return proper date objects but strings, they just pass through the qp untouched"
      (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                         (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
        (is (= [["1" "2014-04-07" "5" "12"]
                ["2" "2014-09-18" "1" "31"]
                ["3" "2014-09-15" "8" "56"]
                ["4" "2014-03-11" "5" "4"]
                ["5" "2013-05-05" "3" "49"]]
               (parse-and-sort-csv result)))))))

(deftest datetime-fields-are-untouched-when-exported
  (let [result (mt/user-http-request :rasta :post 200 "dataset/csv" :query
                                     (json/generate-string (mt/mbql-query users {:order-by [[:asc $id]], :limit 5})))]
    (is (= [["1" "Plato Yeshua"        "2014-04-01T08:30:00"]
            ["2" "Felipinho Asklepios" "2014-12-05T15:15:00"]
            ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00"]
            ["4" "Simcha Yan"          "2014-01-01T08:30:00"]
            ["5" "Quentin Sören"       "2014-10-03T17:30:00"]]
           (parse-and-sort-csv result)))))

(deftest check-that-we-can-export-the-results-of-a-nested-query
  (mt/with-temp-copy-of-db
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :native
                                              :native   {:query "SELECT * FROM USERS;"}}}]
      (letfn [(do-test []
                (let [result (mt/user-http-request :rasta :post 200 "dataset/csv"
                                                   :query (json/generate-string
                                                           {:database mbql.s/saved-questions-virtual-database-id
                                                            :type     :query
                                                            :query    {:source-table (str "card__" (u/the-id card))}}))]
                  (is (some? result))
                  (when (some? result)
                    (is (= 16
                           (count (csv/read-csv result)))))))]
        (testing "with data perms"
          (do-test))
        (testing "with collection perms only"
          (perms/revoke-permissions! (group/all-users) (mt/db))
          (do-test))))))

;; POST /api/dataset/:format
(deftest formatted-results-ignore-query-constraints
  (testing "Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints (#9831)"
    ;; even if the query comes in with `add-default-userland-constraints` (as will be the case if the query gets saved
    (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
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
                 (count (csv/read-csv result)))))))))

;; non-"download" queries should still get the default constraints
;; (this also is a sanitiy check to make sure the `with-redefs` in the test above actually works)
(deftest non--download--queries-should-still-get-the-default-constraints
  (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
    (let [{row-count :row_count, :as result}
          (mt/user-http-request :rasta :post 202 "dataset"
                                {:database (mt/id)
                                 :type     :query
                                 :query    {:source-table (mt/id :venues)}})]
      (is (= 10
             (or row-count result))))))

(deftest check-permissions-test
  (testing "make sure `POST /dataset` calls check user permissions"
    (mt/with-temp-copy-of-db
      ;; give all-users *partial* permissions for the DB, so we know we're checking more than just read permissions for
      ;; the Database
      (perms/revoke-permissions! (group/all-users) (mt/id))
      (perms/grant-permissions! (group/all-users) (mt/id) "schema_that_does_not_exist")
      (is (schema= {:status   (s/eq "failed")
                    :error    (s/eq "You do not have permissions to run this query.")
                    s/Keyword s/Any}
                   (mt/suppress-output
                     (mt/user-http-request :rasta :post "dataset"
                                           (mt/mbql-query venues {:limit 1}))))))))

(deftest query->native-test
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\" "
                           "FROM \"PUBLIC\".\"VENUES\" "
                           "LIMIT 1048576")
              :params nil}
             (mt/user-http-request :rasta :post 200 "dataset/native"
                                   (mt/mbql-query venues
                                     {:fields [$id $name]}))))

      (testing "\nMake sure parameters are spliced correctly"
        (is (= {:query  (str "SELECT \"PUBLIC\".\"CHECKINS\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"CHECKINS\" "
                             "WHERE (\"PUBLIC\".\"CHECKINS\".\"DATE\" >= timestamp with time zone '2015-11-13 00:00:00.000Z'"
                             " AND \"PUBLIC\".\"CHECKINS\".\"DATE\" < timestamp with time zone '2015-11-14 00:00:00.000Z') "
                             "LIMIT 1048576")
                :params nil}
               (mt/user-http-request :rasta :post 200 "dataset/native"
                                     (mt/mbql-query checkins
                                       {:fields [$id]
                                        :filter [:= $date "2015-11-13"]})))))

      (testing "\nshould require that the user have ad-hoc native perms for the DB"
        (mt/suppress-output
          (mt/with-temp-copy-of-db
            ;; Give All Users permissions to see the `venues` Table, but not ad-hoc native perms
            (perms/revoke-permissions! (group/all-users) (mt/id))
            (perms/grant-permissions! (group/all-users) (mt/id) "PUBLIC" (mt/id :venues))
            (is (schema= {:permissions-error? (s/eq true)
                          :message            (s/eq "You do not have permissions to run this query.")
                          s/Any               s/Any}
                         (mt/user-http-request :rasta :post "dataset/native"
                                               (mt/mbql-query venues
                                                 {:fields [$id $name]}))))))))))

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
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (pivots/pivot-query))
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
        (when (#{:bigquery :mongo :presto :redshift :h2 :sqlite} metabase.driver/*driver*)
          (testing "with an added expression"
            ;; the added expression is coming back in this query because it is explicitly included in `:fields` -- see
            ;; comments on `metabase.query-processor.pivot-test/pivots-should-not-return-expressions-test`.
            (let [query  (-> (pivots/pivot-query)
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
                        :semantic_type    "type/Number"
                        :name            "pivot-grouping"
                        :display_name    "pivot-grouping"
                        :expression_name "pivot-grouping"
                        :field_ref       ["expression" "pivot-grouping"]
                        :source          "breakout"}
                       (nth cols 3))))

              (is (= [nil nil nil 7 18760 69540 "wheeee"] (last rows))))))))))

(deftest pivot-filter-dataset-test
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (pivots/filters-query))
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
  (mt/test-drivers pivots/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/dataset/pivot"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "dataset/pivot" (pivots/parameters-query))
                rows   (mt/rows result)]
            (is (= 137 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 137 (count rows)))

            (is (= ["AK" "Google" 0 27] (first rows)))
            (is (= ["AK" "Organic" 0 25] (second rows)))
            (is (= ["VA" nil 2 29] (nth rows 130)))
            (is (= [nil nil 3 2009] (last rows)))))))))
