(ns metabase.driver.redshift
  "Amazon Redshift Driver."
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.execute.legacy-impl :as sql-jdbc.legacy]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table
    :as sql-jdbc.describe-table]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mbql.util :as mbql.u]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log])
  (:import
   (com.amazon.redshift.util RedshiftInterval)
   (java.sql Connection PreparedStatement ResultSet ResultSetMetaData Types)
   (java.time OffsetTime)))

(set! *warn-on-reflection* true)

(driver/register! :redshift, :parent #{:postgres ::sql-jdbc.legacy/use-legacy-classes-for-read-and-set})

(doseq [[feature supported?] {:test/jvm-timezone-setting false
                              :nested-field-columns      false}]
  (defmethod driver/database-supports? [:redshift feature] [_driver _feat _db] supported?))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             metabase.driver impls                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; don't use the Postgres implementation for `describe-table` since it tries to fetch enums which Redshift doesn't
;; support
(defmethod driver/describe-table :redshift
  [& args]
  (apply (get-method driver/describe-table :sql-jdbc) args))

;; The Postgres JDBC .getImportedKeys method doesn't work for Redshift, and we're not allowed to access
;; information_schema.constraint_column_usage, so we'll have to use this custom query instead
;;
;; See also: [Related Postgres JDBC driver issue on GitHub](https://github.com/pgjdbc/pgjdbc/issues/79)
;;           [How to access the equivalent of information_schema.constraint_column_usage in Redshift](https://forums.aws.amazon.com/thread.jspa?threadID=133514)
(def ^:private fk-query
  "SELECT source_column.attname AS \"fk-column-name\",
          dest_table.relname    AS \"dest-table-name\",
          dest_table_ns.nspname AS \"dest-table-schema\",
          dest_column.attname   AS \"dest-column-name\"
   FROM pg_constraint c
          JOIN pg_namespace n             ON c.connamespace          = n.oid
          JOIN pg_class source_table      ON c.conrelid              = source_table.oid
          JOIN pg_attribute source_column ON c.conrelid              = source_column.attrelid
          JOIN pg_class dest_table        ON c.confrelid             = dest_table.oid
          JOIN pg_namespace dest_table_ns ON dest_table.relnamespace = dest_table_ns.oid
          JOIN pg_attribute dest_column   ON c.confrelid             = dest_column.attrelid
   WHERE c.contype                 = 'f'::char
          AND source_table.relname = ?
          AND n.nspname            = ?
          AND source_column.attnum = ANY(c.conkey)
          AND dest_column.attnum   = ANY(c.confkey)")

(defmethod driver/describe-table-fks :redshift
  [_ database table]
  (set (for [fk (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                            [fk-query (:name table) (:schema table)])]
         {:fk-column-name   (:fk-column-name fk)
          :dest-table       {:name   (:dest-table-name fk)
                             :schema (:dest-table-schema fk)}
          :dest-column-name (:dest-column-name fk)})))

(defmethod driver/db-start-of-week :redshift
  [_]
  :sunday)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

;; custom Redshift type handling

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"(?i)CHARACTER VARYING" :type/Text]       ; Redshift uses CHARACTER VARYING (N) as a synonym for VARCHAR(N)
    [#"(?i)NUMERIC"           :type/Decimal]])) ; and also has a NUMERIC(P,S) type, which is the same as DECIMAL(P,S)

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
       (try
         (.setHoldability conn ResultSet/CLOSE_CURSORS_AT_COMMIT)
         (catch Throwable e
           (log/debug e (trs "Error setting default holdability for connection")))))
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

(defn- use-server-side-relative-datetime?
  "Server side generated timestamp in :relative-datetime should be used with following units. Units gt or eq to :day."
  [unit]
  (contains? #{:day :week :month :quarter :year} unit))

(defn- server-side-relative-datetime-honeysql-form
  "Compute `:relative-datetime` clause value server-side. Value is sql formatted (and not passed as date time) to avoid
   jdbc driver's timezone adjustments. Use of `qp.timezone/now` ensures correct timezone is used for the calculation.
   For details see the [[metabase.driver.redshift-test/server-side-relative-datetime-truncation-test]]."
  [amount unit]
  [:cast
   (-> (qp.timezone/now)
       (u.date/truncate unit)
       (u.date/add unit amount)
       (u.date/format-sql))
   :timestamp])

(defmethod sql.qp/->honeysql [:redshift :relative-datetime]
  [driver [_ amount unit]]
  (if (use-server-side-relative-datetime? unit)
    (server-side-relative-datetime-honeysql-form amount unit)
    (let [now-hsql (sql.qp/current-datetime-honeysql-form driver)]
      (sql.qp/date driver unit (if (zero? amount)
                                 now-hsql
                                 (sql.qp/add-interval-honeysql-form driver now-hsql amount unit))))))

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

                  (when-let [field-id (mbql.u/match-one param
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
                        (log/error e (trs "Error checking schema permissions"))
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

(defmethod sql-jdbc.describe-table/describe-table-fields :redshift
  [driver conn {schema :schema, table-name :name :as table} db-name-or-nil]
  (let [parent-method (get-method sql-jdbc.describe-table/describe-table-fields :sql-jdbc)]
    (try (parent-method driver conn table db-name-or-nil)
         (catch Exception e
           (log/error e (trs "Error fetching field metadata for table {0}" table-name))
           ;; Use the fallback method (a SELECT * query) if the JDBC driver throws an exception (#21215)
           (into
            #{}
            (sql-jdbc.describe-table/describe-table-fields-xf driver table)
            (sql-jdbc.describe-table/fallback-fields-metadata-from-select-query driver conn db-name-or-nil schema table-name))))))

(defmethod sql-jdbc.execute/set-parameter [:redshift java.time.ZonedDateTime]
  [driver ps i t]
  (sql-jdbc.execute/set-parameter driver ps i (t/sql-timestamp (t/with-zone-same-instant t (t/zone-id "UTC")))))
