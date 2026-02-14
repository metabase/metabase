(ns metabase.driver.sql-mbql5
  "Driver for opt in mbql 5 compilation."
  (:refer-clojure :exclude [some mapv every? select-keys empty? not-empty])
  (:require
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv empty?]]))

(driver/register! :sql-mbql5, :parent :sql, :abstract? true)

(defmethod sql.qp/preprocess :sql-mbql5
  [_driver mbql5-query]
  (-> mbql5-query
      driver-api/nest-breakouts-in-stages-with-window-aggregation
      driver-api/nest-expressions
      driver-api/add-alias-info
      :stages))

(defn- compile-stage [driver stage]
  (if (= (:lib/type stage) :mbql.stage/native)
    (sql.qp/sql-source-query (:native stage) (:params stage))
    (binding [sql.qp/*inner-query* stage]
      (#'sql.qp/apply-top-level-clauses driver {} stage))))

(defn- compile-stages [driver stages]
  (reduce (fn [hsql-form stage]
            (let [compiled-stage (compile-stage driver stage)]
              (if hsql-form
                ;; When there's a previous stage, we need to:
                ;; 1. Add the :from clause with the previous stage
                ;; 2. Re-apply add-default-select so it uses the correct table alias
                ;; The compiled-stage may have :select [[:*]] from add-default-select,
                ;; but we need :select [[:raw "\"source\".*"]] based on the :from alias
                (let [table-alias (sql.qp/->honeysql driver (h2x/identifier :table-alias sql.qp/source-query-alias))
                      with-from (assoc compiled-stage :from [[hsql-form [table-alias]]])
                      ;; Clear the default select if it's just :* so add-default-select can recompute it
                      cleared (if (= (:select with-from) [[:*]])
                                (dissoc with-from :select)
                                with-from)]
                  (#'sql.qp/add-default-select driver cleared))
                compiled-stage)))
          nil
          stages))

(defmethod sql.qp/->honeysql [:sql-mbql5 ::sql.qp/mbql]
  [driver [_ stages]]
  (compile-stages driver stages))

(defmethod sql.qp/apply-top-level-clause [:sql-mbql5 :filters]
  [driver _ honeysql-form {:keys [filters]}]
  (let [compiled-filters (mapv (partial sql.qp/->honeysql driver) filters)
        where-clause (if (= 1 (count compiled-filters))
                       (first compiled-filters)
                       (into [:and] compiled-filters))]
    (sql.helpers/where honeysql-form where-clause)))

(defmethod sql.qp/join-source :sql-mbql5
  [driver {:keys [stages]}]
  (compile-stages driver stages))

;; TODO(rileythomp): Add schemas like in the :sql impl
(mu/defmethod sql.qp/join->honeysql :sql-mbql5
  [driver {:keys [conditions] :as join}]
  (let [join-alias ((some-fn driver-api/qp.add.alias :alias) join)]
    (assert (string? join-alias))
    [[(sql.qp/join-source driver join)
      [(sql.qp/->honeysql driver (h2x/identifier :table-alias join-alias))]]
     (if (= (count conditions) 1)
       (sql.qp/->honeysql driver (first conditions))
       (into [:and] (mapv (partial sql.qp/->honeysql driver) conditions)))]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :aggregation]
  [driver [_ opts agg-uuid :as clause]]
  ;; TODO(rileythomp): Handle more cases here?
  (if-let [desired-alias (get opts driver-api/qp.add.desired-alias)]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias desired-alias))
    (throw (ex-info "Aggregation reference missing ::desired-alias. Was add-alias-info run?"
                    {:clause clause, :uuid agg-uuid}))))

(defmethod sql.qp/->honeysql [:sql-mbql5 ::sql.qp/over-order-bys]
  [driver [_op aggregations [direction _opts expr]]]
  (if (lib.util/clause-of-type? expr :aggregation)
    (let [[_op _opts agg-uuid] expr
          aggregation (m/find-first #(= (lib.options/uuid %) agg-uuid) aggregations)]
      (when-not (#'sql.qp/contains-clause? #{:cum-count :cum-sum :offset} aggregation)
        [(sql.qp/->honeysql driver aggregation) direction]))
    [(sql.qp/->honeysql driver expr) direction]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :cum-count]
  [driver [_ opts expr-or-nil]]
  ;; a cumulative count with no breakouts doesn't really mean anything, just compile it as a normal count.
  (if (empty? (:breakout sql.qp/*inner-query*))
    (sql.qp/->honeysql driver [:count opts expr-or-nil])
    (#'sql.qp/cumulative-aggregation-over-rows
     driver
     [:sum (if expr-or-nil
             [:count (sql.qp/->honeysql driver expr-or-nil)]
             [:count :*])])))

(defmethod sql.qp/->honeysql [:sql-mbql5 :cum-sum]
  [driver [_ opts expr]]
  ;; a cumulative sum with no breakouts doesn't really mean anything, just compile it as a normal sum.
  (if (empty? (:breakout sql.qp/*inner-query*))
    (sql.qp/->honeysql driver [:sum opts expr])
    (#'sql.qp/cumulative-aggregation-over-rows
     driver
     [:sum [:sum (sql.qp/->honeysql driver expr)]])))

(defmethod sql.qp/->honeysql [:sql-mbql5 :distinct-where]
  [driver [_ opts arg pred]]
  [::h2x/distinct-count
   (sql.qp/->honeysql driver [:case opts [[pred arg]]])])

(defmethod sql.qp/->honeysql [:sql-mbql5 :sum-where]
  [driver [_ opts arg pred]]
  (sql.qp/->honeysql driver [:sum  opts [:case opts [[pred arg]] 0.0]]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :count-where]
  [driver [_ opts pred]]
  (sql.qp/->honeysql driver [:sum-where opts 1 pred]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :share]
  [driver [_ opts pred]]
  [:/ (sql.qp/->honeysql driver [:count-where opts pred]) :%count.*])

(defmethod sql.qp/->honeysql [:sql-mbql5 :case]
  [driver [op _opts cases default]]
  ((get-method sql.qp/->honeysql [:sql op]) driver [op cases {:default default}]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :text]
  [driver [_ opts value]]
  (sql.qp/->honeysql driver [::sql.qp/cast-to-text opts value]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :today]
  [driver [_op opts]]
  (sql.qp/->honeysql driver [:date opts [:now]]))

(defmethod sql.qp/date [:sql-mbql5 :week-of-year]
  [driver _ expr]
  ;; Some DBs truncate when doing integer division, therefore force float arithmetic
  ;; Use h2x/ceil directly since expr is already compiled HoneySQL - going through ->honeysql
  ;; with an MBQL :ceil clause would cause issues with mbql5 drivers that expect different arg structure
  (sql.qp/->honeysql driver [:ceil {} (-> (sql.qp/date driver :day-of-year (sql.qp/date driver :week expr))
                                          (h2x// 7.0)
                                          (sql.qp/compiled))]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :value]
  [driver [op {:keys [base-type effective-type]} value]]
  ((get-method sql.qp/->honeysql [:sql op]) driver [op value {:base_type base-type :effective_type effective-type}]))

(doseq [op [;; unary
            :not :asc :desc :aggregation-options :date
            :length :trim :ltrim :rtrim :upper :lower ::sql.qp/cast-to-text
            :integer :float  :floor :ceil :round :abs :log :exp :sqrt
            :avg :median :stddev :var :sum :min :max :count :distinct
            ;; binary
            := :!= :> :>= :< :<=
            :power :percentile
            :time :temporal-extract
            :absolute-datetime :relative-datetime
            ;; ternary
            :between :replace :substring
            :datetime-add :datetime-subtract :datetime-diff
            ;; n-ary
            :+ :- :* :/ :and :or :concat :coalesce]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op _opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (into [op] args))))

(doseq [op [;; unary
            :field :expression :datetime
            ;; binary
            :contains :starts-with :ends-with]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (into [op] (conj (vec args) opts)))))

(defmethod sql.qp/field-clause->alias :sql-mbql5
  [driver [clause-type opts id-or-name] & unique-name-fn]
  (sql.qp/field-clause->alias* driver [clause-type id-or-name opts] unique-name-fn))

(defmethod sql.qp/clause-value-idx :sql-mbql5 [_driver] 2)

(defmethod sql.qp/unwrap-value-literal :sql-mbql5
  [_driver maybe-value-form]
  (lib.util.match/match-one maybe-value-form
    [:value _opts x & _] x
    _              &match))

(defmethod sql.qp/remapped-order-by? :sql-mbql5
  [_driver [_dir _opts [_ opts _name]]]
  (driver-api/qp.util.transformations.nest-breakouts.externally-remapped-field (dissoc opts :lib/uuid)))

(defmethod sql.qp/remapped-breakout? :sql-mbql5
  [_driver [_ opts _name]]
  (driver-api/qp.util.transformations.nest-breakouts.externally-remapped-field (dissoc opts :lib/uuid)))

(defmethod sql.qp/finest-temporal-breakout-idx :sql-mbql5
  [_driver breakouts]
  (driver-api/finest-temporal-breakout-index breakouts 1))

(defmethod sql.qp/literal-text-value? :sql-mbql5
  [driver [op {:keys [base-type effective-type]} value]]
  ((get-method sql.qp/literal-text-value? :sql) driver [op value {:base_type base-type :effective_type effective-type}]))

(defmethod sql.qp/expression-by-name :sql-mbql5
  [_driver expression-name]
  (m/find-first (comp #{expression-name} lib.util/expression-name)
                (:expressions sql.qp/*inner-query*)))

(defmethod sql.qp/add-interval :sql-mbql5
  [driver hsql-form op [_ _opts amount unit]]
  (sql.qp/add-interval-honeysql-form driver hsql-form (cond-> amount (= op :-) -) unit))

(defmethod sql.qp/make-clause :sql-mbql5
  [_driver tag & args]
  (into [tag {}] args))
