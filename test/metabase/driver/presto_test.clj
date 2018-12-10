(ns metabase.driver.presto-test
  (:require [clj-http.client :as http]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.driver.presto :as presto]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.util.log :as tu.log]
            [toucan.db :as db]
            [clojure.string :as str])
  (:import metabase.driver.presto.PrestoDriver))

;;; HELPERS

(expect
  "http://localhost:8080/"
  (#'presto/details->uri {:host "localhost", :port 8080, :ssl false} "/"))

(expect
  "https://localhost:8443/"
  (#'presto/details->uri {:host "localhost", :port 8443, :ssl true} "/"))

(expect
  "http://localhost:8080/v1/statement"
  (#'presto/details->uri {:host "localhost", :port 8080, :ssl false} "/v1/statement"))

(expect
  {:headers {"X-Presto-Source" "metabase"
             "X-Presto-User"   "user"}}
  (#'presto/details->request {:user "user"}))

(expect
  {:headers    {"X-Presto-Source" "metabase"
                "X-Presto-User"   "user"}
   :basic-auth ["user" "test"]}
  (#'presto/details->request {:user "user", :password "test"}))

(expect
  {:headers {"X-Presto-Source"    "metabase"
             "X-Presto-User"      "user"
             "X-Presto-Catalog"   "test_data"
             "X-Presto-Time-Zone" "America/Toronto"}}
  (#'presto/details->request {:user "user", :catalog "test_data", :report-timezone "America/Toronto"}))

(expect
  [["2017-04-03"
    #inst "2017-04-03T14:19:17.417000000-00:00"
    #inst "2017-04-03T10:19:17.417000000-00:00"
    3.1416M
    "test"]]
  (#'presto/parse-presto-results
   nil
   [{:type "date"} {:type "timestamp with time zone"} {:type "timestamp"} {:type "decimal(10,4)"} {:type "varchar(255)"}]
   [["2017-04-03", "2017-04-03 10:19:17.417 America/Toronto", "2017-04-03 10:19:17.417", "3.1416", "test"]]))

(expect
  [[0, false, "", nil]]
  (#'presto/parse-presto-results nil
                                 [{:type "integer"} {:type "boolean"} {:type "varchar(255)"} {:type "date"}]
                                 [[0, false, "", nil]]))

(expect
  "\"weird.table\"\" name\""
  (#'presto/quote-name "weird.table\" name"))

(expect
  "\"weird . \"\"schema\".\"weird.table\"\" name\""
  (#'presto/quote+combine-names "weird . \"schema" "weird.table\" name"))

;; DESCRIBE-DATABASE
(datasets/expect-with-engine :presto
  {:tables #{{:name "test_data_categories" :schema "default"}
             {:name "test_data_venues"     :schema "default"}
             {:name "test_data_checkins"   :schema "default"}
             {:name "test_data_users"      :schema "default"}}}
  (-> (driver/describe-database (PrestoDriver.) (data/db))
      ;; we load all Presto tables into the same "catalog" (i.e. DB) using the db-prefixed-table-name stuf so we don't
      ;; have to update the docker image every time we add a new dataset. So make sure we ignore the ones that are in
      ;; different datasets in the results here
      (update :tables (comp set (partial filter (comp #{"test_data_categories"
                                                        "test_data_venues"
                                                        "test_data_checkins"
                                                        "test_data_users"}
                                                      :name))))))

;; DESCRIBE-TABLE
(datasets/expect-with-engine :presto
  {:name   "test_data_venues"
   :schema "default"
   :fields #{{:name          "name",
              :database-type "varchar(255)"
              :base-type     :type/Text}
             {:name          "latitude"
              :database-type "double"
              :base-type     :type/Float}
             {:name          "longitude"
              :database-type "double"
              :base-type     :type/Float}
             {:name          "price"
              :database-type "integer"
              :base-type     :type/Integer}
             {:name          "category_id"
              :database-type "integer"
              :base-type     :type/Integer}
             {:name          "id"
              :database-type "integer"
              :base-type     :type/Integer}}}
  (driver/describe-table (PrestoDriver.) (data/db) (db/select-one 'Table :id (data/id :venues))))

;;; TABLE-ROWS-SAMPLE
(datasets/expect-with-engine :presto
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]
   ["Wurstküche"]
   ["Brite Spot Family Restaurant"]]
  (take 5 (driver/table-rows-sample (Table (data/id :venues))
            [(Field (data/id :venues :name))])))


;;; APPLY-PAGE
(expect
  {:select ["name" "id"]
   :from   [{:select   [[:default.categories.name "name"]
                        [:default.categories.id "id"]
                        [{:s "row_number() OVER (ORDER BY \"default\".\"categories\".\"id\" ASC)"} :__rownum__]]
             :from     [:default.categories]
             :order-by [[:default.categories.id :asc]]}]
   :where  [:> :__rownum__ 5]
   :limit  5}
  (#'presto/apply-page {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
                        :from     [:default.categories]
                        :order-by [[:default.categories.id :asc]]}
                       {:page {:page  2
                               :items 5}}))

(expect
  #"com.jcraft.jsch.JSchException:"
  (try
    (let [engine  :presto
          details {:ssl            false
                   :password       "changeme"
                   :tunnel-host    "localhost"
                   :tunnel-pass    "BOGUS-BOGUS"
                   :catalog        "BOGUS"
                   :host           "localhost"
                   :tunnel-enabled true
                   :tunnel-port    22
                   :tunnel-user    "bogus"}]
      (tu.log/suppress-output
        (driver/can-connect-with-details? engine details :rethrow-exceptions)))
    (catch Exception e
      (.getMessage e))))

(datasets/expect-with-engine :presto
  "UTC"
  (tu/db-timezone-id))

;; Query cancellation test, needs careful coordination between the query thread, cancellation thread to ensure
;; everything works correctly together
(datasets/expect-with-engine :presto
  [false ;; Ensure the query promise hasn't fired yet
   false ;; Ensure the cancellation promise hasn't fired yet
   true  ;; Was query called?
   false ;; Cancel should not have been called yet
   true  ;; Cancel should have been called now
   true  ;; The paused query can proceed now
   ]
  (tu/call-with-paused-query
   (fn [query-thunk called-query? called-cancel? pause-query]
     (future
       (with-redefs [presto/fetch-presto-results! (fn [_ _ _] (deliver called-query? true) @pause-query)
                     http/delete                  (fn [_ _] (deliver called-cancel? true))]
         (query-thunk))))))
