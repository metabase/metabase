(ns metabase.driver.presto-test
  (:require [clj-http.client :as http]
            [clojure.test :refer :all]
            [expectations :refer [expect]]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver
             [presto :as presto]
             [util :as driver.u]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.util.log :as tu.log]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

(deftest details->uri-test
  (is (= "http://localhost:8080/"
         (#'presto/details->uri {:host "localhost", :port 8080, :catalog "Sears", :ssl false} "/")))
  (is (= "https://localhost:8443/"
         (#'presto/details->uri {:host "localhost", :port 8443, :catalog "Sears", :ssl true} "/")))
  (is (= "http://localhost:8080/v1/statement"
         (#'presto/details->uri {:host "localhost", :port 8080, :catalog "Sears", :ssl false} "/v1/statement"))))

(deftest details->request-test
  (driver/with-driver :presto
    (is (= {:headers {"X-Presto-Source" "metabase"
                      "X-Presto-User"   "user"}}
           (mt/with-report-timezone-id nil
             (#'presto/details->request {:user "user"}))))
    (is (= {:headers    {"X-Presto-Source" "metabase"
                         "X-Presto-User"   "user"}
            :basic-auth ["user" "test"]}
           (mt/with-report-timezone-id nil
             (#'presto/details->request {:user "user", :password "test"}))))
    (is (= {:headers {"X-Presto-Source"    "metabase"
                      "X-Presto-User"      "user"
                      "X-Presto-Catalog"   "test_data"
                      "X-Presto-Time-Zone" "America/Toronto"}}
           (mt/with-report-timezone-id "America/Toronto"
             (#'presto/details->request {:user "user", :catalog "test_data"})))))
  (testing "details->request should still work if driver is unbound, e.g. when connecting a DB (#11598)"
    (is (= {:headers {"X-Presto-Source" "metabase"
                      "X-Presto-User"   nil}}
           (#'presto/details->request {})))))

(deftest parse-results-test
  (driver/with-driver :presto
    (mt/with-everything-store
      (is (= [["2017-04-03"
               (t/zoned-date-time "2017-04-03T10:19:17.417-04:00[America/Toronto]")
               (t/zoned-date-time "2017-04-03T10:19:17.417Z[UTC]")
               3.1416M
               "test"]]
             (#'presto/parse-presto-results
              [{:type "date"} {:type "timestamp with time zone"} {:type "timestamp"} {:type "decimal(10,4)"} {:type "varchar(255)"}]
              [["2017-04-03", "2017-04-03 10:19:17.417 America/Toronto", "2017-04-03 10:19:17.417", "3.1416", "test"]])))
      (is (=
           [[0, false, "", nil]]
           (#'presto/parse-presto-results
            [{:type "integer"} {:type "boolean"} {:type "varchar(255)"} {:type "date"}]
            [[0, false, "", nil]]))))))

(deftest describe-database-test
  (mt/test-driver :presto
    (is (= {:tables #{{:name "test_data_categories" :schema "default"}
                      {:name "test_data_venues" :schema "default"}
                      {:name "test_data_checkins" :schema "default"}
                      {:name "test_data_users" :schema "default"}}}
           (-> (driver/describe-database :presto (mt/db))
               (update :tables (comp set (partial filter (comp #{"test_data_categories"
                                                                 "test_data_venues"
                                                                 "test_data_checkins"
                                                                 "test_data_users"}
                                                               :name)))))))))

(deftest describe-table-test
  (mt/test-driver :presto
    (is (= {:name   "test_data_venues"
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
           (driver/describe-table :presto (mt/db) (db/select-one 'Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :prestor
    (is (= [["Red Medicine"]
            ["Stout Burgers & Beers"]
            ["The Apple Pan"]
            ["Wurstküche"]
            ["Brite Spot Family Restaurant"]]
           (take 5 (metadata-queries/table-rows-sample (Table (mt/id :venues))
                     [(Field (mt/id :venues :name))]))))))


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
  (sql.qp/apply-top-level-clause :presto :page
    {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
     :from     [:default.categories]
     :order-by [[:default.categories.id :asc]]}
    {:page {:page  2
            :items 5}}))

(expect
  "Hmm, we couldn't connect to the database. Make sure your host and port settings are correct"
  (try
    (let [details {:ssl            false
                   :password       "changeme"
                   :tunnel-host    "localhost"
                   :tunnel-pass    "BOGUS-BOGUS"
                   :catalog        "BOGUS"
                   :host           "localhost"
                   :port           9999
                   :tunnel-enabled true
                   :tunnel-port    22
                   :tunnel-user    "bogus"}]
      (tu.log/suppress-output
        (driver.u/can-connect-with-details? :presto details :throw-exceptions)))
    (catch Exception e
      (.getMessage e))))

(deftest db-default-timezone-test
  (mt/test-driver :presto
    (is (= "UTC"
           (tu/db-timezone-id)))))

;; Query cancellation test, needs careful coordination between the query thread, cancellation thread to ensure
;; everything works correctly together
(deftest query-cancelation-test
  (mt/test-driver :presto
    (let [called-cancel-promise (atom nil)]
      (with-redefs [http/delete (fn [& _]
                                  (deliver @called-cancel-promise true))]
        (is (= :metabase.test.util/success
               (mt/call-with-paused-query
                (fn [query-thunk called-query? called-cancel? pause-query]
                  (reset! called-cancel-promise called-cancel?)
                  (future
                    (with-redefs [presto/fetch-presto-results! (fn [_ _ _] (deliver called-query? true) @pause-query)]
                      (query-thunk)))))))))))

(deftest template-tag-timezone-test
  (mt/test-driver :presto
    (testing "Make sure date params work correctly when report timezones are set (#10487)"
      (mt/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
        (is (= [["2014-08-02T00:00:00+08:00" "2014-08-02"]]
               (mt/rows
                 (qp/process-query
                   {:database   (mt/id)
                    :type       :native
                    :native     {:query         "SELECT {{date}}, cast({{date}} AS date)"
                                 :template-tags {:date {:name "date" :display_name "Date" :type "date"}}}
                    :parameters [{:type   "date/single"
                                  :target ["variable" ["template-tag" "date"]]
                                  :value  "2014-08-02"}]}))))))))
