(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.query-processor.util.relative-datetime :as qp.relative-datetime]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log])
  (:import
   (com.amazon.redshift.util RedshiftInterval)
   (java.sql Connection PreparedStatement ResultSet ResultSetMetaData Types)
   (java.time OffsetTime)))

(set! *warn-on-reflection* true)

(driver/register! :redshift, :parent #{:postgres ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(doseq [[feature supported?] {:connection-impersonation                            true
                              :describe-fields                                     true
                              :describe-fks                                        true
                              :nested-field-columns                                false
                              :sql/window-functions.order-by-output-column-numbers false
                              :test/jvm-timezone-setting                           false}]
  (defmethod driver/database-supports? [:redshift feature] [_driver _feat _db] supported?))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; don't use the Postgres implementation for `describe-table` since it tries to fetch enums which Redshift doesn't
;; support
(defmethod driver/describe-table :redshift
  [& args]
  (apply (get-method driver/describe-table :sql-jdbc) args))

;; don't use the Postgres implementation for `describe-database` as it uses a custom SQL to get the tables.
;; we should do the same for Redshift tho
(defmethod driver/describe-database :redshift
 [& args]
 (apply (get-method driver/describe-database :sql-jdbc) args))

(defmethod sql-jdbc.sync/describe-fks-sql :redshift
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

(defmethod sql-jdbc.sync/describe-fields-sql :redshift
  ;; The implementation is based on `getColumns` in https://github.com/aws/amazon-redshift-jdbc-driver/blob/master/src/main/java/com/amazon/redshift/jdbc/RedshiftDatabaseMetaData.java
  ;; The `database-is-auto-increment` and `database-required` columns are currently missing because they are only
  ;; needed for actions, which redshift doesn't support yet.
  [driver & {:keys [schema-names table-names]}]
  (sql/format {:select [[:c.column_name :name]
                        [:c.data_type :database-type]
                        [[:- :c.ordinal_position 1] :database-position]
                        [:c.schema_name :table-schema]
                        [:c.table_name :table-name]
                        [[:not= :pk.column_name nil] :pk?]
                        [[:case [:not= :c.remarks ""] :c.remarks :else nil] :field-comment]]
               :from [[:svv_all_columns :c]]
               :left-join [[{:select [:tc.table_schema
                                      :tc.table_name
                                      :kc.column_name]
                             :from [[:information_schema.table_constraints :tc]]
                             :join [[:information_schema.key_column_usage :kc]
                                    [:and
                                     [:= :tc.constraint_name :kc.constraint_name]
                                     [:= :tc.table_schema :kc.table_schema]
                                     [:= :tc.table_name :kc.table_name]]]
                             :where [:= :tc.constraint_type "PRIMARY KEY"]}
                            :pk]
                           [:and
                            [:= :c.schema_name :pk.table_schema]
                            [:= :c.table_name :pk.table_name]
                            [:= :c.column_name :pk.column_name]]]
               :where [:and
                       [:raw "c.schema_name !~ '^information_schema|catalog_history|pg_'"]
                       (when schema-names [:in :c.schema_name schema-names])
                       (when table-names [:in :c.table_name table-names])]
               :order-by [:table-schema :table-name :database-position]}
              :dialect (sql.qp/quote-style driver)))

(defmethod driver/db-start-of-week :redshift
  [_]
  :sunday)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; custom Redshift type handling

(def ^:private database-type->base-type
  (some-fn (sql-jdbc.sync/pattern-based-database-type->base-type
            [[#"(?i)CHARACTER VARYING" :type/Text]       ; Redshift uses CHARACTER VARYING (N) as a synonym for VARCHAR(N)
             [#"(?i)NUMERIC"           :type/Decimal]])  ; and also has a NUMERIC(P,S) type, which is the same as DECIMAL(P,S)
           {:super       :type/*    ; (requested support in metabase#36642)
            :varbyte     :type/*    ; represents variable-length binary strings
            :geometry    :type/*    ; spatial data
            :geography   :type/*    ; spatial data
            :intervaly2m :type/*    ; interval literal
            :intervald2s :type/*})) ; interval literal

(defmethod sql-jdbc.sync/database-type->base-type :redshift
  [driver column-type]
  (or (database-type->base-type column-type)
      ((get-method sql-jdbc.sync/database-type->base-type :postgres) driver column-type)))

(defmethod sql.qp/add-interval-honeysql-form :redshift
  [_ hsql-form amount unit]
  (let [hsql-form (h2x/->timestamp hsql-form)]
    (-> [:dateadd (h2x/literal unit) amount hsql-form]
        (h2x/with-type-info (h2x/type-info hsql-form)))))

(defmethod sql.qp/unix-timestamp->honeysql [:redshift :seconds]
  [_ _ expr]
  (h2x/+ [:raw "TIMESTAMP '1970-01-01T00:00:00Z'"]
         (h2x/* expr
                [:raw "INTERVAL '1 second'"])))

(defmethod sql.qp/current-datetime-honeysql-form :redshift
  [_]
  :%getdate)

(defmethod sql-jdbc.execute/set-timezone-sql :redshift
  [_]
  "SET TIMEZONE TO %s;")

;; This impl is basically the same as the default impl in [[metabase.driver.sql-jdbc.execute]], but doesn't attempt to
;; make the connection read-only, because that seems to be causing problems for people
(defmethod sql-jdbc.execute/do-with-connection-with-options :redshift
  [driver db-or-id-or-spec {:keys [^String session-timezone], :as options} f]
  (sql-jdbc.execute/do-with-resolved-connection
   driver
   db-or-id-or-spec
   options
   (fn [^Connection conn]
     (when-not (sql-jdbc.execute/recursive-connection?)
       (sql-jdbc.execute/set-best-transaction-level! driver conn)
       (sql-jdbc.execute/set-time-zone-if-supported! driver conn session-timezone)
       (sql-jdbc.execute/set-role-if-supported! driver conn (cond (integer? db-or-id-or-spec) (qp.store/with-metadata-provider db-or-id-or-spec
                                                                                               (lib.metadata/database (qp.store/metadata-provider)))
                                                               (u/id db-or-id-or-spec)     db-or-id-or-spec))
       (try
         (.setHoldability conn ResultSet/CLOSE_CURSORS_AT_COMMIT)
         (catch Throwable e
           (log/debug e "Error setting default holdability for connection"))))
     (f conn))))

(defn- prepare-statement ^PreparedStatement [^Connection conn sql]
  (.prepareStatement conn
                     sql
                     ResultSet/TYPE_FORWARD_ONLY
                     ResultSet/CONCUR_READ_ONLY
                     ResultSet/CLOSE_CURSORS_AT_COMMIT))

(defn- quote-literal-for-connection
  "Quotes a string literal so that it can be safely inserted into Redshift queries, by returning the result of invoking
  the Redshift QUOTE_LITERAL function on the given string (which is set in a PreparedStatement as a parameter)."
  [^Connection conn ^String s]
  (with-open [stmt (doto (prepare-statement conn "SELECT QUOTE_LITERAL(?);")
                     (.setString 1 s))
              rs   (.executeQuery stmt)]
    (when (.next rs)
      (.getString rs 1))))

(defn- quote-literal-for-database
  "This function invokes quote-literal-for-connection with a connection for the given database. See its docstring for
  more detail."
  [driver database s]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   database
   nil
   (fn [conn]
     (quote-literal-for-connection conn s))))

(defmethod sql.qp/->honeysql [:redshift :regex-match-first]
  [driver [_ arg pattern]]
  [:regexp_substr
   (sql.qp/->honeysql driver arg)
   ;; the parameter to REGEXP_SUBSTR can only be a string literal; neither prepared statement parameters nor encoding/
   ;; decoding functions seem to work (fails with java.sql.SQLExcecption: "The pattern must be a valid UTF-8 literal
   ;; character expression"), hence we will use a different function to safely escape it before splicing here
   [:raw (quote-literal-for-database driver (lib.metadata/database (qp.store/metadata-provider)) pattern)]])

(defmethod sql.qp/->honeysql [:redshift :replace]
  [driver [_ arg pattern replacement]]
  [:replace
   (sql.qp/->honeysql driver arg)
   (sql.qp/->honeysql driver pattern)
   (sql.qp/->honeysql driver replacement)])

(defmethod sql.qp/->honeysql [:redshift :concat]
  [driver [_ & args]]
  ;; concat() only takes 2 args, so generate multiple concats if we have more,
  ;; e.g. [:concat :x :y :z] => [:concat [:concat :x :y] :z] => concat(concat(x, y), z)
  (->> args
       (map (partial sql.qp/->honeysql driver))
       (reduce (fn [x y]
                 (if x
                   [:concat x y]
                   y))
               nil)))

(defn- extract [unit temporal]
  [::h2x/extract (format "'%s'" (name unit)) temporal])

(defn- datediff [unit x y]
  [:datediff [:raw (name unit)] x y])

(defmethod sql.qp/->honeysql [:redshift :datetime-diff]
  [driver [_ x y unit]]
  (let [x (sql.qp/->honeysql driver x)
        y (sql.qp/->honeysql driver y)
        _ (sql.qp/datetime-diff-check-args x y (partial re-find #"(?i)^(timestamp|date)"))
        ;; unlike postgres, we need to make sure the values are timestamps before we
        ;; can do the calculation. otherwise, we'll get an error like
        ;; ERROR: function pg_catalog.date_diff("unknown", ..., ...) does not exist
        x (h2x/->timestamp x)
        y (h2x/->timestamp y)]
    (sql.qp/datetime-diff driver unit x y)))

(defmethod sql.qp/->honeysql [:redshift :relative-datetime]
  [driver [_ amount unit]]
  (qp.relative-datetime/maybe-cacheable-relative-datetime-honeysql driver unit amount))

(defmethod sql.qp/datetime-diff [:redshift :year]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 12))

(defmethod sql.qp/datetime-diff [:redshift :quarter]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :month x y) 3))

(defmethod sql.qp/datetime-diff [:redshift :month]
  [_driver _unit x y]
  (h2x/+ (datediff :month x y)
         ;; redshift's datediff counts month boundaries not whole months, so we need to adjust
         [:case
          ;; if x<y but x>y in the month calendar then subtract one month
          [:and
           [:< x y]
           [:> (extract :day x) (extract :day y)]]
          [:inline -1]

          ;; if x>y but x<y in the month calendar then add one month
          [:and
           [:> x y]
           [:< (extract :day x) (extract :day y)]]
          [:inline 1]

          :else
          [:inline 0]]))

(defmethod sql.qp/datetime-diff [:redshift :week]
  [_driver _unit x y]
  (h2x// (datediff :day x y) 7))

(defmethod sql.qp/datetime-diff [:redshift :day]
  [_driver _unit x y]
  (datediff :day x y))

(defmethod sql.qp/datetime-diff [:redshift :hour]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 3600))

(defmethod sql.qp/datetime-diff [:redshift :minute]
  [driver _unit x y]
  (h2x// (sql.qp/datetime-diff driver :second x y) 60))

(defmethod sql.qp/datetime-diff [:redshift :second]
  [_driver _unit x y]
  (h2x/- (extract :epoch y) (extract :epoch x)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod sql-jdbc.conn/connection-details->spec :redshift
  [_ {:keys [host port db], :as opts}]
  (sql-jdbc.common/handle-additional-options
   (merge
    {:classname                     "com.amazon.redshift.jdbc42.Driver"
     :subprotocol                   "redshift"
     :subname                       (str "//" host ":" port "/" db)
     :ssl                           true
     :OpenSourceSubProtocolOverride false}
    (dissoc opts :host :port :db))))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set Types/TIMESTAMP]
 [:postgres Types/TIMESTAMP])

(defmethod sql-jdbc.execute/read-column-thunk
 [:redshift Types/OTHER]
 [driver ^ResultSet rs ^ResultSetMetaData rsmeta ^Integer i]
 (if (= "interval" (.getColumnTypeName rsmeta i))
   #(.getValue ^RedshiftInterval (.getObject rs i RedshiftInterval))
   ((get-method sql-jdbc.execute/read-column-thunk [:postgres (.getColumnType rsmeta i)]) driver rs rsmeta i)))

(prefer-method
 sql-jdbc.execute/read-column-thunk
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set Types/TIME]
 [:postgres Types/TIME])

(prefer-method
 sql-jdbc.execute/set-parameter
 [::sql-jdbc.legacy/use-legacy-classes-for-read-and-set OffsetTime]
 [:postgres OffsetTime])

(defn- field->parameter-value
  "Map fields used in parameters to parameter `:value`s."
  [{:keys [user-parameters]}]
  (into {}
        (keep (fn [param]
                (if (contains? param :name)
                  [(:name param) (:value param)]

                  (when-let [field-id (lib.util.match/match-one param
                                        [:field (field-id :guard integer?) _]
                                        (when (contains? (set &parents) :dimension)
                                          field-id))]
                    [(:name (lib.metadata/field (qp.store/metadata-provider) field-id))
                     (:value param)]))))
        user-parameters))

(defmethod qp.util/query->remark :redshift
  [_ {{:keys [executed-by card-id dashboard-id]} :info, :as query}]
  (str "/* partner: \"metabase\", "
       (json/generate-string {:dashboard_id        dashboard-id
                              :chart_id            card-id
                              :optional_user_id    executed-by
                              :optional_account_id (public-settings/site-uuid)
                              :filter_values       (field->parameter-value query)})
       " */ "
       (qp.util/default-query->remark query)))

(defn- reducible-schemas-with-usage-permissions
  "Takes something `reducible` that returns a collection of string schema names (e.g. an `Eduction`) and returns an
  `IReduceInit` that filters out schemas for which the DB user has no schema privileges."
  [^Connection conn reducible]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [stmt (prepare-statement conn "SELECT HAS_SCHEMA_PRIVILEGE(?, 'USAGE');")]
        (reduce
         rf
         init
         (eduction
          (filter (fn [^String table-schema]
                    (try
                      (with-open [rs (.executeQuery (doto stmt (.setString 1 table-schema)))]
                        (let [has-perm? (and (.next rs)
                                             (.getBoolean rs 1))]
                          (or has-perm?
                              (log/tracef "Ignoring schema %s because no USAGE privilege on it" table-schema))))
                      (catch Throwable e
                        (log/error e "Error checking schema permissions")
                        false))))
          reducible))))))

(defmethod sql-jdbc.sync/filtered-syncable-schemas :redshift
  [driver conn metadata schema-inclusion-patterns schema-exclusion-patterns]
  (let [parent-method (get-method sql-jdbc.sync/filtered-syncable-schemas :sql-jdbc)]
    (reducible-schemas-with-usage-permissions conn (parent-method driver
                                                                  conn
                                                                  metadata
                                                                  schema-inclusion-patterns
                                                                  schema-exclusion-patterns))))

(defmethod sql-jdbc.execute/set-parameter [:redshift java.time.ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC")))))

(defmethod driver/upload-type->database-type :redshift
  [_driver upload-type]
  (case upload-type
    ::upload/varchar-255              [[:varchar 255]]
    ::upload/text                     [:text]
    ::upload/int                      [:bigint]
    ;; identity(1, 1) defines an auto-increment column starting from 1
    ::upload/auto-incrementing-int-pk [:bigint [:identity 1 1]]
    ::upload/float                    [:float]
    ::upload/boolean                  [:boolean]
    ::upload/date                     [:date]
    ::upload/datetime                 [:timestamp]
    ::upload/offset-datetime          [:timestamp-with-time-zone]))

(defmethod driver/table-name-length-limit :redshift
  [_driver]
  ;; https://docs.aws.amazon.com/redshift/latest/dg/r_names.html
  127)

(defmethod driver/insert-into! :redshift
  [driver db-id table-name column-names values]
  ((get-method driver/insert-into! :sql-jdbc) driver db-id table-name column-names values))

(defmethod sql-jdbc.sync/current-user-table-privileges :redshift
  [_driver conn-spec & {:as _options}]
  ;; KNOWN LIMITATION: this won't return privileges for external tables, calling has_table_privilege on an external table
  ;; result in an operation not supported error
  (->> (jdbc/query
        conn-spec
        (str/join
         "\n"
         ["with table_privileges as ("
          " select"
          "   NULL as role,"
          "   t.schemaname as schema,"
          "   t.objectname as table,"
          ;; if `has_table_privilege` is true `has_any_column_privilege` is false and vice versa, so we have to check both.
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\".\"' || t.objectname || '\"',  'SELECT')"
          "     OR pg_catalog.has_any_column_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'SELECT') as select,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'UPDATE')"
          "     OR pg_catalog.has_any_column_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'UPDATE') as update,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'INSERT') as insert,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'DELETE') as delete"
          " from ("
          "   select schemaname, tablename as objectname from pg_catalog.pg_tables"
          "   union"
          "   select schemaname, viewname as objectname from pg_views"
          " ) t"
          " where t.schemaname !~ '^pg_'"
          "   and t.schemaname <> 'information_schema'"
          "   and pg_catalog.has_schema_privilege(current_user, t.schemaname, 'USAGE')"
          ")"
          "select t.*"
          "from table_privileges t"]))
       (filter #(or (:select %) (:update %) (:delete %) (:update %)))))


;;; ----------------------------------------------- Connection Impersonation ------------------------------------------

(defmethod driver.sql/set-role-statement :redshift
  [_ role]
  (let [special-chars-pattern #"[^a-zA-Z0-9_]"
        needs-quote           (re-find special-chars-pattern role)]
    (if needs-quote
      (format "SET SESSION AUTHORIZATION \"%s\";" role)
      (format "SET SESSION AUTHORIZATION %s;" role))))

(defmethod driver.sql/default-database-role :redshift
  [_ _]
  "DEFAULT")
