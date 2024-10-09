(ns metabase.driver.pinot.query-processor
  (:require
   [clojure.string :as str]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic *query*
  "The INNER part of the query currently being processed.
   (`:settings` is merged in from the outer query as well so we can access timezone info)."
  nil)


(defmulti ^:private ->rvalue
  "Convert something to an 'rvalue`, i.e. a value that could be used in the right-hand side of an assignment expression.

    (let [x 100] ...) ; x is the lvalue; 100 is the rvalue"
  {:arglists '([x])}
  mbql.u/dispatch-by-clause-name-or-class)

(defmethod ->rvalue nil
  [_]
  nil)

(defmethod ->rvalue Object
  [this]
  this)

(defmethod ->rvalue String
  [value]
  (str "'" value "'"))

(defmethod sql.qp/inline-value [:pinot java.lang.String]
  [_driver value]
  (str "'" value "'"))

(defn- resolve-field
  [field-clause]
  (log/debugf "Resolving field clause: %s" field-clause)
  (if (and (sequential? field-clause) (>= (count field-clause) 2))
    (let [[_ field-id options] field-clause
          field-name (cond
                       (integer? field-id)
                       (-> (qp.store/metadata-provider)
                           (lib.metadata/field field-id)
                           :name)

                       (map? options)
                       (:name options)

                       :else
                       (str "unknown-field-" field-id))]
      (str "\"" field-name "\""))
    (throw (ex-info "Invalid field clause structure" {:field-clause field-clause}))))

(defn- resolve-value [value-struct]
  (let [[_ value _] value-struct]
    (str "'" value "'")))

(defmethod ->rvalue :field
  [[_ id-or-name]]
  (if (integer? id-or-name)
    (:name (lib.metadata/field (qp.store/metadata-provider) id-or-name))
    id-or-name))

(defmethod ->rvalue :absolute-datetime
  [[_ t unit]]
  (u.date/format
   (if (= unit :default)
     t
     (u.date/truncate t unit))))

;; TODO - not 100% sure how to handle times here, just treating it exactly like a date will have to do for now
(defmethod ->rvalue :time
  [[_ t unit]]
  (u.date/format (u.date/truncate t unit)))

(defmethod ->rvalue :relative-datetime
  [[_ amount unit]]
  (u.date/format (u.date/truncate (u.date/add unit amount) unit)))

(defmethod ->rvalue :value
  [[_ value]]
  (->rvalue value))

;;; ---------------------------------------------- handle-source-table -----------------------------------------------

(defn- handle-source-table
  [{source-table-id :source-table} pinot-query]
  (let [{source-table-name :name} (lib.metadata/table (qp.store/metadata-provider) source-table-id)]
    (assoc-in pinot-query [:query :dataSource] source-table-name)))

;;; ---------------------- handle-filter. See http://pinot.io/docs/latest/querying/filters.html ----------------------
(defn- handle-filter
  [original-query pinot-query]
  ;; Extract filters from the original query and add to pinot-query
  (let [filters (:filter original-query)]
    (letfn [(filter-clause [filter]
              (if (vector? filter)
                (let [[op & args] filter]
                  ;; log op and args
                  (log/debugf "Processing filter clause: %s, op: %s, args: %s" filter, op, args)
                  (case op
                    :and (str "(" (str/join " AND " (map filter-clause args)) ")")
                    :or (str "(" (str/join " OR " (map filter-clause args)) ")")
                    :not (str "NOT " (filter-clause (first args)))
                    :between (let [[field lower upper] args]
                                (str (resolve-field field) " BETWEEN " (resolve-value lower) " AND " (resolve-value upper)))
                    := (let [[field value] args]
                          (str (resolve-field field) " = " (resolve-value value)))
                    :> (let [[field value] args]
                          (str (resolve-field field) " > " (resolve-value value)))
                    :< (let [[field value] args]
                          (str (resolve-field field) " < " (resolve-value value)))
                    :<= (let [[field value] args]
                           (str (resolve-field field) " <= " (resolve-value value)))
                    :>= (let [[field value] args]
                           (str (resolve-field field) " >= " (resolve-value value)))
                    :!= (let [[field value] args]
                           (str (resolve-field field) " != " (resolve-value value)))
                    (throw (ex-info "Unsupported filter operation" {:filter filter}))))
                (throw (ex-info "Invalid filter format" {:filter filter}))))]
      (if filters
        (let [where-clause (filter-clause filters)]
          (assoc-in pinot-query [:query :where] where-clause))
        pinot-query))))

;;; ----------------------------------------------- handle-aggregation -----------------------------------------------
(defn- handle-aggregations
  [original-query pinot-query]
  ;; Extract aggregations from the original query and add to pinot-query
  (let [aggregations (:aggregation original-query)]
    (log/debugf "Processing aggregations: %s" aggregations)
    (let [aggregation-clauses (map (fn [aggregation]
                                     (let [[_ agg-func options] aggregation
                                           agg-type (first agg-func)
                                           agg-fields (map resolve-field (subvec agg-func 1))
                                           agg-name (:name options)]
                                       (log/debugf "Processing aggregation clause: %s, agg-type: %s, agg-fields: %s" aggregation, agg-type, agg-fields)
                                       (let [result (cond
                                                      (= agg-type :count) (str "COUNT(*)" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :distinctCount) (str "DISTINCTCOUNT(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :distinct) (str "DISTINCT(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :sum) (str "SUM(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :avg) (str "AVG(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :min) (str "MIN(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :max) (str "MAX(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name)))
                                                      (= agg-type :percentile) (let [[field percentile] agg-fields]
                                                                               (str "PERCENTILE(" field ", " percentile ")" (when agg-name (str " AS " agg-name))))

                                                      :else (str (u/upper-case-en (str agg-type)) "(" (str/join ", " agg-fields) ")" (when agg-name (str " AS " agg-name))))]
                                         (log/debugf "Generated aggregation clause: %s" result)
                                         result)))
                                   aggregations)]
      (if (seq aggregation-clauses)
        (assoc-in pinot-query [:query :aggregations] aggregation-clauses)
        pinot-query))))

;;; ------------------------------------------------ handle-breakout -------------------------------------------------
(defn- handle-breakout
  [original-query pinot-query]
  ;; Extract breakout fields from the original query and add to pinot-query
  (let [breakout (:breakout original-query)
        breakout-names (map resolve-field breakout)]
    (if (seq breakout-names)
      (-> pinot-query
                (assoc-in [:query :group-by] breakout-names))
            pinot-query)))

;;; ------------------------------------------------ handle-order-by -------------------------------------------------
(defn- handle-order-by
  [original-query pinot-query]
  ;; Extract order by fields from the original query and add to pinot-query
  (let [order-by (:order-by original-query)
        order-by-clauses (map (fn [[direction field]]
                                (let [field-name (resolve-field field)]
                                  (str field-name " " (name direction))))
                              order-by)]
    (if (seq order-by-clauses)
      (assoc-in pinot-query [:query :order-by] order-by-clauses)
      pinot-query)))

;;; ------------------------------------------------- handle-fields --------------------------------------------------

(defn- handle-fields
  [original-query pinot-query]
  ;; Extract fields from the original query and add to pinot-query
  (let [fields (:fields original-query)
        field-names (map resolve-field fields)]
    (if (seq field-names)
      (assoc-in pinot-query [:query :columns] field-names)
      (assoc-in pinot-query [:query :columns] []))))

;;; -------------------------------------------------- handle-limit --------------------------------------------------

(defn- handle-limit
  [original-query pinot-query]
  ;; Extract limit from the original query and add to pinot-query
  (let [limit (:limit original-query)]
    (if limit
      (assoc-in pinot-query [:query :limit] limit)
      pinot-query)))

;;; -------------------------------------------------- handle-page ---------------------------------------------------

;; TODO - no real way to implement this DB side, probably have to do Clojure-side w/ `take`/`drop`

(defn- handle-page
  [original-query pinot-query]
  ;; Extract page information (offset) and add to pinot-query
  (let [page (:page original-query)
        limit (get-in pinot-query [:query :limit] 0)]
    (if page
      (assoc-in pinot-query [:query :offset] (* page limit))
      pinot-query)))

;;; -------------------------------------------------- generate-pinot-sql --------------------------------------------
(defn- generate-pinot-sql
  [pinot-query]
  ;; Generate the SQL string for Pinot from the pinot-query map
  (let [
        group-by-exists? (get-in pinot-query [:query :group-by])
        select-clause (if group-by-exists?
                        (str "SELECT " (str/join ", " (concat (get-in pinot-query [:query :group-by]) (get-in pinot-query [:query :aggregations]))))
                        (if (get-in pinot-query [:query :aggregations])
                          (str "SELECT " (str/join ", " (get-in pinot-query [:query :aggregations])))
                          (str "SELECT " (str/join ", " (get-in pinot-query [:query :columns])))))
        from-clause (str "FROM " (get-in pinot-query [:query :dataSource]))
        where-clause (if-let [where (get-in pinot-query [:query :where])]
                       (str "WHERE " where)
                       nil)
        group-by-clause (if-let [group-by (get-in pinot-query [:query :group-by])]
                          (str "GROUP BY " (str/join ", " group-by))
                          nil)
        order-by-clause (if-let [order-by (get-in pinot-query [:query :order-by])]
                          (str "ORDER BY " (str/join ", " order-by))
                          nil)
        limit-clause (if-let [limit (get-in pinot-query [:query :limit])]
                       (if (get-in pinot-query [:query :offset])
                         (str "LIMIT " (get-in pinot-query [:query :offset]) ", " limit)
                         (str "LIMIT " limit))
                       nil)

        clauses (remove nil? [select-clause from-clause where-clause group-by-clause order-by-clause limit-clause])]
    (log/infof "Generated Pinot SQL: %s" (str/join " " clauses))
    (assoc-in pinot-query [:query :sql] (str/join " " clauses))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Build + Log + Process Query                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- build-pinot-query
  [original-query]
  {:pre [(map? original-query)]}
    (let [pinot-query {:query {}, :mbql? true}
          ;; log original-query
          _ (log/debugf "Original query: %s" original-query)
          ;; Extract source table name
          pinot-query (handle-source-table original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after handle-source-table: %s" pinot-query)
          ;; Extract breakout fields
          pinot-query (handle-breakout original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after handle-breakout: %s" pinot-query)
          ;; Extract aggregations
          pinot-query (handle-aggregations original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after handle-aggregations: %s" pinot-query)
          ;; Extract filter
          pinot-query (handle-filter original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after handle-filter: %s" pinot-query)
          ;; Extract order by
          pinot-query (handle-order-by original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after handle-order-by: %s" pinot-query)
          ;; Extract fields (mapping IDs to field names)
          pinot-query (handle-fields original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after select-fields: %s" pinot-query)
          ;; Handle limit if provided
          pinot-query (handle-limit original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after limit: %s" pinot-query)
          ;; Handle page if provided
          pinot-query (handle-page original-query pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after page: %s" pinot-query)
          ;; Generate Pinot SQL and set it in the query
          pinot-query (generate-pinot-sql pinot-query)
          ;; log pinot-query
          _ (log/debugf "Pinot query after generate pinot sql: %s" pinot-query)
          ]

      ;; Return the final Pinot query
      pinot-query))

(defn mbql->native
  "Transpile an MBQL (inner) query into a native form suitable for a Pinot DB."
  [query]
  ;; Merge `:settings` into the inner query dict so the QP has access to it
  (let [query (assoc (:query query) :settings (:settings query))]
    (binding [*query*                           query]
      (try
        (build-pinot-query query)
        (catch Throwable e
          (throw (ex-info (tru "Error generating Pinot query")
                          {:type         qp.error-type/driver
                           :source-query query}
                          e)))))))
