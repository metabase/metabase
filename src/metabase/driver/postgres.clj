(ns metabase.driver.postgres
  "Database driver for PostgreSQL databases. Builds on top of the SQL JDBC driver, which implements most functionality
  for JDBC-based drivers."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [honey.sql.pg-ops :as sql.pg-ops]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.postgres.actions :as postgres.actions]
   [metabase.driver.postgres.ddl :as postgres.ddl]
   [metabase.driver.postgres-routines :as postgres-routines]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.quoting :refer [quote-columns quote-identifier
                                             with-quoting]]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-database :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.io StringReader)
   (java.sql
    Connection
    ResultSet
    ResultSetMetaData
    Types)
   (java.time LocalDateTime OffsetDateTime OffsetTime)
   (org.postgresql.copy CopyManager)
   (org.postgresql.jdbc PgConnection)))

(set! *warn-on-reflection* true)

(comment
  ;; method impls live in these namespaces.
  postgres.actions/keep-me
  postgres.ddl/keep-me
  sql.pg-ops/keep-me)

(driver/register! :postgres, :parent :sql-jdbc)

(defmethod driver/display-name :postgres [_] "PostgreSQL")

;; Features that are supported by Postgres and all of its child drivers like Redshift
(doseq [[feature supported?] {:connection-impersonation true
                              :describe-fields          true
                              :describe-fks             true
                              :describe-indexes         true
                              :describe-routines        true
                              :convert-timezone         true
                              :datetime-diff            true
                              :now                      true
                              :persist-models           true
                              :schemas                  true
                              :identifiers-with-spaces  true
                              :uuid-type                true
                              :split-part               true
                              :uploads                  true
                              :expression-literals      true
                              :expressions/text         true
                              :expressions/integer      true
                              :expressions/float        true
                              :expressions/date         true
                              :database-routing         true}]
  (defmethod driver/database-supports? [:postgres feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:postgres :nested-field-columns]
  [_driver _feat db]
  (driver.common/json-unfolding-default db))

;; Features that are supported by postgres only
(doseq [feature [:actions
                 :actions/custom
                 :table-privileges
                 ;; Index sync is turned off across the application as it is not used ATM.
                 #_:index-info
                 :database-replication]]
  (defmethod driver/database-supports? [:postgres feature]
    [driver _feat _db]
    (= driver :postgres)))

(defmethod driver/escape-entity-name-for-metadata :postgres [_driver entity-name]
  (when entity-name
    ;; these entities names are used as a pattern for LIKE queries in jdbc
    ;; so we need to double escape it, first for java, then for sql
    (str/replace entity-name "\\" "\\\\")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/display-name :postgres [_] "PostgreSQL")

(defmethod driver/humanize-connection-error-message :postgres
  [_ message]
  (condp re-matches message
    #"^FATAL: database \".*\" does not exist$"
    :database-name-incorrect

    #"^No suitable driver found for.*$"
    :invalid-hostname

    #"^Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections.$"
    :cannot-connect-check-host-and-port

    #"^FATAL: role \".*\" does not exist$"
    :username-incorrect

    #"^FATAL: password authentication failed for user.*$"
    :password-incorrect

    #"^FATAL: .*$" ; all other FATAL messages: strip off the 'FATAL' part, capitalize, and add a period
    (let [[_ message] (re-matches #"^FATAL: (.*$)" message)]
      (str (str/capitalize message) \.))

    message))

(defmethod driver/db-default-timezone :postgres
  [driver database]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^java.sql.Connection conn]
     (with-open [stmt (.prepareStatement conn "show timezone;")
                 rset (.executeQuery stmt)]
       (when (.next rset)
         (.getString rset 1))))))

(defmethod driver/connection-properties :postgres
  [_]
  (->>
   [driver.common/default-host-details
    (assoc driver.common/default-port-details :placeholder 5432)
    driver.common/default-dbname-details
    driver.common/default-user-details
    driver.common/auth-provider-options
    (assoc driver.common/default-password-details
           :visible-if {"use-auth-provider" false})
    driver.common/cloud-ip-address-info
    {:name "schema-filters"
     :type :schema-filters
     :display-name "Schemas"
     :visible-if {"destination-database" false}}
    driver.common/default-ssl-details
    {:name         "ssl-mode"
     :display-name (trs "SSL Mode")
     :type         :select
     :options [{:name  "allow"
                :value "allow"}
               {:name  "prefer"
                :value "prefer"}
               {:name  "require"
                :value "require"}
               {:name  "verify-ca"
                :value "verify-ca"}
               {:name  "verify-full"
                :value "verify-full"}]
     :default "require"
     :visible-if {"ssl" true}}
    {:name         "ssl-root-cert"
     :display-name (trs "SSL Root Certificate (PEM)")
     :type         :secret
     :secret-kind  :pem-cert
     ;; only need to specify the root CA if we are doing one of the verify modes
     :visible-if   {"ssl-mode" ["verify-ca" "verify-full"]}}
    {:name         "ssl-use-client-auth"
     :display-name (trs "Authenticate client certificate?")
     :type         :boolean
     ;; TODO: does this somehow depend on any of the ssl-mode vals?  it seems not (and is in fact orthogonal)
     :visible-if   {"ssl" true}}
    {:name         "ssl-client-cert"
     :display-name (trs "SSL Client Certificate (PEM)")
     :type         :secret
     :secret-kind  :pem-cert
     :visible-if   {"ssl-use-client-auth" true}}
    {:name         "ssl-key"
     :display-name (trs "SSL Client Key (PKCS-8/DER)")
     :type         :secret
     ;; since this can be either PKCS-8 or PKCS-12, we can't model it as a :keystore
     :secret-kind  :binary-blob
     :visible-if   {"ssl-use-client-auth" true}}
    {:name         "ssl-key-password"
     :display-name (trs "SSL Client Key Password")
     :type         :secret
     :secret-kind  :password
     :visible-if   {"ssl-use-client-auth" true}}
    driver.common/ssh-tunnel-preferences
    driver.common/advanced-options-start
    driver.common/json-unfolding

    (assoc driver.common/additional-options
           :placeholder "prepareThreshold=0")
    driver.common/default-advanced-options]
   (into [] (mapcat u/one-or-many))))

(defmethod driver/db-start-of-week :postgres
  [_]
  :monday)

(defn- get-typenames [{:keys [nspname typname]}]
  (cond-> [typname]
    (not= nspname "public") (conj (format "\"%s\".\"%s\"" nspname typname))))

(defn- enum-types
  [database]
  (into #{}
        (mapcat get-typenames)
        (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                    [(str "SELECT nspname, typname "
                          "FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
                          "WHERE t.oid IN (SELECT DISTINCT enumtypid FROM pg_enum e)")])))

(defn- get-tables-sql
  [schemas table-names]
  ;; Ref: https://github.com/davecramer/pgjdbc/blob/a714bfd/pgjdbc/src/main/java/org/postgresql/jdbc/PgDatabaseMetaData.java#L1272
  (sql/format
   (cond->  {:select    [[:n.nspname :schema]
                         [:c.relname :name]
                         [[:case-expr :c.relkind
                           [:inline "r"] [:inline "TABLE"]
                           [:inline "p"] [:inline "PARTITIONED TABLE"]
                           [:inline "v"] [:inline "VIEW"]
                           [:inline "f"] [:inline "FOREIGN TABLE"]
                           [:inline "m"] [:inline "MATERIALIZED VIEW"]
                           :else nil]
                          :type]
                         [:d.description :description]
                         [:stat.n_live_tup :estimated_row_count]]
             :from      [[:pg_catalog.pg_class :c]]
             :join      [[:pg_catalog.pg_namespace :n]   [:= :c.relnamespace :n.oid]]
             :left-join [[:pg_catalog.pg_description :d] [:and [:= :c.oid :d.objoid] [:= :d.objsubid 0] [:= :d.classoid [:raw "'pg_class'::regclass"]]]
                         [:pg_stat_user_tables :stat]    [:and [:= :n.nspname :stat.schemaname] [:= :c.relname :stat.relname]]]
             :where     [:and [:= :c.relnamespace :n.oid]
                         ;; filter out system tables
                         [(keyword "!~") :n.nspname "^pg_"] [:<> :n.nspname "information_schema"]
                         ;; only get tables of type: TABLE, PARTITIONED TABLE, VIEW, FOREIGN TABLE, MATERIALIZED VIEW
                         [:raw "c.relkind in ('r', 'p', 'v', 'f', 'm')"]]
             :order-by  [:type :schema :name]}
     (seq schemas)
     (sql.helpers/where [:in :n.nspname schemas])

     (seq table-names)
     (sql.helpers/where [:in :c.relname table-names]))
   {:dialect :ansi}))

(defn- get-tables
  ;; have it as its own method for ease of testing
  [database schemas tables]
  (sql-jdbc.execute/reducible-query database (get-tables-sql schemas tables)))

(defn- describe-syncable-tables
  [{driver :engine :as database}]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       database
       nil
       (fn [^Connection conn]
         (reduce
          rf
          init
          (when-let [syncable-schemas (seq (driver/syncable-schemas driver database))]
            (let [have-select-privilege? (sql-jdbc.describe-database/have-select-privilege-fn driver conn)]
              (eduction
               (comp (filter have-select-privilege?)
                     (map #(dissoc % :type)))
               (get-tables database syncable-schemas nil))))))))))

(defmethod driver/describe-database :postgres
  [_driver database]
  ;; TODO: we should figure out how to sync tables using transducer, this way we don't have to hold 100k tables in
  ;; memory in a set like this
  {:tables (into #{} (describe-syncable-tables database))})

(defmethod driver/describe-routines :postgres
  [driver database & opts]
  (apply postgres-routines/describe-routines-improved driver database opts))

(defmethod sql-jdbc.sync/describe-fields-sql :postgres
  ;; The implementation is based on `getColumns` in https://github.com/pgjdbc/pgjdbc/blob/fcc13e70e6b6bb64b848df4b4ba6b3566b5e95a3/pgjdbc/src/main/java/org/postgresql/jdbc/PgDatabaseMetaData.java
  [driver & {:keys [schema-names table-names]}]
  (sql/format
   {:union-all
    [{:select [[:c.column_name :name]
               [[:case
                 [:in :c.udt_schema [[:inline "public"] [:inline "pg_catalog"]]]
                 [:format [:inline "%s"] :c.udt_name]
                 :else
                 [:format [:inline "\"%s\".\"%s\""] :c.udt_schema :c.udt_name]]
                :database-type]
               [[:- :c.ordinal_position [:inline 1]] :database-position]
               [:c.table_schema :table-schema]
               [:c.table_name :table-name]
               [[:not= :pk.column_name nil] :pk?]
               [[:col_description
                 [:cast [:cast [:format [:inline "%I.%I"] [:cast :c.table_schema :text] [:cast :c.table_name :text]] :regclass] :oid]
                 :c.ordinal_position]
                :field-comment]
               [[:and
                 [:or [:= :column_default nil] [:= [:lower :column_default] [:inline "null"]]]
                 [:= :is_nullable [:inline "NO"]]
                  ;;_ IS_AUTOINCREMENT from: https://github.com/pgjdbc/pgjdbc/blob/fcc13e70e6b6bb64b848df4b4ba6b3566b5e95a3/pgjdbc/src/main/java/org/postgresql/jdbc/PgDatabaseMetaData.java#L1852-L1856
                 [:not [:or
                        [:and [:!= :column_default nil] [:like :column_default [:inline "%nextval(%"]]]
                        [:!= :is_identity [:inline "NO"]]]]]
                :database-required]
               [[:or
                 [:and [:!= :column_default nil] [:like :column_default [:inline "%nextval(%"]]]
                 [:!= :is_identity [:inline "NO"]]]
                :database-is-auto-increment]]
      :from [[:information_schema.columns :c]]
      :left-join [[{:select [:tc.table_schema
                             :tc.table_name
                             :kc.column_name]
                    :from [[:information_schema.table_constraints :tc]]
                    :join [[:information_schema.key_column_usage :kc]
                           [:and
                            [:= :tc.constraint_name :kc.constraint_name]
                            [:= :tc.table_schema :kc.table_schema]
                            [:= :tc.table_name :kc.table_name]]]
                    :where [:= :tc.constraint_type [:inline "PRIMARY KEY"]]}
                   :pk]
                  [:and
                   [:= :c.table_schema :pk.table_schema]
                   [:= :c.table_name :pk.table_name]
                   [:= :c.column_name :pk.column_name]]]
      :where [:and
              [:raw "c.table_schema !~ '^information_schema|catalog_history|pg_'"]
              (when schema-names [:in :c.table_schema schema-names])
              (when table-names [:in :c.table_name table-names])]}
     {:select [[:pa.attname :name]
               [[:case
                 [:in :ptn.nspname [[:inline "public"] [:inline "pg_catalog"]]]
                 [:format [:inline "%s"] :pt.typname]
                 :else
                 [:format [:inline "\"%s\".\"%s\""] :ptn.nspname :pt.typname]]
                :database-type]
               [[:- :pa.attnum [:inline 1]] :database-position]
               [:pn.nspname :table-schema]
               [:pc.relname :table-name]
               [false :pk?]
               [nil :field-comment]
               [false :database-required]
               [false :database-is-auto-increment]]
      :from [[:pg_catalog.pg_class :pc]]
      :join [[:pg_catalog.pg_namespace :pn] [:= :pn.oid :pc.relnamespace]
             [:pg_catalog.pg_attribute :pa] [:= :pa.attrelid :pc.oid]
             [:pg_catalog.pg_type :pt] [:= :pt.oid :pa.atttypid]
             [:pg_catalog.pg_namespace :ptn] [:= :ptn.oid :pt.typnamespace]]
      :where [:and
              [:= :pc.relkind [:inline "m"]]
              [:>= :pa.attnum [:inline 1]]
              (when schema-names [:in :pn.nspname schema-names])
              (when table-names [:in :pc.relname table-names])]}]
    :order-by [:table-schema :table-name :database-position]}
   :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-fks-sql :postgres
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select (vec
                        {:fk_ns.nspname       "fk-table-schema"
                         :fk_table.relname    "fk-table-name"
                         :fk_column.attname   "fk-column-name"
                         :pk_ns.nspname       "pk-table-schema"
                         :pk_table.relname    "pk-table-name"
                         :pk_column.attname   "pk-column-name"})
               :from   [[:pg_constraint :c]]
               :join   [[:pg_class     :fk_table]  [:= :c.conrelid :fk_table.oid]
                        [:pg_namespace :fk_ns]     [:= :c.connamespace :fk_ns.oid]
                        [:pg_attribute :fk_column] [:= :c.conrelid :fk_column.attrelid]
                        [:pg_class     :pk_table]  [:= :c.confrelid :pk_table.oid]
                        [:pg_namespace :pk_ns]     [:= :pk_table.relnamespace :pk_ns.oid]
                        [:pg_attribute :pk_column] [:= :c.confrelid :pk_column.attrelid]]
               :where  [:and
                        [:raw "fk_ns.nspname !~ '^information_schema|catalog_history|pg_'"]
                        [:= :c.contype [:raw "'f'::char"]]
                        [:= :fk_column.attnum [:raw "ANY(c.conkey)"]]
                        [:= :pk_column.attnum [:raw "ANY(c.confkey)"]]
                        (when table-names [:in :fk_table.relname table-names])
                        (when schema-names [:in :fk_ns.nspname schema-names])]
               :order-by [:fk-table-schema :fk-table-name]}
              :dialect (sql.qp/quote-style driver)))

(defmethod sql-jdbc.sync/describe-indexes-sql :postgres
  [driver & {:keys [schema-names table-names]}]
  ;; From https://github.com/pgjdbc/pgjdbc/blob/master/pgjdbc/src/main/java/org/postgresql/jdbc/PgDatabaseMetaData.java#L2662
  (sql/format {:select [:tmp.table-schema
                        :tmp.table-name
                        [[:trim :!both [:inline "\""] :!from [:pg_catalog.pg_get_indexdef :tmp.ci_oid :tmp.pos false]] :field-name]]
               :from [[{:select [[:n.nspname :table-schema]
                                 [:ct.relname :table-name]
                                 [:ci.oid :ci_oid]
                                 [[:. [:composite [:information_schema._pg_expandarray :i.indkey]] :n] :pos]]
                        :from [[:pg_catalog.pg_class :ct]]
                        :join [[:pg_catalog.pg_namespace :n] [:= :ct.relnamespace :n.oid]
                               [:pg_catalog.pg_index :i] [:= :ct.oid :i.indrelid]
                               [:pg_catalog.pg_class :ci] [:= :ci.oid :i.indexrelid]]
                        :where [:and
                                ;; No filtered indexes
                                [:= [:pg_catalog.pg_get_expr :i.indpred :i.indrelid] nil]
                                [:raw "n.nspname !~ '^information_schema|catalog_history|pg_'"]
                                (when (seq schema-names) [:in :n.nspname schema-names])
                                (when (seq table-names) [:in :ct.relname table-names])]}
                       :tmp]]
               ;; The only column or the first column in a composite index
               :where [:= :tmp.pos 1]}
              :dialect (sql.qp/quote-style driver)))

;; Describe the Fields present in a `table`. This just hands off to the normal SQL driver implementation of the same
;; name, but first fetches database enum types so we have access to them.
(defmethod sql-jdbc.sync/describe-fields-pre-process-xf :postgres
  [_driver database & _args]
  (let [enums (enum-types database)]
    (map (fn [{:keys [database-type] :as col}]
           (cond-> col
             (contains? enums database-type)
             (assoc :base-type :type/PostgresEnum))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver.sql/json-field-length :postgres
  [_ json-field-identifier]
  [:length [:cast json-field-identifier :text]])

(defn- ->timestamp [honeysql-form]
  (h2x/cast-unless-type-in "timestamp" #{"timestamp" "timestamptz" "timestamp with time zone" "date"} honeysql-form))

(defn- format-interval
  "Generate a Postgres 'INTERVAL' literal.

    (sql/format-expr [::interval 2 :day])
    =>
    [\"INTERVAL '2 day'\"]"
  ;; I tried to write this with Malli but couldn't figure out how to make it work. See
  ;; https://metaboat.slack.com/archives/CKZEMT1MJ/p1676076592468909
  [_fn [amount unit]]
  {:pre [(number? amount)
         (#{:millisecond :second :minute :hour :day :week :month :year} unit)]}
  [(format "INTERVAL '%s %s'" (num amount) (name unit))])

(sql/register-fn! ::interval #'format-interval)

(defn- interval [amount unit]
  (h2x/with-database-type-info [::interval amount unit] "interval"))

(defmethod sql.qp/add-interval-honeysql-form :postgres
  [driver hsql-form amount unit]
  ;; Postgres doesn't support quarter in intervals (#20683)
  (cond
    (= unit :quarter)
    (recur driver hsql-form (* 3 amount) :month)

    ;; date + interval -> timestamp, so cast the expression back to date
    (h2x/is-of-type? hsql-form "date")
    (h2x/cast "date" (h2x/+ hsql-form (interval amount unit)))

    :else
    (let [hsql-form (->timestamp hsql-form)]
      (-> (h2x/+ hsql-form (interval amount unit))
          (h2x/with-type-info (h2x/type-info hsql-form))))))

(defmethod sql.qp/current-datetime-honeysql-form :postgres
  [driver]
  (h2x/current-datetime-honeysql-form driver))

(defmethod sql.qp/unix-timestamp->honeysql [:postgres :seconds]
  [_ _ expr]
  ;; without tagging the expression, other code will want to add a type
  (h2x/with-database-type-info [:to_timestamp expr] "timestamptz"))

(defmethod sql.qp/cast-temporal-string [:postgres :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  (h2x/with-database-type-info [:to_timestamp expr (h2x/literal "YYYYMMDDHH24MISS")] "timestamptz"))

(defmethod sql.qp/cast-temporal-byte [:postgres :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
                               [:convert_from expr (h2x/literal "UTF8")]))

(defmethod sql.qp/cast-temporal-byte [:postgres :Coercion/ISO8601Bytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/ISO8601->DateTime
                               [:convert_from expr (h2x/literal "UTF8")]))

(defn- extract [unit expr]
  [::h2x/extract unit expr])

(defn- make-time [hour minute second]
  (h2x/with-database-type-info [:make_time hour minute second] "time"))

(defn- time-trunc [unit expr]
  (let [hour   [::pg-conversion (extract :hour expr) :integer]
        minute (if (#{:minute :second} unit)
                 [::pg-conversion (extract :minute expr) :integer]
                 [:inline 0])
        second (if (= unit :second)
                 [::pg-conversion (extract :second expr) ::double]
                 [:inline 0.0])]
    (make-time hour minute second)))

(mu/defn- date-trunc
  [unit :- driver-api/schema.temporal-bucketing.unit.date-time.truncate
   expr]
  (condp = (h2x/database-type expr)
    ;; apparently there is no convenient way to truncate a TIME column in Postgres, you can try to use `date_trunc`
    ;; but it returns an interval (??) and other insane things. This seems to be slightly less insane.
    "time"
    (time-trunc unit expr)

    "timetz"
    (h2x/cast "timetz" (time-trunc unit expr))

    ;; postgres returns timestamp or timestamptz from `date_trunc`, so cast back if we've got a date column
    "date"
    (h2x/cast "date" [:date_trunc (h2x/literal unit) expr])

    #_else
    (let [expr' (->timestamp expr)]
      (-> [:date_trunc (h2x/literal unit) expr']
          (h2x/with-database-type-info (h2x/database-type expr'))))))

(defn- extract-from-timestamp [unit expr]
  (extract unit (->timestamp expr)))

(defn- extract-integer [unit expr]
  (h2x/->integer (extract-from-timestamp unit expr)))

(defmethod sql.qp/date [:postgres :default]          [_ _ expr] expr)
(defmethod sql.qp/date [:postgres :second-of-minute] [_ _ expr] (extract-integer :second expr))
(defmethod sql.qp/date [:postgres :minute]           [_ _ expr] (date-trunc :minute expr))
(defmethod sql.qp/date [:postgres :minute-of-hour]   [_ _ expr] (extract-integer :minute expr))
(defmethod sql.qp/date [:postgres :hour]             [_ _ expr] (date-trunc :hour expr))
(defmethod sql.qp/date [:postgres :hour-of-day]      [_ _ expr] (extract-integer :hour expr))
(defmethod sql.qp/date [:postgres :day-of-month]     [_ _ expr] (extract-integer :day expr))
(defmethod sql.qp/date [:postgres :day-of-year]      [_ _ expr] (extract-integer :doy expr))
(defmethod sql.qp/date [:postgres :month]            [_ _ expr] (date-trunc :month expr))
(defmethod sql.qp/date [:postgres :month-of-year]    [_ _ expr] (extract-integer :month expr))
(defmethod sql.qp/date [:postgres :quarter]          [_ _ expr] (date-trunc :quarter expr))
(defmethod sql.qp/date [:postgres :quarter-of-year]  [_ _ expr] (extract-integer :quarter expr))
(defmethod sql.qp/date [:postgres :year]             [_ _ expr] (date-trunc :year expr))
(defmethod sql.qp/date [:postgres :year-of-era]      [_ _ expr] (extract-integer :year expr))

(defmethod sql.qp/date [:postgres :week-of-year-iso] [_driver _ expr] (extract-integer :week expr))

(defmethod sql.qp/date [:postgres :day-of-week]
  [driver _unit expr]
  ;; Postgres extract(dow ...) returns Sunday(0)...Saturday(6)
  ;;
  ;; Since that's different than what we normally consider the [[metabase.driver/db-start-of-week]] for Postgres
  ;; (Monday) we need to pass in a custom offset here
  (sql.qp/adjust-day-of-week driver
                             (h2x/+ (extract-integer :dow expr) 1)
                             (driver.common/start-of-week-offset-for-day :sunday)))

(defmethod sql.qp/date [:postgres :week]
  [_ _ expr]
  (sql.qp/adjust-start-of-week :postgres (partial date-trunc :week) expr))

(mu/defn- quoted? [database-type :- driver-api/schema.common.non-blank-string]
  (and (str/starts-with? database-type "\"")
       (str/ends-with? database-type "\"")))

(defmethod sql.qp/date [:postgres :day]
  [_ _ expr]
  (h2x/maybe-cast (h2x/database-type expr) (h2x/->date expr)))

(defmethod sql.qp/->honeysql [:postgres :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        timestamptz? (or (h2x/is-of-type? expr "timestamptz")
                         (h2x/is-of-type? expr "timestamp with time zone"))
        _            (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
        expr         [:timezone target-timezone (if (not timestamptz?)
                                                  [:timezone source-timezone expr]
                                                  expr)]]
    (h2x/with-database-type-info expr "timestamp")))

(defmethod sql.qp/->honeysql [:postgres :value]
  [driver value]
  (let [[_ raw-value {base-type :base_type, database-type :database_type}] value]
    (when (some? raw-value)
      (condp #(isa? %2 %1) base-type
        :type/IPAddress    (h2x/cast :inet raw-value)
        :type/PostgresEnum (if (quoted? database-type)
                             (h2x/cast database-type raw-value)
                             (h2x/quoted-cast database-type raw-value))
        ((get-method sql.qp/->honeysql [:sql-jdbc :value])
         driver value)))))

(defmethod sql.qp/->honeysql [:postgres :median]
  [driver [_ arg]]
  (sql.qp/->honeysql driver [:percentile arg 0.5]))

(defmethod sql.qp/datetime-diff [:postgres :year]
  [_driver _unit x y]
  (let [interval [:age (date-trunc :day y) (date-trunc :day x)]]
    (h2x/->integer (extract :year interval))))

(defmethod sql.qp/datetime-diff [:postgres :quarter]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:postgres :month]
  [_driver _unit x y]
  (let [interval           [:age (date-trunc :day y) (date-trunc :day x)]
        year-diff          (extract :year interval)
        month-of-year-diff (extract :month interval)]
    (h2x/->integer (h2x/+ month-of-year-diff (h2x/* year-diff 12)))))

(defmethod sql.qp/datetime-diff [:postgres :week]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :day x y) 7))

(defmethod sql.qp/datetime-diff [:postgres :day]
  [_driver _unit x y]
  (h2x/- (h2x/cast :DATE y) (h2x/cast :DATE x)))

(defmethod sql.qp/datetime-diff [:postgres :hour]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 3600))

(defmethod sql.qp/datetime-diff [:postgres :minute]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 60))

(defmethod sql.qp/datetime-diff [:postgres :second]
  [_driver _unit x y]
  (let [seconds (h2x/- (extract-from-timestamp :epoch y) (extract-from-timestamp :epoch x))]
    (h2x/->integer [:trunc seconds])))

(defmethod sql.qp/float-dbtype :postgres
  [_]
  "DOUBLE PRECISION")

(defn- format-regex-match-first [_fn [identifier pattern]]
  (let [[identifier-sql & identifier-args] (sql/format-expr identifier {:nested true})
        [pattern-sql & pattern-args]       (sql/format-expr pattern {:nested true})]
    (into [(format "substring(%s FROM %s)" identifier-sql pattern-sql)]
          cat
          [identifier-args
           pattern-args])))

(sql/register-fn! ::regex-match-first #'format-regex-match-first)

(defmethod sql.qp/->honeysql [:postgres :regex-match-first]
  [driver [_ arg pattern]]
  (let [identifier (sql.qp/->honeysql driver arg)]
    [::regex-match-first identifier pattern]))

(defmethod sql.qp/->honeysql [:postgres :split-part]
  [driver [_ text divider position]]
  (let [position (sql.qp/->honeysql driver position)]
    [:case
     [:< position 1]
     ""

     :else
     [:split_part (sql.qp/->honeysql driver text) (sql.qp/->honeysql driver divider) position]]))

(defmethod sql.qp/->honeysql [:postgres :text]
  [driver [_ value]]
  (h2x/maybe-cast "TEXT" (sql.qp/->honeysql driver value)))

(defn- format-pg-conversion [_fn [expr psql-type]]
  (let [[expr-sql & expr-args] (sql/format-expr expr {:nested true})]
    (into [(format "%s::%s" expr-sql (name psql-type))]
          expr-args)))

(sql/register-fn! ::pg-conversion #'format-pg-conversion)

(defn- pg-conversion
  "HoneySQL form that adds a Postgres-style `::` cast e.g. `expr::type`.

    (pg-conversion :my_field ::integer) -> HoneySQL -[Compile]-> \"my_field\"::integer"
  [expr psql-type]
  [::pg-conversion expr psql-type])

(defn- format-text-array
  "Create a Postgres text array literal from a sequence of elements. Used for the `::json-query` stuff
  below.

    (sql/format-expr [::text-array \"A\" 1 \"B\" 2])
    =>
    [\"array[?, 1, ?, 2]::text[]\" \"A\" \"B\"]"
  [_fn [& elements]]
  (let [elements (for [element elements]
                   (if (number? element)
                     [:inline element]
                     (name element)))
        sql-args (map #(sql/format-expr % {:nested true}) elements)
        sqls     (map first sql-args)
        args     (mapcat rest sql-args)]
    (into [(format "array[%s]::text[]" (str/join ", " sqls))]
          args)))

(sql/register-fn! ::text-array #'format-text-array)

(defn- format-json-query
  "e.g.

  ```clj
  [::json-query [::h2x/identifier :field [\"boop\" \"bleh\"]] \"bigint\" [\"meh\"]]
  =>
  [\"(boop.bleh#>> array[?]::text[])::bigint\" \"meh\"]
  ```"
  [_fn [parent-identifier field-type names]]
  (let [names-text-array                 (into [::text-array] names)
        [parent-id-sql & parent-id-args] (sql/format-expr parent-identifier {:nested true})
        [path-sql & path-args]           (sql/format-expr names-text-array {:nested true})]
    (into [(format "(%s#>> %s)::%s" parent-id-sql path-sql field-type)]
          cat
          [parent-id-args path-args])))

(sql/register-fn! ::json-query #'format-json-query)

(defmethod sql.qp/json-query :postgres
  [_driver unwrapped-identifier nfc-field]
  (assert (h2x/identifier? unwrapped-identifier)
          (format "Invalid identifier: %s" (pr-str unwrapped-identifier)))
  (let [field-type        (:database-type nfc-field)
        nfc-path          (:nfc-path nfc-field)
        parent-identifier (sql.qp.u/nfc-field->parent-identifier unwrapped-identifier nfc-field)]
    [::json-query parent-identifier field-type (rest nfc-path)]))

(defmethod sql.qp/->honeysql [:postgres :field]
  [driver [_ id-or-name opts :as clause]]
  (let [stored-field  (when (integer? id-or-name)
                        (driver-api/field (driver-api/metadata-provider) id-or-name))
        parent-method (get-method sql.qp/->honeysql [:sql :field])
        identifier    (parent-method driver clause)]
    (cond
      (= (:database-type stored-field) "money")
      (pg-conversion identifier :numeric)

      (driver-api/json-field? stored-field)
      (if (or (::sql.qp/forced-alias opts)
              (= (driver-api/qp.add.source-table opts) driver-api/qp.add.source))
        (keyword (driver-api/qp.add.source-alias opts))
        (walk/postwalk #(if (h2x/identifier? %)
                          (sql.qp/json-query :postgres % stored-field)
                          %)
                       identifier))

      :else
      identifier)))

;; Postgres is not happy with JSON fields which are in group-bys or order-bys
;; being described twice instead of using the alias.
;; Therefore, force the alias, but only for JSON fields to avoid ambiguity.
;; The alias names in JSON fields are unique wrt nfc path
(defmethod sql.qp/apply-top-level-clause
  [:postgres :breakout]
  [driver clause honeysql-form {breakout-fields :breakout, _fields-fields :fields :as query}]
  (let [stored-field-ids (map second breakout-fields)
        stored-fields    (map #(when (integer? %)
                                 (driver-api/field (driver-api/metadata-provider) %))
                              stored-field-ids)
        parent-method    (partial (get-method sql.qp/apply-top-level-clause [:sql :breakout])
                                  driver clause honeysql-form)
        qualified        (parent-method query)
        unqualified      (parent-method (update query
                                                :breakout
                                                #(sql.qp/rewrite-fields-to-force-using-column-aliases % {:is-breakout true})))]
    (if (some driver-api/json-field? stored-fields)
      (merge qualified
             (select-keys unqualified #{:group-by}))
      qualified)))

(defn- order-by-is-json-field?
  [clause]
  (let [is-aggregation? (= (-> clause (second) (first)) :aggregation)
        stored-field-id (-> clause (second) (second))
        stored-field    (when (and (not is-aggregation?) (integer? stored-field-id))
                          (driver-api/field (driver-api/metadata-provider) stored-field-id))]
    (and
     (some? stored-field)
     (driver-api/json-field? stored-field))))

(defmethod sql.qp/->honeysql [:postgres :desc]
  [driver clause]
  (let [new-clause (if (order-by-is-json-field? clause)
                     (sql.qp/rewrite-fields-to-force-using-column-aliases clause)
                     clause)]
    ((get-method sql.qp/->honeysql [:sql :desc]) driver new-clause)))

(defmethod sql.qp/->honeysql [:postgres :asc]
  [driver clause]
  (let [new-clause (if (order-by-is-json-field? clause)
                     (sql.qp/rewrite-fields-to-force-using-column-aliases clause)
                     clause)]
    ((get-method sql.qp/->honeysql [:sql :asc]) driver new-clause)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-base-types
  "Map of default Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:array         :type/*
   :bigint        :type/BigInteger
   :bigserial     :type/BigInteger
   :bit           :type/*
   :bool          :type/Boolean
   :boolean       :type/Boolean
   :box           :type/*
   :bpchar        :type/Text ; "blank-padded char" is the internal name of "character"
   :bytea         :type/*    ; byte array
   :cidr          :type/Structured ; IPv4/IPv6 network address
   :circle        :type/*
   :citext        :type/Text ; case-insensitive text
   :char          :type/Text
   :character     :type/Text
   :date          :type/Date
   :decimal       :type/Decimal
   :float4        :type/Float
   :float8        :type/Float
   :geometry      :type/*
   :inet          :type/IPAddress
   :int           :type/Integer
   :int2          :type/Integer
   :int4          :type/Integer
   :integer       :type/Integer
   :int8          :type/BigInteger
   :interval      :type/*               ; time span
   :json          :type/JSON
   :jsonb         :type/JSON
   :line          :type/*
   :lseg          :type/*
   :macaddr       :type/Structured
   :money         :type/Decimal
   :numeric       :type/Decimal
   :path          :type/*
   :pg_lsn        :type/Integer         ; PG Log Sequence #
   :point         :type/*
   :real          :type/Float
   :serial        :type/Integer
   :serial2       :type/Integer
   :serial4       :type/Integer
   :serial8       :type/BigInteger
   :smallint      :type/Integer
   :smallserial   :type/Integer
   :text          :type/Text
   :time          :type/Time
   :timetz        :type/TimeWithLocalTZ
   :timestamp     :type/DateTime
   :timestamptz   :type/DateTimeWithLocalTZ
   :tsquery       :type/*
   :tsvector      :type/*
   :txid_snapshot :type/*
   :uuid          :type/UUID
   :varbit        :type/*
   :varchar       :type/Text
   :xml           :type/Structured
   (keyword "bit varying")                :type/*
   (keyword "character varying")          :type/Text
   (keyword "double precision")           :type/Float
   (keyword "time with time zone")        :type/Time
   (keyword "time without time zone")     :type/Time
   ;; TODO postgres also supports `timestamp(p) with time zone` where p is the precision
   ;; maybe we should switch this to use `sql-jdbc.sync/pattern-based-database-type->base-type`
   (keyword "timestamp with time zone")    :type/DateTimeWithLocalTZ
   (keyword "timestamp without time zone") :type/DateTime})

(defmethod driver/dynamic-database-types-lookup :postgres
  [_driver database database-types]
  (when (seq database-types)
    (let [ts (enum-types database)]
      (not-empty
       (into {}
             (comp
              (filter ts)
              (map #(vector % :type/PostgresEnum)))
             database-types)))))

(defmethod sql-jdbc.sync/database-type->base-type :postgres
  [_driver database-type]
  (default-base-types database-type))

(defmethod sql-jdbc.sync/column->semantic-type :postgres
  [_driver database-type _column-name]
  ;; this is really, really simple right now.  if its postgres :json type then it's :type/SerializedJSON semantic-type
  (case database-type
    "json"  :type/SerializedJSON
    "jsonb" :type/SerializedJSON
    "xml"   :type/XML
    "inet"  :type/IPAddress
    nil))

(defn- pkcs-12-key-value?
  "If a value was uploaded for the SSL key, return whether it's using the PKCS-12 format."
  [ssl-key-value]
  (when ssl-key-value
    (= (second (re-find driver-api/uploaded-base-64-prefix-pattern ssl-key-value))
       "x-pkcs12")))

(defn- ssl-params
  "Builds the params to include in the JDBC connection spec for an SSL connection."
  [{:keys [ssl-key-value] :as db-details}]
  (-> (set/rename-keys db-details {:ssl-mode :sslmode})
      ;; if somehow there was no ssl-mode set, just make it required (preserves existing behavior)
      (cond-> (nil? (:ssl-mode db-details)) (assoc :sslmode "require"))
      (m/assoc-some :sslrootcert (driver-api/secret-value-as-file! :postgres db-details "ssl-root-cert"))
      (m/assoc-some :sslkey (driver-api/secret-value-as-file! :postgres db-details "ssl-key" (when (pkcs-12-key-value? ssl-key-value) ".p12")))
      (m/assoc-some :sslcert (driver-api/secret-value-as-file! :postgres db-details "ssl-client-cert"))
      ;; Pass an empty string as password if none is provided; otherwise the driver will prompt for one
      (assoc :sslpassword (or (driver-api/secret-value-as-string :postgres db-details "ssl-key-password") ""))

      (as-> params ;; from outer cond->
            (dissoc params :ssl-root-cert :ssl-root-cert-options :ssl-client-key :ssl-client-cert :ssl-key-password
                    :ssl-use-client-auth)
        (driver-api/clean-secret-properties-from-details params :postgres))))

(def ^:private disable-ssl-params
  "Params to include in the JDBC connection spec to disable SSL."
  {:sslmode "disable"})

(defmethod sql-jdbc.conn/connection-details->spec :postgres
  [_ {ssl? :ssl, :as details-map}]
  (let [props (-> details-map
                  (update :port (fn [port]
                                  (if (string? port)
                                    (Integer/parseInt port)
                                    port)))
                  ;; remove :ssl in case it's false; DB will still try (& fail) to connect if the key is there
                  (dissoc :ssl))
        props (if ssl?
                (let [ssl-prms (ssl-params details-map)]
                  ;; if the user happened to specify any of the SSL options directly, allow those to take
                  ;; precedence, but only if they match a key from our own
                  ;; our `ssl-params` function is also removing various internal properties, ex: for secret resolution,
                  ;; so we can't just merge the entire `props` map back in here because it will bring all those
                  ;; internal property values back; only merge in the ones the driver might recognize
                  (merge ssl-prms (select-keys props (keys ssl-prms))))
                (merge disable-ssl-params props))
        props (as-> props it
                (set/rename-keys it {:dbname :db})
                (driver-api/spec :postgres it)
                (sql-jdbc.common/handle-additional-options it details-map))]
    props))

(defmethod sql-jdbc.sync/excluded-schemas :postgres [_driver] #{"information_schema" "pg_catalog"})

(defmethod sql-jdbc.execute/set-timezone-sql :postgres
  [_]
  "SET SESSION TIMEZONE TO %s;")

;; for some reason postgres `TIMESTAMP WITH TIME ZONE` columns still come back as `Type/TIMESTAMP`, which seems like a
;; bug with the JDBC driver?
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/TIMESTAMP]
  [_ ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (let [^Class klass (if (= (u/lower-case-en (.getColumnTypeName rsmeta i)) "timestamptz")
                       OffsetDateTime
                       LocalDateTime)]
    (fn []
      (.getObject rs i klass))))

;; Sometimes Postgres times come back as strings like `07:23:18.331+00` (no minute in offset) and there's a bug in the
;; JDBC driver where it can't parse those correctly. We can do it ourselves in that case.
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/TIME]
  [driver ^ResultSet rs rsmeta ^Integer i]
  (let [parent-thunk ((get-method sql-jdbc.execute/read-column-thunk [:sql-jdbc Types/TIME]) driver rs rsmeta i)]
    (fn []
      (try
        (parent-thunk)
        (catch Throwable e
          (let [s (.getString rs i)]
            (log/tracef e "Error in Postgres JDBC driver reading TIME value, fetching as string '%s'" s)
            (u.date/parse s)))))))

;; The postgres JDBC driver cannot properly read MONEY columns — see https://github.com/pgjdbc/pgjdbc/issues/425. Work
;; around this by checking whether the column type name is `money`, and reading it out as a String and parsing to a
;; BigDecimal if so; otherwise, proceeding as normal
(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/DOUBLE]
  [_driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
  (if (= (.getColumnTypeName rsmeta i) "money")
    (fn []
      (some-> (.getString rs i) u/parse-currency))
    (fn []
      (.getObject rs i))))

(defmethod sql-jdbc.execute/read-column-thunk [:postgres Types/SQLXML]
  [_driver ^ResultSet rs ^ResultSetMetaData _rsmeta ^Integer i]
  (fn [] (.getString rs i)))

;; de-CLOB any CLOB values that come back
(defmethod sql-jdbc.execute/read-column-thunk :postgres
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (let [obj (.getObject rs i)]
      (cond (instance? org.postgresql.util.PGobject obj)
            (.getValue ^org.postgresql.util.PGobject obj)

            :else
            obj))))

;; Postgres doesn't support OffsetTime
(defmethod sql-jdbc.execute/set-parameter [:postgres OffsetTime]
  [driver prepared-statement i t]
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (sql-jdbc.execute/set-parameter driver prepared-statement i local-time)))

(defmethod sql-jdbc.execute/execute-prepared-statement! :postgres
  [driver stmt]
  (let [orig-method (get-method sql-jdbc.execute/execute-prepared-statement! :sql-jdbc)]
    (try
      (orig-method driver stmt)
      (catch Throwable e
        (if (re-find #"No value specified for parameter" (ex-message e))
          (throw (ex-info (tru "It looks like you have a ''?'' in your code which Postgres''s JDBC driver interprets as a parameter. You might need to escape it like ''??''.")
                          {:driver driver
                           :sql    (str stmt)
                           :type   driver-api/qp.error-type.invalid-query}))
          (throw e))))))

(defmethod driver/upload-type->database-type :postgres
  [_driver upload-type]
  (case upload-type
    :metabase.upload/varchar-255              [[:varchar 255]]
    :metabase.upload/text                     [:text]
    :metabase.upload/int                      [:bigint]
    :metabase.upload/auto-incrementing-int-pk [:bigserial]
    :metabase.upload/float                    [:float]
    :metabase.upload/boolean                  [:boolean]
    :metabase.upload/date                     [:date]
    :metabase.upload/datetime                 [:timestamp]
    :metabase.upload/offset-datetime          [:timestamp-with-time-zone]))

(defmethod driver/allowed-promotions :postgres
  [_driver]
  {:metabase.upload/int     #{:metabase.upload/float}
   :metabase.upload/boolean #{:metabase.upload/int
                              :metabase.upload/float}})

(defmethod driver/create-auto-pk-with-append-csv? :postgres
  [driver]
  (= driver :postgres))

(defn- alter-column-using-hsql-expr
  "In postgres some ALTER COLUMN statements generated by replacing or appending csv files
  will result in an error, e.g. boolean columns cannot be changed to bigint.

  This function returns a honey expr suitable for use with the USING keyword to tell postgres how to transform
  values of the old type to the new, to avoid an error.

  It returns nil if no such expression has been defined for the pair of types. In this case, the caller should
  generate the ALTER COLUMN statement without a USING."
  [column old-type new-type]
  (case [old-type new-type]

    [[:boolean] [:bigint]]
    [:case
     (quote-identifier column) 1
     :else 0]

    [[:boolean] [:float]]
    [:case
     (quote-identifier column) 1.0
     :else 0.0]

    nil))

(defmethod sql-jdbc.sync/alter-table-columns-sql :postgres
  [driver table-name column-definitions & {:keys [old-types]}]
  (with-quoting driver
    (-> {:alter-table  (keyword table-name)
         :alter-column (for [[column column-type] column-definitions
                             :let [old-type (get old-types column)]]
                         (let [base (list* (quote-identifier column)
                                           :type
                                           (if (string? column-type)
                                             [[:raw column-type]]
                                             column-type))]
                           (if-some [using (alter-column-using-hsql-expr column old-type column-type)]
                             (vec (concat base [:using using]))
                             (vec base))))}
        (sql/format
         :quoted  true
         :dialect (sql.qp/quote-style driver))
        first)))

(defmethod driver/table-name-length-limit :postgres
  [_driver]
  ;; https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS
  ;; This could be incorrect if Postgres has been compiled with a value for NAMEDATALEN other than the default (64), but
  ;; that seems unlikely and there's not an easy way to find out.
  63)

(defn- format-copy
  [_clause table]
  [(str "COPY " (sql/format-entity table))])

(sql/register-clause! ::copy format-copy :insert-into)

(defn- format-from-stdin
  [_clause delimiter]
  [(str "FROM STDIN NULL " delimiter)])

(sql/register-clause! ::from-stdin format-from-stdin :from)

(defn- sanitize-value
  ;; Per https://www.postgresql.org/docs/current/sql-copy.html#id-1.9.3.55.9.2
  ;; "Backslash characters (\) can be used in the COPY data to quote data characters that might otherwise be taken as
  ;; row or column delimiters. In particular, the following characters must be preceded by a backslash if they appear
  ;; as part of a column value: backslash itself, newline, carriage return, and the current delimiter character."
  [v]
  (if (string? v)
    (str/replace v #"\\|\n|\r|\t" {"\\" "\\\\"
                                   "\n" "\\n"
                                   "\r" "\\r"
                                   "\t" "\\t"})
    v))

(defn- row->tsv
  [row]
  (->> row
       (map sanitize-value)
       (str/join "\t")))

(defmethod driver/insert-into! :postgres
  [driver db-id table-name column-names values]
  (jdbc/with-db-transaction [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
    (let [copy-manager (CopyManager. (.unwrap ^Connection (:connection conn) PgConnection))
          dialect      (sql.qp/quote-style driver)
          [sql & _] (sql/format {::copy       (keyword table-name)
                                 :columns     (quote-columns driver column-names)
                                 ::from-stdin "''"}
                                :quoted true
                                :dialect dialect)
          ;; On Postgres with a large file, 100 (3.76m) was significantly faster than 50 (4.03m) and 25 (4.27m). 1,000 was a
          ;; little faster but not by much (3.63m), and 10,000 threw an error:
          ;;     PreparedStatement can have at most 65,535 parameters
          chunks (partition-all (or driver/*insert-chunk-rows* 1000) values)]
      (doseq [chunk chunks]
        (let [tsvs (->> chunk
                        (map row->tsv)
                        (str/join "\n")
                        (StringReader.))]
          (.copyIn copy-manager ^String sql tsvs))))))

(defmethod sql-jdbc.sync/current-user-table-privileges :postgres
  [_driver conn-spec & {:as _options}]
  ;; KNOWN LIMITATION: this won't return privileges for foreign tables, calling has_table_privilege on a foreign table
  ;; result in a operation not supported error
  (->> (jdbc/query
        conn-spec
        (str/join
         "\n"
         ["with table_privileges as ("
          " select"
          "   NULL as role,"
          "   t.schemaname as schema,"
          "   t.objectname as table,"
          "   pg_catalog.has_any_column_privilege(current_user, '\"' || replace(t.schemaname, '\"', '\"\"') || '\"' || '.' || '\"' || replace(t.objectname, '\"', '\"\"') || '\"',  'update') as update,"
          "   pg_catalog.has_any_column_privilege(current_user, '\"' || replace(t.schemaname, '\"', '\"\"') || '\"' || '.' || '\"' || replace(t.objectname, '\"', '\"\"') || '\"',  'select') as select,"
          "   pg_catalog.has_any_column_privilege(current_user, '\"' || replace(t.schemaname, '\"', '\"\"') || '\"' || '.' || '\"' || replace(t.objectname, '\"', '\"\"') || '\"',  'insert') as insert,"
          "   pg_catalog.has_table_privilege(     current_user, '\"' || replace(t.schemaname, '\"', '\"\"') || '\"' || '.' || '\"' || replace(t.objectname, '\"', '\"\"') || '\"',  'delete') as delete"
          " from ("
          "   select schemaname, tablename as objectname from pg_catalog.pg_tables"
          "   union"
          "   select schemaname, viewname as objectname from pg_catalog.pg_views"
          "   union"
          "   select schemaname, matviewname as objectname from pg_catalog.pg_matviews"
          " ) t"
          " where t.schemaname !~ '^pg_'"
          "   and t.schemaname <> 'information_schema'"
          "   and pg_catalog.has_schema_privilege(current_user, t.schemaname, 'usage')"
          ")"
          "select t.*"
          "from table_privileges t"]))
       (filter #(or (:select %) (:update %) (:delete %) (:insert %)))))

;;; ------------------------------------------------- User Impersonation --------------------------------------------------

(defmethod driver.sql/set-role-statement :postgres
  [_ role]
  (let [special-chars-pattern #"[^a-zA-Z0-9_]"
        needs-quote           (re-find special-chars-pattern role)]
    (if needs-quote
      (format "SET ROLE \"%s\";" role)
      (format "SET ROLE %s;" role))))

(defmethod driver.sql/default-database-role :postgres
  [_ _]
  "NONE")

(defmethod sql-jdbc/impl-query-canceled? :postgres [_ e]
  ;; ok to hardcode driver name here because this function only supports app DB types
  (driver-api/query-canceled-exception? :postgres e))

(defmethod sql-jdbc/impl-table-known-to-not-exist? :postgres
  [_ e]
  (= (sql-jdbc/get-sql-state e) "42P01"))
