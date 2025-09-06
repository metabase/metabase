(ns metabase.driver.oceanbase
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.app-db.spec :as app-db.spec]
   [clojure.set :as set]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.empty-string-is-null :as sql.qp.empty-string-is-null]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config.core :as config])
  (:import [java.sql Connection DatabaseMetaData ResultSet]))

(set! *warn-on-reflection* true)

(driver/register! :oceanbase, :parent #{:sql-jdbc
                                        ::sql.qp.empty-string-is-null/empty-string-is-null})

;; Local implementation of spec function to avoid driver-api dependency
(defn- make-subname
  "Make a subname for the given `host`, `port`, and `db` params."
  [host port db]
  (str "//" (when-not (str/blank? host) (str host ":" port)) (if-not (str/blank? db) (str "/" db) "/")))

(defn- oceanbase-spec
  [_ {:keys [host port db]
      :as   opts}]
  ;; Always create spec, use defaults if details are missing
  (merge
   {:classname   "com.oceanbase.jdbc.Driver"
    :subprotocol "oceanbase"
    :subname     (make-subname (or host "localhost") (or port 2881) (or db "test"))}
   (dissoc opts :host :port :db)))

(def supported-features
  {:datetime-diff true
   :expression-literals true
   :now true
   :identifiers-with-spaces true
   :convert-timezone true
   :expressions/date true
   :describe-fields true
   :database-routing false})

(doseq [[feature supported?] supported-features]
  (defmethod driver/database-supports? [:oceanbase feature] [_driver _feature _db] supported?))

(defn- get-oceanbase-mode
  "Get OceanBase compatibility mode from connection or spec.
   Returns 'oracle' or 'mysql'. Defaults to 'oracle' if detection fails."
  [conn-or-spec]
  (try
    ;; Only attempt connection if we have a valid spec with classname
    (if (and conn-or-spec (map? conn-or-spec) (:classname conn-or-spec))
      (let [query "SHOW VARIABLES LIKE 'ob_compatibility_mode'"
            result (jdbc/query conn-or-spec [query] {:as-arrays? false :max-rows 1})]
        (if (seq result)
          (let [value (get-in (first result) [:value])]
            (if (= value "ORACLE") "oracle" "mysql"))
          "oracle"))
      "oracle")
    (catch Exception e
      (log/debug "Failed to detect OceanBase mode, defaulting to oracle. Error:" (.getMessage e))
      "oracle")))

(defn- get-mode [spec]
  (get-oceanbase-mode spec))

(defn- detect-mode-from-connection [conn]
  (get-oceanbase-mode {:connection conn}))

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"BIGINT" :type/BigInteger]
    [#"BINARY" :type/*]
    [#"BIT" :type/Boolean]
    [#"BLOB" :type/*]
    [#"CHAR" :type/Text]
    [#"DATE" :type/Date]
    [#"DATETIME" :type/DateTime]
    [#"DECIMAL" :type/Decimal]
    [#"DOUBLE" :type/Float]
    [#"ENUM" :type/Text]
    [#"FLOAT" :type/Float]
    [#"INT" :type/Integer]
    [#"INTEGER" :type/Integer]
    [#"JSON" :type/JSON]
    [#"LONGBLOB" :type/*]
    [#"LONGTEXT" :type/Text]
    [#"MEDIUMBLOB" :type/*]
    [#"MEDIUMINT" :type/Integer]
    [#"MEDIUMTEXT" :type/Text]
    [#"NUMERIC" :type/Decimal]
    [#"REAL" :type/Float]
    [#"SET" :type/Text]
    [#"SMALLINT" :type/Integer]
    [#"TEXT" :type/Text]
    [#"TIME" :type/Time]
    [#"TIMESTAMP" :type/DateTime]
    [#"TINYBLOB" :type/*]
    [#"TINYINT" :type/Integer]
    [#"TINYTEXT" :type/Text]
    [#"VARBINARY" :type/*]
    [#"VARCHAR" :type/Text]
    [#"YEAR" :type/Integer]
    [#"ANYDATA" :type/*]
    [#"ANYTYPE" :type/*]
    [#"ARRAY" :type/*]
    [#"BFILE" :type/*]
    [#"CLOB" :type/Text]
    [#"INTERVAL" :type/DateTime]
    [#"LONG RAW" :type/*]
    [#"LONG" :type/Text]
    [#"NUMBER" :type/Decimal]
    [#"RAW" :type/*]
    [#"REF" :type/*]
    [#"ROWID" :type/*]
    [#"STRUCT" :type/*]
    [#"TIMESTAMP(\(\d\))? WITH TIME ZONE" :type/DateTimeWithTZ]
    [#"TIMESTAMP(\(\d\))? WITH LOCAL TIME ZONE" :type/DateTimeWithLocalTZ]
    [#"VARCHAR2" :type/Text]
    [#"XML" :type/*]]))

(defmethod sql-jdbc.sync/database-type->base-type :oceanbase
  [_ column-type]
  (database-type->base-type column-type))

(defmethod sql.qp/quote-style :oceanbase
  [_driver]
  ;; For OceanBase, default to oracle mode for safety
  ;; The actual mode will be detected per-connection in can-connect? method
  :oracle)

(defmethod driver/db-start-of-week :oceanbase
  [_driver]
  :sunday)

(mr/def ::details
  [:map
   [:host {:optional true} [:maybe string?]]
   [:port {:optional true} [:maybe integer?]]
   [:user {:optional true} [:maybe string?]]
   [:password {:optional true} [:maybe string?]]
   [:db {:optional true} [:maybe string?]]
   [:schema-filters-type {:optional true} [:enum "inclusion" "exclusion"]]
   [:schema-filters-patterns {:optional true} [:maybe string?]]])

(def ^:private default-connection-args
  {:useUnicode true
   :characterEncoding "UTF-8"
   :autoReconnect true
   :failOverReadOnly false
   :maxReconnects 3
   :initialTimeout 2
   :connectTimeout 30000
   :socketTimeout 30000
   :sessionVariables "time_zone='+00:00'"
   :allowPublicKeyRetrieval true
   :useProxy false
   :proxyHost ""
   :proxyPort ""
   :proxyUser ""
   :proxyPassword ""
   :autoCommit true
   :readOnly false
   :transactionIsolation "READ_COMMITTED"})

(defn- maybe-add-program-name-option [jdbc-spec additional-options-map]
  (let [prog-name (str/replace config/mb-version-and-process-identifier "," "_")
        set-prog-nm-fn #(assoc jdbc-spec :connectionAttributes (str "program_name:" prog-name))]
    (if-let [conn-attrs (get additional-options-map "connectionAttributes")]
      (if (str/includes? conn-attrs "program_name")
        jdbc-spec
        (set-prog-nm-fn))
      (set-prog-nm-fn))))

(defmethod sql-jdbc.conn/connection-details->spec :oceanbase
  [_ {:keys [additional-options], :as details}]
  (let [addl-opts-map (sql-jdbc.common/additional-options->map additional-options :url "=" false)]
    (merge
     default-connection-args
     (let [details (-> details (set/rename-keys {:dbname :db}))]
       (-> (oceanbase-spec :oceanbase details)
           (maybe-add-program-name-option addl-opts-map)
           (sql-jdbc.common/handle-additional-options details))))))

(defmethod driver/connection-properties :oceanbase
  [_]
  (->>
   [driver.common/default-host-details
    (assoc driver.common/default-port-details
           :placeholder 2881
           :helper-text "Port number (default: 2881)")
    driver.common/default-dbname-details
    driver.common/default-user-details
    driver.common/default-password-details
    driver.common/default-role-details
    driver.common/advanced-options-start
    (assoc driver.common/additional-options
           :placeholder "useUnicode=true&characterEncoding=UTF-8&autoReconnect=true")
    driver.common/default-advanced-options]
   (into [] (mapcat u/one-or-many))))

(defmethod driver/can-connect? :oceanbase
  [driver details]
      (try
    (let [spec (sql-jdbc.conn/connection-details->spec driver details)]
      (log/info "Testing OceanBase connection with spec:" (dissoc spec :password))
      ;; Use SHOW VARIABLES query - works in both MySQL and Oracle modes
      (let [result (jdbc/query spec ["SHOW VARIABLES LIKE 'ob_compatibility_mode'"])
            first-row (first result)
            value (get-in first-row [:value])]
        (log/info "OceanBase connection test result:" {:result result :first-row first-row :value value})
        (if (and (some? value)
                 (or (= value "MYSQL")
                     (= value "ORACLE")))
          (do
            (log/info "OceanBase mode detected:" (clojure.string/lower-case value))
            true)
          (do
            (log/warn "OceanBase connection successful but compatibility mode not recognized:" value)
            ;; Still return true if we can connect, even if mode is not recognized
            true))))
    (catch Exception e
      (log/error "Failed to connect to OceanBase database:" (.getMessage e))
      (log/error "Connection details:" (dissoc details :password))
      false)))

(defn- format-mod [_fn [x y]]
  (let [[x-sql & x-args] (sql/format-expr x {:nested true})
        [y-sql & y-args] (sql/format-expr y {:nested true})]
    (into [(format "mod(%s, %s)" x-sql y-sql)]
          (concat x-args y-args))))

(sql/register-fn! ::mod #'format-mod)

(defn- trunc
  [format-template v]
  (-> [:trunc v (h2x/literal format-template)]
      (h2x/with-database-type-info "date")))

(defmethod sql.qp/->honeysql [:oceanbase :substring]
  [driver [_ arg start & [length]]]
  ;; Default to Oracle mode (SUBSTR) since it's more restrictive
  (if length
    [:substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start) (sql.qp/->honeysql driver length)]
    [:substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver start)]))

(defmethod sql.qp/->honeysql [:oceanbase :concat]
  [driver [_ & args]]
  (transduce
   (map (partial sql.qp/->honeysql driver))
   (completing
    (fn [x y]
      (if x
        [:concat x y]
        y)))
   nil
   args))

(defmethod sql.qp/->honeysql [:oceanbase :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr (sql.qp/->honeysql driver arg) (sql.qp/->honeysql driver pattern)])

(defmethod sql.qp/->honeysql [:oceanbase ::sql.qp/cast-to-text]
  [driver [_ expr]]
  (sql.qp/->honeysql driver [::sql.qp/cast expr "varchar2(256)"]))

(defmethod sql.qp/date [:oceanbase :second-of-minute]
  [_driver _unit v]
  (let [t (h2x/->timestamp v)]
    (h2x/->integer [:floor [::h2x/extract :second t]])))

(defmethod sql.qp/date [:oceanbase :minute]           [_ _ v] (trunc :mi v))
(defmethod sql.qp/date [:oceanbase :minute-of-hour]   [_ _ v] [::h2x/extract :minute (h2x/->timestamp v)])
(defmethod sql.qp/date [:oceanbase :hour]             [_ _ v] (trunc :hh v))
(defmethod sql.qp/date [:oceanbase :hour-of-day]      [_ _ v] [::h2x/extract :hour (h2x/->timestamp v)])
(defmethod sql.qp/date [:oceanbase :day]              [_ _ v] (trunc :dd v))
(defmethod sql.qp/date [:oceanbase :day-of-month]     [_ _ v] [::h2x/extract :day v])
(defmethod sql.qp/date [:oceanbase :month]            [_ _ v] (trunc :month v))
(defmethod sql.qp/date [:oceanbase :month-of-year]    [_ _ v] [::h2x/extract :month v])
(defmethod sql.qp/date [:oceanbase :quarter]          [_ _ v] (trunc :q v))
(defmethod sql.qp/date [:oceanbase :year]             [_ _ v] (trunc :year v))
(defmethod sql.qp/date [:oceanbase :year-of-era]      [_ _ v] [::h2x/extract :year v])

(defmethod sql.qp/date [:oceanbase :week]
  [driver _ v]
  (sql.qp/adjust-start-of-week driver (partial trunc :day) v))

(defmethod sql.qp/date [:oceanbase :week-of-year-iso]
  [_ _ v]
  (h2x/->integer [:to_char v (h2x/literal :iw)]))

(defmethod sql.qp/date [:oceanbase :day-of-year]
  [driver _ v]
  (h2x/inc (h2x/- (sql.qp/date driver :day v) (trunc :year v))))

(defmethod sql.qp/date [:oceanbase :quarter-of-year]
  [driver _ v]
  (h2x// (h2x/+ (sql.qp/date driver :month-of-year (sql.qp/date driver :quarter v))
                2)
         3))

(defmethod sql.qp/date [:oceanbase :day-of-week]
  [driver _ v]
  (sql.qp/adjust-day-of-week
   driver
   (h2x/->integer [:to_char v (h2x/literal :d)])
   (driver.common/start-of-week-offset driver)
   (fn mod-fn [& args]
     (into [::mod] args))))

(defmethod sql.qp/apply-top-level-clause [:oceanbase :limit]
  [driver _ honeysql-query {value :limit}]
  {:pre [(number? value)]}
  ((get-method sql.qp/apply-top-level-clause [:sql-jdbc :limit]) driver :limit honeysql-query {:limit value}))

(defmethod sql.qp/apply-top-level-clause [:oceanbase :page]
  [driver _ honeysql-query {{:keys [items page]} :page}]
  {:pre [(number? items) (number? page)]}
  ((get-method sql.qp/apply-top-level-clause [:sql-jdbc :page]) driver :page honeysql-query {:page {:items items :page page}}))

(defmethod driver/humanize-connection-error-message :oceanbase
  [_ message]
  (let [message-str (str message)]
    (cond
      (re-matches #"^Communications link failure\s+The last packet sent successfully to the server was 0 milliseconds ago. The driver has not received any packets from the server.$" message-str)
      :cannot-connect-check-host-and-port

      (re-matches #"^Unknown database .*$" message-str)
      :database-name-incorrect

      (re-matches #"Access denied for user.*$" message-str)
      :username-or-password-incorrect

      (re-matches #"Must specify port after ':' in connection string" message-str)
      :invalid-hostname

      :else message)))

(defmethod sql-jdbc.sync/excluded-schemas :oceanbase
  [_]
  #{"information_schema" "mysql" "performance_schema" "sys" "oceanbase"
    "ANONYMOUS" "APEX_040200" "APPQOSSYS" "AUDSYS" "CTXSYS" "DBSNMP" "DIP" "DVSYS"
    "GSMADMIN_INTERNAL" "GSMCATUSER" "GSMUSER" "LBACSYS" "MDSYS" "OLAPSYS" "ORDDATA"
    "ORDSYS" "OUTLN" "RDSADMIN" "SYS" "SYSBACKUP" "SYSDG" "SYSKM" "SYSTEM" "WMSYS"
    "XDB" "XS$NULL"})

(defmethod driver/escape-entity-name-for-metadata :oceanbase
  [_ entity-name]
  (str/replace entity-name "/" "//"))

(defmethod sql-jdbc.describe-table/get-table-pks :oceanbase
  [_driver ^Connection conn _db-name-or-nil table]
  (let [^DatabaseMetaData metadata (.getMetaData conn)]
    (try
      (into [] (sql-jdbc.sync.common/reducible-results
                #(.getPrimaryKeys metadata nil nil (:name table))
                (fn [^ResultSet rs] #(.getString rs "COLUMN_NAME"))))
      (catch Exception e
        (log/warn "Error getting primary keys for table" (:name table) "Error:" (.getMessage e))
        []))))

(defn- filtered-syncable-schemas-impl
  [_driver conn]
  (try
    (let [mode (clojure.string/lower-case (detect-mode-from-connection conn))]
      (log/info "OceanBase schema filtering - detected mode:" mode)
      (case mode
        "oracle"
        (try
          (let [test-spec {:connection conn}
                user-query "SELECT USER FROM DUAL"
                user-result (jdbc/query test-spec [user-query] {:as-arrays? false :max-rows 1})
                current-user (when (seq user-result)
                              (get-in (first user-result) [:user]))]
            (log/info "OceanBase Oracle mode: user query result:" {:user-result user-result :current-user current-user})
            (if current-user
              [current-user]
              (do
                (log/warn "OceanBase Oracle mode: No valid username found from SQL query, returning empty schema list")
                [])))
          (catch Exception e
            (log/warn "OceanBase Oracle mode: Failed to get username from SQL query, returning empty schema list. Error:" (.getMessage e))
            []))
        "mysql"
        (try
          (let [test-spec {:connection conn}
                db-query "SELECT DATABASE() as current_db"
                db-result (jdbc/query test-spec [db-query] {:as-arrays? false :max-rows 1})
                current-db (when (seq db-result)
                            (get-in (first db-result) [:current_db]))]
            (log/info "OceanBase MySQL mode: database query result:" {:db-result db-result :current-db current-db})
            (if current-db
              [current-db]
              (do
                (log/warn "OceanBase MySQL mode: No valid database found from SQL query, returning empty schema list")
                [])))
          (catch Exception e
            (log/warn "OceanBase MySQL mode: Failed to get database from SQL query, returning empty schema list. Error:" (.getMessage e))
            []))
        []))
    (catch Exception e
      (log/warn "Error in OceanBase schema filtering, returning empty list. Error:" (.getMessage e))
      [])))

(defmethod sql-jdbc.sync.interface/filtered-syncable-schemas :oceanbase
  [_driver conn _metadata _schema-inclusion-filters _schema-exclusion-filters]
  (filtered-syncable-schemas-impl _driver conn))

(defmethod sql-jdbc.sync.interface/active-tables :oceanbase
  [driver connection schema-inclusion-filters schema-exclusion-filters]
  (sql-jdbc.describe-database/fast-active-tables driver connection nil schema-inclusion-filters schema-exclusion-filters))



(defmethod driver/describe-database :oceanbase
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (let [mode (get-mode (sql-jdbc.conn/connection-details->spec driver (:details database)))
           db-name (or (:dbname (:details database)) (:db (:details database)))]
       (log/debug "OceanBase describe database - mode:" mode "db-name:" db-name)
       (case (clojure.string/lower-case mode)
         "oracle"
         (let [sql "SELECT t.table_name as name,
                           USER as schema,
                           tc.comments as description
                    FROM user_tables t
                    LEFT JOIN user_tab_comments tc ON (t.table_name = tc.table_name)
                    WHERE tc.table_type = 'TABLE' OR tc.table_type IS NULL
                    ORDER BY t.table_name"
               tables (jdbc/query {:connection conn} [sql])]
           {:tables (set (map (fn [table]
                               {:name (:name table)
                                :schema (:schema table)
                                :description (when-not (str/blank? (:description table))
                                              (:description table))})
                             tables))})
         "mysql"
         (let [sql "SELECT t.table_name as name,
                           t.table_schema as `schema`,
                           t.table_comment as description
                    FROM information_schema.tables t
                    WHERE t.table_schema = ? AND t.table_type = 'BASE TABLE'
                    ORDER BY t.table_name"
               tables (jdbc/query {:connection conn} [sql db-name])]
           {:tables (set (map (fn [table]
                               {:name (:name table)
                                :schema (:schema table)
                                :description (when-not (str/blank? (:description table))
                                              (:description table))})
                             tables))})
         (let [sql "SELECT t.table_name as name,
                           USER as schema,
                           tc.comments as description
                    FROM user_tables t
                    LEFT JOIN user_tab_comments tc ON (t.table_name = tc.table_name)
                    WHERE tc.table_type = 'TABLE' OR tc.table_type IS NULL
                    ORDER BY t.table_name"
               tables (jdbc/query {:connection conn} [sql])]
           {:tables (set (map (fn [table]
                               {:name (:name table)
                                :schema (:schema table)
                                :description (when-not (str/blank? (:description table))
                                              (:description table))})
                             tables))}))))))

(defmethod sql-jdbc.sync/describe-fields-sql :oceanbase
  [driver & {:keys [table-names details]}]
  (letfn [(build-table-filter [tables]
            (when (seq tables)
              (str " IN (" (clojure.string/join "," (map #(str "'" (clojure.string/lower-case %) "'") tables)) ")")))

          (build-oracle-sql [tables]
            (str "SELECT c.column_name as name,
                       c.column_id as database_position,
                       c.table_name as table_name,
                       UPPER(c.data_type) as database_type,
                       CASE WHEN c.nullable = 'Y' THEN 0 ELSE 1 END as database_required,
                       0 as database_is_auto_increment,
                       CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END as pk_field,
                       cc.comments as field_comment
                FROM user_tab_columns c
                LEFT JOIN user_col_comments cc ON (c.table_name = cc.table_name AND c.column_name = cc.column_name)
                LEFT JOIN (
                  SELECT pcc.table_name, pcc.column_name
                  FROM user_cons_columns pcc
                  JOIN user_constraints puc ON (pcc.constraint_name = puc.constraint_name)
                  WHERE puc.constraint_type = 'P'
                ) pk ON (c.table_name = pk.table_name AND c.column_name = pk.column_name)"
                 (when (seq tables) (str " WHERE LOWER(c.table_name)" (build-table-filter tables)))
                 " ORDER BY c.table_name, c.column_id"))

          (build-mysql-sql [tables db-name]
            (let [base-sql "SELECT c.column_name AS name,
                                   c.ordinal_position AS database_position,
                                   c.table_name AS table_name,
                                   UPPER(c.data_type) AS database_type,
                                   CASE WHEN c.is_nullable = 'NO' AND c.extra != 'auto_increment' THEN 1 ELSE 0 END AS database_required,
                                   CASE WHEN c.extra = 'auto_increment' THEN 1 ELSE 0 END AS database_is_auto_increment,
                                   CASE WHEN c.column_key = 'PRI' THEN 1 ELSE 0 END AS pk_field,
                                   c.column_comment AS field_comment
                            FROM information_schema.columns c"
                  table-filter (when (seq tables) (str " AND LOWER(c.table_name)" (build-table-filter tables)))
                  final-sql (str base-sql
                                (if (and db-name (not (str/blank? db-name)))
                                  " WHERE c.table_schema = ?"
                                  " WHERE c.table_schema = (SELECT DATABASE())")
                                table-filter
                                " ORDER BY c.table_name, c.ordinal_position")]
              (if (and db-name (not (str/blank? db-name)))
                [final-sql db-name]
                [final-sql])))]
    (try
      (let [spec (sql-jdbc.conn/connection-details->spec driver details)
            mode (get-mode spec)
            db-name (or (:dbname spec) (:db spec))]
        (case (clojure.string/lower-case mode)
          "mysql" (build-mysql-sql table-names db-name)
          [(build-oracle-sql table-names)]))
      (catch Exception e
        (log/error e "Error in OceanBase describe-fields-sql, falling back to Oracle mode")
        [(build-oracle-sql table-names)]))))



(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :oceanbase
  [_driver _db & _args]
  (letfn [(parse-position [pos-val]
            (when pos-val
              (try
                (-> (if (number? pos-val) pos-val (Integer/parseInt (str pos-val))) dec)
                (catch Exception _
                  (log/warn "Failed to parse database_position:" pos-val)
                  nil))))

          (is-true? [val]
            (or (= val 1) (= val 1M)))]
    (map (fn [col]
           (try
             (-> col
                 (assoc :table-name (:table_name col))
                 (assoc :database-type (:database_type col))
                 (cond-> (and (:field_comment col) (not (str/blank? (:field_comment col))))
                   (assoc :field-comment (:field_comment col)))
                 (assoc :pk? (is-true? (:pk_field col)))
                 (assoc :database-required (is-true? (:database_required col)))
                 (assoc :database-is-auto-increment (is-true? (:database_is_auto_increment col)))
                 (assoc :database-position (parse-position (:database_position col)))
                 (dissoc :table_name :database_type :field_comment :pk_field :database_required :database_is_auto_increment))
             (catch Exception e
               (log/warn "Error processing field column:" col "Error:" (.getMessage e))
               col))))))

(defmethod driver/execute-reducible-query :oceanbase
  [driver query context respond]
  ((get-method driver/execute-reducible-query :sql-jdbc) driver query context respond))

(defmethod sql.qp/apply-top-level-clause [:oceanbase :limit]
  [driver _ honeysql-query {value :limit}]
  {:pre [(number? value)]}
  (letfn [(oracle-limit [query val]
            {:select [:*]
             :from   [(-> (merge {:select [:*]} query)
                         (update :select sql.u/select-clause-deduplicate-aliases))]
             :where  [:<= [:raw "rownum"] [:inline val]]})]
    ;; For OceanBase, default to Oracle mode for safety
    (oracle-limit honeysql-query value)))

(defmethod driver/notify-database-updated :oceanbase
  [_ _]
  (log/debug "OceanBase database updated notification received"))

(defmethod sql-jdbc.sync.interface/have-select-privilege? :oceanbase
  [driver ^Connection conn table-schema table-name]
  (try
    (let [mode (clojure.string/lower-case (detect-mode-from-connection conn))
          test-spec {:connection conn}]
      (case mode
        "oracle"
        (try
          ;; For Oracle mode, try a simple SELECT query
          (let [sql "SELECT 1 FROM DUAL WHERE 1 = 0"]
            (jdbc/query test-spec [sql] {:as-arrays? false :max-rows 1})
            true)
          (catch Exception e
            (log/debug "OceanBase Oracle mode: SELECT privilege check failed for" table-schema "." table-name "Error:" (.getMessage e))
            false))
        "mysql"
        (try
          ;; For MySQL mode, try a simple SELECT query
          (let [sql "SELECT 1 LIMIT 0"]
            (jdbc/query test-spec [sql] {:as-arrays? false :max-rows 1})
            true)
          (catch Exception e
            (log/debug "OceanBase MySQL mode: SELECT privilege check failed for" table-schema "." table-name "Error:" (.getMessage e))
            false))
        true))
    (catch Exception e
      (log/debug "OceanBase: SELECT privilege check failed for" table-schema "." table-name "Error:" (.getMessage e))
      false)))

(log/info "OceanBase driver loaded")
(defmethod driver/describe-table :oceanbase
  [driver database table]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [^Connection conn]
     (let [table-name (:name table)
           schema (:schema table)]
       (log/info "OceanBase describe-table for table:" table-name "schema:" schema)
       (let [result (assoc (select-keys table [:name :schema])
                           :fields (try
                                     ;; First, try to detect the mode for this specific connection
                                     (let [mode (detect-mode-from-connection conn)
                                           _ (log/info "OceanBase detected mode for table" table-name ":" mode)]
                                       (if (= (clojure.string/lower-case mode) "mysql")
                                         ;; For MySQL mode, try a direct JDBC approach first
                                         (try
                                           (let [db-name (or (:dbname (:details database)) (:db (:details database)))
                                                 sql "SELECT COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT, EXTRA
                                                       FROM INFORMATION_SCHEMA.COLUMNS
                                                       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                                                       ORDER BY ORDINAL_POSITION"
                                                 params (if db-name [db-name table-name] [table-name])
                                                 sql (if db-name sql "SELECT COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT, EXTRA
                                                                    FROM INFORMATION_SCHEMA.COLUMNS
                                                                    WHERE TABLE_NAME = ?
                                                                    ORDER BY ORDINAL_POSITION")
                                                 result (jdbc/query {:connection conn} [sql params] {:as-arrays? false})]
                                             (log/info "OceanBase MySQL direct query returned" (count result) "fields for table" table-name)
                                             (log/debug "OceanBase MySQL direct query result:" result)
                                             (into #{} (map (fn [row]
                                                             {:name (:column_name row)
                                                              :database-type (:data_type row)
                                                              :database-position (dec (:ordinal_position row))
                                                              :database-required (= "NO" (:is_nullable row))
                                                              :database-is-auto-increment (= "auto_increment" (:extra row))
                                                              :pk? (= "PRI" (:column_key row))
                                                              :field-comment (:column_comment row)})
                                                           result)))
                                           (catch Exception e
                                             (log/warn "OceanBase MySQL direct query failed, trying standard method. Error:" (.getMessage e))
                                             (let [fields (into #{} (sql-jdbc.sync/describe-fields driver database
                                                                                                  :table-names [table-name]
                                                                                                  :schema-names (when schema [schema])))]
                                               (log/info "OceanBase standard describe-fields returned" (count fields) "fields for table" table-name)
                                               (log/debug "OceanBase standard describe-fields result:" fields)
                                               fields)))
                                         ;; For Oracle mode, use standard method
                                         (let [fields (into #{} (sql-jdbc.sync/describe-fields driver database
                                                                                              :table-names [table-name]
                                                                                              :schema-names (when schema [schema])))]
                                           (log/info "OceanBase Oracle describe-fields returned" (count fields) "fields for table" table-name)
                                           (log/debug "OceanBase Oracle describe-fields result:" fields)
                                           fields)))
                                     (catch Throwable e
                                       (log/error e "Error retrieving fields for OceanBase table" schema "." table-name)
                                       (try
                                         (let [fallback-fields (sql-jdbc.describe-table/describe-table-fields driver conn table nil)]
                                           (log/info "OceanBase fallback JDBC method returned" (count fallback-fields) "fields for table" table-name)
                                           (log/debug "OceanBase fallback JDBC result:" fallback-fields)
                                           fallback-fields)
                                         (catch Throwable e2
                                           (log/error e2 "Fallback JDBC method also failed for OceanBase table" schema "." table-name)
                                           #{})))))]
         (log/info "OceanBase describe-table final result for table" table-name ":" (select-keys result [:name :schema :fields]))
         result)))))

