(ns metabase.driver.sql-mbql5
  "An abstract driver to allow for opt-in MBQL5 compilation."
  (:refer-clojure :exclude [mapv get-in])
  (:require
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql.parameters.substitution :as sql.params.substitution]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv get-in]]))

(driver/register! :sql-mbql5, :parent :sql, :abstract? true)

(defmethod sql.qp/preprocess :sql-mbql5
  [_driver mbql5-query]
  (-> mbql5-query
      driver-api/nest-breakouts-in-stages-with-window-aggregation
      driver-api/nest-expressions
      driver-api/add-alias-info
      :stages))

(defn- stage->honeysql [driver stage]
  (cond
    (:persisted-info/native stage)
    (sql.qp/sql-source-query (:persisted-info/native stage) nil)

    (= (:lib/type stage) :mbql.stage/native)
    (sql.qp/sql-source-query (:native stage) (:params stage))

    :else
    (binding [sql.qp/*inner-query* stage]
      (#'sql.qp/apply-top-level-clauses driver {} stage))))

(defn- stages->honeysql [driver stages]
  (first
   (reduce
    (fn [[prev-hsql prev-stage] stage]
      (let [stage-hsql (stage->honeysql driver stage)]
        (if prev-hsql
          (let [table-alias (sql.qp/->honeysql driver (h2x/identifier :table-alias sql.qp/source-query-alias))
                columns-metadata (get-in prev-stage [:lib/stage-metadata :columns])
                desired-aliases (mapv :lib/desired-column-alias columns-metadata)
                cur-hsql (cond-> (assoc stage-hsql :from [[prev-hsql [table-alias]]])
                           (sql.qp/needs-cte-for-duplicate-cols? columns-metadata)
                           (assoc :with [[[sql.qp/source-query-alias {:columns (mapv #(h2x/identifier :field %) desired-aliases)}]
                                          prev-hsql]]
                                  :from [[table-alias]])

                           ;; Clear the default select if it's just :* so add-default-select can recompute it
                           (= (:select stage-hsql) [[:*]])
                           (dissoc :select))]
            [(#'sql.qp/add-default-select driver cur-hsql) stage])
          [stage-hsql stage])))
    [nil nil]
    stages)))

(defmethod sql.qp/compile-mbql :sql-mbql5
  [driver stages]
  (stages->honeysql driver stages))

(defmethod sql.qp/apply-top-level-clause [:sql-mbql5 :filters]
  [driver _ honeysql-form {:keys [filters]}]
  (let [compiled-filters (mapv (partial sql.qp/->honeysql driver) filters)
        where-clause (if (= 1 (count compiled-filters))
                       (first compiled-filters)
                       (into [:and] compiled-filters))]
    (sql.helpers/where honeysql-form where-clause)))

(defmethod sql.qp/join-source :sql-mbql5
  [driver {:keys [stages]}]
  (stages->honeysql driver stages))

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

(defmethod sql.qp/over-order-by->honeysql :sql-mbql5
  [driver aggregations [direction _opts expr]]
  (if (lib.util/clause-of-type? expr :aggregation)
    (let [[_op _opts agg-uuid] expr
          aggregation (m/find-first #(= (lib.options/uuid %) agg-uuid) aggregations)]
      (when-not (#'sql.qp/contains-clause? #{:cum-count :cum-sum :offset} aggregation)
        [(sql.qp/->honeysql driver aggregation) direction]))
    [(sql.qp/->honeysql driver expr) direction]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :case]
  [driver [op _opts cases default]]
  ;; `mbql-clause` drops the `{:default 0.0}` from `:sum-where` to just `0.0`
  ;; so we need to add the key back for `sql.qp/->honeysql[:sql :case]`
  ((get-method sql.qp/->honeysql [:sql op]) driver [op cases {:default default}]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :value]
  [driver [op {:keys [base-type effective-type]} value]]
  ;; We need to rename the keys for `sql.qp/->honeysql [:sql :value]`
  ((get-method sql.qp/->honeysql [:sql op]) driver [op value {:base_type base-type :effective_type effective-type}]))

;; For clauses that DO NOT have their opts propogated
(doseq [op [;; unary
            :not :asc :desc :aggregation-options :date
            :length :trim :ltrim :rtrim :upper :lower ::sql.qp/cast-to-text
            :integer :float  :floor :ceil :round :abs :log :exp :sqrt
            :avg :median :stddev :var :sum :min :max :count :distinct
            :text :count-where :share
            ;; binary
            := :!= :> :>= :< :<=
            :power :percentile
            :time :temporal-extract
            :absolute-datetime :relative-datetime
            :sum-where :distinct-where
            ;; ternary
            :between :replace :substring
            :datetime-add :datetime-subtract :datetime-diff
            ;; n-ary
            :+ :- :* :/ :and :or :concat :coalesce
            ;; cumulative functions
            :cum-sum :cum-count]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op _opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (into [op] args))))

;; For clauses that DO have their opts propogated
(doseq [op [;; unary
            :field :expression :datetime
            ;; binary
            :contains :starts-with :ends-with]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (into [op] (cond-> (vec args) opts (conj opts))))))

(defmethod sql.qp/mbql-clause :sql-mbql5
  [driver [tag & args :as clause]]
  (cond
    ;; Return the clause as is if it's already MBQL5 or if it's already compiled to HoneySQL
    (or (lib.options/uuid clause)
        (= ::sql.qp/compiled tag))
    clause

    ;; Convert the clause to MBQL5 if it's a regular MBQL4 clause
    (and (simple-keyword? tag)
         (not (driver-api/match-lite clause ::sql.qp/compiled true)))
    (lib.convert/->pMBQL clause)

    :else ;; Handle namespaced or partially compiled clauses manually
    (into [tag {:lib/uuid (str (random-uuid))}]
          (map (fn [x] (sql.qp/mbql-clause driver x))) args)))

(defmethod sql.params.substitution/field->clause :sql-mbql5
  [driver field other-opts]
  (sql.params.substitution/field->clause* driver field other-opts))

(defmethod sql.qp/clause-value-idx :sql-mbql5 [_driver] 2)

(defmethod sql.qp/expression-by-name :sql-mbql5
  [_driver expression-name]
  (m/find-first (comp #{expression-name} lib.util/expression-name)
                (:expressions sql.qp/*inner-query*)))

;; TODO(rileythomp, 2026-03-19): Check if we actually need to dissoc here and below
(defmethod sql.qp/remapped-order-by? :sql-mbql5
  [_driver [_dir _opts [_ opts _name]]]
  (driver-api/qp.util.transformations.nest-breakouts.externally-remapped-field (dissoc opts :lib/uuid)))

(defmethod sql.qp/remapped-breakout? :sql-mbql5
  [_driver [_ opts _name]]
  (driver-api/qp.util.transformations.nest-breakouts.externally-remapped-field (dissoc opts :lib/uuid)))

(defmethod sql.qp/finest-temporal-breakout-idx :sql-mbql5
  [_driver breakouts]
  (driver-api/finest-temporal-breakout-index breakouts 1))
