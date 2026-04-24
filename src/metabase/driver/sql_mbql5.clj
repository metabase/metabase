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
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.parameters.dates :as qp.params.dates]
   [metabase.query-processor.parameters.operators :as qp.params.ops]
   [metabase.query-processor.util.add-alias-info :as add]
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

(defn- predicates->honeysql [driver predicates]
  (let [predicates (mapv #(sql.qp/->honeysql driver %) predicates)]
    (if (= 1 (count predicates))
      (first predicates)
      (into [:and] predicates))))

(defmethod sql.qp/apply-top-level-clause [:sql-mbql5 :filters]
  [driver _ honeysql-form {:keys [filters]}]
  (sql.helpers/where honeysql-form (predicates->honeysql driver filters)))

(defmethod sql.qp/join-source :sql-mbql5
  [driver {:keys [stages]}]
  (stages->honeysql driver stages))

(mu/defmethod sql.qp/join->honeysql :sql-mbql5 :- sql.qp/HoneySQLJoin
  [driver {:keys [conditions] :as join} :- [:ref :metabase.lib.schema.join/join]]
  (let [join-alias ((some-fn driver-api/qp.add.alias :alias) join)]
    (assert (string? join-alias))
    [[(sql.qp/join-source driver join)
      [(sql.qp/->honeysql driver (h2x/identifier :table-alias join-alias))]]
     (predicates->honeysql driver conditions)]))

(defn- agg-by-id [aggs agg-uuid]
  (m/find-first #(= (lib.options/uuid %) agg-uuid) aggs))

;; Should mirror the logic in `sql.qp/->honeysql [:sql :aggregation]`
(defmethod sql.qp/->honeysql [:sql-mbql5 :aggregation]
  [driver [_ _opts _agg-uuid :as clause]]
  (driver-api/match-lite clause
    [:aggregation {driver-api/qp.add.desired-alias desired-alias} _agg-uuid]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias desired-alias))

    [:aggregation {driver-api/qp.add.source-alias source-alias} _agg-uuid]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias source-alias))

    [:aggregation {:lib/source-name source-name} _agg-uuid]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias source-name))

    [:aggregation _opts agg-uuid]
    (let [agg (agg-by-id (:aggregation sql.qp/*inner-query*) agg-uuid)]
      (&recur agg))

    [:distinct & _]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias :count))

    [#{:+ :- :* :/} & _]
    (sql.qp/->honeysql driver &match)

    [:offset {:lib/source-name source-name} _expr _n]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias source-name))

    [ag-type & _]
    (sql.qp/->honeysql driver (h2x/identifier :field-alias ag-type))))

(defmethod sql.qp/over-order-by->honeysql :sql-mbql5
  [driver aggregations [direction _opts expr]]
  (if (lib.util/clause-of-type? expr :aggregation)
    (let [[_op _opts agg-uuid] expr
          aggregation (agg-by-id aggregations agg-uuid)]
      (when-not (#'sql.qp/contains-clause? #{:cum-count :cum-sum :offset} aggregation)
        [(sql.qp/->honeysql driver aggregation) direction]))
    [(sql.qp/->honeysql driver expr) direction]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :value]
  [driver [op {:keys [base-type effective-type]} value]]
  ;; We need to rename just these keys for `sql.qp/->honeysql [:sql :value]`
  ((get-method sql.qp/->honeysql [:sql op]) driver [op value {:base_type base-type :effective_type effective-type}]))

(defmethod sql.qp/->honeysql [:sql-mbql5 :case]
  [driver [op _opts cases opts-or-default]]
  ;; Handle the default options coming in as a map from `mbql-clause`, or as a single value from ->mbql5
  ((get-method sql.qp/->honeysql [:sql op]) driver [op cases (if (map? opts-or-default)
                                                               opts-or-default
                                                               {:default opts-or-default})]))

;; For clauses that DO NOT have their opts propagated
(doseq [op [:!= :* :+ :- :/ :< :<= := :> :>= :abs :absolute-datetime :aggregation-options :and :asc :avg :between
            ::sql.qp/cast ::sql.qp/cast-to-text :ceil :coalesce :concat :count :count-where :cum-count :cum-sum :date
            :datetime-add :datetime-diff :datetime-subtract :desc :distinct :distinct-where :exp
            ::sql.qp/expression-literal-text-value :float :floor :integer :length :log :lower :ltrim :max :median :min
            ::sql.qp/nfc-path :not :now :or :percentile :power :relative-datetime :replace :round :rtrim :share :sqrt
            :stddev :substring :sum :sum-where :temporal-extract :text :time :today :trim :upper :var]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op _opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (into [op] args))))

;; For clauses that DO have their opts propagated
(doseq [op [:expression :field :datetime :contains :starts-with :ends-with]]
  (defmethod sql.qp/->honeysql [:sql-mbql5 op]
    [driver [op opts & args]]
    ((get-method sql.qp/->honeysql [:sql op]) driver (cond-> (into [op] args) opts (conj opts)))))

(defmethod sql.qp/mbql-clause-with-opts :sql-mbql5
  [_driver tag opts & args]
  (into [tag (lib.schema.common/normalize-options-map opts)] args))

(defmethod sql.qp/expression-by-name :sql-mbql5
  [_driver inner-query expression-name]
  (m/find-first #(= expression-name (lib.util/expression-name %)) (:expressions inner-query)))

(defmethod sql.qp/aggregation-name :sql-mbql5
  [_driver inner-query ag-clause]
  (or (::add/desired-alias (lib/options ag-clause))
      (:name (lib/options ag-clause))
      (lib/column-name inner-query ag-clause)))

(defmethod sql.qp/clause-value-idx :sql-mbql5 [_driver] 2)

(defmethod sql.qp/breakout-options-index :sql-mbql5 [_driver] 1)

(mu/defmethod sql.params.substitution/field->clause :sql-mbql5 :- :mbql.clause/field
  [driver field other-opts]
  (sql.qp/mbql-clause-with-opts driver :field
                                (merge {:base-type                     (:base-type field)
                                        driver-api/qp.add.source-table (:table-id field)
                                        ::sql.params.substitution/compiling-field-filter?      true}
                                       other-opts)
                                (:id field)))

(defmethod sql.params.substitution/to-clause :sql-mbql5 [_driver param] (qp.params.ops/to-clause param))

(defmethod sql.params.substitution/desugar-filter-clause :sql-mbql5 [_driver filter-clause] (lib/desugar-filter-clause filter-clause))

(defmethod sql.params.substitution/wrap-value-literals-in-mbql :sql-mbql5
  [_driver mbql]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (driver-api/wrap-value-literals-in-mbql5 mbql))

(defmethod sql.params.substitution/date-string->filter :sql-mbql5 [_driver date-string field] (qp.params.dates/date-string->filter date-string field))
