(ns metabase-enterprise.audit-app.pages.common
  "Shared functions used by audit internal queries across different namespaces."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.walk :as walk]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries
    :as qp.middleware.audit]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

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
  (let [timezone (memoize/ttl
                  #_{:clj-kondo/ignore [:deprecated-var]}
                  sql-jdbc.sync/db-default-timezone
                  :ttl/threshold (u/hours->ms 1))]
    (fn []
      (timezone (mdb/db-type) {:datasource (mdb/app-db)}))))

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

(mu/defn ^:private reduce-results* :- :some
  [honeysql-query :- :map
   rff            :- ::qp.schema/rff
   init]
  (let [driver         (mdb/db-type)
        [sql & params] (compile-honeysql driver honeysql-query)]
    ;; MySQL driver normalizies timestamps. Setting `*results-timezone-id-override*` is a shortcut
    ;; instead of mocking up a chunk of regular QP pipeline.
    (binding [qp.timezone/*results-timezone-id-override* (application-db-default-timezone)]
      (try
        (with-open [conn (.getConnection (mdb/app-db))
                    stmt (sql-jdbc.execute/prepared-statement driver conn sql params)
                    rs   (sql-jdbc.execute/execute-prepared-statement! driver stmt)]
          (let [rsmeta   (.getMetaData rs)
                cols     (for [col (sql-jdbc.execute/column-metadata driver rsmeta)]
                           (update col :name u/lower-case-en))
                metadata {:cols cols}
                rf       (rff metadata)]
            (reduce rf init (sql-jdbc.execute/reducible-rows driver rs rsmeta))))
        (catch Throwable e
          (throw (ex-info (tru "Error running audit query: {0}" (ex-message e))
                          {:driver         driver
                           :honeysql-query honeysql-query
                           :sql            sql
                           :params         params}
                          e)))))))

(defn reducible-query
  "Return a function with the signature

    (thunk) -> IReduceInit

  that, when reduced, runs `honeysql-query` against the application DB, automatically including limits and offsets for
  paging."
  [honeysql-query]
  (bound-fn reducible-query-thunk []
    (reify clojure.lang.IReduceInit
      (reduce [_this rf init]
        (reduce-results* honeysql-query (constantly rf) init)))))

(defn query
  "Run a internal audit query, automatically including limits and offsets for paging. This function returns results
  directly as a series of maps (the 'legacy results' format as described in
  `metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries.internal-queries`)"
  [honeysql-query]
  (let [rff (fn rff [{:keys [cols]}]
              (let [col-names (mapv (comp keyword :name) cols)]
                ((map (partial zipmap col-names)) conj)))]
    (reduce-results* honeysql-query rff [])))

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

(defn lowercase-field
  "Lowercase a SQL field, to enter into honeysql query"
  [field]
  [:lower field])

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
