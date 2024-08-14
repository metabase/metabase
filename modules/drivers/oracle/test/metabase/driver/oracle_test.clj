(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.oracle :as oracle]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.lib.test-util :as lib.tu]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test.order-by-test :as qp-test.order-by-test]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.env :as te]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.oracle :as oracle.tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.util Base64)))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      ;; 1. If sync fails when loading a test dataset, don't swallow the error; throw an Exception so we
                      ;;    can debug it. This is much less confusing when trying to fix broken tests.
                      ;;
                      ;; 2. Make sure we're in Honey SQL 2 mode for all the little SQL snippets we're compiling in these
                      ;;    tests.
                      (binding [sync-util/*log-exceptions-and-continue?* false]
                        (thunk))))

(deftest ^:parallel connection-details->spec-test
  (doseq [[^String message expected-spec details]
          [["You should be able to connect with an SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521:ORCL"}
            {:host "localhost"
             :port 1521
             :sid  "ORCL"}]
           ["You should be able to specify a Service Name with no SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521/MyCoolService"}
            {:host         "localhost"
             :port         1521
             :service-name "MyCoolService"}]
           ["You should be able to specify a Service Name *and* an SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521:ORCL/MyCoolService"}
            {:host         "localhost"
             :port         1521
             :service-name "MyCoolService"
             :sid          "ORCL"}]
           ["You should be to specify SSL with a trust store"
            {:classname                         "oracle.jdbc.OracleDriver"
             :subprotocol                       "oracle:thin"
             :subname                           (str "@(DESCRIPTION=(ADDRESS=(PROTOCOL=tcps)(HOST=localhost)(PORT=1521)"
                                                     ")(CONNECT_DATA=(SID=ORCL)(SERVICE_NAME=MyCoolService)))")}
            {:host                    "localhost"
             :port                    1521
             :service-name            "MyCoolService"
             :sid                     "ORCL"
             :ssl                     true}]]]
    (let [actual-spec (sql-jdbc.conn/connection-details->spec :oracle details)
          prog-prop   (deref #'oracle/prog-name-property)]
      (is (= (dissoc expected-spec prog-prop)
             (dissoc actual-spec prog-prop))
          message)
      ;; check our truncated Oracle version of the version/UUID string
      ;; in some test cases, the version info isn't set, to the string "null" is the value
      (is (re-matches #"MB (?:null|v(?:.*)) [\-a-f0-9]*" (get actual-spec prog-prop))))))

(deftest ^:parallel require-sid-or-service-name-test
  (testing "no SID and no Service Name should throw an exception"
    (is (thrown?
         AssertionError
         (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                          :port 1521})))
    (is (= "You must specify the SID and/or the Service Name."
           (try (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                                 :port 1521})
                (catch Throwable e
                  (driver/humanize-connection-error-message :oracle (.getMessage e))))))))

(deftest connection-properties-test
  (testing "Connection properties should be returned properly (including transformation of secret types)"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (let [expected [{:name "host"}
                      {:name "port"}
                      {:name "sid"}
                      {:name "service-name"}
                      {:name "user"}
                      {:name "password"}
                      {:name "ssl"}
                      {:name "ssl-use-keystore"}
                      {:name       "ssl-keystore-options"
                       :type       "select"
                       :options    [{:name  "Local file path"
                                     :value "local"}
                                    {:name  "Uploaded file path"
                                     :value "uploaded"}]
                       :visible-if {:ssl-use-keystore true}}
                      {:name       "ssl-keystore-value"
                       :type       "textFile"
                       :visible-if {:ssl-keystore-options "uploaded"}}
                      {:name       "ssl-keystore-path"
                       :type       "string"
                       :visible-if {:ssl-keystore-options "local"}}
                      {:name "ssl-keystore-password-value"
                       :type "password"}
                      {:name "ssl-use-truststore"}
                      {:name       "ssl-truststore-options"
                       :type       "select"
                       :options    [{:name  "Local file path"
                                     :value "local"}
                                    {:name  "Uploaded file path"
                                     :value "uploaded"}]
                       :visible-if {:ssl-use-truststore true}}
                      {:name       "ssl-truststore-value"
                       :type       "textFile"
                       :visible-if {:ssl-truststore-options "uploaded"}}
                      {:name       "ssl-truststore-path"
                       :type       "string"
                       :visible-if {:ssl-truststore-options "local"}}
                      {:name "ssl-truststore-password-value"
                       :type "password"}
                      {:name "tunnel-enabled"}
                      {:name "tunnel-host"}
                      {:name "tunnel-port"}
                      {:name "tunnel-user"}
                      {:name "tunnel-auth-option"}
                      {:name "tunnel-pass"}
                      {:name "tunnel-private-key"}
                      {:name "tunnel-private-key-passphrase"}
                      {:name "advanced-options"}
                      {:name "auto_run_queries"}
                      {:name "let-user-control-scheduling"}
                      {:name "schedules.metadata_sync"}
                      {:name "schedules.cache_field_values"}
                      {:name "refingerprint"}]
            actual   (->> (driver/connection-properties :oracle)
                          (driver.u/connection-props-server->client :oracle))]
        (is (= expected (mt/select-keys-sequentially expected actual)))))))

(deftest ^:parallel test-ssh-connection
  (testing "Gets an error when it can't connect to oracle via ssh tunnel"
    (mt/test-driver :oracle
      (is (thrown?
           java.net.ConnectException
           (try
             (let [engine :oracle
                   details {:ssl            false
                            :password       "changeme"
                            :tunnel-host    "localhost"
                            :tunnel-pass    "BOGUS-BOGUS"
                            :port           5432
                            :dbname         "test"
                            :host           "localhost"
                            :tunnel-enabled true
                            ;; we want to use a bogus port here on purpose -
                            ;; so that locally, it gets a ConnectionRefused,
                            ;; and in CI it does too. Apache's SSHD library
                            ;; doesn't wrap every exception in an SshdException
                            :tunnel-port    21212
                            :tunnel-user    "bogus"}]
               (driver.u/can-connect-with-details? engine details :throw-exceptions))
             (catch Throwable e
               (loop [^Throwable e e]
                 (or (when (instance? java.net.ConnectException e)
                       (throw e))
                     (some-> (.getCause e) recur))))))))))

(deftest timezone-id-test
  (mt/test-driver :oracle
    (is (= (t/zone-id "Z")
           (-> (driver/db-default-timezone :oracle (mt/db))
               t/zone-id
               .normalized)))))

;;; see also [[metabase.test.data.oracle/insert-all-test]]
(deftest ^:parallel insert-rows-ddl-test
  (mt/test-driver :oracle
    (testing "Make sure we're generating correct DDL for Oracle to insert all rows at once."
      (is (= [[(str "INSERT ALL"
                    " INTO \"my_db\".\"my_table\" (\"col1\", \"col2\") VALUES (?, 1)"
                    " INTO \"my_db\".\"my_table\" (\"col1\", \"col2\") VALUES (?, 2) "
                    "SELECT * FROM dual")
               "A"
               "B"]]
             (ddl/insert-rows-ddl-statements :oracle (h2x/identifier :table "my_db" "my_table") [{:col1 "A", :col2 1}
                                                                                                 {:col1 "B", :col2 2}]))))))

(defn- do-with-temp-user [username f]
  (let [username (or username (mt/random-name))]
    (try
      (oracle.tx/create-user! username)
      (f username)
      (finally
        (oracle.tx/drop-user! username)))))

(defmacro ^:private with-temp-user
  "Run `body` with a temporary user bound, binding their name to `username-binding`. Use this to create the equivalent
  of temporary one-off databases. A particular username can be passed in as the binding or else one is generated with
  `mt/random-name`."
  [[username-binding & [username]] & body]
  `(do-with-temp-user ~username (fn [~username-binding] ~@body)))

(deftest ^:parallel subselect-test
  (testing "Don't try to generate queries with SELECT (...) AS source, Oracle hates `AS`"
    ;; TODO -- seems WACK that we actually have to create objects for this to work and can't just stick them in the QP
    ;; store.
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      {:database {:id     1
                                                  :name   "db"
                                                  :engine :oracle}
                                       :tables   [{:id     1
                                                   :db-id  1
                                                   :schema "public"
                                                   :name   "table"}]
                                       :fields   [{:id            1
                                                   :table-id      1
                                                   :name          "field"
                                                   :display-name  "Field"
                                                   :database-type "char"
                                                   :base-type     :type/Text}]})
      (let [hsql (sql.qp/mbql->honeysql :oracle
                                        {:query {:source-query {:source-table 1
                                                                :expressions  {"s" [:substring [:field 1 nil] 2]}
                                                                :fields       [[:field 1 nil]
                                                                               [:expression "s"]]}
                                                 :fields       [[:field "s" {:base-type :type/Text}]]
                                                 :limit        3}})]
        (testing (format "Honey SQL =\n%s" (u/pprint-to-str hsql))
          (is (= [["SELECT"
                   "  *"
                   "FROM"
                   "  ("
                   "    SELECT"
                   "      \"source\".\"s\" \"s\""
                   "    FROM"
                   "      ("
                   "        SELECT"
                   "          \"public\".\"table\".\"field\" \"field\","
                   "          SUBSTR(\"public\".\"table\".\"field\", 2) \"s\""
                   "        FROM"
                   "          \"public\".\"table\""
                   "      ) \"source\""
                   "  )"
                   "WHERE"
                   "  rownum <= 3"]]
                 (-> (sql.qp/format-honeysql :oracle hsql)
                     vec
                     (update 0 (partial driver/prettify-native-form :oracle))
                     (update 0 str/split-lines)))))))))

(deftest return-clobs-as-text-test
  (mt/test-driver :oracle
    (testing "Make sure Oracle CLOBs are returned as text (#9026)"
      (let [details  (:details (mt/db))
            spec     (sql-jdbc.conn/connection-details->spec :oracle details)
            execute! (fn [format-string & args]
                       (jdbc/execute! spec (apply format format-string args)))
            pk-type  (sql.tx/pk-sql-type :oracle)]
        (with-temp-user
          #_:clj-kondo/ignore
          [username]
          (execute! "CREATE TABLE \"%s\".\"messages\" (\"id\" %s, \"message\" CLOB)"            username pk-type)
          (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (1, 'Hello')" username)
          (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (2, NULL)"    username)
          (sync/sync-database! (mt/db) {:scan :schema})
          (let [table    (t2/select-one :model/Table :schema username, :name "messages", :db_id (mt/id))
                id-field (t2/select-one :model/Field :table_id (u/the-id table), :name "id")]
            (testing "The CLOB is synced as a text field"
              (let [base-type (t2/select-one-fn :base_type :model/Field :table_id (u/the-id table), :name "message")]
                ;; type/OracleCLOB is important for skipping fingerprinting and field values scanning #44109
                (is (= :type/OracleCLOB base-type))
                (is (isa? base-type :type/Text))))
            (is (= [[1M "Hello"]
                    [2M nil]]
                   (mt/rows
                    (qp/process-query
                     {:database (mt/id)
                      :type     :query
                      :query    {:source-table (u/the-id table)
                                 :order-by     [[:asc [:field (u/the-id id-field) nil]]]}}))))))))))

(deftest handle-slashes-test
  (mt/test-driver :oracle
    (let [details  (:details (mt/db))
          spec     (sql-jdbc.conn/connection-details->spec :oracle details)
          execute! (fn [format-string & args]
                     (jdbc/execute! spec (apply format format-string args)))
          pk-type  (sql.tx/pk-sql-type :oracle)
          schema   (str (mt/random-name) "/")]
      (with-temp-user [username schema]
        (execute! "CREATE TABLE \"%s\".\"mess/ages/\" (\"id\" %s, \"column1\" varchar(200))" username pk-type)
        (testing "Sync can handle slashes in the schema and tablenames"
          (is (= #{"id" "column1"}
                 (into #{}
                       (map :name)
                       (:fields
                        (sql-jdbc.sync/describe-table :oracle spec {:name "mess/ages/" :schema username}))))))))))

;; let's make sure we're actually attempting to generate the correctl HoneySQL for joins and source queries so we
;; don't sit around scratching our heads wondering why the queries themselves aren't working
(deftest honeysql-test
  (mt/test-driver :oracle
    (testing "Correct HoneySQL form should be generated"
      (mt/with-metadata-provider (mt/id)
        (is (= (letfn [(id
                         ([field-name database-type]
                          (id oracle.tx/session-schema "test_data_venues" field-name database-type))
                         ([table-name field-name database-type]
                          (id nil table-name field-name database-type))
                         ([schema-name table-name field-name database-type]
                          (-> (h2x/identifier :field schema-name table-name field-name)
                              (h2x/with-database-type-info database-type))))]
                 {:select [:*]
                  :from   [{:select
                            [[(id "id" "number")
                              [(h2x/identifier :field-alias "id")]]
                             [(id "name" "varchar2")
                              [(h2x/identifier :field-alias "name")]]
                             [(id "category_id" "number")
                              [(h2x/identifier :field-alias "category_id")]]
                             [(id "latitude" "binary_double")
                              [(h2x/identifier :field-alias "latitude")]]
                             [(id "longitude" "binary_double")
                              [(h2x/identifier :field-alias "longitude")]]
                             [(id "price" "number")
                              [(h2x/identifier :field-alias "price")]]]
                            :from     [[(h2x/identifier :table oracle.tx/session-schema "test_data_venues")]]
                            :join-by  [:left-join [[(h2x/identifier :table oracle.tx/session-schema "test_data_categories")
                                                    [(h2x/identifier :table-alias "test_data_categories__via__cat")]]
                                                   [:=
                                                    (id "category_id" "number")
                                                    (id "test_data_categories__via__cat" "id" "number")]]]
                            :where    [:=
                                       (id "test_data_categories__via__cat" "name" "varchar2")
                                       "BBQ"]
                            :order-by [[(id "id" "number") :asc]]}]
                  :where  [:<= [:raw "rownum"] [:inline 100]]})
               (#'sql.qp/mbql->honeysql
                :oracle
                (qp.preprocess/preprocess
                 (mt/mbql-query venues
                   {:source-table $$venues
                    :order-by     [[:asc $id]]
                    :filter       [:=
                                   &test_data_categories__via__cat.categories.name
                                   [:value "BBQ" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                    :fields       [$id $name $category_id $latitude $longitude $price]
                    :limit        100
                    :joins        [{:source-table $$categories
                                    :alias        "test_data_categories__via__cat"
                                    :strategy     :left-join
                                    :condition    [:=
                                                   $category_id
                                                   &test_data_categories__via__cat.categories.id]
                                    :fk-field-id  (mt/id :venues :category_id)
                                    :fields       :none}]})))))))))

(deftest oracle-connect-with-ssl-test
  ;; ridiculously hacky test; hopefully it can be simplified; see inline comments for full explanations
  (mt/test-driver :oracle
    (if (System/getenv "MB_ORACLE_SSL_TEST_SSL") ; only even run this test if this env var is set
      ;; swap out :oracle env vars with any :oracle-ssl ones that were defined
      (mt/with-env-keys-renamed-by #(str/replace-first % "mb-oracle-ssl-test" "mb-oracle-test")
        ;; need to get a fresh instance of details to pick up env key changes
        (let [ssl-details  (#'oracle.tx/connection-details)
              orig-user-id api/*current-user-id*]
          (testing "Oracle can-connect? with SSL connection"
            (is (driver/can-connect? :oracle ssl-details)))
          (testing "Sync works with SSL connection"
            (binding [sync-util/*log-exceptions-and-continue?* false
                      api/*current-user-id* (mt/user->id :crowberto)]
              (doseq [[details variant] [[ssl-details "SSL with Truststore Path"]
                                         ;; in the file upload scenario, the truststore bytes are base64 encoded
                                         ;; to the -value suffix property, and the -path suffix property is removed
                                         [(-> (assoc
                                               ssl-details
                                               :ssl-truststore-value
                                               (.encodeToString (Base64/getEncoder)
                                                                (mt/file->bytes (:ssl-truststore-path ssl-details)))
                                               :ssl-truststore-options
                                               "uploaded")
                                              (dissoc :ssl-truststore-path))
                                          "SSL with Truststore Upload"]]]
                (testing (str " " variant)
                  (t2.with-temp/with-temp [Database database {:engine  :oracle,
                                                              :name    (format (str variant " version of %d") (mt/id)),
                                                              :details (->> details
                                                                            (driver.u/db-details-client->server :oracle))}]
                    (mt/with-db database
                      (testing " can sync correctly"
                        (sync/sync-database! database {:scan :schema})
                        ;; should be four tables from test-data
                        (is (= 8 (t2/count Table :db_id (u/the-id database) :name [:like "test_data%"])))
                        (binding [api/*current-user-id* orig-user-id ; restore original user-id to avoid perm errors
                                  ;; we also need to rebind this dynamic var so that we can pretend "test-data" is
                                  ;; actually the name of the database, and not some variation on the :name specified
                                  ;; above, so that the table names resolve correctly in the generated query we can't
                                  ;; simply call this new temp database "test-data", because then it will no longer be
                                  ;; unique compared to the "real" "test-data" DB associated with the non-SSL (default)
                                  ;; database, and the logic within metabase.test.data.interface/metabase-instance would
                                  ;; be wrong (since we would end up with two :oracle Databases both named "test-data",
                                  ;; violating its assumptions, in case the app DB ends up in an inconsistent state)
                                  tx/*database-name-override* "test-data"
                                  ;; Only run the embedded test with the :oracle driver. For example, run it with :h2
                                  ;; results in errors because of column name formatting.
                                  te/*test-drivers* (constantly #{:oracle})]
                          (testing " and execute a query correctly"
                            (qp-test.order-by-test/order-by-test))))))))))))
      (log/warn (u/format-color 'yellow
                                "Skipping %s because %s env var is not set"
                                "oracle-connect-with-ssl-test"
                                "MB_ORACLE_SSL_TEST_SSL")))))

(deftest ^:parallel text-equals-empty-string-test
  (mt/test-driver :oracle
    (testing ":= with empty string should work correctly (#13158)"
      (mt/dataset airports
        (is (= [1M]
               (mt/first-row
                (mt/run-mbql-query airport {:aggregation [:count], :filter [:= $code ""]}))))))))

(deftest ^:parallel custom-expression-between-test
  (mt/test-driver :oracle
    (testing "Custom :between expression should work (#15538)"
      (let [query (mt/mbql-query nil
                    {:source-query {:native (str "select 42 as \"val\","
                                                 " cast(to_timestamp('09-APR-2021') AS date) as \"date\","
                                                 " to_timestamp('09-APR-2021') AS \"timestamp\" "
                                                 "from dual")}
                     :aggregation  [[:aggregation-options
                                     [:sum-where
                                      [:field "val" {:base-type :type/Decimal}]
                                      [:between [:field "date" {:base-type :type/Date}] "2021-01-01" "2021-12-31"]]
                                     {:name "CE", :display-name "CE"}]]})]
        (mt/with-native-query-testing-context query
          (is (= [42M]
                 (mt/first-row (qp/process-query query)))))))))

(deftest ^:parallel escape-alias-test
  (testing "Oracle should strip double quotes and null characters from identifiers"
    (is (= "ABC_D_E__FG_H"
           (driver/escape-alias :oracle "ABC\"D\"E\"\u0000FG\u0000H")))))

(deftest read-timestamp-with-tz-test
  (mt/test-driver :oracle
    (testing "We should return TIMESTAMP WITH TIME ZONE columns correctly"
      (let [test-date "2024-12-20 16:05:00 US/Eastern"
            sql       (format "SELECT TIMESTAMP '%s' AS timestamp_tz FROM dual" test-date)
            query     (-> (mt/native-query {:query sql})
                          (assoc-in [:middleware :format-rows?] false))]
        (doseq [report-tz ["UTC" "US/Pacific"]]
          (mt/with-temporary-setting-values [report-timezone report-tz]
            (mt/with-native-query-testing-context query
              (testing "The value should come back from driver with original zone info, regardless of report timezone"
                (= (t/offset-date-time (u.date/parse test-date) "US/Eastern")
                   (ffirst (mt/rows (qp/process-query query))))))))))))

(deftest read-timestamp-with-local-tz-test
  (mt/test-driver :oracle
    (testing "We should return TIMESTAMP WITH LOCAL TIME ZONE columns correctly"
      (let [test-date  "2024-12-20 16:05:00 US/Pacific"
            sql        (format "SELECT CAST(TIMESTAMP '%s' AS TIMESTAMP WITH LOCAL TIME ZONE) AS timestamp_tz FROM dual" test-date)
            query      (-> (mt/native-query {:query sql})
                           (assoc-in [:middleware :format-rows?] false))
            spec       #(sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            old-format (-> (jdbc/query (spec) "SELECT value FROM NLS_SESSION_PARAMETERS WHERE PARAMETER = 'NLS_TIMESTAMP_TZ_FORMAT'")
                           ffirst
                           val)
            do-with-temp-tz-format (fn [thunk]
                                     ;; verify that the value is independent of NLS_TIMESTAMP_TZ_FORMAT
                                     (jdbc/execute! (spec) "ALTER SESSION SET NLS_TIMESTAMP_TZ_FORMAT = 'YYYY-MM-DD HH:MI'")
                                     (thunk)
                                     (jdbc/execute! (spec) (format "ALTER SESSION SET NLS_TIMESTAMP_TZ_FORMAT = '%s'" old-format)))]
        (do-with-temp-tz-format
         (fn []
           (doseq [report-tz ["UTC" "US/Pacific"]]
             (mt/with-temporary-setting-values [report-timezone report-tz]
               (mt/with-native-query-testing-context query
                 (is (= (t/zoned-date-time (u.date/parse test-date) report-tz)
                        (ffirst (mt/rows (qp/process-query query))))))))))))))
