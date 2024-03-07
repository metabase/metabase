(ns metabase.driver.postgres-test
  "Tests for features/capabilities specific to PostgreSQL driver, such as support for Postgres UUID or enum types."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [malli.core :as mc]
   [metabase.actions.error :as actions.error]
   [metabase.config :as config]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.postgres :as postgres]
   [metabase.driver.postgres.actions :as postgres.actions]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.actions-test :as sql-jdbc.actions-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.models.action :as action]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.secret :as secret]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      ;; 1. If sync fails when loading a test dataset, don't swallow the error; throw an Exception so we
                      ;;    can debug it. This is much less confusing when trying to fix broken tests.
                      ;;
                      ;; 2. Make sure we're in Honey SQL 2 mode for all the little SQL snippets we're compiling in these
                      ;;    tests.
                      (binding [sync-util/*log-exceptions-and-continue?* false]
                        (thunk))))

(deftest ^:parallel interval-test
  (is (= ["INTERVAL '2 day'"]
         (sql/format-expr [::postgres/interval 2 :day])))
  (is (= ["INTERVAL '-2.5 year'"]
         (sql/format-expr [::postgres/interval -2.5 :year])))
  (are [amount unit msg] (thrown-with-msg?
                          AssertionError
                          msg
                          (sql/format-expr [::postgres/interval amount unit]))
    "2"  :day  #"\QAssert failed: (number? amount)\E"
    :day 2     #"\QAssert failed: (number? amount)\E"
    2    "day" #"\QAssert failed: (#{:day :hour :week :second :month :year :millisecond :minute} unit)\E"
    2    2     #"\QAssert failed: (#{:day :hour :week :second :month :year :millisecond :minute} unit)\E"
    2    :can  #"\QAssert failed: (#{:day :hour :week :second :month :year :millisecond :minute} unit)\E"))

(deftest ^:parallel extract-test
  (is (= ["extract(month from NOW())"]
         (sql.qp/format-honeysql :postgres (#'postgres/extract :month :%now)))))

(deftest ^:parallel datetime-diff-test
  (is (= [["CAST("
           "  extract("
           "    year"
           "    from"
           "      AGE("
           "        DATE_TRUNC('day', CAST(? AS timestamp)),"
           "        DATE_TRUNC('day', CAST(? AS timestamp))"
           "      )"
           "  ) AS integer"
           ")"]
          "2021-10-03T09:00:00"
          "2021-10-03T09:00:00"]
         (as-> [:datetime-diff "2021-10-03T09:00:00" "2021-10-03T09:00:00" :year] <>
           (sql.qp/->honeysql :postgres <>)
           (sql.qp/format-honeysql :postgres <>)
           (update (vec <>) 0 #(str/split-lines (driver/prettify-native-form :postgres %)))))))

(defn drop-if-exists-and-create-db!
  "Drop a Postgres database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (mt/dbdef->connection-details :postgres :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                       FROM pg_stat_activity
                       WHERE pg_stat_activity.datname = ?;" db-name])
    ;; create the DB
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\";
                                  CREATE DATABASE \"%s\";"
                                 db-name db-name)]
                   {:transaction? false})))

(defn- exec!
  "Execute a sequence of statements against the database whose spec is passed as the first param."
  [spec statements]
  (doseq [statement statements]
    (jdbc/execute! spec [statement])))

;;; ----------------------------------------------- Connection Details -----------------------------------------------

(deftest ^:parallel connection-details->spec-test
  (testing (str "Check that SSL params get added the connection details in the way we'd like # no SSL -- this should "
                "*not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL "
                "anyway")
    (is (= {:classname                     "org.postgresql.Driver"
            :subprotocol                   "postgresql"
            :subname                       "//localhost:5432/bird_sightings"
            :OpenSourceSubProtocolOverride true
            :user                          "camsaul"
            :sslmode                       "disable"
            :ApplicationName               config/mb-version-and-process-identifier}
           (sql-jdbc.conn/connection-details->spec :postgres
             {:ssl    false
              :host   "localhost"
              :port   5432
              :dbname "bird_sightings"
              :user   "camsaul"}))))
  (testing "ssl - check that expected params get added"
    (is (= {:classname                     "org.postgresql.Driver"
            :subprotocol                   "postgresql"
            :subname                       "//localhost:5432/bird_sightings"
            :OpenSourceSubProtocolOverride true
            :user                          "camsaul"
            :ssl                           true
            :sslmode                       "require"
            :sslpassword                   ""
            :ApplicationName               config/mb-version-and-process-identifier}
           (sql-jdbc.conn/connection-details->spec :postgres
             {:ssl    true
              :host   "localhost"
              :port   5432
              :dbname "bird_sightings"
              :user   "camsaul"}))))
  (testing "make sure connection details w/ extra params work as expected"
    (is (= {:classname                     "org.postgresql.Driver"
            :subprotocol                   "postgresql"
            :subname                       "//localhost:5432/cool?prepareThreshold=0"
            :OpenSourceSubProtocolOverride true
            :sslmode                       "disable"
            :ApplicationName               config/mb-version-and-process-identifier}
           (sql-jdbc.conn/connection-details->spec :postgres
             {:host               "localhost"
              :port               "5432"
              :dbname             "cool"
              :additional-options "prepareThreshold=0"}))))
  (testing "user-specified SSL options should always take precendence over defaults"
    (is (= {:classname                     "org.postgresql.Driver"
            :subprotocol                   "postgresql"
            :subname                       "//localhost:5432/bird_sightings"
            :OpenSourceSubProtocolOverride true
            :user                          "camsaul"
            :ssl                           true
            :sslmode                       "verify-ca"
            :sslcert                       "my-cert"
            :sslkey                        "my-key"
            :sslfactory                    "myfactoryoverride"
            :sslrootcert                   "myrootcert"
            :sslpassword                   ""
            :ApplicationName               config/mb-version-and-process-identifier}
           (sql-jdbc.conn/connection-details->spec :postgres
             {:ssl         true
              :host        "localhost"
              :port        5432
              :dbname      "bird_sightings"
              :user        "camsaul"
              :sslmode     "verify-ca"
              :sslcert     "my-cert"
              :sslkey      "my-key"
              :sslfactory  "myfactoryoverride"
              :sslrootcert "myrootcert"})))))


;;; ------------------------------------------- Tests for sync edge cases --------------------------------------------

(deftest edge-case-identifiers-test
  (mt/test-driver :postgres
    (testing "Make sure that Tables / Fields with dots in their names get escaped properly"
      (mt/dataset dots-in-names
        (= {:columns ["id" "dotted.name"]
            :rows    [[1 "toucan_cage"]
                      [2 "four_loko"]
                      [3 "ouija_board"]]}
           (mt/rows+column-names (mt/run-mbql-query objects.stuff)))))
    (testing "make sure schema/table/field names with hyphens in them work correctly (#8766)"
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "hyphen-names-test"})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        ;; create the postgres DB
        (drop-if-exists-and-create-db! "hyphen-names-test")
        ;; create the DB object
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname "hyphen-names-test")}]
          (let [sync! #(sync/sync-database! database)]
            ;; populate the DB and create a view
            (exec! spec ["CREATE SCHEMA \"x-mas\";"
                         "CREATE TABLE \"x-mas\".\"presents-and-gifts\" (\"gift-description\" TEXT NOT NULL);"
                         "INSERT INTO \"x-mas\".\"presents-and-gifts\" (\"gift-description\") VALUES ('Bird Hat');;"])
            (sync!)
            (is (= [["Bird Hat"]]
                   (mt/rows (qp/process-query
                             {:database (u/the-id database)
                              :type     :query
                              :query    {:source-table (t2/select-one-pk Table :name "presents-and-gifts")}}))))))))))

(mt/defdataset duplicate-names
  [["birds"
    [{:field-name "name", :base-type :type/Text}]
    [["Rasta"]
     ["Lucky"]]]
   ["people"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "bird_id", :base-type :type/Integer, :fk :birds}]
    [["Cam" 1]]]])

(deftest duplicate-names-test
  (mt/test-driver :postgres
    (testing "Make sure that duplicate column names (e.g. caused by using a FK) still return both columns"
      (mt/dataset duplicate-names
        (is (= {:columns ["name" "name_2"]
                :rows    [["Cam" "Rasta"]]}
               (mt/rows+column-names
                 (mt/run-mbql-query people
                   {:fields [$name $bird_id->birds.name]}))))))))

(defn- default-table-result [table-name]
  {:name table-name, :schema "public", :description nil})

(deftest materialized-views-test
  (mt/test-driver :postgres
    (testing (str "Check that we properly fetch materialized views. As discussed in #2355 they don't come back from "
                  "JDBC `DatabaseMetadata` so we have to fetch them manually.")
      (drop-if-exists-and-create-db! "materialized_views_test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "materialized_views_test"})]
        (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
                       ["DROP MATERIALIZED VIEW IF EXISTS test_mview;
                       CREATE MATERIALIZED VIEW test_mview AS
                       SELECT 'Toucans are the coolest type of bird.' AS true_facts;"])
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname "materialized_views_test")}]
          (is (= {:tables #{(default-table-result "test_mview")}}
                 (driver/describe-database :postgres database))))))))

(deftest foreign-tables-test
  (mt/test-driver :postgres
    (testing "Check that we properly fetch foreign tables."
      (drop-if-exists-and-create-db! "fdw_test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "fdw_test"})]
        ;; You need to set `MB_POSTGRESQL_TEST_USER` in order for this to work apparently.
        ;;
        ;; make sure that the details include optional stuff like `:user`. Otherwise the test is going to FAIL. You can
        ;; set it at run time from the REPL using [[mt/db-test-env-var!]].
        (is (mc/coerce [:map
                        [:port :int]
                        [:host :string]
                        [:user :string]]
                       details))
        (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
                       [(str "CREATE EXTENSION IF NOT EXISTS postgres_fdw;
                              CREATE SERVER foreign_server
                                FOREIGN DATA WRAPPER postgres_fdw
                                OPTIONS (host '" (:host details) "', port '" (:port details) "', dbname 'fdw_test');
                              CREATE TABLE public.local_table (data text);
                              CREATE FOREIGN TABLE foreign_table (data text)
                                SERVER foreign_server
                                OPTIONS (schema_name 'public', table_name 'local_table');

                              CREATE USER MAPPING FOR " (:user details) "
                                SERVER foreign_server
                                OPTIONS (user '" (:user details) "');
                              GRANT ALL ON public.local_table to PUBLIC;")])
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname "fdw_test")}]
          (is (= {:tables (set (map default-table-result ["foreign_table" "local_table"]))}
                 (driver/describe-database :postgres database))))))))

(deftest recreated-views-test
  (mt/test-driver :postgres
    (testing (str "make sure that if a view is dropped and recreated that the original Table object is marked active "
                  "rather than a new one being created (#3331)")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "dropped_views_test"})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        ;; create the postgres DB
        (drop-if-exists-and-create-db! "dropped_views_test")
        ;; create the DB object
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname "dropped_views_test")}]
          (let [sync! #(sync/sync-database! database)]
            ;; populate the DB and create a view
            (exec! spec ["CREATE table birds (name VARCHAR UNIQUE NOT NULL);"
                         "INSERT INTO birds (name) VALUES ('Rasta'), ('Lucky'), ('Parroty');"
                         "CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"
                         "GRANT ALL ON angry_birds to PUBLIC;"])
            ;; now sync the DB
            (sync!)
            ;; drop the view
            (exec! spec ["DROP VIEW angry_birds;"])
            ;; sync again
            (sync!)
            ;; recreate the view
            (exec! spec ["CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"
                         "GRANT ALL ON angry_birds to PUBLIC;"])
            ;; sync one last time
            (sync!)
            ;; now take a look at the Tables in the database related to the view. THERE SHOULD BE ONLY ONE!
            (is (= [{:name "angry_birds", :active true}]
                   (map (partial into {})
                        (t2/select [Table :name :active] :db_id (u/the-id database), :name "angry_birds"))))))))))

(deftest partitioned-table-test
  (mt/test-driver :postgres
    (testing (str "Make sure that partitioned tables (in addition to the individual partitions themselves) are
                   synced properly (#15049")
      (let [db-name "partitioned_table_test"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        ;; create the postgres DB
        (drop-if-exists-and-create-db! db-name)
        (let [major-v (sql-jdbc.execute/do-with-connection-with-options
                       :postgres
                       spec
                       nil
                       (fn [^java.sql.Connection conn]
                         (.. conn getMetaData getDatabaseMajorVersion)))]
          (if (>= major-v 10)
            ;; create the DB object
            (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname db-name)}]
              (let [sync! #(sync/sync-database! database)]
                ;; create a main partitioned table and two partitions for it
                (exec! spec ["CREATE TABLE part_vals (val bigint NOT NULL) PARTITION BY RANGE (\"val\");"
                             "CREATE TABLE part_vals_0 (val bigint NOT NULL);"
                             "ALTER TABLE ONLY part_vals ATTACH PARTITION part_vals_0 FOR VALUES FROM (0) TO (1000);"
                             "CREATE TABLE part_vals_1 (val bigint NOT NULL);"
                             "ALTER TABLE ONLY part_vals ATTACH PARTITION part_vals_1 FOR VALUES FROM (1000) TO (2000);"
                             "GRANT ALL ON part_vals to PUBLIC;"
                             "GRANT ALL ON part_vals_0 to PUBLIC;"
                             "GRANT ALL ON part_vals_1 to PUBLIC;"])
                ;; now sync the DB
                (sync!)
                ;; all three of these tables should appear in the metadata (including, importantly, the "main" table)
                (is (= {:tables (set (map default-table-result ["part_vals" "part_vals_0" "part_vals_1"]))}
                       (driver/describe-database :postgres database)))))
            (log/warn
             (u/format-color
              'yellow
              "Skipping partitioned-table-test; Postgres major version %d doesn't support PARTITION BY" major-v))))))))

(deftest ^:parallel json-query-test
  (let [boop-identifier (h2x/identifier :field "boop" "bleh -> meh")]
    (testing "Transforming MBQL query with JSON in it to postgres query works"
      (let [boop-field {:nfc-path [:bleh :meh] :database-type "bigint"}]
        (is (= [::postgres/json-query
                [::h2x/identifier :field ["boop" "bleh"]]
                "bigint"
                [:meh]]
               (#'sql.qp/json-query :postgres boop-identifier boop-field)))
        (is (= ["(boop.bleh#>> array[?]::text[])::bigint" "meh"]
               (sql/format-expr (#'sql.qp/json-query :postgres boop-identifier boop-field))))))
    (testing "What if types are weird and we have lists"
      (let [weird-field {:nfc-path [:bleh "meh" :foobar 1234] :database-type "bigint"}]
        (is (= ["(boop.bleh#>> array[?, ?, 1234]::text[])::bigint" "meh" "foobar"]
               (sql/format-expr (#'sql.qp/json-query :postgres boop-identifier weird-field))))))
    (testing "Give us a boolean cast when the field is boolean"
      (let [boolean-boop-field {:database-type "boolean" :nfc-path [:bleh "boop" :foobar 1234]}]
        (is (= ["(boop.bleh#>> array[?, ?, 1234]::text[])::boolean" "boop" "foobar"]
               (sql/format-expr (#'sql.qp/json-query :postgres boop-identifier boolean-boop-field))))))
    (testing "Give us a bigint cast when the field is bigint (#22732)"
      (let [boolean-boop-field {:database-type "bigint" :nfc-path [:bleh "boop" :foobar 1234]}]
        (is (= ["(boop.bleh#>> array[?, ?, 1234]::text[])::bigint" "boop" "foobar"]
               (sql/format-expr (#'sql.qp/json-query :postgres boop-identifier boolean-boop-field))))))))

(deftest ^:parallel json-field-test
  (mt/test-driver :postgres
    (testing "Deal with complicated identifier (#22967)"
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        {:database (assoc meta/database :engine :postgres, :id 1)
                                         :tables   [(merge (meta/table-metadata :venues)
                                                           {:id     1
                                                            :db-id  1
                                                            :name   "complicated_identifiers"
                                                            :schema nil})]
                                         :fields   [(merge (meta/field-metadata :venues :id)
                                                           {:id            1
                                                            :table-id      1
                                                            :nfc-path      ["jsons" "values" "qty"]
                                                            :database-type "integer"})]})
        (let [field-clause [:field 1 {:binning
                                      {:strategy  :num-bins
                                       :num-bins  100
                                       :min-value 0.75
                                       :max-value 54.0
                                       :bin-width 0.75}}]]
          (is (= ["((FLOOR((((complicated_identifiers.jsons#>> array[?, ?]::text[])::integer - 0.75) / 0.75)) * 0.75) + 0.75)"
                  "values" "qty"]
                 (sql/format-expr (sql.qp/->honeysql :postgres field-clause) {:nested true}))))))))

(def ^:private json-alias-mock-metadata-provider
  (lib.tu/mock-metadata-provider
   {:database (assoc meta/database :engine :postgres, :id 1)
    :tables   [(merge (meta/table-metadata :venues)
                      {:id     1
                       :db-id  1
                       :name   "json_alias_test"
                       :schema nil})]
    :fields   [(merge (meta/field-metadata :venues :id)
                      {:id            1
                       :table-id      1
                       :name          "json_alias_test"
                       :nfc-path      ["bob"
                                       "injection' OR 1=1--' AND released = 1"
                                       "injection' OR 1=1--' AND released = 1"]
                       :database-type "VARCHAR"})]}))

(deftest ^:parallel json-alias-test
  (mt/test-driver :postgres
    (testing "json breakouts and order bys have alias coercion"
      (qp.store/with-metadata-provider json-alias-mock-metadata-provider
        (let [field-bucketed [:field 1
                              {:temporal-unit                                              :month
                               :metabase.query-processor.util.add-alias-info/source-table  1
                               :metabase.query-processor.util.add-alias-info/source-alias  "dontwannaseethis"
                               :metabase.query-processor.util.add-alias-info/desired-alias "dontwannaseethis"
                               :metabase.query-processor.util.add-alias-info/position      1}]
              compile-res    (qp.compile/compile
                              {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :aggregation  [[:count]]
                                          :breakout     [field-bucketed]
                                          :order-by     [[:asc field-bucketed]]}})]
          (is (= ["SELECT"
                  "  DATE_TRUNC("
                  "    'month',"
                  "    CAST("
                  "      (\"json_alias_test\".\"bob\" #>> array [ ?, ? ] :: text [ ]) :: VARCHAR AS timestamp"
                  "    )"
                  "  ) AS \"json_alias_test\","
                  "  COUNT(*) AS \"count\""
                  "FROM"
                  "  \"json_alias_test\""
                  "GROUP BY"
                  "  \"json_alias_test\""
                  "ORDER BY"
                  "  \"json_alias_test\" ASC"]
                 (str/split-lines (driver/prettify-native-form :postgres (:query compile-res)))))
          (is (= ["injection' OR 1=1--' AND released = 1"
                  "injection' OR 1=1--' AND released = 1"]
                 (:params compile-res))))))))

(deftest ^:parallel json-alias-test-2
  (mt/test-driver :postgres
    (testing "json breakouts and order bys have alias coercion"
      (qp.store/with-metadata-provider json-alias-mock-metadata-provider
        (let [field-ordinary [:field 1 nil]
              only-order     (qp.compile/compile
                              {:database 1
                               :type     :query
                               :query    {:source-table 1
                                          :order-by     [[:asc field-ordinary]]}})]
          (is (= ["SELECT"
                  "  (\"json_alias_test\".\"bob\" #>> array [ ?, ? ] :: text [ ]) :: VARCHAR AS \"json_alias_test\""
                  "FROM"
                  "  \"json_alias_test\""
                  "ORDER BY"
                  "  \"json_alias_test\" ASC"
                  "LIMIT"
                  "  1048575"]
                 (str/split-lines (driver/prettify-native-form :postgres (:query only-order))))))))))

(def ^:private json-alias-in-model-mock-metadata-provider
  (providers.mock/mock-metadata-provider
    json-alias-mock-metadata-provider
    {:cards [{:name          "Model with JSON"
              :id            123
              :database-id   (meta/id)
              :dataset-query {:database (meta/id)
                              :type     :query
                              :query    {:source-table 1
                                         :aggregation  [[:count]]
                                         :breakout     [[:field 1 nil]]}}}]}))

(deftest ^:parallel json-breakout-in-model-test
  (mt/test-driver :postgres
    (testing "JSON columns in inner queries are referenced properly in outer queries #34930"
      (qp.store/with-metadata-provider json-alias-in-model-mock-metadata-provider
        (let [nested (qp.compile/compile
                       {:database 1
                        :type     :query
                        :query    {:source-table "card__123"}})]
          (is (= ["SELECT"
                  "  \"json_alias_test\" AS \"json_alias_test\","
                  "  \"source\".\"count\" AS \"count\""
                  "FROM"
                  "  ("
                  "    SELECT"
                  "      (\"json_alias_test\".\"bob\" #>> array [ ?, ? ] :: text [ ]) :: VARCHAR AS \"json_alias_test\","
                  "      COUNT(*) AS \"count\""
                  "    FROM"
                  "      \"json_alias_test\""
                  "    GROUP BY"
                  "      \"json_alias_test\""
                  "    ORDER BY"
                  "      \"json_alias_test\" ASC"
                  "  ) AS \"source\""
                  "LIMIT"
                  "  1048575"]
                 (str/split-lines (driver/prettify-native-form :postgres (:query nested))))))))))

(deftest describe-nested-field-columns-identifier-test
  (mt/test-driver :postgres
    (testing "sync goes and runs with identifier if there is a schema other than default public one"
      (drop-if-exists-and-create-db! "describe-json-with-schema-test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name  "describe-json-with-schema-test"
                                                                 :json-unfolding true})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (jdbc/execute! spec [(str "CREATE SCHEMA bobdobbs;"
                                  "CREATE TABLE bobdobbs.describe_json_table (trivial_json JSONB NOT NULL);"
                                  "INSERT INTO bobdobbs.describe_json_table (trivial_json) VALUES ('{\"a\": 1}');")])
        (t2.with-temp/with-temp [:model/Database database {:engine :postgres, :details details}]
          (mt/with-db database
            (sync-tables/sync-tables-and-database! database)
            (is (= #{{:name              "trivial_json → a",
                      :database-type     "bigint",
                      :base-type         :type/Integer,
                      :database-position 0,
                      :json-unfolding    false,
                      :visibility-type   :normal,
                      :nfc-path          [:trivial_json "a"]}}
                   (sql-jdbc.sync/describe-nested-field-columns
                    :postgres
                    database
                    {:schema "bobdobbs" :name "describe_json_table" :id (mt/id "describe_json_table")})))))))))

(deftest describe-funky-name-table-nested-field-columns-test
  (mt/test-driver :postgres
    (testing "sync goes and still works with funky schema and table names, including caps and special chars (#23026, #23027)"
      (drop-if-exists-and-create-db! "describe-json-funky-names-test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name  "describe-json-funky-names-test"
                                                                 :json-unfolding true})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (jdbc/execute! spec [(str "CREATE SCHEMA \"AAAH_#\";"
                                  "CREATE TABLE \"AAAH_#\".\"dESCribe_json_table_%\" (trivial_json JSONB NOT NULL);"
                                  "INSERT INTO \"AAAH_#\".\"dESCribe_json_table_%\" (trivial_json) VALUES ('{\"a\": 1}');")])
        (t2.with-temp/with-temp [:model/Database database {:engine :postgres, :details details}]
          (mt/with-db database
            (sync-tables/sync-tables-and-database! database)
            (is (= #{{:name              "trivial_json → a",
                      :database-type     "bigint",
                      :base-type         :type/Integer,
                      :database-position 0,
                      :json-unfolding    false,
                      :visibility-type   :normal,
                      :nfc-path          [:trivial_json "a"]}}
                   (sql-jdbc.sync/describe-nested-field-columns
                    :postgres
                    database
                    {:schema "AAAH_#" :name "dESCribe_json_table_%" :id (mt/id "dESCribe_json_table_%")})))))))))

(mt/defdataset with-uuid
  [["users"
    [{:field-name "user_id", :base-type :type/UUID}]
    [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
     [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
     [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
     [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
     [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]]])

(deftest uuid-columns-test
  (mt/test-driver :postgres
    (mt/dataset with-uuid
      (testing "Check that we can load a Postgres Database with a :type/UUID"
        (is (= [{:name "id", :base_type :type/Integer}
                {:name "user_id", :base_type :type/UUID}]
               (map #(select-keys % [:name :base_type])
                    (mt/cols (mt/run-mbql-query users))))))
      (testing "Check that we can filter by a UUID Field"
        (is (= [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
               (mt/rows (mt/run-mbql-query users
                          {:filter [:= $user_id "4652b2e7-d940-4d55-a971-7e484566663e"]})))))
      (testing "check that a nil value for a UUID field doesn't barf (#2152)"
        (is (= []
               (mt/rows (mt/run-mbql-query users
                          {:filter [:= $user_id nil]})))))
      (testing "check that is-empty doesn't barf (#22667)"
        (is (= []
               (mt/rows (mt/run-mbql-query users
                          {:filter [:is-empty $user_id]})))))
      (testing "check that not-empty doesn't barf (#22667)"
        (is (= (map-indexed (fn [i [uuid]] [(inc i) uuid])
                            (-> with-uuid :table-definitions first :rows))
               (mt/rows (mt/run-mbql-query users
                          {:filter [:not-empty $user_id]})))))
      (testing "Check that we can filter by a UUID for SQL Field filters (#7955)"
        (is (= [[1 #uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]]
               (mt/rows
                 (qp/process-query
                   (assoc (mt/native-query
                            {:query         "SELECT * FROM users WHERE {{user}}"
                             :template-tags {:user
                                             {:name         "user"
                                              :display_name "User ID"
                                              :type         "dimension"
                                              :widget-type  "number"
                                              :dimension    [:field (mt/id :users :user_id) nil]}}})
                       :parameters
                       [{:type   "text"
                         :target ["dimension" ["template-tag" "user"]]
                         :value  "4f01dcfd-13f7-430c-8e6f-e505c0851027"}]))))))
      (testing "Check that we can filter by multiple UUIDs for SQL Field filters"
        (is (= [[1 #uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
                [3 #uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]]
               (mt/rows
                 (qp/process-query
                   (assoc (mt/native-query
                            {:query         "SELECT * FROM users WHERE {{user}}"
                             :template-tags {:user
                                             {:name         "user"
                                              :display_name "User ID"
                                              :type         "dimension"
                                              :widget-type  :number
                                              :dimension    [:field (mt/id :users :user_id) nil]}}})
                       :parameters
                       [{:type   "text"
                         :target ["dimension" ["template-tag" "user"]]
                         :value  ["4f01dcfd-13f7-430c-8e6f-e505c0851027"
                                  "da1d6ecc-e775-4008-b366-c38e7a2e8433"]}])))))))))

(mt/defdataset ip-addresses
  [["addresses"
    [{:field-name "ip", :base-type {:native "inet"}, :effective-type :type/IPAddress}]
    [[[:raw "'192.168.1.1'::inet"]]
     [[:raw "'10.4.4.15'::inet"]]]]])

(deftest inet-columns-test
  (mt/test-driver :postgres
    (testing (str "Filtering by inet columns should add the appropriate SQL cast, e.g. `cast('192.168.1.1' AS inet)` "
                  "(otherwise this wouldn't work)")
      (mt/dataset ip-addresses
        (is (= [[1]]
               (mt/rows (mt/run-mbql-query addresses
                          {:aggregation [[:count]]
                           :filter      [:= $ip "192.168.1.1"]}))))))))

(defn- do-with-money-test-db [thunk]
  (drop-if-exists-and-create-db! "money_columns_test")
  (let [details (mt/dbdef->connection-details :postgres :db {:database-name "money_columns_test"})]
    (sql-jdbc.execute/do-with-connection-with-options
     :postgres
     (sql-jdbc.conn/connection-details->spec :postgres details)
     {:write? true}
     (fn [^java.sql.Connection conn]
       (doseq [sql+args [["CREATE table bird_prices (bird TEXT, price money);"]
                         ["INSERT INTO bird_prices (bird, price) VALUES (?, ?::numeric::money), (?, ?::numeric::money);"
                          "Lucky Pigeon"   6.0
                          "Katie Parakeet" 23.99]]]
         (next.jdbc/execute! conn sql+args))))
    (t2.with-temp/with-temp [Database db {:engine :postgres, :details (assoc details :dbname "money_columns_test")}]
      (sync/sync-database! db)
      (mt/with-db db
        (thunk)))))

(deftest money-columns-test
  (mt/test-driver :postgres
    (testing "We should support the Postgres MONEY type"
      (testing "It should be possible to return money column results (#3754)"
        (sql-jdbc.execute/do-with-connection-with-options
         :postgres
         (mt/db)
         nil
         (fn [conn]
           (with-open [stmt (sql-jdbc.execute/prepared-statement :postgres conn "SELECT 1000::money AS \"money\";" nil)
                       rs   (sql-jdbc.execute/execute-prepared-statement! :postgres stmt)]
             (let [row-thunk (sql-jdbc.execute/row-thunk :postgres rs (.getMetaData rs))]
               (is (= [1000.00M]
                      (row-thunk))))))))

      (do-with-money-test-db
       (fn []
         (testing "We should be able to select avg() of a money column (#11498)"
           (is (= "SELECT AVG(bird_prices.price::numeric) AS avg FROM bird_prices"
                  (sql.qp-test-util/query->sql
                   (mt/mbql-query bird_prices
                     {:aggregation [[:avg $price]]}))))
           (is (= [[14.995M]]
                  (mt/rows
                   (mt/run-mbql-query bird_prices
                     {:aggregation [[:avg $price]]})))))

         (testing "Should be able to filter on a money column"
           (is (= [["Katie Parakeet" 23.99M]]
                  (mt/rows
                   (mt/run-mbql-query bird_prices
                     {:filter [:= $price 23.99]}))))
           (is (= []
                  (mt/rows
                   (mt/run-mbql-query bird_prices
                     {:filter [:!= $price $price]})))))

         (testing "Should be able to sort by price"
           (is (= [["Katie Parakeet" 23.99M]
                   ["Lucky Pigeon" 6.00M]]
                  (mt/rows
                   (mt/run-mbql-query bird_prices
                     {:order-by [[:desc $price]]}))))))))))

(defn- enums-test-db-details [] (mt/dbdef->connection-details :postgres :db {:database-name "enums_test"}))

(def ^:private enums-db-sql
  (str/join
   \newline
   ["CREATE TYPE \"bird type\" AS ENUM ('toucan', 'pigeon', 'turkey');"
    "CREATE TYPE bird_status AS ENUM ('good bird', 'angry bird', 'delicious bird');"
    "CREATE TABLE birds ("
    "  name varchar PRIMARY KEY NOT NULL,"
    "  status bird_status NOT NULL,"
    "  type \"bird type\" NOT NULL"
    ");"
    "INSERT INTO"
    "  birds (\"name\", status, \"type\")"
    "VALUES"
    "  ('Rasta', 'good bird', 'toucan'),"
    "  ('Lucky', 'angry bird', 'pigeon'),"
    "  ('Theodore', 'delicious bird', 'turkey');"]))

(defn- create-enums-db!
  "Create a Postgres database called `enums_test` that has a couple of enum types and a couple columns of those types.
  One of those types has a space in the name, which is legal when quoted, to make sure we handle such wackiness
  properly."
  []
  (drop-if-exists-and-create-db! "enums_test")
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (enums-test-db-details))]
    (jdbc/execute! spec [enums-db-sql])))

(defn- do-with-enums-db [f]
  (create-enums-db!)
  (t2.with-temp/with-temp [Database database {:engine :postgres, :details (enums-test-db-details)}]
    (sync-metadata/sync-db-metadata! database)
    (f database)
    (driver/notify-database-updated :postgres database)))

(deftest enums-test
  (mt/test-driver :postgres
    (testing "check that values for enum types get wrapped in appropriate CAST() fn calls in `->honeysql`"
      (is (= (h2x/with-database-type-info [:cast "toucan" (h2x/identifier :type-name "bird type")]
                                          "bird type")
             (sql.qp/->honeysql :postgres [:value "toucan" {:database_type "bird type", :base_type :type/PostgresEnum}]))))

    (do-with-enums-db
      (fn [db]
        (testing "check that we can actually fetch the enum types from a DB"
          (is (= #{(keyword "bird type") :bird_status}
                 (#'postgres/enum-types :postgres db))))

        (testing "check that describe-table properly describes the database & base types of the enum fields"
          (is (= {:name   "birds"
                  :fields #{{:name                       "name"
                             :database-type              "varchar"
                             :base-type                  :type/Text
                             :pk?                        true
                             :database-position          0
                             :database-required          true
                             :database-is-auto-increment false
                             :json-unfolding             false}
                            {:name                       "status"
                             :database-type              "bird_status"
                             :base-type                  :type/PostgresEnum
                             :database-position          1
                             :database-required          true
                             :database-is-auto-increment false
                             :json-unfolding             false}
                            {:name                       "type"
                             :database-type              "bird type"
                             :base-type                  :type/PostgresEnum
                             :database-position          2
                             :database-required          true
                             :database-is-auto-increment false
                             :json-unfolding             false}}}
                 (driver/describe-table :postgres db {:name "birds"}))))

        (testing "check that when syncing the DB the enum types get recorded appropriately"
          (let [table-id (t2/select-one-pk Table :db_id (u/the-id db), :name "birds")]
            (is (= #{{:name "name", :database_type "varchar", :base_type :type/Text}
                     {:name "type", :database_type "bird type", :base_type :type/PostgresEnum}
                     {:name "status", :database_type "bird_status", :base_type :type/PostgresEnum}}
                   (set (map (partial into {})
                             (t2/select [Field :name :database_type :base_type] :table_id table-id)))))))

        (testing "End-to-end check: make sure everything works as expected when we run an actual query"
          (let [table-id           (t2/select-one-pk Table :db_id (u/the-id db), :name "birds")
                bird-type-field-id (t2/select-one-pk Field :table_id table-id, :name "type")]
            (is (= {:rows        [["Rasta" "good bird" "toucan"]]
                    :native_form {:query  (str "SELECT \"public\".\"birds\".\"name\" AS \"name\","
                                               " \"public\".\"birds\".\"status\" AS \"status\","
                                               " \"public\".\"birds\".\"type\" AS \"type\" "
                                               "FROM \"public\".\"birds\" "
                                               "WHERE \"public\".\"birds\".\"type\" = CAST('toucan' AS \"bird type\") "
                                               "LIMIT 10")
                                  :params nil}}
                   (-> (qp/process-query
                        {:database (u/the-id db)
                         :type     :query
                         :query    {:source-table table-id
                                    :filter       [:= [:field (u/the-id bird-type-field-id) nil] "toucan"]
                                    :limit        10}})
                       :data
                       (select-keys [:rows :native_form]))))))))))

(deftest enums-actions-test
  (mt/test-driver :postgres
    (testing "actions with enums"
      (do-with-enums-db
       (fn [enums-db]
         (mt/with-db enums-db
           (mt/with-actions-enabled
             (mt/with-actions [model {:type :model
                                      :dataset_query
                                      (mt/mbql-query birds)}
                               {action-id :action-id} {:type :implicit
                                                       :kind "row/create"}]
               (testing "Enum fields are a valid implicit parameter target"
                 (let [columns        (->> model :result_metadata (map :name) set)
                       action-targets (->> (action/select-action :id action-id)
                                           :parameters
                                           (map :id)
                                           set)]
                   (is (= columns action-targets))))
               (testing "Can create new records with an enum value"
                 (is (= {:created-row
                         {:name "new bird", :status "good bird", :type "turkey"}}
                        (mt/user-http-request :crowberto
                                              :post 200
                                              (format "action/%s/execute" action-id)
                                              {:parameters {"name"   "new bird"
                                                            "status" "good bird"
                                                            "type"   "turkey"}}))))))))))))

;; API tests are in [[metabase.api.action-test]]
(deftest actions-maybe-parse-sql-error-test
  (testing "violate not null constraint"
    (is (= {:type :metabase.actions.error/violate-not-null-constraint,
            :message "Ranking must have values."
            :errors {"ranking" "You must provide a value."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/violate-not-null-constraint nil :row/created
            "ERROR: null value in column \"ranking\" violates not-null constraint\n  Detail: Failing row contains (3, admin, null).")))

    (is (= {:type :metabase.actions.error/violate-not-null-constraint,
            :message "Ranking must have values."
            :errors {"ranking" "You must provide a value."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/violate-not-null-constraint nil :row/created
            "ERROR: null value in column \"ranking\" of relation \"group\" violates not-null constraint\n  Detail: Failing row contains (57, admin, null)."))))

  (testing "violate unique constraint"
    (with-redefs [postgres.actions/constraint->column-names (constantly ["ranking"])]
      (is (= {:type :metabase.actions.error/violate-unique-constraint,
              :message "Ranking already exists.",
              :errors {"ranking" "This Ranking value already exists."}}
             (sql-jdbc.actions/maybe-parse-sql-error
              :postgres actions.error/violate-unique-constraint nil nil
              "Batch entry 0 UPDATE \"public\".\"group\" SET \"ranking\" = CAST(2 AS INTEGER) WHERE \"public\".\"group\".\"id\" = 1 was aborted: ERROR: duplicate key value violates unique constraint \"group_ranking_key\"\n  Detail: Key (ranking)=(2) already exists.  Call getNextException to see other errors in the batch.")))))

  (testing "incorrect type"
    (is (= {:type :metabase.actions.error/incorrect-value-type,
            :message "Some of your values aren’t of the correct type for the database.",
            :errors {}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/incorrect-value-type nil nil
            "Batch entry 0 UPDATE \"public\".\"group\" SET \"ranking\" = CAST('S' AS INTEGER) WHERE \"public\".\"group\".\"id\" = 1 was aborted: ERROR: invalid input syntax for type integer: \"S\"  Call getNextException to see other errors in the batch."))))

  (testing "violate fk constraints"
    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Unable to create a new record.",
            :errors {"group-id" "This Group-id does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/violate-foreign-key-constraint nil :row/create
            "ERROR: insert or update on table \"user\" violates foreign key constraint \"user_group-id_group_-159406530\"\n  Detail: Key (group-id)=(999) is not present in table \"group\".")))

    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Unable to update the record.",
            :errors {"id" "This Id does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/violate-foreign-key-constraint nil :row/update
            "ERROR: update or delete on table \"group\" violates foreign key constraint \"user_group-id_group_-159406530\" on table \"user\"\n  Detail: Key (id)=(1) is still referenced from table \"user\".")))

    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Other tables rely on this row so it cannot be deleted.",
            :errors {}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :postgres actions.error/violate-foreign-key-constraint nil :row/delete
            "ERROR: update or delete on table \"group\" violates foreign key constraint \"user_group-id_group_-159406530\" on table \"user\"\n  Detail: Key (id)=(1) is still referenced from table \"user\".")))))


;; this contains specical tests case for postgres
;; for generic tests, check [[metabase.driver.sql-jdbc.actions-test/action-error-handling-test]]
(deftest action-error-handling-test
  (mt/test-driver :postgres
    (testing "violate not-null constraints with multiple columns"
      (drop-if-exists-and-create-db! "not-null-constraint-on-multiple-cols")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "not-null-constraint-on-multiple-cols"})]
        (doseq [stmt ["CREATE TABLE mytable (id serial PRIMARY KEY,
                      column1 VARCHAR(50),
                      column2 VARCHAR(50),
                      CONSTRAINT unique_columns UNIQUE (column1, column2)
                      );"
                      "INSERT INTO mytable (id, column1, column2)
                      VALUES  (1, 'A', 'A'), (2, 'B', 'B');"]]
          (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details) [stmt]))
        (t2.with-temp/with-temp [:model/Database database {:engine driver/*driver* :details details}]
          (mt/with-db database
            (sync/sync-database! database)
            (mt/with-actions-enabled
              (testing "when creating"
                (is (= {:errors      {"column1" "This Column1 value already exists."
                                      "column2" "This Column2 value already exists."}
                        :message     "Column1 and Column2 already exist."
                        :status-code 400
                        :type        actions.error/violate-unique-constraint}
                       (sql-jdbc.actions-test/perform-action-ex-data
                        :row/create (mt/$ids {:create-row {:id      3
                                                           :column1 "A"
                                                           :column2 "A"}
                                              :database   (:id database)
                                              :query      {:source-table $$mytable}
                                              :type       :query})))))
              (testing "when updating"
                (is (= {:errors      {"column1" "This Column1 value already exists."
                                      "column2" "This Column2 value already exists."}
                        :message     "Column1 and Column2 already exist."
                        :status-code 400
                        :type        actions.error/violate-unique-constraint}
                       (sql-jdbc.actions-test/perform-action-ex-data
                        :row/update (mt/$ids {:update-row {:column1 "A"
                                                           :column2 "A"}
                                              :database   (:id database)
                                              :query      {:source-table $$mytable
                                                           :filter       [:= $mytable.id 2]}
                                              :type       :query}))))))))))))

;;; ------------------------------------------------ Timezone-related ------------------------------------------------

(deftest timezone-test
  (mt/test-driver :postgres
    (letfn [(get-timezone-with-report-timezone [report-timezone]
              (mt/with-temporary-setting-values [report-timezone report-timezone]
                (ffirst
                 (mt/rows
                  (qp/process-query {:database (mt/id)
                                     :type     :native
                                     :native   {:query "SELECT current_setting('TIMEZONE') AS timezone;"}})))))]
      (testing "check that if we set report-timezone to US/Pacific that the session timezone is in fact US/Pacific"
        (is  (= "US/Pacific"
                (get-timezone-with-report-timezone "US/Pacific"))))
      (testing "check that we can set it to something else: America/Chicago"
        (is (= "America/Chicago"
               (get-timezone-with-report-timezone "America/Chicago"))))
      (testing (str "ok, check that if we try to put in a fake timezone that the query still reëxecutes without a "
                    "custom timezone. This should give us the same result as if we didn't try to set a timezone at all")
        (is (= (get-timezone-with-report-timezone nil)
               (get-timezone-with-report-timezone "Crunk Burger")))))))

(deftest fingerprint-time-fields-test
  (mt/test-driver :postgres
    (testing "Make sure we're able to fingerprint TIME fields (#5911)"
      (drop-if-exists-and-create-db! "time_field_test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "time_field_test"})]
        (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
                       [(str "CREATE TABLE toucan_sleep_schedule ("
                             "  start_time TIME WITHOUT TIME ZONE NOT NULL, "
                             "  end_time TIME WITHOUT TIME ZONE NOT NULL, "
                             "  reason VARCHAR(256) NOT NULL"
                             ");"
                             "INSERT INTO toucan_sleep_schedule (start_time, end_time, reason) "
                             "  VALUES ('22:00'::time, '9:00'::time, 'Beauty Sleep');")])
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details (assoc details :dbname "time_field_test")}]
          (sync/sync-database! database)
          (is (= {"start_time" {:global {:distinct-count 1
                                         :nil%           0.0}
                                :type   {:type/DateTime {:earliest "22:00:00"
                                                         :latest   "22:00:00"}}}
                  "end_time"   {:global {:distinct-count 1
                                         :nil%           0.0}
                                :type   {:type/DateTime {:earliest "09:00:00"
                                                         :latest   "09:00:00"}}}
                  "reason"     {:global {:distinct-count 1
                                         :nil%           0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 12.0}}}}
                 (t2/select-fn->fn :name :fingerprint Field
                                   :table_id (t2/select-one-pk Table :db_id (u/the-id database))))))))))

;;; ----------------------------------------------------- Other ------------------------------------------------------

(deftest ^:parallel exception-test
  (mt/test-driver :postgres
    (testing (str "If the DB throws an exception, is it properly returned by the query processor? Is it status "
                  ":failed? (#9942)")
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Error executing query"
           (qp/process-query
            {:database (mt/id)
             :type     :native
             :native   {:query "SELECT adsasdasd;"}})))
      (try
        (qp/process-query
         {:database (mt/id)
          :type     :native
          :native   {:query "SELECT adsasdasd;"}})
        (catch Throwable e
          (is (= "ERROR: column \"adsasdasd\" does not exist\n  Position: 20"
                 (try
                   (-> e ex-cause ex-message)
                   (catch Throwable e
                     e)))))))))

(deftest ^:parallel pgobject-test
  (mt/test-driver :postgres
    (testing "Make sure PGobjects are decoded correctly"
      (let [results (qp/process-query (mt/native-query {:query "SELECT pg_sleep(0.1) AS sleep;"}))]
        (testing "rows"
          (is (= [[""]]
                 (mt/rows results))))
        (testing "cols"
          (is (= [{:display_name "sleep"
                   :base_type    :type/Text
                   :effective_type :type/Text
                   :source       :native
                   :field_ref    [:field "sleep" {:base-type :type/Text}]
                   :name         "sleep"}]
                 (mt/cols results))))))))

(deftest ^:parallel id-field-parameter-test
  (mt/test-driver :postgres
    (testing "We should be able to filter a PK column with a String value -- should get parsed automatically (#13263)"
      (is (= [[2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
             (mt/rows
               (mt/run-mbql-query venues
                 {:filter [:= $id "2"]})))))))

(deftest dont-sync-tables-with-no-select-permissions-test
  (testing "Make sure we only sync databases for which the current user has SELECT permissions"
    (mt/test-driver :postgres
      (drop-if-exists-and-create-db! "no-select-test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "no-select-test"})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (doseq [statement ["CREATE TABLE PUBLIC.table_with_perms (x INTEGER NOT NULL);"
                           "CREATE TABLE PUBLIC.table_with_no_perms (y INTEGER NOT NULL);"
                           "DROP USER IF EXISTS no_select_test_user;"
                           "CREATE USER no_select_test_user WITH PASSWORD '123456';"
                           "GRANT SELECT ON TABLE \"no-select-test\".PUBLIC.table_with_perms TO no_select_test_user;"]]
          (is (= [0]
                 (jdbc/execute! spec [statement])))))
      (let [test-user-details (assoc (mt/dbdef->connection-details :postgres :db {:database-name "no-select-test"})
                                     :user "no_select_test_user"
                                     :password "123456")]
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details test-user-details}]
          ;; make sure that sync still succeeds even tho some tables are not SELECTable.
          (binding [sync-util/*log-exceptions-and-continue?* false]
            (is (some? (sync/sync-database! database {:scan :schema}))))
          (is (= #{"table_with_perms"}
                 (t2/select-fn-set :name Table :db_id (:id database)))))))))

(deftest json-operator-?-works
  (testing "Make sure the Postgres ? operators (for JSON types) work in native queries"
    (mt/test-driver :postgres
      (drop-if-exists-and-create-db! "json-test")
      (let [details (mt/dbdef->connection-details :postgres :db {:database-name "json-test"})
            spec    (sql-jdbc.conn/connection-details->spec :postgres details)]
        (doseq [statement ["DROP TABLE IF EXISTS PUBLIC.json_table;"
                           "CREATE TABLE PUBLIC.json_table (json_val JSON NOT NULL);"
                           "INSERT INTO PUBLIC.json_table (json_val) VALUES ('{\"a\": 1, \"b\": 2}');"]]
          (jdbc/execute! spec [statement])))
      (let [json-db-details (mt/dbdef->connection-details :postgres :db {:database-name "json-test"})
            query           (str "SELECT json_val::jsonb ? 'a',"
                                 "json_val::jsonb ?| array['c', 'd'],"
                                 "json_val::jsonb ?& array['a', 'b']"
                                 "FROM \"json_table\";")]
        (t2.with-temp/with-temp [Database database {:engine :postgres, :details json-db-details}]
          (mt/with-db database (sync/sync-database! database)
            (is (= [[true false true]]
                   (-> {:query query}
                       (mt/native-query)
                       (qp/process-query)
                       (mt/rows))))))))))

(deftest sync-json-with-composite-pks-test
  (testing "Make sure sync a table with json columns that have composite pks works"
    (mt/test-driver :postgres
      (drop-if-exists-and-create-db! "composite-pks-test")
      (with-redefs [metadata-queries/nested-field-sample-limit 4]
        (let [details (mt/dbdef->connection-details driver/*driver* :db {:database-name "composite-pks-test"})
              spec    (sql-jdbc.conn/connection-details->spec driver/*driver* details)]
          (doseq [statement (concat ["CREATE TABLE PUBLIC.json_table(first_id INTEGER, second_id INTEGER, json_val JSON, PRIMARY KEY(first_id, second_id));"]
                                    (for [[first-id second-id json] [[1 1 "{\"int_turn_string\":1}"]
                                                                     [2 2 "{\"int_turn_string\":2}"]
                                                                     [3 3 "{\"int_turn_string\":3}"]
                                                                     [4 4 "{\"int_turn_string\":4}"]
                                                                     [4 5 "{\"int_turn_string\":\"x\"}"]
                                                                     [4 6 "{\"int_turn_string\":5}"]]]
                                      (format "INSERT INTO PUBLIC.json_table (first_id, second_id, json_val) VALUES (%d, %d, '%s');" first-id second-id json)))]
            (jdbc/execute! spec [statement]))
          (t2.with-temp/with-temp [:model/Database database {:engine driver/*driver* :details details}]
            (mt/with-db database
              (sync-tables/sync-tables-and-database! database)
              (is (= #{{:name              "json_val → int_turn_string",
                        :database-type     "text"
                        :base-type         :type/Text
                        :database-position 0
                        :json-unfolding    false
                        :visibility-type   :normal
                        :nfc-path          [:json_val "int_turn_string"]}}
                     (sql-jdbc.sync/describe-nested-field-columns
                      :postgres
                      database
                      (t2/select-one Table :db_id (mt/id) :name "json_table")))))))))))

(defn- pretty-sql [s]
  (-> s
      (str/replace #"\"" "")
      (str/replace #"public\." "")))

(deftest ^:parallel do-not-cast-to-date-if-column-is-already-a-date-test
  (testing "Don't wrap Field in date() if it's already a DATE (#11502)"
    (mt/test-driver :postgres
      (mt/dataset attempted-murders
        (let [query (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :breakout    [!day.date]})]
          (is (= (str "SELECT attempts.date AS date, COUNT(*) AS count "
                      "FROM attempts "
                      "GROUP BY attempts.date "
                      "ORDER BY attempts.date ASC")
                 (some-> (qp.compile/compile query) :query pretty-sql))))))))

(deftest ^:parallel do-not-cast-to-timestamp-if-column-if-timestamp-tz-or-date-test
  (testing "Don't cast a DATE or TIMESTAMPTZ to TIMESTAMP, it's not necessary (#19816)"
    (mt/test-driver :postgres
      (mt/dataset test-data
        (let [query (mt/mbql-query people
                      {:fields [!month.birth_date
                                !month.created_at
                                !month.id]
                       :limit  1})]
          (is (= {:query ["SELECT"
                          "  DATE_TRUNC('month', \"public\".\"people\".\"birth_date\") AS \"birth_date\","
                          "  DATE_TRUNC('month', \"public\".\"people\".\"created_at\") AS \"created_at\","
                          "  DATE_TRUNC('month', CAST(\"public\".\"people\".\"id\" AS timestamp)) AS \"id\""
                          "FROM"
                          "  \"public\".\"people\""
                          "LIMIT"
                          "  1"]
                  :params nil}
                 (-> (qp.compile/compile query)
                     (update :query #(str/split-lines (driver/prettify-native-form :postgres %)))))))))))

(deftest postgres-ssl-connectivity-test
  (mt/test-driver :postgres
    (if (System/getenv "MB_POSTGRES_SSL_TEST_SSL")
      (testing "We should be able to connect to a Postgres instance, providing our own root CA via a secret property"
        (mt/with-env-keys-renamed-by #(str/replace-first % "mb-postgres-ssl-test" "mb-postgres-test")
          (id-field-parameter-test)))
      (log/warn (u/format-color 'yellow
                                "Skipping %s because %s env var is not set"
                                "postgres-ssl-connectivity-test"
                                "MB_POSTGRES_SSL_TEST_SSL")))))

(def ^:private dummy-pem-contents
  (str "-----BEGIN CERTIFICATE-----\n"
       "-----END CERTIFICATE-----"))

(deftest handle-nil-client-ssl-properties-test
  (mt/test-driver :postgres
    (testing "Setting only one of the client SSL params doesn't result in an NPE error (#19984)"
      (mt/with-temp-file [dummy-root-cert   "dummy-root-cert.pem"
                          dummy-client-cert "dummy-client-cert.pem"]
        (spit dummy-root-cert dummy-pem-contents)
        (spit dummy-client-cert dummy-pem-contents)
        (let [db-details {:host "dummy-hostname"
                          :dbname "test-db"
                          :port 5432
                          :user "dummy-login"
                          :password "dummy-password"
                          :ssl true
                          :ssl-use-client-auth true
                          :ssl-mode "verify-full"
                          :ssl-root-cert-options "local"
                          :ssl-root-cert-path dummy-root-cert
                          :ssl-client-cert-options "local"
                          :ssl-client-cert-value dummy-client-cert}]
          ;; this will fail/throw an NPE if the fix for #19984 is not put in place (since the server code will
          ;; attempt to "store" a non-existent :ssl-client-key-value to a temp file)
          (is (map? (#'postgres/ssl-params db-details))))))))

(deftest can-set-ssl-key-via-gui
  (testing "ssl key can be set via the gui (#20319)"
    (with-redefs [secret/value->file!
                  (fn [{:keys [connection-property-name value] :as _secret} & [_driver? _ext?]]
                    (str "file:" connection-property-name "=" value))]
      (is (= "file:ssl-key=/clientkey.pkcs12"
             (:sslkey
              (#'postgres/ssl-params
               {:ssl true
                :ssl-client-cert-options "local"
                :ssl-client-cert-path "/client.pem"
                :ssl-key-options "local"
                :ssl-key-password-value "sslclientkeypw!"
                :ssl-key-path "/clientkey.pkcs12" ;; <-- this is what is set via ui.
                :ssl-mode "verify-ca"
                :ssl-root-cert-options "local"
                :ssl-root-cert-path "/root.pem"
                :ssl-use-client-auth true
                :tunnel-enabled false
                :advanced-options false
                :dbname "metabase"
                :engine :postgres
                :host "localhost"
                :user "bcm"
                :password "abcdef123"
                :port 5432})))))))

(deftest pkcs-12-extension-test
  (testing "Uploaded PKCS-12 SSL keys are stored in a file with the .p12 extension (#20319)"
    (letfn [(absolute-path [^java.io.File file]
              (some-> file .getAbsolutePath))]
      (is (-> (#'postgres/ssl-params
               {:ssl                 true
                :ssl-key-options     "uploaded"
                :ssl-key-value       "data:application/x-pkcs12;base64,SGVsbG8="
                :ssl-mode            "require"
                :ssl-use-client-auth true
                :tunnel-enabled      false
                :advanced-options    false
                :dbname              "metabase"
                :engine              :postgres
                :host                "localhost"
                :user                "bcm"
                :password            "abcdef123"
                :port                5432})
              :sslkey
              absolute-path
              (str/ends-with? ".p12"))))))

(deftest syncable-schemas-test
  (mt/test-driver :postgres
    (testing "`syncable-schemas` should return schemas that should be synced"
      (mt/with-empty-db
        (is (= #{"public"}
               (driver/syncable-schemas driver/*driver* (mt/db))))))
    (testing "metabase_cache schemas should be excluded"
      (mt/dataset test-data
        (mt/with-persistence-enabled [persist-models!]
          (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
            (mt/with-temp [:model/Card _ {:name "model"
                                          :type :model
                                          :dataset_query (mt/mbql-query categories)
                                          :database_id (mt/id)}]
              (persist-models!)
              (is (some (partial re-matches #"metabase_cache(.*)")
                        (map :schema_name (jdbc/query conn-spec "SELECT schema_name from INFORMATION_SCHEMA.SCHEMATA;"))))
              (is (nil? (some (partial re-matches #"metabase_cache(.*)")
                              (driver/syncable-schemas driver/*driver* (mt/db))))))))))))
(deftest table-privileges-test
  (mt/test-driver :postgres
    (testing "`table-privileges` should return the correct data for current_user and role privileges"
      (mt/with-empty-db
        (let [conn-spec      (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              get-privileges (fn []
                               (sql-jdbc.conn/with-connection-spec-for-testing-connection
                                 [spec [:postgres (assoc (:details (mt/db)) :user "privilege_rows_test_example_role")]]
                                 (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [_] spec)]
                                   (set (sql-jdbc.sync/current-user-table-privileges driver/*driver* spec)))))]
          (try
           (jdbc/execute! conn-spec (str
                                     "DROP SCHEMA IF EXISTS \"dotted.schema\" CASCADE;"
                                     "CREATE SCHEMA \"dotted.schema\";"
                                     "CREATE TABLE \"dotted.schema\".bar (id INTEGER);"
                                     "CREATE TABLE \"dotted.schema\".\"dotted.table\" (id INTEGER);"
                                     "CREATE VIEW \"dotted.schema\".\"dotted.view\" AS SELECT 'hello world';"
                                     "CREATE MATERIALIZED VIEW \"dotted.schema\".\"dotted.materialized_view\" AS SELECT 'hello world';"
                                     "DROP ROLE IF EXISTS privilege_rows_test_example_role;"
                                     "CREATE ROLE privilege_rows_test_example_role WITH LOGIN;"
                                     "GRANT SELECT ON \"dotted.schema\".\"dotted.table\" TO privilege_rows_test_example_role;"
                                     "GRANT UPDATE ON \"dotted.schema\".\"dotted.table\" TO privilege_rows_test_example_role;"
                                     "GRANT SELECT ON \"dotted.schema\".\"dotted.view\" TO privilege_rows_test_example_role;"
                                     "GRANT SELECT ON \"dotted.schema\".\"dotted.materialized_view\" TO privilege_rows_test_example_role;"))
           (testing "check that without USAGE privileges on the schema, nothing is returned"
             (is (= #{}
                    (get-privileges))))
           (testing "with USAGE privileges, SELECT and UPDATE privileges are returned"
             (jdbc/execute! conn-spec "GRANT USAGE ON SCHEMA \"dotted.schema\" TO privilege_rows_test_example_role;")
             (is (= #{{:role   nil
                       :schema "dotted.schema"
                       :table  "dotted.materialized_view"
                       :update false
                       :select true
                       :insert false
                       :delete false}
                      {:role   nil
                       :schema "dotted.schema"
                       :table  "dotted.view"
                       :update false
                       :select true
                       :insert false
                       :delete false}
                      {:role   nil
                       :schema "dotted.schema"
                       :table  "dotted.table"
                       :select true
                       :update true
                       :insert false
                       :delete false}}
                    (get-privileges))))
           (finally
            (doseq [stmt ["REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"dotted.schema\" FROM privilege_rows_test_example_role;"
                          "REVOKE ALL PRIVILEGES ON SCHEMA \"dotted.schema\" FROM privilege_rows_test_example_role;"
                          "DROP ROLE privilege_rows_test_example_role;"]]
              (jdbc/execute! conn-spec stmt)))))))))

(deftest ^:parallel set-role-statement-test
  (testing "set-role-statement should return a SET ROLE command, with the role quoted if it contains special characters"
    ;; No special characters
    (is (= "SET ROLE MY_ROLE;"        (driver.sql/set-role-statement :postgres "MY_ROLE")))
    (is (= "SET ROLE ROLE123;"        (driver.sql/set-role-statement :postgres "ROLE123")))
    (is (= "SET ROLE lowercase_role;" (driver.sql/set-role-statement :postgres "lowercase_role")))

    ;; None (special role in Postgres to revert back to login role; should not be quoted)
    (is (= "SET ROLE none;"      (driver.sql/set-role-statement :postgres "none")))
    (is (= "SET ROLE NONE;"      (driver.sql/set-role-statement :postgres "NONE")))

    ;; Special characters
    (is (= "SET ROLE \"Role.123\";"   (driver.sql/set-role-statement :postgres "Role.123")))
    (is (= "SET ROLE \"$role\";"      (driver.sql/set-role-statement :postgres "$role")))))
