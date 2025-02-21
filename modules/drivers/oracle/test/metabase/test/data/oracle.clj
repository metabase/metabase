(ns ^:mb/driver-tests metabase.test.data.oracle
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.oracle]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]
   [metabase.test.data.sql-jdbc.load-data :as load-data]
   [metabase.test.data.sql.ddl :as ddl]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(comment metabase.driver.oracle/keep-me)

(sql-jdbc.tx/add-test-extensions! :oracle)

;; Similar to SQL Server, Oracle on AWS doesn't let you create different databases; we'll qualify the names of tables to
;; include their DB name
;;
;; e.g.
;; H2 Tests                   | Oracle Tests
;; ---------------------------+------------------------------------------------
;; PUBLIC.VENUES.ID           | mb_test.test_data_venues.id
;; PUBLIC.CHECKINS.USER_ID    | mb_test.test_data_checkins.user_id
;; PUBLIC.INCIDENTS.TIMESTAMP | mb_test.sad_toucan_incidents.timestamp
(defonce           session-schema   "mb_test")
(defonce ^:private session-password "password")
;; Session password is only used when creating session user, not anywhere else

(defn- truststore-details []
  (when (some-> (tx/db-test-env-var :oracle :ssl-use-truststore) Boolean/parseBoolean)
    (into {:ssl-use-truststore true}
          (keep (fn [k]
                  (when-let [v (tx/db-test-env-var :oracle k)]
                    [k v])))
          [:ssl-truststore-options :ssl-truststore-path :ssl-truststore-value :ssl-truststore-password-value])))

(defn- keystore-details []
  (when (some-> (tx/db-test-env-var :oracle :ssl-use-keystore) Boolean/parseBoolean)
    (into {:ssl-use-keystore true}
          (keep (fn [k]
                  (when-let [v (tx/db-test-env-var :oracle k)]
                    [k v])))
          [:ssl-keystore-options :ssl-keystore-path :ssl-keystore-value :ssl-keystore-password-value])))

(mu/defn- connection-details :- :metabase.driver.oracle/details
  []
  (let [details* {:host                    (tx/db-test-env-var-or-throw :oracle :host "localhost")
                  :port                    (parse-long (tx/db-test-env-var-or-throw :oracle :port "1521"))
                  :user                    (tx/db-test-env-var :oracle :user)
                  :password                (tx/db-test-env-var :oracle :password)
                  :sid                     (tx/db-test-env-var :oracle :sid)
                  :service-name            (tx/db-test-env-var :oracle :service-name (when-not (tx/db-test-env-var :oracle :sid) "XEPDB1"))
                  :ssl                     (Boolean/parseBoolean (tx/db-test-env-var :oracle :ssl "false"))
                  :schema-filters-type     "inclusion"
                  :schema-filters-patterns session-schema}
        details* (merge details*
                        (truststore-details)
                        (keystore-details))]
    ;; if user or password are not set and we cannot possibly be using SSL auth, set the defaults
    (cond-> details*
      (and (nil? (:user details*)) (not (:ssl-use-keystore details*)))
      (assoc :user "system")

      (and (nil? (:password details*)) (not (:ssl-use-keystore details*)))
      (assoc :password "password"))))

(deftest connection-details-test
  (testing "Make sure connection details handle things like MB_ORACLE_TEST_SSL_USE_TRUSTSTORE=false correctly"
    (with-redefs [env/env (assoc env/env
                                 :mb-oracle-test-user ""
                                 :mb-oracle-test-ssl "FALSE"
                                 :mb-oracle-test-ssl-use-truststore "true"
                                 :mb-oracle-test-ssl-use-keystore "false")]
      (is (=? {:user               "system"
               :ssl                false
               :ssl-use-truststore true}
              (connection-details))))))

(defn- dbspec [& _]
  (let [conn-details (connection-details)]
    (sql-jdbc.conn/connection-details->spec :oracle conn-details)))

(defmethod tx/dbdef->connection-details :oracle [& _]
  (connection-details))

(defmethod tx/sorts-nil-first? :oracle [_ _] false)

(defmethod driver/database-supports? [:oracle :test/time-type]
  [_driver _feature _database]
  false)

(doseq [[base-type sql-type] {:type/BigInteger             "NUMBER(*,0)"
                              :type/Boolean                "NUMBER(1)"
                              :type/Date                   "DATE"
                              :type/Temporal               "TIMESTAMP"
                              :type/DateTime               "TIMESTAMP"
                              :type/DateTimeWithTZ         "TIMESTAMP WITH TIME ZONE"
                              :type/DateTimeWithLocalTZ    "TIMESTAMP WITH LOCAL TIME ZONE"
                              :type/DateTimeWithZoneOffset "TIMESTAMP WITH TIME ZONE"
                              :type/DateTimeWithZoneID     "TIMESTAMP WITH TIME ZONE"
                              :type/Decimal                "DECIMAL"
                              :type/Float                  "BINARY_DOUBLE"
                              :type/Integer                "INTEGER"
                              :type/Text                   "VARCHAR2(4000)"}]
  (defmethod sql.tx/field-base-type->sql-type [:oracle base-type] [_ _] sql-type))

;; If someone tries to run Time column tests with Oracle give them a heads up that Oracle does not support it
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Oracle does not have a TIME data type.")))

(defmethod sql.tx/drop-table-if-exists-sql :oracle
  [_ {:keys [database-name]} {:keys [table-name]}]
  ;; ⅋ replaced with `;` in the actual executed SQL; `;` itself is automatically removed Missing IN or OUT parameter
  (format "BEGIN
             EXECUTE IMMEDIATE 'DROP TABLE \"%s\".\"%s\" CASCADE CONSTRAINTS'⅋
           EXCEPTION
             WHEN OTHERS THEN
               IF SQLCODE != -942 THEN
                 RAISE⅋
               END IF⅋
           END⅋"
          session-schema
          (tx/db-qualified-table-name database-name table-name)))

(defmethod sql.tx/create-db-sql :oracle [& _] nil)

(defmethod sql.tx/drop-db-if-exists-sql :oracle [& _] nil)

(defmethod execute/execute-sql! :oracle [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :oracle [_]
  "INTEGER GENERATED BY DEFAULT AS IDENTITY (START WITH 1 INCREMENT BY 1) NOT NULL")

(defmethod sql.tx/qualified-name-components :oracle [& args]
  (apply tx/single-db-qualified-name-components session-schema args))

(defmethod tx/id-field-type :oracle [_] :type/Decimal)

(defmethod load-data/row-xform :oracle
  [_driver _dbdef tabledef]
  (load-data/maybe-add-ids-xform tabledef))

;; Oracle has weird syntax for inserting multiple rows, it looks like
;;
;; INSERT ALL
;;     INTO table (col1,col2) VALUES (val1,val2)
;;     INTO table (col1,col2) VALUES (val1,val2)
;; SELECT * FROM dual;
;;
;; So this custom HoneySQL type below generates the correct DDL statement

(defn- format-insert-all [_fn [rows]]
  (let [rows-sql-args (mapv sql/format rows)
        sqls          (map first rows-sql-args)
        args          (mapcat rest rows-sql-args)]
    (into [(format
            "INSERT ALL %s SELECT * FROM dual"
            (str/join " " sqls))]
          args)))

(sql/register-fn! ::insert-all #'format-insert-all)

;;; normal Honey SQL `:into` doesn't seem to work with our `identifier` type, so define a custom version here that does.
(defn- format-into [_fn identifier]
  {:pre [(h2x/identifier? identifier)]}
  (let [[sql & args] (sql/format-expr identifier)]
    (into [(str "INTO " sql)] args)))

(sql/register-clause! ::into #'format-into :into)

(defn- row->into [driver table-identifier row-map]
  (let [cols (vec (keys row-map))]
    {::into   table-identifier
     :columns (mapv (fn [col]
                      (h2x/identifier :field col))
                    cols)
     :values  [(mapv (fn [col]
                       (let [v (get row-map col)]
                         (sql.qp/->honeysql driver v)))
                     cols)]}))

(defmethod ddl/insert-rows-honeysql-form :oracle
  [driver table-identifier row-or-rows]
  [::insert-all (mapv (partial row->into driver table-identifier)
                      (u/one-or-many row-or-rows))])

;;; see also [[metabase.driver.oracle-test/insert-rows-ddl-test]]
(deftest ^:parallel insert-all-test
  (let [rows [{:name "Plato Yeshua", :t #t "2014-04-01T08:30", :password 1, :active true}
              {:name "Felipinho Asklepios", :t #t "2014-12-05T15:15", :password 2, :active false}]
        hsql (ddl/insert-rows-honeysql-form :oracle (h2x/identifier :table "my_db" "my_table") rows)]
    (is (= [::insert-all
            [{::into   (h2x/identifier :table "my_db" "my_table")
              :columns [(h2x/identifier :field "name")
                        (h2x/identifier :field "t")
                        (h2x/identifier :field "password")
                        (h2x/identifier :field "active")]
              :values  [["Plato Yeshua" #t "2014-04-01T08:30" [:inline 1] [:inline 1]]]}
             {::into   (h2x/identifier :table "my_db" "my_table")
              :columns [(h2x/identifier :field "name")
                        (h2x/identifier :field "t")
                        (h2x/identifier :field "password")
                        (h2x/identifier :field "active")]
              :values  [["Felipinho Asklepios" #t "2014-12-05T15:15" [:inline 2] [:inline 0]]]}]]
           hsql))
    (is (= [["INSERT"
             "  ALL INTO \"my_db\".\"my_table\" (\"name\", \"t\", \"password\", \"active\")"
             "VALUES"
             "  (?, ?, 1, 1) INTO \"my_db\".\"my_table\" (\"name\", \"t\", \"password\", \"active\")"
             "VALUES"
             "  (?, ?, 2, 0)"
             "SELECT"
             "  *"
             "FROM"
             "  dual"]
            "Plato Yeshua"
            #t "2014-04-01T08:30"
            "Felipinho Asklepios"
            #t "2014-12-05T15:15"]
           (-> (sql/format-expr hsql)
               (update 0 (partial driver/prettify-native-form :oracle))
               (update 0 str/split-lines))))))

;;; Clear out the session schema before and after tests run
;; TL;DR Oracle schema == Oracle user. Create new user for session-schema
(defn- execute! [format-string & args]
  (let [sql (apply format format-string args)]
    (log/info (u/format-color 'blue "[oracle] %s" sql))
    (jdbc/execute! (dbspec) sql))
  (log/info (u/format-color 'blue "[ok]")))

(defn create-user!
  ;; default to using session-password for all users created this session
  ([username]
   (create-user! username session-password))
  ([username password]
   (execute! "CREATE USER \"%s\" IDENTIFIED BY \"%s\" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS"
             username
             password)))

(defn drop-user! [username]
  (u/ignore-exceptions
    (execute! "DROP USER \"%s\" CASCADE" username)))

(defmethod tx/before-run :oracle
  [_]
  (drop-user! session-schema)
  (create-user! session-schema))

(defmethod tx/aggregate-column-info :oracle
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal}))))

(defmethod tx/dataset-already-loaded? :oracle
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [tabledef       (first (:table-definitions dbdef))
        ;; table-name should be something like test_data_venues
        table-name     (tx/db-qualified-table-name (:database-name dbdef) (:table-name tabledef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver (connection-details))
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        nil
                                    #_schema-pattern session-schema
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["TABLE"]))]
         ;; if the ResultSet returns anything we know the table is already loaded.
         (.next rset))))))

(def ^:dynamic *override-describe-database-to-filter-by-db-name?*
  "Whether to override the production implementation for `describe-database` with a special one that only syncs
  the tables qualified by the database name. This is `true` by default during tests to fake database isolation.
  See (metabase#40310)"
  true)

(defonce ^:private ^{:arglists '([driver database])}
  original-describe-database
  (get-method driver/describe-database :oracle))

;; For test databases, only sync the tables that are qualified by the db name
(defmethod driver/describe-database :oracle
  [driver database]
  (if *override-describe-database-to-filter-by-db-name?*
    (let [r                (original-describe-database driver database)
          physical-db-name (data.impl/database-source-dataset-name database)]
      (update r :tables (fn [tables]
                          (into #{}
                                (filter #(tx/qualified-by-db-name? physical-db-name (:name %)))
                                tables))))
    (original-describe-database driver database)))

(deftest ^:parallel describe-database-sanity-check-test
  (testing "Make sure even tho tables from different datasets are all stuffed in one DB we still sync them separately"
    (mt/test-driver :oracle
      (mt/dataset airports
        (is (= #{"airports_airport"
                 "airports_continent"
                 "airports_country"
                 "airports_municipality"
                 "airports_region"}
               (into #{}
                     (map :name)
                     (:tables (driver/describe-database :oracle (mt/db))))))))))

(defmethod tx/drop-view! :oracle
  [driver database view-name {:keys [materialized?]}]
  (let [database-name (get-in database [:settings :database-source-dataset-name])
        qualified-view (sql.tx/qualify-and-quote driver database-name (name view-name))]
    (u/ignore-exceptions
      ;; If exists does not exist in oracle
      (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec database)
                     (sql/format
                      {(if materialized? :drop-materialized-view :drop-view) [[[:raw qualified-view]]]}
                      :dialect (sql.qp/quote-style driver))
                     {:transaction? false}))))
