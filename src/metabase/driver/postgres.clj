(ns metabase.driver.postgres
  "Database driver for PostgreSQL databases. Builds on top of the SQL JDBC driver, which implements most functionality
  for JDBC-based drivers."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase.db.spec :as mdb.spec]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.postgres.actions :as postgres.actions]
   [metabase.driver.postgres.ddl :as postgres.ddl]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.sql.util.unprepare :as unprepare]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.models.secret :as secret]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.io StringReader)
   (java.sql Connection ResultSet ResultSetMetaData Time Types)
   (java.time LocalDateTime OffsetDateTime OffsetTime)
   (java.util Date UUID)
   (org.postgresql.copy CopyManager)
   (org.postgresql.jdbc PgConnection)))

(set! *warn-on-reflection* true)

(comment
  ;; method impls live in these namespaces.
  postgres.actions/keep-me
  postgres.ddl/keep-me)

(driver/register! :postgres, :parent :sql-jdbc)

(defmethod driver/display-name :postgres [_] "PostgreSQL")

;; Features that are supported by Postgres and all of its child drivers like Redshift
(doseq [[feature supported?] {:convert-timezone         true
                              :datetime-diff            true
                              :now                      true
                              :persist-models           true
                              :table-privileges         true
                              :schemas                  true
                              :connection-impersonation true}]
  (defmethod driver/database-supports? [:postgres feature] [_driver _feature _db] supported?))

(defmethod driver/database-supports? [:postgres :nested-field-columns]
  [_driver _feat db]
  (driver.common/json-unfolding-default db))

;; Features that are supported by postgres only
(doseq [feature [:actions
                 :actions/custom
                 :uploads
                 :index-info]]
  (defmethod driver/database-supports? [:postgres feature]
    [driver _feat _db]
    (= driver :postgres)))

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
    driver.common/default-password-details
    driver.common/cloud-ip-address-info
    {:name "schema-filters"
     :type :schema-filters
     :display-name "Schemas"}
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
   (map u/one-or-many)
   (apply concat)))

(defmethod driver/db-start-of-week :postgres
  [_]
  :monday)

(defn- get-typenames [{:keys [nspname typname]}]
  (cond-> [typname]
    (not= nspname "public") (conj (format "\"%s\".\"%s\"" nspname typname))))

(defn- enum-types [_driver database]
  (into #{}
        (comp (mapcat get-typenames)
              (map keyword))
        (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec database)
                    [(str "SELECT nspname, typname "
                          "FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace "
                          "WHERE t.oid IN (SELECT DISTINCT enumtypid FROM pg_enum e)")])))

(def ^:private ^:dynamic *enum-types* nil)

;; Describe the Fields present in a `table`. This just hands off to the normal SQL driver implementation of the same
;; name, but first fetches database enum types so we have access to them. These are simply binded to the dynamic var
;; and used later in `database-type->base-type`, which you will find below.
(defmethod driver/describe-table :postgres
  [driver database table]
  (binding [*enum-types* (enum-types driver database)]
    (sql-jdbc.sync/describe-table driver database table)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           metabase.driver.sql impls                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ->timestamp [honeysql-form]
  (h2x/cast-unless-type-in "timestamp" #{"timestamp" "timestamptz" "date"} honeysql-form))

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
  (if (= unit :quarter)
    (recur driver hsql-form (* 3 amount) :month)
    (let [hsql-form (->timestamp hsql-form)]
      (-> (h2x/+ hsql-form (interval amount unit))
          (h2x/with-type-info (h2x/type-info hsql-form))))))

(defmethod sql.qp/current-datetime-honeysql-form :postgres
  [_driver]
  (h2x/with-database-type-info :%now "timestamptz"))

(defmethod sql.qp/unix-timestamp->honeysql [:postgres :seconds]
  [_ _ expr]
  [:to_timestamp expr])

(defmethod sql.qp/cast-temporal-string [:postgres :Coercion/YYYYMMDDHHMMSSString->Temporal]
  [_driver _coercion-strategy expr]
  [:to_timestamp expr (h2x/literal "YYYYMMDDHH24MISS")])

(defmethod sql.qp/cast-temporal-byte [:postgres :Coercion/YYYYMMDDHHMMSSBytes->Temporal]
  [driver _coercion-strategy expr]
  (sql.qp/cast-temporal-string driver :Coercion/YYYYMMDDHHMMSSString->Temporal
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

(mu/defn ^:private date-trunc
  [unit :- ::lib.schema.temporal-bucketing/unit.date-time.truncate
   expr]
  (condp = (h2x/database-type expr)
    ;; apparently there is no convenient way to truncate a TIME column in Postgres, you can try to use `date_trunc`
    ;; but it returns an interval (??) and other insane things. This seems to be slightly less insane.
    "time"
    (time-trunc unit expr)

    "timetz"
    (h2x/cast "timetz" (time-trunc unit expr))

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
(defmethod sql.qp/date [:postgres :day]              [_ _ expr] (h2x/->date expr))
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

(mu/defn ^:private quoted? [database-type :- ::lib.schema.common/non-blank-string]
  (and (str/starts-with? database-type "\"")
       (str/ends-with? database-type "\"")))

(defmethod sql.qp/->honeysql [:postgres :convert-timezone]
  [driver [_ arg target-timezone source-timezone]]
  (let [expr         (sql.qp/->honeysql driver (cond-> arg
                                                 (string? arg) u.date/parse))
        timestamptz? (h2x/is-of-type? expr "timestamptz")
        _            (sql.u/validate-convert-timezone-args timestamptz? target-timezone source-timezone)
        expr         [:timezone target-timezone (if (not timestamptz?)
                                                  [:timezone source-timezone expr]
                                                  expr)]]
    (h2x/with-database-type-info expr "timestamp")))

(defmethod sql.qp/->honeysql [:postgres :value]
  [driver value]
  (let [[_ value {base-type :base_type, database-type :database_type}] value]
    (when (some? value)
      (condp #(isa? %2 %1) base-type
        :type/UUID         (when (not= "" value) ; support is-empty/non-empty checks
                             (UUID/fromString  value))
        :type/IPAddress    (h2x/cast :inet value)
        :type/PostgresEnum (if (quoted? database-type)
                             (h2x/cast database-type value)
                             (h2x/quoted-cast database-type value))
        (sql.qp/->honeysql driver value)))))

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
  (let [interval (h2x/- (date-trunc :day y) (date-trunc :day x))]
    (h2x/->integer (extract :day interval))))

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

(defmethod sql.qp/->honeysql [:postgres Time]
  [_ time-value]
  (h2x/->time time-value))

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
                        (lib.metadata/field (qp.store/metadata-provider) id-or-name))
        parent-method (get-method sql.qp/->honeysql [:sql :field])
        identifier    (parent-method driver clause)]
    (cond
      (= (:database-type stored-field) "money")
      (pg-conversion identifier :numeric)

      (lib.field/json-field? stored-field)
      (if (or (::sql.qp/forced-alias opts)
              (= (::add/source-table opts) ::add/source))
        (keyword (::add/source-alias opts))
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
                                 (lib.metadata/field (qp.store/metadata-provider) %))
                              stored-field-ids)
        parent-method    (partial (get-method sql.qp/apply-top-level-clause [:sql :breakout])
                                  driver clause honeysql-form)
        qualified        (parent-method query)
        unqualified      (parent-method (update query
                                                :breakout
                                                #(sql.qp/rewrite-fields-to-force-using-column-aliases % {:is-breakout true})))]
    (if (some lib.field/json-field? stored-fields)
      (merge qualified
             (select-keys unqualified #{:group-by}))
      qualified)))

(defn- order-by-is-json-field?
  [clause]
  (let [is-aggregation? (= (-> clause (second) (first)) :aggregation)
        stored-field-id (-> clause (second) (second))
        stored-field    (when (and (not is-aggregation?) (integer? stored-field-id))
                          (lib.metadata/field (qp.store/metadata-provider) stored-field-id))]
    (and
      (some? stored-field)
      (lib.field/json-field? stored-field))))

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

(defmethod unprepare/unprepare-value [:postgres Date]
  [_ value]
  (format "'%s'::timestamp" (u.date/format value)))

(prefer-method unprepare/unprepare-value [:sql Time] [:postgres Date])

(defmethod unprepare/unprepare-value [:postgres UUID]
  [_ value]
  (format "'%s'::uuid" value))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         metabase.driver.sql-jdbc impls                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-base-types
  "Map of default Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  {:bigint        :type/BigInteger
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
   :date          :type/Date
   :decimal       :type/Decimal
   :float4        :type/Float
   :float8        :type/Float
   :geometry      :type/*
   :inet          :type/IPAddress
   :int           :type/Integer
   :int2          :type/Integer
   :int4          :type/Integer
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
   (keyword "timestamp with time zone")    :type/DateTimeWithTZ
   (keyword "timestamp without time zone") :type/DateTime})

(defmethod sql-jdbc.sync/database-type->base-type :postgres
  [_driver column]
  (if (contains? *enum-types* column)
    :type/PostgresEnum
    (default-base-types column)))

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
    (= (second (re-find secret/uploaded-base-64-prefix-pattern ssl-key-value))
       "x-pkcs12")))

(defn- ssl-params
  "Builds the params to include in the JDBC connection spec for an SSL connection."
  [{:keys [ssl-key-value] :as db-details}]
  (let [ssl-root-cert   (when (contains? #{"verify-ca" "verify-full"} (:ssl-mode db-details))
                          (secret/db-details-prop->secret-map db-details "ssl-root-cert"))
        ssl-client-key  (when (:ssl-use-client-auth db-details)
                          (secret/db-details-prop->secret-map db-details "ssl-key"))
        ssl-client-cert (when (:ssl-use-client-auth db-details)
                          (secret/db-details-prop->secret-map db-details "ssl-client-cert"))
        ssl-key-pw      (when (:ssl-use-client-auth db-details)
                          (secret/db-details-prop->secret-map db-details "ssl-key-password"))
        all-subprops    (apply concat (map :subprops [ssl-root-cert ssl-client-key ssl-client-cert ssl-key-pw]))
        has-value?      (comp some? :value)]
    (cond-> (set/rename-keys db-details {:ssl-mode :sslmode})
      ;; if somehow there was no ssl-mode set, just make it required (preserves existing behavior)
      (nil? (:ssl-mode db-details))
      (assoc :sslmode "require")

      (has-value? ssl-root-cert)
      (assoc :sslrootcert (secret/value->file! ssl-root-cert :postgres))

      (has-value? ssl-client-key)
      (assoc :sslkey (secret/value->file! ssl-client-key :postgres (when (pkcs-12-key-value? ssl-key-value) ".p12")))

      (has-value? ssl-client-cert)
      (assoc :sslcert (secret/value->file! ssl-client-cert :postgres))

      ;; Pass an empty string as password if none is provided; otherwise the driver will prompt for one
      true
      (assoc :sslpassword (or (secret/value->string ssl-key-pw) ""))

      true
      (as-> params ;; from outer cond->
        (dissoc params :ssl-root-cert :ssl-root-cert-options :ssl-client-key :ssl-client-cert :ssl-key-password
                       :ssl-use-client-auth)
        (apply dissoc params all-subprops)))))

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
                (mdb.spec/spec :postgres it)
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

;; de-CLOB any CLOB values that come back
(defmethod sql-jdbc.execute/read-column-thunk :postgres
  [_ ^ResultSet rs _ ^Integer i]
  (fn []
    (let [obj (.getObject rs i)]
      (if (instance? org.postgresql.util.PGobject obj)
        (.getValue ^org.postgresql.util.PGobject obj)
        obj))))

;; Postgres doesn't support OffsetTime
(defmethod sql-jdbc.execute/set-parameter [:postgres OffsetTime]
  [driver prepared-statement i t]
  (let [local-time (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))]
    (sql-jdbc.execute/set-parameter driver prepared-statement i local-time)))

(defmethod driver/upload-type->database-type :postgres
  [_driver upload-type]
  (case upload-type
    ::upload/varchar-255              [[:varchar 255]]
    ::upload/text                     [:text]
    ::upload/int                      [:bigint]
    ::upload/auto-incrementing-int-pk [:bigserial]
    ::upload/float                    [:float]
    ::upload/boolean                  [:boolean]
    ::upload/date                     [:date]
    ::upload/datetime                 [:timestamp]
    ::upload/offset-datetime          [:timestamp-with-time-zone]))

(defmethod driver/create-auto-pk-with-append-csv? :postgres
  [driver]
  (= driver :postgres))

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
          [sql & _]    (sql/format {::copy       (keyword table-name)
                                    :columns     (map keyword column-names)
                                    ::from-stdin "''"}
                                   :quoted true
                                   :dialect (sql.qp/quote-style driver))
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
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'update') as update,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'select') as select,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'insert') as insert,"
          "   pg_catalog.has_table_privilege(current_user, '\"' || t.schemaname || '\"' || '.' || '\"' || t.objectname || '\"',  'delete') as delete"
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
       (filter #(or (:select %) (:update %) (:delete %) (:update %)))))

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
