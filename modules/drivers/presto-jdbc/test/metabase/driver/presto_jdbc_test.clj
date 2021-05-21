(ns metabase.driver.presto-jdbc-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;; we no longer parse our own rows from HTTP responses, so this can probably be removed
#_(deftest parse-results-test
    (driver/with-driver :presto-jdbc
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
  (mt/test-driver :presto-jdbc
    (is (= {:tables #{{:name "categories" :schema "default"}
                      {:name "venues" :schema "default"}
                      {:name "checkins" :schema "default"}
                      {:name "users" :schema "default"}}}
           (-> (driver/describe-database :presto-jdbc (mt/db))
               (update :tables (comp set (partial filter (comp #{"categories"
                                                                 "venues"
                                                                 "checkins"
                                                                 "users"}
                                                               :name)))))))))

(deftest describe-table-test
  (mt/test-driver :presto-jdbc
    (is (= {:name   "venues"
            :schema "default"
            :fields #{{:name          "name",
                       ;; for HTTP based Presto driver, this is coming back as varchar(255)
                       ;; however, for whatever reason, the DESCRIBE statement results do not return the length
                       :database-type "varchar"
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
           (driver/describe-table :presto-jdbc (mt/db) (db/select-one 'Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :presto-jdbc
    ;; TODO: this is failing because five different values are coming back...
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                  [(Field (mt/id :venues :id))
                   (Field (mt/id :venues :name))]
                  (constantly conj))
                (sort-by first)
                (take 5))))))

(deftest page-test
  (testing ":page clause"
    (is (= {:select ["name" "id"]
            :from   [{:select   [[:default.categories.name "name"]
                                 [:default.categories.id "id"]
                                 [(hsql/raw "row_number() OVER (ORDER BY \"default\".\"categories\".\"id\" ASC)")
                                  :__rownum__]]
                      :from     [:default.categories]
                      :order-by [[:default.categories.id :asc]]}]
            :where  [:> :__rownum__ 5]
            :limit  5}
           (sql.qp/apply-top-level-clause :presto-jdbc :page
                                          {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
                                           :from     [:default.categories]
                                           :order-by [[:default.categories.id :asc]]}
                                          {:page {:page  2
                                                  :items 5}})))))

#_(deftest test-connect-via-tunnel
    (testing "connection fails as expected"
      (mt/test-driver
       :presto-jdbc
       (is (thrown?
            java.net.ConnectException
            (try
              (let [engine :presto-jdbc
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
  (mt/test-driver :presto-jdbc
    (is (= "UTC"
           (tu/db-timezone-id)))))

;; we no longer can cancel queries, so this can probably be skipped
#_(deftest query-cancelation-test
    (mt/test-driver :presto-jdbc
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

;; TODO: figure out what's up with timezones
;; failing with java.sql.SQLException: Cannot convert instance of java.time.OffsetDateTime to timestamp with time zone
(deftest template-tag-timezone-test
  (mt/test-driver :presto-jdbc
    (testing "Make sure date params work correctly when report timezones are set (#10487)"
      (mt/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
        ;; TODO: figure out this failure
        ;; the 2nd item in the vec is identical to the first
        ;; looks like Presto is supposed to chop off the time portion if it is DATE at midnight in the session TZ
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
  (mt/test-driver :presto-jdbc
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= (str "SELECT count(*) AS \"count\" "
                    "FROM \"default\".\"venues\" "
                    "WHERE \"default\".\"venues\".\"name\" = 'wow'")
               (:query (qp/query->native-with-spliced-params query))
               (-> (qp/process-query query) :data :native_form :query))))
      ;; since we no longer
      #_(testing "When actually running the query we should use paranoid splicing and hex-encode strings"
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

;; TODO: this is hanging forever when testing presto-jdbc; is it even needed there?
#_(deftest basic-auth-error-message-test
    (testing "Error messages when using basic auth should not log credentials (metabase/metaboat#130)"
      (mt/test-driver :presto-jdbc
        (let [bad-details {:ssl      true
                           :user     "userSECRET"
                           :password "passSECRET"
                           :catalog  "BOGUS"
                           :host     "metabase.com"
                           :port     443}]
          (letfn [(test-sensitive-info-not-included [x]
                    (let [s (u/pprint-to-str x)]
                      (testing (format "\nx =\n%s" s)
                        (testing "username should not be present"
                          (is (not (str/includes? s "userSECRET"))))
                        (testing "password should not be present"
                          (is (not (str/includes? s "passSECRET")))))))]
            (testing "Run query with bad details"
              (mt/with-temp-vals-in-db Database (mt/id) {:details bad-details}
                (testing "Should throw an Exception"
                  (is (thrown?
                       clojure.lang.ExceptionInfo
                       (mt/run-mbql-query venues {:limit 1}))))
                (testing "Exception should not include sensitive info"
                  (try
                    (mt/run-mbql-query venues {:limit 1})
                    (catch Throwable e
                      (test-sensitive-info-not-included e))))
                (testing "via API request"
                  (let [logs (mt/with-log-messages-for-level :error
                               (let [response (mt/user-http-request :crowberto :post 202 "dataset" (mt/mbql-query venues {:limit 1}))]
                                 (testing "API request should have failed"
                                   (is (schema= {:status   (s/eq "failed")
                                                 s/Keyword s/Any}
                                                response)))
                                 (testing "API response should not include sensitive info"
                                   (test-sensitive-info-not-included response))))]
                    (testing "server logs should not include sensitive info"
                      (test-sensitive-info-not-included logs)))))))))))
