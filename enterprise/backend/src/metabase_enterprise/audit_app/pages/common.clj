(ns metabase-enterprise.audit-app.pages.common
  "Shared functions used by audit internal queries across different namespaces."
  (:require
   [clojure.core.async :as a]
   [clojure.core.memoize :as memoize]
   [clojure.walk :as walk]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [java-time :as t]
   [medley.core :as m]
   [metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
    :as qp.middleware.audit]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.query :as mdb.query]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.urls :as urls]
   [schema.core :as s]))

(set! *warn-on-reflection* true)

(def ^:private ^:const default-limit Integer/MAX_VALUE)

(defn- add-default-params [honeysql-query]
  (let [{:keys [limit offset]} qp.middleware.audit/*additional-query-params*]
    (if (and (nil? limit) (nil? offset))
      honeysql-query
      (-> honeysql-query
          (update :limit (fn [query-limit]
                           [:inline (or limit query-limit default-limit)]))
          (update :offset (fn [query-offset]
                            [:inline (or offset query-offset 0)]))))))

(defn- inject-cte-body-into-from
  [from ctes]
  (vec
   (for [source from]
     (if (vector? source)
       (let [[source alias] source]
         [(ctes source source) alias])
       (if (ctes source)
         [(ctes source) source]
         source)))))

(defn- inject-cte-body-into-join
  [joins ctes]
  (->> joins
       (partition 2)
       (mapcat (fn [[source condition]]
                 (if (vector? source)
                   (let [[source alias] source]
                     [(if (ctes source)
                        [(ctes source) alias]
                        [source alias])
                      condition])
                   [(if (ctes source)
                      [(ctes source) source]
                      source)
                    condition])))
       vec))

(defn- CTEs->subselects
  ([query] (CTEs->subselects query {}))
  ([{:keys [with] :as query} ctes]
   (let [ctes (reduce (fn [ctes [alias definition]]
                        (assoc ctes alias (CTEs->subselects definition ctes)))
                      ctes
                      with)]
     (walk/postwalk
      (fn [form]
        (if (map? form)
          (-> form
              (m/update-existing :from inject-cte-body-into-from ctes)
              ;; TODO -- make this work with all types of joins
              (m/update-existing :left-join inject-cte-body-into-join ctes)
              (m/update-existing :join inject-cte-body-into-join ctes))
          form))
      (dissoc query :with)))))

;; TODO - fixme
(def ^:private ^{:arglists '([])} application-db-default-timezone
  ;; cache the application DB's default timezone for an hour. I don't expect this information to change *ever*,
  ;; really, but it seems like it is possible that it *could* change. Determining this for every audit query seems
  ;; wasteful however.
  ;;
  ;; This is cached by db-type and the JDBC connection spec in case that gets changed/swapped out for one reason or
  ;; another
  (let [timezone (memoize/ttl sql-jdbc.sync/db-default-timezone :ttl/threshold (u/hours->ms 1))]
    (fn []
      (timezone (mdb/db-type) {:datasource mdb.connection/*application-db*}))))

(defn- compile-honeysql [driver honeysql-query]
  (try
    (let [honeysql-query (cond-> honeysql-query
                           ;; MySQL 5.x does not support CTEs, so convert them to subselects instead
                           (= driver :mysql) CTEs->subselects)]
      (mdb.query/compile (add-default-params honeysql-query)))
    (catch Throwable e
      (throw (ex-info (tru "Error compiling audit query: {0}" (ex-message e))
                      {:driver driver, :honeysql-query honeysql-query}
                      e)))))

(defn- reduce-results* [honeysql-query context rff init]
  (let [driver         (mdb/db-type)
        [sql & params] (compile-honeysql driver honeysql-query)
        canceled-chan  (qp.context/canceled-chan context)]
    ;; MySQL driver normalizies timestamps. Setting `*results-timezone-id-override*` is a shortcut
    ;; instead of mocking up a chunk of regular QP pipeline.
    (binding [qp.timezone/*results-timezone-id-override* (application-db-default-timezone)]
      (try
        (with-open [conn (.getConnection mdb.connection/*application-db*)
                    stmt (sql-jdbc.execute/prepared-statement driver conn sql params)
                    rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
          (let [rsmeta   (.getMetaData rs)
                cols     (sql-jdbc.execute/column-metadata driver rsmeta)
                metadata {:cols cols}
                rf       (rff metadata)]
            (reduce rf init (sql-jdbc.execute/reducible-rows driver rs rsmeta canceled-chan))))
        (catch InterruptedException e
          (a/>!! canceled-chan :cancel)
          (throw e))
        (catch Throwable e
          (throw (ex-info (tru "Error running audit query: {0}" (ex-message e))
                          {:driver         driver
                           :honeysql-query honeysql-query
                           :sql            sql
                           :params         params}
                          e)))))))

(defn reducible-query
  "Return a function with the signature

    (f context) -> IReduceInit

  that, when reduced, runs `honeysql-query` against the application DB, automatically including limits and offsets for
  paging."
  [honeysql-query]
  (bound-fn reducible-query-fn [context]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (reduce-results* honeysql-query context (constantly rf) init)))))

(defn query
  "Run a internal audit query, automatically including limits and offsets for paging. This function returns results
  directly as a series of maps (the 'legacy results' format as described in
  `metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries.internal-queries`)"
  [honeysql-query]
  (let [context {:canceled-chan (a/promise-chan)}
        rff     (fn [{:keys [cols]}]
                  (let [col-names (mapv (comp keyword :name) cols)]
                    ((map (partial zipmap col-names)) conj)))]
    (try
      (reduce-results* honeysql-query context rff [])
      (catch InterruptedException e
        (a/>!! (:canceled-chan context) ::cancel)
        (throw e)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Helper Fns                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn user-full-name
  "HoneySQL to grab the full name of a User.

     (user-full-name :u) ;; -> 'Cam Saul'"
  [user-table]
  (let [first-name (keyword (name user-table) "first_name")
        last-name  (keyword (name user-table) "last_name")
        email      (keyword (name user-table) "email")]
    [:case
     [:and [:= nil first-name] [:= nil last-name]]
     email
     [:or [:= nil first-name] [:= nil last-name]]
     (h2x/concat [:coalesce first-name ""] [:coalesce last-name ""])
     :else
     (h2x/concat [:coalesce first-name ""] (h2x/literal " ") [:coalesce last-name ""])]))

(def datetime-unit-str->base-type
  "Map of datetime unit strings (possible params for queries that accept a datetime `unit` param) to the `:base_type` we
  should use for that column in the results."
  {"quarter"         :type/Date
   "day"             :type/Date
   "hour"            :type/DateTime
   "week"            :type/Date
   "default"         :type/DateTime
   "day-of-week"     :type/Integer
   "hour-of-day"     :type/Integer
   "month"           :type/Date
   "month-of-year"   :type/Integer
   "day-of-month"    :type/Integer
   "year"            :type/Integer
   "day-of-year"     :type/Integer
   "week-of-year"    :type/Integer
   "quarter-of-year" :type/Integer
   "minute-of-hour"  :type/Integer
   "minute"          :type/DateTime})

(def DateTimeUnitStr
  "Scheme for a valid QP DateTime unit as a string (the format they will come into the audit QP). E.g. something
  like `day` or `day-of-week`."
  (apply s/enum (keys datetime-unit-str->base-type)))

(defn grouped-datetime
  "Group a datetime expression by `unit` using the appropriate SQL QP `date` implementation for our application
  database.

    (grouped-datetime :day :timestamp) ;; -> `cast(timestamp AS date)` [honeysql equivalent]"
  [unit expr]
  (binding [#_{:clj-kondo/ignore [:deprecated-var]} hx/*honey-sql-version* 2]
    (sql.qp/date (mdb/db-type) (keyword unit) expr)))

(defn first-non-null
  "Build a `CASE` statement that returns the first non-`NULL` of `exprs`."
  [& exprs]
  (into [:case]
        (mapcat (fn [expr] [[:not= expr nil] expr]))
        exprs))

(defn zero-if-null
  "Build a `CASE` statement that will replace results of `expr` with `0` when it's `NULL`, perfect for things like
  counts."
  [expr]
  [:case [:not= expr nil] expr :else 0])

(defn lowercase-field
  "Lowercase a SQL field, to enter into honeysql query"
  [field]
  [:lower field])

(defn add-45-days-clause
  "Add an appropriate `WHERE` clause to limit query to 45 days"
  [query date_column]
  (sql.helpers/where query [:>
                            (h2x/cast :date date_column)
                            (h2x/cast :date (h2x/literal (t/format "yyyy-MM-dd" (t/minus (t/local-date) (t/days 45)))))]))

(defn add-search-clause
  "Add an appropriate `WHERE` clause to `query` to see if any of the `fields-to-search` match `query-string`.

  (add-search-clause {} \"birds\" :t.name :db.name)"
  [query query-string & fields-to-search]
  (sql.helpers/where query (when (seq query-string)
                             (let [query-string (str \% (u/lower-case-en query-string) \%)]
                               (cons
                                :or
                                (for [field fields-to-search]
                                  [:like (lowercase-field field) query-string]))))))

(defn add-sort-clause
  "Add an `ORDER BY` clause to `query` on `sort-column` and `sort-direction`.

  Most queries will just have explicit default `ORDER BY` clauses"
  [query sort-column sort-direction]
  (sql.helpers/order-by query [(keyword sort-column) (keyword sort-direction)]))

(defn card-public-url
  "Return HoneySQL for a `CASE` statement to return a Card's public URL if the `public_uuid` `field` is non-NULL."
  [field]
  [:case
   [:not= field nil]
   (h2x/concat (urls/public-card-prefix) field)])

(defn native-or-gui
  "Return HoneySQL for a `CASE` statement to format the QueryExecution `:native` column as either `Native` or `GUI`."
  [query-execution-table]
  [:case [:= (keyword (name query-execution-table) "native") true] (h2x/literal "Native") :else (h2x/literal "GUI")])

(defn card-name-or-ad-hoc
  "HoneySQL for a `CASE` statement to return the name of a Card, or `Ad-hoc` if Card name is `NULL`."
  [card-table]
  (first-non-null (keyword (name card-table) "name") (h2x/literal "Ad-hoc")))

(defn query-execution-is-download
  "HoneySQL for a `WHERE` clause to restrict QueryExecution rows to downloads (i.e. executions returned in CSV/JSON/XLS
  format)."
  [query-execution-table]
  [:in (keyword (name query-execution-table) "context") #{"csv-download" "xlsx-download" "json-download"}])

(defn- format-separator
  [_separator [x y]]
  (let [[x-sql & x-args] (sql/format-expr x {:nested true})
        [y-sql & y-args] (sql/format-expr y {:nested true})]
    (into [(format "%s SEPARATOR %s" x-sql y-sql)]
          cat
          [x-args
           y-args])))

(sql/register-fn!
 ::separator
 format-separator)

(defn group-concat
  "Portable MySQL `group_concat`/Postgres `string_agg`"
  [expr separator]
  (if (= (mdb/db-type) :mysql)
    [:group_concat [::separator expr (h2x/literal separator)]]
    [:string_agg expr (h2x/literal separator)]))
