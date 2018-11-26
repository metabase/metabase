(ns metabase.api.dataset-test
  "Unit tests for /api/dataset endpoints."
  (:require [cheshire
             [core :as json]
             [generate :as generate]]
            [clojure.data.csv :as csv]
            [dk.ative.docjure.spreadsheet :as spreadsheet]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]
             [query-execution :refer [QueryExecution]]]
            [metabase.test
             [data :as data :refer :all]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :refer [expect-with-driver]]
             [users :refer :all]]
            [metabase.test.util.log :as tu.log]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn user-details [user]
  (tu/match-$ user
    {:email        $
     :date_joined  $
     :first_name   $
     :last_name    $
     :last_login   $
     :is_superuser $
     :is_qbnewb    $
     :common_name  $}))

(defn format-response [m]
  (into {} (for [[k v] (-> m
                           (m/dissoc-in [:data :results_metadata])
                           (m/dissoc-in [:data :insights]))]
             (cond
               (contains? #{:id :started_at :running_time :hash} k) [k (boolean v)]
               (= :data k) [k (if-not (contains? v :native_form)
                                v
                                (update v :native_form boolean))]
               :else [k v]))))

(defn- most-recent-query-execution [] (db/select-one QueryExecution {:order-by [[:id :desc]]}))

;;; ## POST /api/meta/dataset
;; Just a basic sanity check to make sure Query Processor endpoint is still working correctly.
(expect
  [ ;; API call response
   {:data                   {:rows        [[1000]]
                             :columns     ["count"]
                             :cols        [{:base_type    "type/Integer"
                                            :special_type "type/Number"
                                            :name         "count"
                                            :display_name "count"
                                            :source       "aggregation"}]
                             :native_form true}
    :row_count              1
    :status                 "completed"
    :context                "ad-hoc"
    :json_query             (-> (data/mbql-query checkins
                                  {:aggregation [[:count]]})
                                (assoc :type "query")
                                (assoc-in [:query :aggregation] [["count"]])
                                (assoc :constraints qp/default-query-constraints))
    :started_at             true
    :running_time           true
    :average_execution_time nil
    :database_id            (id)}
   ;; QueryExecution record in the DB
   {:hash         true
    :row_count    1
    :result_rows  1
    :context      :ad-hoc
    :executor_id  (user->id :rasta)
    :native       false
    :pulse_id     nil
    :card_id      nil
    :dashboard_id nil
    :error        nil
    :id           true
    :database_id  (id)
    :started_at   true
    :running_time true}]
  (let [result ((user->client :rasta) :post 200 "dataset" (data/mbql-query checkins
                                                            {:aggregation [[:count]]}))]
    [(format-response result)
     (format-response (most-recent-query-execution))]))


;; Even if a query fails we still expect a 200 response from the api
(expect
  [ ;; API call response
   {:data         {:rows    []
                   :columns []
                   :cols    []}
    :row_count    0
    :status       "failed"
    :context      "ad-hoc"
    :error        true
    :json_query   {:database    (id)
                   :type        "native"
                   :native      {:query "foobar"}
                   :constraints qp/default-query-constraints}
    :database_id  (id)
    :started_at   true
    :running_time true}
   ;; QueryExecution entry in the DB
   {:hash         true
    :id           true
    :result_rows  0
    :row_count    0
    :context      :ad-hoc
    :error        true
    :database_id  (id)
    :started_at   true
    :running_time true
    :executor_id  (user->id :rasta)
    :native       true
    :pulse_id     nil
    :card_id      nil
    :dashboard_id nil}]
  ;; Error message's format can differ a bit depending on DB version and the comment we prepend to it, so check that
  ;; it exists and contains the substring "Syntax error in SQL statement"
  (let [check-error-message (fn [output]
                              (update output :error (fn [error-message]
                                                      (boolean (re-find #"Syntax error in SQL statement" error-message)))))
        result              (tu.log/suppress-output
                              ((user->client :rasta) :post 200 "dataset" {:database (id)
                                                                          :type     "native"
                                                                          :native   {:query "foobar"}}))]
    [(check-error-message (dissoc (format-response result) :stacktrace))
     (check-error-message (format-response (most-recent-query-execution)))]))


;;; Make sure that we're piggybacking off of the JSON encoding logic when encoding strange values in XLSX (#5145, #5220, #5459)
(defrecord ^:private SampleNastyClass [^String v])

(generate/add-encoder
 SampleNastyClass
 (fn [obj, ^com.fasterxml.jackson.core.JsonGenerator json-generator]
   (.writeString json-generator (:v obj))))

(defrecord ^:private AnotherNastyClass [^String v])

(expect
  [{"Values" "values"}
   {"Values" "Hello XLSX World!"}   ; should use the JSON encoding implementation for object
   {"Values" "{:v \"No Encoder\"}"} ; fall back to the implementation of `str` for an object if no JSON encoder exists rather than barfing
   {"Values" "ABC"}]
  (->> (spreadsheet/create-workbook "Results" [["values"]
                                               [(SampleNastyClass. "Hello XLSX World!")]
                                               [(AnotherNastyClass. "No Encoder")]
                                               ["ABC"]])
       (spreadsheet/select-sheet "Results")
       (spreadsheet/select-columns {:A "Values"})))

(defn- parse-and-sort-csv [response]
  (sort-by
   ;; ID in CSV is a string, parse it and sort it to get the first 5
   (comp #(Integer/parseInt %) first)
   ;; First row is the header
   (rest (csv/read-csv response))))

;; Date columns should be emitted without time
(expect
  [["1" "2014-04-07" "5" "12"]
   ["2" "2014-09-18" "1" "31"]
   ["3" "2014-09-15" "8" "56"]
   ["4" "2014-03-11" "5" "4"]
   ["5" "2013-05-05" "3" "49"]]
  (let [result ((user->client :rasta) :post 200 "dataset/csv" :query
                (json/generate-string (data/mbql-query checkins)))]
    (take 5 (parse-and-sort-csv result))))

;; Check an empty date column
(expect
  [["1" "2014-04-07" "" "5" "12"]
   ["2" "2014-09-18" "" "1" "31"]
   ["3" "2014-09-15" "" "8" "56"]
   ["4" "2014-03-11" "" "5" "4"]
   ["5" "2013-05-05" "" "3" "49"]]
  (with-db (get-or-create-database! defs/test-data-with-null-date-checkins)
    (let [result ((user->client :rasta) :post 200 "dataset/csv" :query
                  (json/generate-string (data/mbql-query checkins)))]
      (take 5 (parse-and-sort-csv result)))))

;; SQLite doesn't return proper date objects but strings, they just pass through the qp untouched
(expect-with-driver :sqlite
  [["1" "2014-04-07" "5" "12"]
   ["2" "2014-09-18" "1" "31"]
   ["3" "2014-09-15" "8" "56"]
   ["4" "2014-03-11" "5" "4"]
   ["5" "2013-05-05" "3" "49"]]
  (let [result ((user->client :rasta) :post 200 "dataset/csv" :query
                (json/generate-string (data/mbql-query checkins)))]
    (take 5 (parse-and-sort-csv result))))

;; DateTime fields are untouched when exported
(expect
  [["1" "Plato Yeshua"        "2014-04-01T08:30:00.000Z"]
   ["2" "Felipinho Asklepios" "2014-12-05T15:15:00.000Z"]
   ["3" "Kaneonuskatew Eiran" "2014-11-06T16:15:00.000Z"]
   ["4" "Simcha Yan"          "2014-01-01T08:30:00.000Z"]
   ["5" "Quentin Sören"       "2014-10-03T17:30:00.000Z"]]
  (let [result ((user->client :rasta) :post 200 "dataset/csv" :query
                (json/generate-string (data/mbql-query users)))]
    (take 5 (parse-and-sort-csv result))))

;; Check that we can export the results of a nested query
(expect
  16
  (tt/with-temp Card [card {:dataset_query {:database (id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM USERS;"}}}]
    (let [result ((user->client :rasta) :post 200 "dataset/csv"
                  :query (json/generate-string
                          {:database database/virtual-id
                           :type     :query
                           :query    {:source-table (str "card__" (u/get-id card))}}))]
      (count (csv/read-csv result)))))
