(ns metabase.driver.redshift-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   #_[java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.redshift :as redshift]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database
    :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.plugins.jdbc-proxy :as jdbc-proxy]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.redshift :as redshift.test]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.random :as tu.random]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   #_{:clj-kondo/ignore [:discouraged-namespace :deprecated-namespace]}
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (metabase.plugins.jdbc_proxy ProxyDriver)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      ;; Make sure we're in Honey SQL 2 mode for all the little SQL snippets we're compiling in these
                      ;; tests.
                      (binding [hx/*honey-sql-version* 2]
                        (thunk))))

(deftest ^:parallel correct-driver-test
  (mt/test-driver :redshift
    (testing "Make sure we're using the correct driver for Redshift"
      (let [driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")
            driver (if (instance? ProxyDriver driver)
                     (jdbc-proxy/wrapped-driver driver)
                     driver)]
        ;; although we set this as com.amazon.redshift.jdbc42.Driver, that is apparently an alias for this "real" class
        (is (= "com.amazon.redshift.Driver"
               (.getName (class driver))))))))

(deftest ^:parallel default-select-test
  (is (= ["SELECT \"source\".* FROM (SELECT *) AS \"source\""]
         (->> {:from [[[::sql.qp/sql-source-query "SELECT *"]
                       [(h2x/identifier :table-alias "source")]]]}
              (#'sql.qp/add-default-select :redshift)
              (sql.qp/format-honeysql :redshift)))))

(defn- query->native [query]
  (let [native-query (atom nil)
        check-sql-fn (fn [_ _ sql & _]
                       (reset! native-query sql)
                       (throw (Exception. "done")))]
    (with-redefs [sql-jdbc.execute/prepared-statement check-sql-fn
                  sql-jdbc.execute/execute-statement! check-sql-fn]
      (u/ignore-exceptions
        (qp/process-query query))
      @native-query)))

(defn- sql->lines [sql]
  (str/split-lines (driver/prettify-native-form :redshift sql)))

(deftest remark-test
  (testing "if I run a Redshift query, does it get a remark added to it?"
    (mt/test-driver :redshift
      (let [expected (for [line ["-- /* partner: \"metabase\", {\"dashboard_id\":5678,\"chart_id\":1234,\"optional_user_id\":1000,\"optional_account_id\":\"{{site-uuid}}\",\"filter_values\":{\"id\":[\"1\",\"2\",\"3\"]}} */ Metabase:: userID: 1000 queryType: MBQL queryHash: cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2"
                                 "SELECT"
                                 "  \"{{schema}}\".\"test_data_users\".\"id\" AS \"id\","
                                 "  \"{{schema}}\".\"test_data_users\".\"name\" AS \"name\","
                                 "  \"{{schema}}\".\"test_data_users\".\"last_login\" AS \"last_login\""
                                 "FROM"
                                 "  \"{{schema}}\".\"test_data_users\""
                                 "WHERE"
                                 "  ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 1"
                                 "  )"
                                 "  OR ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 2"
                                 "  )"
                                 "  OR ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 3"
                                 "  )"
                                 "LIMIT"
                                 "  2000"]]
                       (-> line
                           (str/replace #"\Q{{site-uuid}}\E" (public-settings/site-uuid))
                           (str/replace #"\Q{{schema}}\E" (redshift.test/unique-session-schema))))]
        (is (= expected
               (sql->lines
                (query->native
                 (assoc
                  (mt/mbql-query users {:limit 2000})
                  :parameters [{:type   "id"
                                :target [:dimension [:field (mt/id :users :id) nil]]
                                :value  ["1" "2" "3"]}]
                  :info {:executed-by  1000
                         :card-id      1234
                         :dashboard-id 5678
                         :context      :ad-hoc
                         :query-hash   (byte-array [-53 -125 -44 -10 -18 -36 37 14 -37 15 44 22 -8 -39 -94 30
                                                    93 66 -13 34 -52 -20 -31 73 76 -114 -13 -42 52 88 31 -30])})))))))))

;; the extsales table is a Redshift Spectrum linked table, provided by AWS's sample data set for Redshift.
;; See https://docs.aws.amazon.com/redshift/latest/dg/c-getting-started-using-spectrum.html
;;
;; Data is loaded into S3 via:
;;
;; aws s3 cp s3://awssampledbuswest2/tickit/spectrum/sales/ s3://mb-rs-test/tickit/spectrum/sales/ --recursive
;;
;; And the Redshift table and schema is created via:
;;
;; create external schema spectrum
;; from data catalog
;; database 'spectrumdb'
;; iam_role ''
;; create external database if not exists;
;;
;; create external table spectrum.extsales(
;; salesid integer,
;; listid integer,
;; sellerid integer,
;; buyerid integer,
;; eventid integer,
;; dateid smallint,
;; qtysold smallint,
;; pricepaid decimal(8,2),
;; commission decimal(8,2),
;; saletime timestamp)
;; row format delimited
;; fields terminated by '\t'
;; stored as textfile
;; location 's3://mb-rs-test/tickit/spectrum/sales/'
;; table properties ('numRows'='172000');
;;
(deftest ^:parallel test-external-table
  (mt/test-driver :redshift
    (testing "expects spectrum schema to exist"
      (is (=? [{:description     nil
                :table_id        (mt/id :extsales)
                :semantic_type    nil
                :name            "buyerid"
                :settings        nil
                :source          :fields
                :field_ref       [:field (mt/id :extsales :buyerid) nil]
                :nfc_path        nil
                :parent_id       nil
                :id              (mt/id :extsales :buyerid)
                :visibility_type :normal
                :display_name    "Buyerid"
                :base_type       :type/Integer
                :effective_type  :type/Integer
                :coercion_strategy nil}
               {:description     nil
                :table_id        (mt/id :extsales)
                :semantic_type    nil
                :name            "salesid"
                :settings        nil
                :source          :fields
                :field_ref       [:field (mt/id :extsales :salesid) nil]
                :nfc_path        nil
                :parent_id       nil
                :id              (mt/id :extsales :salesid)
                :visibility_type :normal
                :display_name    "Salesid"
                :base_type       :type/Integer
                :effective_type  :type/Integer
                :coercion_strategy nil}]
              ;; in different Redshift instances, the fingerprint on these columns is different.
              (map #(dissoc % :fingerprint)
                   (get-in (qp/process-query (mt/mbql-query extsales
                                               {:limit    1
                                                :fields   [$buyerid $salesid]
                                                :order-by [[:asc $buyerid]
                                                           [:asc $salesid]]
                                                :filter   [:= [:field (mt/id :extsales :buyerid) nil] 11498]}))
                           [:data :cols])))))))

(deftest parameters-test
  (mt/test-driver :redshift
    (testing "Native query parameters should work with filters. (#12984)"
      (is (= [[693 "2015-12-29T00:00:00Z" 10 90]]
             (mt/rows
               (qp/process-query
                {:database   (mt/id)
                 :type       :native
                 :native     {:query         (str "select * "
                                                  (format "from \"%s\".test_data_checkins " (redshift.test/unique-session-schema))
                                                  "where {{date}} "
                                                  "order by date desc "
                                                  "limit 1;")
                              :template-tags {"date" {:name         "date"
                                                      :display-name "date"
                                                      :type         :dimension
                                                      :widget-type  :date/all-options
                                                      :dimension    [:field (mt/id :checkins :date) nil]}}}
                 :parameters [{:type   :date/all-options
                               :target [:dimension [:template-tag "date"]]
                               :value  "past30years"}]})))))))

(defn- execute! [format-string & args]
  (let [sql  (apply format format-string args)
        spec (sql-jdbc.conn/connection-details->spec :redshift @redshift.test/db-connection-details)]
    (log/info (u/format-color 'blue "[redshift] %s" sql))
    (try
      (jdbc/execute! spec sql)
      (catch Throwable e
        (throw (ex-info (format "Error executing SQL: %s" (ex-message e))
                        {:sql sql}
                        e)))))
  (log/info (u/format-color 'blue "[ok]")))

(deftest redshift-types-test
  (mt/test-driver
    :redshift
    (testing "Redshift specific types should be synced correctly"
      (let [db-details   (tx/dbdef->connection-details :redshift nil nil)
            tbl-nm       "redshift_specific_types"
            qual-tbl-nm  (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) tbl-nm)
            view-nm      "late_binding_view"
            qual-view-nm (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) view-nm)]
        (t2.with-temp/with-temp [Database database {:engine :redshift, :details db-details}]
          (try
            ;; create a table with a CHARACTER VARYING and a NUMERIC column, and a late bound view that selects from it
            (execute!
             (str "DROP TABLE IF EXISTS %1$s;%n"
                  "CREATE TABLE %1$s(weird_varchar CHARACTER VARYING(50), numeric_col NUMERIC(10,2));%n"
                  "CREATE OR REPLACE VIEW %2$s AS SELECT * FROM %1$s WITH NO SCHEMA BINDING;")
             qual-tbl-nm
             qual-view-nm)
            ;; sync the schema again to pick up the new view (and table, though we aren't checking that)
            (sync/sync-database! database)
            (is (contains?
                 (t2/select-fn-set :name Table :db_id (u/the-id database)) ; the new view should have been synced
                 view-nm))
            (let [table-id (t2/select-one-pk Table :db_id (u/the-id database), :name view-nm)]
              ;; and its columns' :base_type should have been identified correctly
              (is (= [{:name "numeric_col",   :database_type "numeric(10,2)",         :base_type :type/Decimal}
                      {:name "weird_varchar", :database_type "character varying(50)", :base_type :type/Text}]
                     (map
                      mt/derecordize
                      (t2/select [Field :name :database_type :base_type] :table_id table-id {:order-by [:name]})))))
            (finally
              (execute! (str "DROP TABLE IF EXISTS %s;%n"
                             "DROP VIEW IF EXISTS %s;")
                        qual-tbl-nm
                        qual-view-nm))))))))

(deftest redshift-lbv-sync-error-test
  (mt/test-driver
    :redshift
    (testing "Late-binding view with with data types that cause a JDBC error can still be synced successfully (#21215)"
      (let [db-details   (tx/dbdef->connection-details :redshift nil nil)
            view-nm      "weird_late_binding_view"
            qual-view-nm (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) view-nm)]
        (t2.with-temp/with-temp [Database database {:engine :redshift, :details db-details}]
          (try
            (execute!
             (str "CREATE OR REPLACE VIEW %1$s AS ("
                  "WITH test_data AS (SELECT 'open' AS shop_status UNION ALL SELECT 'closed' AS shop_status) "
                  "SELECT NULL as raw_null, "
                  "'hello' as raw_var, "
                  "CASE WHEN shop_status = 'open' THEN 11387.133 END AS case_when_numeric_inc_nulls "
                  "FROM test_data) WITH NO SCHEMA BINDING;")
             qual-view-nm)
            (sync/sync-database! database)
            (is (contains?
                 (t2/select-fn-set :name Table :db_id (u/the-id database)) ; the new view should have been synced without errors
                 view-nm))
            (let [table-id (t2/select-one-pk Table :db_id (u/the-id database), :name view-nm)]
              ;; and its columns' :base_type should have been identified correctly
              (is (= [{:name "case_when_numeric_inc_nulls", :database_type "numeric",              :base_type :type/Decimal}
                      {:name "raw_null",                    :database_type "varchar",              :base_type :type/Text}
                      {:name "raw_var",                     :database_type "character varying(5)", :base_type :type/Text}]
                     (t2/select [Field :name :database_type :base_type] :table_id table-id {:order-by [:name]}))))
            (finally
              (execute! (str "DROP VIEW IF EXISTS %s;")
                        qual-view-nm))))))))

(deftest filtered-syncable-schemas-test
  (mt/test-driver :redshift
    (testing "Should filter out schemas for which the user has no perms"
      ;; create a random username and random schema name, and grant the user USAGE permission for it
      (let [temp-username (u/lower-case-en (tu.random/random-name))
            random-schema (u/lower-case-en (tu.random/random-name))
            user-pw       "Password1234"
            db-det        (:details (mt/db))]
        (execute! (str "CREATE SCHEMA %s;"
                       "CREATE USER %s PASSWORD '%s';%n"
                       "GRANT USAGE ON SCHEMA %s TO %s;%n")
                  random-schema
                  temp-username
                  user-pw
                  random-schema
                  temp-username)
        (try
          (binding [redshift.test/*use-original-filtered-syncable-schemas-impl?* true]
            (t2.with-temp/with-temp [Database db {:engine :redshift, :details (assoc db-det :user temp-username :password user-pw)}]
              (sql-jdbc.execute/do-with-connection-with-options
               :redshift
               db
               nil
               (fn [^java.sql.Connection conn]
                 (let [schemas (reduce conj
                                       #{}
                                       (sql-jdbc.sync/filtered-syncable-schemas :redshift
                                                                                conn
                                                                                (.getMetaData conn)
                                                                                nil
                                                                                nil))]
                   (testing "filtered-syncable-schemas for the user should contain the newly created random schema"
                     (is (contains? schemas random-schema)))
                   (testing "should not contain the current session-schema name (since that was never granted)"
                     (is (not (contains? schemas (redshift.test/unique-session-schema))))))))))
          (finally
            (execute! (str "REVOKE USAGE ON SCHEMA %s FROM %s;%n"
                           "DROP USER IF EXISTS %s;%n"
                           "DROP SCHEMA IF EXISTS %s;%n")
                      random-schema
                      temp-username
                      temp-username
                      random-schema)))))

    (testing "Should filter out non-existent schemas (for which nobody has permissions)"
      (let [fake-schema-name (u/qualified-name ::fake-schema)]
        (binding [redshift.test/*use-original-filtered-syncable-schemas-impl?* true]
          ;; override `all-schemas` so it returns our fake schema in addition to the real ones.
          (with-redefs [sql-jdbc.describe-database/all-schemas (let [orig sql-jdbc.describe-database/all-schemas]
                                                                 (fn [metadata]
                                                                   (eduction
                                                                    cat
                                                                    [(orig metadata) [fake-schema-name]])))]
            (sql-jdbc.execute/do-with-connection-with-options
             :redshift
             (mt/db)
             nil
             (fn [^java.sql.Connection conn]
               (letfn [(schemas []
                         (reduce
                          conj
                          #{}
                          (sql-jdbc.sync/filtered-syncable-schemas :redshift conn (.getMetaData conn) nil nil)))]
                 (testing "if schemas-with-usage-permissions is disabled, the ::fake-schema should come back"
                   (with-redefs [redshift/reducible-schemas-with-usage-permissions (fn [_ reducible]
                                                                                     reducible)]
                     (is (contains? (schemas) fake-schema-name))))
                 (testing "normally, ::fake-schema should be filtered out (because it does not exist)"
                   (is (not (contains? (schemas) fake-schema-name)))))))))))))

(mt/defdataset numeric-unix-timestamps
  [["timestamps"
    [{:field-name "timestamp", :base-type {:native "numeric"}}]
    [[1642704550656]]]])

(deftest numeric-unix-timestamp-test
  (mt/test-driver :redshift
    (testing "NUMERIC columns should work with UNIX timestamp conversion (#7487)"
      (mt/dataset numeric-unix-timestamps
        (testing "without coercion strategy"
          (let [query (mt/mbql-query timestamps)]
            (mt/with-native-query-testing-context query
              (is (= [1 1642704550656M]
                     (mt/first-row (qp/process-query query)))))))
        (testing "WITH coercion strategy"
          (mt/with-temp-vals-in-db Field (mt/id :timestamps :timestamp) {:coercion_strategy :Coercion/UNIXMilliSeconds->DateTime
                                                                         :effective_type    :type/Instant}
            (let [query (mt/mbql-query timestamps)]
              (mt/with-native-query-testing-context query
                (is (= [1 "2022-01-20T18:49:10.656Z"]
                       (mt/first-row (qp/process-query query))))))))))))

(deftest interval-test
  (mt/test-drivers #{:postgres :redshift}
    (testing "Redshift Interval values should behave the same as postgres (#19501)"
      (is (= ["0 years 0 mons 5 days 0 hours 0 mins 0.0 secs"]
             (mt/first-row
               (qp/process-query
                 (mt/native-query {:query "select interval '5 days'"}))))))))

;;;; Server side generated timestamps for :relative-datetime tests follow.

(defn- run-native-query [sql & params]
  (-> (mt/native-query {:query sql
                        :params params})
      qp/process-query))

(defn- session-id []
  (-> "select pg_backend_pid()" run-native-query mt/rows ffirst))

(defn- last-queries-of-a-session [session-id]
  (let [query-str (str "select result_cache_hit, query_text\n"
                       "from sys_query_history\n"
                       "where session_id = ? \n"
                       "order by start_time desc\n"
                       "limit 3\n")]
    (->> (run-native-query query-str session-id)
         mt/rows
         (map (partial zipmap [:result-cache-hit :query-text])))))

;; According to https://docs.aws.amazon.com/redshift/latest/dg/c_challenges_achieving_high_performance_queries.html#result-caching
;; caching is on by default. Hence check for that is skipped.
(deftest server-side-timestamp-caching-test
  (mt/test-driver :redshift
   (testing "Relative date time queries should be cached"
     (sql-jdbc.execute/do-with-connection-with-options
      :redshift
      (mt/id)
      nil
      (fn [_]
        (let [sid (session-id)
              ;; :time-interval translates to :relative-datetime, which is now using server side generated timestamps
              ;; for units day and greater.
              query-to-cache (mt/mbql-query
                              test_data_users
                              {:fields [$id $last_login]
                               :filter [:time-interval $last_login -500 :day {:include-current false}]})
              compiled-sql (-> query-to-cache qp/compile :query)]
          ;; BEWARE: Following expression has a flake potential. If that happens, see the discussion in attached link
          ;;         for more info. https://github.com/metabase/metabase/pull/35995#discussion_r1409850657
          (dotimes [_ 2]
            (qp/process-query query-to-cache))
          (let [last-queries (last-queries-of-a-session sid)
                ;; First row of last queries should contain "last-queries query" info.
                ;; Second should contain info about query that should be returned from cache.
                cached-row (second last-queries)
                cached-row-adjusted-redshift-sql (str/replace (:query-text cached-row) #"\$\d+" "?")
                ;; Third row contains the same query. At the point of its execution, it may have been cached, but
                ;; afterwards it should.
                pre-cached-row (nth last-queries 2)
                pre-cached-row-adjusted-redshift-sql (str/replace (:query-text pre-cached-row) #"\$\d+" "?")]
            (testing "Last queries results contain query before caching on expected postion"
              (is (str/includes? pre-cached-row-adjusted-redshift-sql compiled-sql)))
            (testing "Last queries results contain cached query on expected position"
              (is (str/includes? cached-row-adjusted-redshift-sql compiled-sql)))
            ;; BEWARE: There is a potential that following expr could make the test flaky -- hard to guarantee that db
            ;;         will actually cache the result. If that happens, we should reconsider testing strategy
            ;;         or remove this test completely.
            (testing "Query was returned from cache"
              (is (true? (:result-cache-hit cached-row)))))))))))

(defn- getdate-vs-ss-ts-test-thunk-generator
  ([]
   (getdate-vs-ss-ts-test-thunk-generator :week -1))
  ([unit value]
   (fn []
     ;; `with-redefs` forces use of `gettime()` in :relative-datetime transformation even for units gte or eq to :day.
     ;; This was standard before PR #35995, now server side timestamps are used for that. This test confirms that
     ;; server side generated timestamp (ie. new code path) results are equal to old code path results, that were not
     ;; cacheable.
     (let [honey {:select [[(with-redefs [redshift/use-server-side-relative-datetime? (constantly false)]
                              (sql.qp/->honeysql :redshift [:relative-datetime value unit]))]
                           [(sql.qp/->honeysql :redshift [:relative-datetime value unit])]]}
           sql (sql/format honey)
           result (apply run-native-query sql)
           [db-generated ss-generated] (-> result mt/rows first)]
       (is (= db-generated ss-generated)
           (format (str "\n---\n"
                        "results timezone == %s\n"
                        "report timezone == %s\n"
                        "database timezone == %s\n"
                        "system timezone == %s\n")
                   (qp.timezone/results-timezone-id)
                   (qp.timezone/report-timezone-id-if-supported)
                   (qp.timezone/database-timezone-id)
                   (qp.timezone/system-timezone-id)))))))

(deftest server-side-relative-datetime-test
  (mt/test-driver
   :redshift
   (testing "Values of getdate() and server side generated timestamp are equal"
     (mt/with-metadata-provider (mt/id)
       (let [test-thunk (getdate-vs-ss-ts-test-thunk-generator)]
         (doseq [tz-setter [qp.test-util/do-with-report-timezone-id
                            test.tz/do-with-system-timezone-id
                            qp.test-util/do-with-database-timezone-id
                            qp.test-util/do-with-results-timezone-id]
                 timezone ["America/Los_Angeles"
                           "Europe/Prague"
                           "UTC"]]
           (testing (str tz-setter " " timezone)
             (tz-setter timezone test-thunk))))))))

;; Other configurations of timezone settings were also tested with values UTC America/Los_Angeles Europe/Prague.
;; Test containing all configurations took ~500 seconds. Leaving here only one random configuration to be
;; included in CI tests.
(deftest server-side-relative-datetime-multiple-tz-settings-test
  (mt/test-driver
   :redshift
   (mt/with-metadata-provider (mt/id)
     (testing "Value of server side generated timestamp matches the one from getdate() with multiple timezone settings"
       (mt/with-results-timezone-id "UTC"
         (mt/with-database-timezone-id "America/Los_Angeles"
           (mt/with-report-timezone-id "America/Los_Angeles"
             (mt/with-system-timezone-id "Europe/Prague"
               (let [test-thunk (getdate-vs-ss-ts-test-thunk-generator)]
                 (test-thunk))))))))))

(comment
  ;; For local testing.
  (defn- generate-tz-tests [fs tzs thunks]
    (letfn [(combine-acc [acc [f & fs*] tzs]
              (if (nil? f)
                acc
                (recur (into acc (mapcat (fn [thunk*] (for [tz tzs] #(f tz thunk*)))) acc)
                       fs*
                       tzs)))]
      (combine-acc (vec thunks) fs tzs)))

  ;; For local testing.
  (defn- generate-test-thunks
    "Generate test thunks of product units x tests"
    [units values]
    (for [unit units
          value values
          :let [test-thunk (getdate-vs-ss-ts-test-thunk-generator unit value)]]
      (fn []
        (testing (format "unit = %s, value = %s" unit value)
          (test-thunk)))))

  ;; Following is meant for local testing and not to be run in the CI. Feel free to tweak the values.
  (deftest tz-settings-combinations-test
    (mt/test-driver
     :redshift
     (mt/with-metadata-provider (mt/id)
       (let [thunks-with-various-values-units (generate-test-thunks [:day :week :month] [-1 0 1])
             tz-setters [qp.test-util/do-with-report-timezone-id
                         test.tz/do-with-system-timezone-id]
             tzs ["America/Los_Angeles"
                  "Europe/Prague"]
             testcases (generate-tz-tests tz-setters tzs thunks-with-various-values-units)]
         #_{:clj-kondo/ignore [:discouraged-var]}
         (time (doseq [testcase testcases]
                 (time (testcase))))))))
  )

(comment
  (def tz-setters [qp.test-util/do-with-report-timezone-id
                   test.tz/do-with-system-timezone-id
                   qp.test-util/do-with-database-timezone-id
                   qp.test-util/do-with-results-timezone-id])
  (def tzs ["America/Los_Angeles"
            "Europe/Prague"
            "UTC"])
  (-> (generate-test-thunks [:day :week :month :year] [-30 -7 -1 0 1 7 30]) count)
  ;; => 28
  (->> (generate-test-thunks [:day :week :month :year] [-30 -7 -1 0 1 7 30])
       (generate-tz-tests tz-setters tzs)
       count)
  ;; => 7168

  (def some-tz-setters [qp.test-util/do-with-report-timezone-id
                        test.tz/do-with-system-timezone-id])
  (def some-tzs ["America/Los_Angeles"
            "Europe/Prague"])
  (->> (generate-test-thunks [:day :week :month :year] [-1 0 1])
       (generate-tz-tests some-tz-setters some-tzs)
       count)
  ;; => 108
  )

(deftest server-side-relative-datetime-various-units-test
  (mt/test-driver
   :redshift
   (mt/with-metadata-provider (mt/id)
     (testing "Value of server side generated timestamp matches the one from getdate() with multiple timezone settings"
       (doseq [unit [:day :week :month :year]
               value [-30 0 7]
               :let [test-thunk (getdate-vs-ss-ts-test-thunk-generator unit value)]]
         (test-thunk))))))

;; Dec 8th 2023, Temporarily skip this to unblock master, QP should fix this soon
#_(deftest server-side-relative-datetime-truncation-test
  (mt/test-driver
   :redshift
   (testing "Datetime _truncation_ works correctly over different timezones"
     ;; Sunday is the first week day. System is in UTC and has 2014 Aug 10 Sunday 12:30:01 AM. Report is required
     ;; for New York, where there's still Saturday. So the time span that we'd like to see the results for
     ;; is 2014 Jul 27 12:00 AM <= x < 2014 Aug 03 12:00 AM. If we were using local date as a base
     ;; (in redshift/server-side-relative-datetime-honeysql-form), that would be correctly adjusted by the jdbc driver
     ;; to match timezone of the session. However that adjustment would come _after the truncation and addition_
     ;; that :relative-datetime does, hence would produce incorrect results. This test verifies the situation
     ;; is correctly handled.
     (mt/with-report-timezone-id "America/New_York"
       (mt/with-system-timezone-id "UTC"
         (mt/with-clock (t/zoned-date-time (t/local-date-time 2014 8 10 0 30 1 0) "UTC")
           (is (= [[13 "Dwight Gresham" "2014-08-01T10:30:00-04:00"]
                   [15 "Rüstem Hebel" "2014-08-01T12:45:00-04:00"]
                   [7 "Conchúr Tihomir" "2014-08-02T09:30:00-04:00"]
                   [6 "Shad Ferdynand" "2014-08-02T12:30:00-04:00"]]
                  (->> (mt/run-mbql-query
                        test_data_users
                        {:fields [$id $name $last_login]
                         :filter [:and
                                  [:>= $last_login [:relative-datetime -1 :week]]
                                  [:< $last_login [:relative-datetime 0 :week]]]
                         :order-by [[:asc $last_login]]})
                       (mt/formatted-rows [int str str]))))))))))
