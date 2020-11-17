(ns metabase.driver.presto-test
  (:require [clj-http.client :as http]
            [clojure.core.async :as a]
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
      (is (= ["2017-04-03"
              (t/zoned-date-time "2017-04-03T10:19:17.417-04:00[America/Toronto]")
              (t/zoned-date-time "2017-04-03T10:19:17.417Z[UTC]")
              3.1416M
              "test"]
             ((#'presto/parse-row-fn
               [{:type "date"}
                {:type "timestamp with time zone"}
                {:type "timestamp"}
                {:type "decimal(10,4)"}
                {:type "varchar(255)"}])
              ["2017-04-03" "2017-04-03 10:19:17.417 America/Toronto" "2017-04-03 10:19:17.417" "3.1416" "test"])))
      (is (= [0 false "" nil]
             ((#'presto/parse-row-fn
               [{:type "integer"} {:type "boolean"} {:type "varchar(255)"} {:type "date"}])
              [0 false "" nil]))))))

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
                       :base-type     :type/Text
                       :database-position 1}
                      {:name          "latitude"
                       :database-type "double"
                       :base-type     :type/Float
                       :database-position 3}
                      {:name          "longitude"
                       :database-type "double"
                       :base-type     :type/Float
                       :database-position 4}
                      {:name          "price"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 5}
                      {:name          "category_id"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 2}
                      {:name          "id"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 0}}}
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

(deftest test-connect-via-tunnel
  (testing "connection fails as expected"
    (mt/test-driver
     :presto
     (is (thrown?
          java.net.ConnectException
          (try
            (let [engine :presto
                  details {:ssl            false
                           :password       "changeme"
                           :tunnel-host    "localhost"
                           :tunnel-pass    "BOGUS-BOGUS"
                           :catalog        "BOGUS"
                           :host           "localhost"
                           :port           9999
                           :tunnel-enabled true
                           ;; we want to use a bogus port here on purpose -
                           ;; so that locally, it gets a ConnectionRefused,
                           ;; and in CI it does too. Apache's SSHD library
                           ;; doesn't wrap every exception in an SshdException
                           :tunnel-port    21212
                           :tunnel-user    "bogus"}]
              (tu.log/suppress-output
               (driver.u/can-connect-with-details? engine details :throw-exceptions)))
            (catch Throwable e
              (loop [^Throwable e e]
                (or (when (instance? java.net.ConnectException e)
                      (throw e))
                    (some-> (.getCause e) recur))))))))))

(deftest db-default-timezone-test
  (mt/test-driver :presto
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest query-cancelation-test
  (mt/test-driver :presto
    (let [query (mt/mbql-query venues)]
      (mt/with-open-channels [running-chan (a/promise-chan)
                              cancel-chan  (a/promise-chan)]
        (with-redefs [http/delete            (fn [& _]
                                               (a/>!! cancel-chan ::cancel))
                      presto/fetch-next-page (fn [& _]
                                               (a/>!! running-chan ::running)
                                               (Thread/sleep 5000)
                                               (throw (Exception. "Don't actually run!")))]
          (let [out-chan (qp/process-query-async query)]
            ;; wait for query to start running, then close `out-chan`
            (a/go
              (a/<! running-chan)
              (a/close! out-chan)))
          (is (= ::cancel
                 (mt/wait-for-result cancel-chan 2000))))))))

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

(deftest splice-strings-test
  (mt/test-driver :presto
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= (str "SELECT count(*) AS \"count\" "
                    "FROM \"default\".\"test_data_venues\" "
                    "WHERE \"default\".\"test_data_venues\".\"name\" = 'wow'")
               (:query (qp/query->native-with-spliced-params query))
               (-> (qp/process-query query) :data :native_form :query))))

      (testing "When actually running the query we should use paranoid splicing and hex-encode strings"
        (let [orig    @#'presto/execute-presto-query
              the-sql (atom nil)]
          (with-redefs [presto/execute-presto-query (fn [details sql canceled-chan respond]
                                                      (reset! the-sql sql)
                                                      (with-redefs [presto/execute-presto-query orig]
                                                        (orig details sql canceled-chan respond)))]
            (qp/process-query query)
            (is (= (str "-- Metabase\n"
                        "SELECT count(*) AS \"count\" "
                        "FROM \"default\".\"test_data_venues\" "
                        "WHERE \"default\".\"test_data_venues\".\"name\" = from_utf8(from_hex('776f77'))")
                   @the-sql))))))))
