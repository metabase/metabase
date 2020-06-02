(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [cheshire
             [core :as json]
             [generate :as generate]]
            [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.data.csv :as csv]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [medley.core :as m]
            [metabase
             [http-client :as http-client]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :refer [Card]]
             [permissions :as perms]
             [permissions-group :as group]
             [query-execution :refer [QueryExecution]]]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.test.data
             [dataset-definitions :as defs]
             [users :as test-users]]
            [metabase.test.util :as tu]
            [schema.core :as s]
            [toucan.db :as db])
  (:import com.fasterxml.jackson.core.JsonGenerator))

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

(defn- most-recent-query-execution [] (db/select-one QueryExecution {:order-by [[:id :desc]]}))

(def ^:private query-defaults
  {:middleware {:add-default-userland-constraints? true}})

(deftest basic-query-test
  (testing "POST /api/dataset"
    (testing "\nJust a basic sanity check to make sure Query Processor endpoint is still working correctly."
      (let [result ((mt/user->client :rasta) :post 202 "dataset" (mt/mbql-query checkins
                                                                   {:aggregation [[:count]]}))]
        (testing "\nAPI Response"
          (is (= {:data                   {:rows             [[1000]]
                                           :cols             [(tu/obj->json->obj (qp.test/aggregate-col :count))]
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
                 (format-response (most-recent-query-execution)))))))))

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
            result              (mt/suppress-output
                                  ((mt/user->client :rasta) :post 202 "dataset" {:database (mt/id)
                                                                                 :type     "native"
                                                                                 :native   {:query "foobar"}}))]
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
                 (check-error-message (format-response (most-recent-query-execution))))))))))


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
         (let [result ((mt/user->client :rasta) :post 202 "dataset/csv" :query
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
                                                 :post 202 "dataset/csv"
                                                 :query (json/generate-string (mt/mbql-query checkins {:limit 1})))
               :headers
               (select-keys ["Cache-Control" "Content-Disposition" "Content-Type" "Expires" "X-Accel-Buffering"])
               (update "Content-Disposition" #(some-> % (str/replace #"query_result_.+(\.\w+)"
                                                                                   "query_result_<timestamp>$1"))))))))

(deftest check-an-empty-date-column
  (mt/dataset defs/test-data-with-null-date-checkins
    (let [result ((mt/user->client :rasta) :post 202 "dataset/csv" :query
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
      (let [result ((mt/user->client :rasta) :post 202 "dataset/csv" :query
                    (json/generate-string (mt/mbql-query checkins {:order-by [[:asc $id]], :limit 5})))]
        (is (= [["1" "2014-04-07" "5" "12"]
                ["2" "2014-09-18" "1" "31"]
                ["3" "2014-09-15" "8" "56"]
                ["4" "2014-03-11" "5" "4"]
                ["5" "2013-05-05" "3" "49"]]
               (parse-and-sort-csv result)))))))

(deftest datetime-fields-are-untouched-when-exported
  (let [result ((mt/user->client :rasta) :post 202 "dataset/csv" :query
                (json/generate-string (mt/mbql-query users {:order-by [[:asc $id]], :limit 5})))]
    (is (= [["1" "Plato Yeshua"        "2014-04-01T08:30:00"]
            ["2" "Felipinho Asklepios" "2014-12-05T15:15:00"]
            ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00"]
            ["4" "Simcha Yan"          "2014-01-01T08:30:00"]
            ["5" "Quentin Sören"       "2014-10-03T17:30:00"]]
           (parse-and-sort-csv result)))))

(deftest check-that-we-can-export-the-results-of-a-nested-query
  (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM USERS;"}}}]
    (let [result ((mt/user->client :rasta) :post 202 "dataset/csv"
                  :query (json/generate-string
                          {:database mbql.s/saved-questions-virtual-database-id
                           :type     :query
                           :query    {:source-table (str "card__" (u/get-id card))}}))]
      (is (some? result))
      (when (some? result)
        (is (= 16
               (count (csv/read-csv result))))))))

;; POST /api/dataset/:format
;;
;; Downloading CSV/JSON/XLSX results shouldn't be subject to the default query constraints
;; -- even if the query comes in with `add-default-userland-constraints` (as will be the case if the query gets saved
;; from one that had it -- see #9831)
(deftest formatted-results-ignore-query-constraints
  (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
    (let [result ((mt/user->client :rasta) :post 202 "dataset/csv"
                  :query (json/generate-string
                          {:database   (mt/id)
                           :type       :query
                           :query      {:source-table (mt/id :venues)}
                           :middleware
                           {:add-default-userland-constraints? true
                            :userland-query?                   true}}))]
      (is (some? result))
      (when (some? result)
        (is (= 101
               (count (csv/read-csv result))))))))

;; non-"download" queries should still get the default constraints
;; (this also is a sanitiy check to make sure the `with-redefs` in the test above actually works)
(deftest non--download--queries-should-still-get-the-default-constraints
  (with-redefs [constraints/default-query-constraints {:max-results 10, :max-results-bare-rows 10}]
    (let [{row-count :row_count, :as result}
          ((mt/user->client :rasta) :post 202 "dataset"
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
                    ((mt/user->client :rasta) :post "dataset"
                     (mt/mbql-query venues {:limit 1}))))))))

(deftest query->native-test
  (testing "POST /api/dataset/native"
    (testing "\nCan we fetch a native version of an MBQL query?"
      (is (= {:query  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\" "
                           "FROM \"PUBLIC\".\"VENUES\" "
                           "LIMIT 1048576")
              :params nil}
             ((mt/user->client :rasta) :post 200 "dataset/native"
              (mt/mbql-query venues
                {:fields [$id $name]}))))

      (testing "\nMake sure parameters are spliced correctly"
        (is (= {:query  (str "SELECT \"PUBLIC\".\"CHECKINS\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"CHECKINS\" "
                             "WHERE (\"PUBLIC\".\"CHECKINS\".\"DATE\" >= timestamp with time zone '2015-11-13 00:00:00.000Z'"
                             " AND \"PUBLIC\".\"CHECKINS\".\"DATE\" < timestamp with time zone '2015-11-14 00:00:00.000Z') "
                             "LIMIT 1048576")
                :params nil}
               ((mt/user->client :rasta) :post 200 "dataset/native"
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
                         ((mt/user->client :rasta) :post "dataset/native"
                          (mt/mbql-query venues
                            {:fields [$id $name]}))))))))))

(deftest report-timezone-test
  (mt/test-driver :postgres
    (testing "expected (desired) and actual timezone should be returned as part of query results"
      (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
        (let [results ((mt/user->client :rasta) :post 202 "dataset" (mt/mbql-query checkins
                                                                      {:aggregation [[:count]]}))]
          (is (= {:requested_timezone "US/Pacific"
                  :results_timezone   "US/Pacific"}
                 (-> results
                     :data
                     (select-keys [:requested_timezone :results_timezone])))))))))
