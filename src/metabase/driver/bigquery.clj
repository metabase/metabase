(ns metabase.driver.bigquery
  "Google BigQuery driver. For the most part piggybacks off of the Generic SQL driver, but as BigQuery is not
  JDBC-based significant parts such as syncing and executing queries are customized.

  Since this is a rather complicated driver, it is broken out into two namespaces. The other namespace,
  `metabase.driver.bigquery.client`, serves as a wrapper around the BigQuery API itself, and also handles conversions
  between types returned by BigQuery queries and those expected by Metabase itself. Functions related to sync metadata
  fetching, running queries, and post-processing their results can be found there.

  Note that there is no separate `query-processor` namespace; having one is certainly a more normal way to split a
  large driver, but splitting the driver in that way proved to be more confusing than the current separation.

  Keep in mind that in addition to using logic from the Generic SQL driver, the BigQuery driver also shares some logic
  with the Google Analytics driver. This shared code can be found in the `metabase.driver.google` namespace."
  (:require [clojure
             [set :as set]
             [string :as str]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.bigquery.client :as client]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.models
             [database :refer [Database]]
             [field :as field]]
            ;; Required because classes like metabase.query_processor.interface.Field are used below. Don't remove!
            metabase.query-processor.interface
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db])
  (:import com.google.api.services.bigquery.model.Table
           java.util.Date))

(defrecord BigQueryDriver []
  clojure.lang.Named
  (getName [_] "BigQuery"))

(def ^:private driver (BigQueryDriver.))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                QUERY PROCESSOR                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- date-add [unit timestamp interval]
  (hsql/call :date_add timestamp interval (hx/literal unit)))

;; microseconds = unix timestamp in microseconds. Most BigQuery functions like strftime require timestamps in this
;; format

(def ^:private ->microseconds (partial hsql/call :timestamp_to_usec))

(defn- microseconds->str [format-str µs]
  (hsql/call :strftime_utc_usec µs (hx/literal format-str)))

(defn- trunc-with-format [format-str timestamp]
  (hx/->timestamp (microseconds->str format-str (->microseconds timestamp))))

(defn- date [unit expr]
  {:pre [expr]}
  (case unit
    :default         expr
    :minute          (trunc-with-format "%Y-%m-%d %H:%M:00" expr)
    :minute-of-hour  (hx/minute expr)
    :hour            (trunc-with-format "%Y-%m-%d %H:00:00" expr)
    :hour-of-day     (hx/hour expr)
    :day             (hx/->timestamp (hsql/call :date expr))
    :day-of-week     (hsql/call :dayofweek expr)
    :day-of-month    (hsql/call :day expr)
    :day-of-year     (hsql/call :dayofyear expr)
    :week            (date-add :day (date :day expr) (hx/- 1 (date :day-of-week expr)))
    :week-of-year    (hx/week expr)
    :month           (trunc-with-format "%Y-%m-01" expr)
    :month-of-year   (hx/month expr)
    :quarter         (date-add :month
                               (trunc-with-format "%Y-01-01" expr)
                               (hx/* (hx/dec (date :quarter-of-year expr))
                                     3))
    :quarter-of-year (hx/quarter expr)
    :year            (hx/year expr)))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :sec_to_timestamp  expr)
    :milliseconds (hsql/call :msec_to_timestamp expr)))



;; Make the dataset-id the "schema" of every field or table in the query because otherwise BigQuery can't figure out
;; where things is from
(defn- qualify-fields-and-tables-with-dataset-id [{{{:keys [dataset-id]} :details} :database, :as query}]
  (walk/postwalk (fn [x]
                   (cond
                     ;; TODO - it is inconvenient that we use different keys for `schema` across different classes. We
                     ;; should one day refactor to use the same key everywhere.
                     (instance? metabase.query_processor.interface.Field x)     (assoc x :schema-name dataset-id)
                     (instance? metabase.query_processor.interface.JoinTable x) (assoc x :schema      dataset-id)
                     :else                                                      x))
                 (assoc-in query [:query :source-table :schema] dataset-id)))

(defn- honeysql-form [outer-query]
  (sqlqp/build-honeysql-form driver (qualify-fields-and-tables-with-dataset-id outer-query)))

(defn- honeysql-form->sql ^String [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; replace identifiers like [shakespeare].[word] with ones like [shakespeare.word] since that's hat BigQuery expects
  (let [[sql & args] (sql/honeysql-form->sql+args driver honeysql-form)
        sql          (str/replace (hx/unescape-dots sql) #"\]\.\[" ".")]
    (assert (empty? args)
      "BigQuery statements can't be parameterized!")
    sql))

(defn- mbql->native
  "Convert an MBQL query to a native SQL one."
  {:arglists '([outer-query])}
  [{{{:keys [dataset-id]} :details, :as database} :database
    {{table-name :name} :source-table}            :query
    :as                                           outer-query}]
  {:pre [(map? database) (seq dataset-id) (seq table-name)]}
  (binding [sqlqp/*query* outer-query]
    (let [honeysql-form (honeysql-form outer-query)
          sql           (honeysql-form->sql honeysql-form)]
      {:query      sql
       :table-name table-name
       :mbql?      true})))


;; These provide implementations of `->honeysql` that prevents HoneySQL from converting forms to prepared
;; statement parameters (`?`)
(defmethod sqlqp/->honeysql [BigQueryDriver String]
  [_ s]
  ;; TODO - what happens if `s` contains single-quotes? Shouldn't we be escaping them somehow?
  (hx/literal s))

(defmethod sqlqp/->honeysql [BigQueryDriver Boolean]
  [_ bool]
  (hsql/raw (if bool "TRUE" "FALSE")))

(defmethod sqlqp/->honeysql [BigQueryDriver Date]
  [_ date]
  (hsql/call :timestamp (hx/literal (u/date->iso-8601 date))))


(defn- field->alias [{:keys [^String schema-name, ^String field-name, ^String table-name, ^Integer index, field], :as this}]
  {:pre [(map? this) (or field
                         index
                         (and (seq schema-name) (seq field-name) (seq table-name))
                         (log/error "Don't know how to alias: " this))]}
  (cond
    field (recur field) ; type/DateTime
    index (name (let [{{aggregations :aggregation} :query} sqlqp/*query*
                      {ag-type :aggregation-type}          (nth aggregations index)]
                  (if (= ag-type :distinct)
                    :count
                    ag-type)))
    :else (str schema-name \. table-name \. field-name)))

;; TODO - Making 2 DB calls for each field to fetch its dataset is inefficient and makes me cry, but this method is
;; currently only used for SQL params so it's not a huge deal at this point
(defn- field->identifier [{table-id :table_id, :as field}]
  (let [db-id   (db/select-one-field :db_id 'Table :id table-id)
        dataset (:dataset-id (db/select-one-field :details Database, :id db-id))]
    (hsql/raw (apply format "[%s.%s.%s]" dataset (field/qualified-name-components field)))))

;; We have to override the default SQL implementations of breakout and order-by because BigQuery propogates casting
;; functions in SELECT
;; BAD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp],
;;       count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp])
;; ORDER BY msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) ASC
;; LIMIT 10
;;
;; GOOD:
;; SELECT msec_to_timestamp([sad_toucan_incidents.incidents.timestamp]) AS [sad_toucan_incidents.incidents.timestamp],
;;        count(*) AS [count]
;; FROM [sad_toucan_incidents.incidents]
;; GROUP BY [sad_toucan_incidents.incidents.timestamp]
;; ORDER BY [sad_toucan_incidents.incidents.timestamp] ASC
;; LIMIT 10

(defn- deduplicate-aliases
  "Given a sequence of aliases, return a sequence where duplicate aliases have been appropriately suffixed.

     (deduplicate-aliases [\"sum\" \"count\" \"sum\" \"avg\" \"sum\" \"min\"])
     ;; -> [\"sum\" \"count\" \"sum_2\" \"avg\" \"sum_3\" \"min\"]"
  [aliases]
  (loop [acc [], alias->use-count {}, [alias & more, :as aliases] aliases]
    (let [use-count (get alias->use-count alias)]
      (cond
        (empty? aliases) acc
        (not alias)      (recur (conj acc alias) alias->use-count more)
        (not use-count)  (recur (conj acc alias) (assoc alias->use-count alias 1) more)
        :else            (let [new-count (inc use-count)
                               new-alias (str alias "_" new-count)]
                           (recur (conj acc new-alias) (assoc alias->use-count alias new-count, new-alias 1) more))))))

(defn- select-subclauses->aliases
  "Return a vector of aliases used in HoneySQL SELECT-SUBCLAUSES.
   (For clauses that aren't aliased, `nil` is returned as a placeholder)."
  [select-subclauses]
  (for [subclause select-subclauses]
    (when (and (vector? subclause)
               (= 2 (count subclause)))
      (second subclause))))

(defn update-select-subclause-aliases
  "Given a vector of HoneySQL SELECT-SUBCLAUSES and a vector of equal length of NEW-ALIASES,
   return a new vector with combining the original `SELECT` subclauses with the new aliases.

   Subclauses that are not aliased are not modified; they are given a placeholder of `nil` in the NEW-ALIASES vector.

     (update-select-subclause-aliases [[:user_id \"user_id\"] :venue_id]
                                      [\"user_id_2\" nil])
     ;; -> [[:user_id \"user_id_2\"] :venue_id]"
  [select-subclauses new-aliases]
  (for [[subclause new-alias] (partition 2 (interleave select-subclauses new-aliases))]
    (if-not new-alias
      subclause
      [(first subclause) new-alias])))

(defn- deduplicate-select-aliases
  "Replace duplicate aliases in SELECT-SUBCLAUSES with appropriately suffixed aliases.

  BigQuery doesn't allow duplicate aliases in `SELECT` statements; a statement like `SELECT sum(x) AS sum, sum(y) AS
  sum` is invalid. (See #4089) To work around this, we'll modify the HoneySQL aliases to make sure the same one isn't
  used twice by suffixing duplicates appropriately.
  (We'll generate SQL like `SELECT sum(x) AS sum, sum(y) AS sum_2` instead.)"
  [select-subclauses]
  (let [aliases (select-subclauses->aliases select-subclauses)
        deduped (deduplicate-aliases aliases)]
    (update-select-subclause-aliases select-subclauses deduped)))

(defn- apply-aggregation
  "BigQuery's implementation of `apply-aggregation` just hands off to the normal Generic SQL implementation, but calls
  `deduplicate-select-aliases` on the results."
  [driver honeysql-form query]
  (-> (sqlqp/apply-aggregation driver honeysql-form query)
      (update :select deduplicate-select-aliases)))


(defn- field->breakout-identifier [field]
  (hsql/raw (str \[ (field->alias field) \])))

(defn- apply-breakout [driver honeysql-form {breakout-fields :breakout, fields-fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group)  (map field->breakout-identifier breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it
      ;; twice, or HoneySQL will barf
      ((partial apply h/merge-select) (for [field breakout-fields
                                            :when (not (contains? (set fields-fields) field))]
                                        (sqlqp/as driver (sqlqp/->honeysql driver field) field)))))

(defn- apply-join-tables
  "Copy of the Generic SQL implementation of `apply-join-tables`, but prepends schema (dataset-id) to join-alias."
  [honeysql-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [honeysql-form honeysql-form, [{:keys [table-name pk-field source-field schema join-alias]} & more] join-tables]
    (let [honeysql-form (h/merge-left-join honeysql-form
                          [(hx/qualify-and-escape-dots schema table-name) (hx/qualify-and-escape-dots schema join-alias)]
                          [:= (hx/qualify-and-escape-dots source-schema source-table-name (:field-name source-field))
                              (hx/qualify-and-escape-dots schema join-alias               (:field-name pk-field))])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- apply-order-by [honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(field->breakout-identifier field) (case direction
                                                                                              :ascending  :asc
                                                                                              :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn- string-length-fn [field-key]
  (hsql/call :length field-key))

;; From the dox: Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be
;; at most 128 characters long.
(defn- format-custom-field-name ^String [^String custom-field-name]
  (str/join (take 128 (-> (str/trim custom-field-name)
                        (str/replace #"[^\w\d_]" "_")
                        (str/replace #"(^\d)" "_$1")))))

(defn- date-interval [driver unit amount]
  (sqlqp/->honeysql driver (u/relative-date unit amount)))


;; BigQuery doesn't return a timezone with it's time strings as it's always UTC, JodaTime parsing also defaults to UTC
(def ^:private bigquery-date-formatter (driver/create-db-time-formatter "yyyy-MM-dd HH:mm:ss.SSSSSS"))
(def ^:private bigquery-db-time-query "select CAST(CURRENT_TIMESTAMP() AS STRING)")


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 PROTOCOL IMPLS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(u/strict-extend BigQueryDriver
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-aggregation         apply-aggregation
          :apply-breakout            apply-breakout
          :apply-join-tables         (u/drop-first-arg apply-join-tables)
          :apply-order-by            (u/drop-first-arg apply-order-by)
          ;; these two are actually not applicable since we don't use JDBC
          :column->base-type         (constantly nil)
          :connection-details->spec  (constantly nil)
          :current-datetime-fn       (constantly :%current_timestamp)
          :date                      (u/drop-first-arg date)
          :field->alias              (u/drop-first-arg field->alias)
          :field->identifier         (u/drop-first-arg field->identifier)
          ;; we want identifiers quoted [like].[this] initially (we have to convert them to [like.this] before
          ;; executing)
          :quote-style               (constantly :sqlserver)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)})

  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?             (u/drop-first-arg client/can-connect?)
          :date-interval            date-interval
          :describe-database        (u/drop-first-arg client/describe-database)
          :describe-table           (u/drop-first-arg client/describe-table)
          :details-fields           (constantly [{:name         "project-id"
                                                  :display-name "Project ID"
                                                  :placeholder  "praxis-beacon-120871"
                                                  :required     true}
                                                 {:name         "dataset-id"
                                                  :display-name "Dataset ID"
                                                  :placeholder  "toucanSightings"
                                                  :required     true}
                                                 {:name         "client-id"
                                                  :display-name "Client ID"
                                                  :placeholder  "1201327674725-y6ferb0feo1hfssr7t40o4aikqll46d4.apps.googleusercontent.com"
                                                  :required     true}
                                                 {:name         "client-secret"
                                                  :display-name "Client Secret"
                                                  :placeholder  "dJNi4utWgMzyIFo2JbnsK6Np"
                                                  :required     true}
                                                 {:name         "auth-code"
                                                  :display-name "Auth Code"
                                                  :placeholder  "4/HSk-KtxkSzTt61j5zcbee2Rmm5JHkRFbL5gD5lgkXek"
                                                  :required     true}])
          :execute-query            (u/drop-first-arg client/execute-query)
          ;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins
          ;; are still allowed, which puts us in a weird position, however; people can manually specifiy "foreign key"
          ;; relationships in admin and everything should work correctly. Since we can't infer any "FK" relationships
          ;; during sync our normal FK tests are not appropriate for BigQuery, so they're disabled for the time being.
          ;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set
          ;; up these FK relationships for FK tables
          :features                 (constantly (set/union #{:basic-aggregations
                                                             :standard-deviation-aggregations
                                                             :native-parameters
                                                             :expression-aggregations
                                                             :binning}
                                                           (when-not config/is-test?
                                                             ;; during unit tests don't treat bigquery as having FK
                                                             ;; support
                                                             #{:foreign-keys})))
          :format-custom-field-name (u/drop-first-arg format-custom-field-name)
          :mbql->native             (u/drop-first-arg mbql->native)
          :current-db-time          (driver/make-current-db-time-fn bigquery-date-formatter bigquery-db-time-query)}))

(defn -init-driver
  "Register the BigQuery driver"
  []
  (driver/register-driver! :bigquery driver))
