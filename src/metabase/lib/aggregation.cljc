(ns metabase.lib.aggregation
  (:refer-clojure :exclude [count distinct max min var])
  (:require
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn column-metadata->aggregation-ref :- :mbql.clause/aggregation
  "Given `:metadata/field` column metadata for an aggregation, construct an `:aggregation` reference."
  [metadata :- lib.metadata/ColumnMetadata]
  (let [options {:lib/uuid       (str (random-uuid))
                 :effective-type ((some-fn :effective-type :base-type) metadata)}
        ag-uuid (:lib/source-uuid metadata)]
    (assert ag-uuid "Metadata for an aggregation reference should include :lib/source-uuid")
    [:aggregation options ag-uuid]))

(mu/defn resolve-aggregation :- ::lib.schema.aggregation/aggregation
  "Resolve an aggregation with a specific `index`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   ag-uuid      :- :string]
  (let [{aggregations :aggregation} (lib.util/query-stage query stage-number)
        found (m/find-first (comp #{ag-uuid} :lib/uuid second) aggregations)]
    (when-not found
      (throw (ex-info (i18n/tru "No aggregation with uuid {0}" ag-uuid)
                      {:uuid         ag-uuid
                       :query        query
                       :stage-number stage-number})))
    found))

(defmethod lib.metadata.calculation/describe-top-level-key-method :aggregation
  [query stage-number _k]
  (when-let [aggregations (not-empty (:aggregation (lib.util/query-stage query stage-number)))]
    (lib.util/join-strings-with-conjunction
     (i18n/tru "and")
     (for [aggregation aggregations]
       (lib.metadata.calculation/display-name query stage-number aggregation :long)))))

(defmethod lib.metadata.calculation/metadata-method :aggregation
  [query stage-number [_ag {:keys [base-type effective-type], :as _opts} index, :as _aggregation-ref]]
  (let [aggregation (resolve-aggregation query stage-number index)]
    (merge
     (lib.metadata.calculation/metadata query stage-number aggregation)
     {:lib/source :source/aggregations
      :lib/source-uuid (:lib/uuid (second aggregation))}
     (when base-type
       {:base-type base-type})
     (when effective-type
       {:effective-type effective-type}))))

;;; TODO -- merge this stuff into `defop` somehow.

(defmethod lib.metadata.calculation/display-name-method :aggregation
  [query stage-number [_tag _opts index] style]
  (lib.metadata.calculation/display-name query stage-number (resolve-aggregation query stage-number index) style))

(lib.hierarchy/derive ::count-aggregation ::aggregation)

;;; count and cumulative count can both be used either with no args (count of rows) or with one arg (count of X, which
;;; I think means count where X is not NULL or something like that. Basically `count(x)` in SQL)
(doseq [tag [:count
             :cum-count]]
  (lib.hierarchy/derive tag ::count-aggregation))

(defmethod lib.metadata.calculation/display-name-method ::count-aggregation
  [query stage-number [tag _opts x] style]
  ;; x is optional.
  (if x
    (let [x-display-name (lib.metadata.calculation/display-name query stage-number x style)]
      (case tag
        :count     (i18n/tru "Count of {0}" x-display-name)
        :cum-count (i18n/tru "Cumulative count of {0}" x-display-name)))
    (case tag
      :count     (i18n/tru "Count")
      :cum-count (i18n/tru "Cumulative count"))))

(defmethod lib.metadata.calculation/column-name-method ::count-aggregation
  [_query _stage-number [tag :as _clause]]
  (case tag
    :count     "count"
    :cum-count "cum_count"))

(defmethod lib.metadata.calculation/metadata-method ::count-aggregation
  [query stage-number clause]
  (assoc ((get-method lib.metadata.calculation/metadata-method ::aggregation) query stage-number clause)
         :semantic-type :type/Quantity))

(defmethod lib.metadata.calculation/display-name-method :case
  [_query _stage-number _case _style]
  (i18n/tru "Case"))

(defmethod lib.metadata.calculation/column-name-method :case
  [_query _stage-number _case]
  "case")

;;; TODO - Should `:case` derive from `::aggregation` as well???

(lib.hierarchy/derive ::unary-aggregation ::aggregation)

(doseq [tag [:avg
             :cum-sum
             :distinct
             :max
             :median
             :min
             :stddev
             :sum
             :var]]
  (lib.hierarchy/derive tag ::unary-aggregation))

(defmethod lib.metadata.calculation/column-name-method ::unary-aggregation
  [_query _stage-number [tag _opts _arg]]
  (case tag
    :avg       "avg"
    :cum-sum   "sum"
    :distinct  "count"
    :max       "max"
    :median    "median"
    :min       "min"
    :stddev    "stddev"
    :sum       "sum"
    :var       "var"))


(defmethod lib.metadata.calculation/display-name-method ::unary-aggregation
  [query stage-number [tag _opts arg] style]
  (let [arg (lib.metadata.calculation/display-name query stage-number arg style)]
    (case tag
      :avg       (i18n/tru "Average of {0}"            arg)
      :cum-sum   (i18n/tru "Cumulative sum of {0}"     arg)
      :distinct  (i18n/tru "Distinct values of {0}"    arg)
      :max       (i18n/tru "Max of {0}"                arg)
      :median    (i18n/tru "Median of {0}"             arg)
      :min       (i18n/tru "Min of {0}"                arg)
      :stddev    (i18n/tru "Standard deviation of {0}" arg)
      :sum       (i18n/tru "Sum of {0}"                arg)
      :var       (i18n/tru "Variance of {0}"           arg))))

(defmethod lib.metadata.calculation/display-name-method :percentile
  [query stage-number [_percentile _opts x p] style]
  (i18n/tru "{0}th percentile of {1}" p (lib.metadata.calculation/display-name query stage-number x style)))

(defmethod lib.metadata.calculation/column-name-method :percentile
  [_query _stage-number _clause]
  "percentile")

(lib.hierarchy/derive :percentile ::aggregation)

;;; we don't currently have sophisticated logic for generating nice display names for filter clauses.
;;;
;;; TODO : wait a minute, we do have that stuff now!

(defmethod lib.metadata.calculation/display-name-method :sum-where
  [query stage-number [_sum-where _opts x _pred] style]
  (i18n/tru "Sum of {0} matching condition" (lib.metadata.calculation/display-name query stage-number x style)))

(defmethod lib.metadata.calculation/column-name-method :sum-where
  [query stage-number [_sum-where _opts x _pred]]
  (str "sum_where_" (lib.metadata.calculation/column-name query stage-number x)))

(lib.hierarchy/derive :sum-where ::aggregation)

(defmethod lib.metadata.calculation/display-name-method :share
  [_query _stage-number _share _style]
  (i18n/tru "Share of rows matching condition"))

(defmethod lib.metadata.calculation/column-name-method :share
  [_query _stage-number _share]
  "share")

(lib.hierarchy/derive :share ::aggregation)

(defmethod lib.metadata.calculation/display-name-method :count-where
  [_query _stage-number _count-where _style]
  (i18n/tru "Count of rows matching condition"))

(defmethod lib.metadata.calculation/column-name-method :count-where
  [_query _stage-number _count-where]
  "count-where")

(lib.hierarchy/derive :count-where ::aggregation)

(defmethod lib.metadata.calculation/metadata-method ::aggregation
  [query stage-number [_tag _opts first-arg :as clause]]
  (merge
   ;; flow the `:options` from the field we're aggregating. This is important, for some reason.
   ;; See [[metabase.query-processor-test.aggregation-test/field-settings-for-aggregate-fields-test]]
   (when first-arg
     (select-keys (lib.metadata.calculation/metadata query stage-number first-arg) [:settings]))
   ((get-method lib.metadata.calculation/metadata-method :default) query stage-number clause)))

(lib.common/defop count       [] [x])
(lib.common/defop cum-count   [] [x])
(lib.common/defop count-where [x y])
(lib.common/defop avg         [x])
(lib.common/defop distinct    [x])
(lib.common/defop max         [x])
(lib.common/defop median      [x])
(lib.common/defop min         [x])
(lib.common/defop percentile  [x y])
(lib.common/defop share       [x])
(lib.common/defop stddev      [x])
(lib.common/defop sum         [x])
(lib.common/defop cum-sum     [x])
(lib.common/defop sum-where   [x y])
(lib.common/defop var         [x])

(defmethod lib.ref/ref-method :aggregation
  [aggregation-clause]
  aggregation-clause)

(mu/defn aggregate :- ::lib.schema/query
  "Adds an aggregation to query."
  ([query an-aggregate-clause]
   (aggregate query -1 an-aggregate-clause))
  ([query stage-number an-aggregate-clause]
   (lib.util/add-summary-clause query stage-number :aggregation an-aggregate-clause)))

(mu/defn aggregations :- [:maybe [:sequential ::lib.schema.aggregation/aggregation]]
  "Get the aggregations in a given stage of a query."
  ([query]
   (aggregations query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (:aggregation (lib.util/query-stage query stage-number)))))

(mu/defn aggregations-metadata :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Get metadata about the aggregations in a given stage of a query."
  ([query]
   (aggregations-metadata query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (some->> (not-empty (:aggregation (lib.util/query-stage query stage-number)))
            (into [] (map (fn [aggregation]
                            (let [metadata (lib.metadata.calculation/metadata query stage-number aggregation)]
                              (-> metadata
                                  (u/assoc-default :effective-type (or (:base-type metadata) :type/*))
                                  (assoc :lib/source :source/aggregations
                                         :lib/source-uuid (:lib/uuid (second aggregation)))))))))))

(def ^:private OperatorWithColumns
  [:merge
   ::lib.schema.aggregation/operator
   [:map
    [:columns {:optional true} [:sequential lib.metadata/ColumnMetadata]]]])

(defmethod lib.metadata.calculation/display-name-method :mbql.aggregation/operator
  [_query _stage-number {:keys [display-info]} _display-name-style]
  (:display-name (display-info)))

(defmethod lib.metadata.calculation/display-info-method :mbql.aggregation/operator
  [_query _stage-number {:keys [display-info requires-column? selected?] short-name :short}]
  (cond-> (assoc (display-info)
                 :short-name (u/qualified-name short-name)
                 :requires-column requires-column?)
    (some? selected?) (assoc :selected selected?)))

(mu/defn aggregation-operator-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Returns the columns for which `aggregation-operator` is applicable."
  [aggregation-operator :- OperatorWithColumns]
  (:columns aggregation-operator))

(mu/defn available-aggregation-operators :- [:maybe [:sequential OperatorWithColumns]]
  "Returns the available aggegation operators for the stage with `stage-number` of `query`.
  If `stage-number` is omitted, uses the last stage."
  ([query]
   (available-aggregation-operators query -1))

  ([query :- ::lib.schema/query
    stage-number :- :int]
   (let [db-features (or (:features (lib.metadata/database query)) #{})
         stage (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)
         with-columns (fn [{:keys [requires-column? supported-field] :as operator}]
                        (cond
                          (not requires-column?)
                          operator

                          (= supported-field :any)
                          (assoc operator :columns columns)

                          :else
                          (when-let [cols (->> columns
                                               (filterv #(lib.types.isa/field-type? supported-field %))
                                               not-empty)]
                            (assoc operator :columns cols))))]
     (not-empty
      (into []
            (comp (filter (fn [op]
                            (let [feature (:driver-feature op)]
                              (or (nil? feature) (db-features feature)))))
                  (keep with-columns)
                  (map #(assoc % :lib/type :mbql.aggregation/operator)))
            lib.schema.aggregation/aggregation-operators)))))

;;; TODO -- this should probably return a plain aggregation clause rather than an external op form; people can convert
;;; to external op as needed using [[metabase.lib.common/external-op]]. See
;;; https://metaboat.slack.com/archives/C04CYTEL9N2/p1686941960566759
(mu/defn aggregation-clause :- ::lib.schema.common/external-op
  "Returns a standalone aggregation clause for an `aggregation-operator` and
  a `column`.
  For aggregations requiring an argument `column` is mandatory, otherwise
  it is optional."
  ([aggregation-operator :- ::lib.schema.aggregation/operator]
   (if-not (:requires-column? aggregation-operator)
     {:lib/type :lib/external-op
      :operator (:short aggregation-operator)
      :args     []}
     (throw (ex-info (lib.util/format "aggregation operator %s requires an argument"
                                      (:short aggregation-operator))
                     {:aggregation-operator aggregation-operator}))))

  ([aggregation-operator :- ::lib.schema.aggregation/operator
    column]
   {:lib/type :lib/external-op
    :operator (:short aggregation-operator)
    :args     [column]}))

(def ^:private SelectedOperatorWithColumns
  [:merge
   ::lib.schema.aggregation/operator
   [:map
    [:columns {:optional true} [:sequential lib.metadata/ColumnMetadata]]
    [:selected? {:optional true} :boolean]]])

(mu/defn selected-aggregation-operators :- [:maybe [:sequential SelectedOperatorWithColumns]]
  "Mark the operator and the column (if any) in `agg-operators` selected by `agg-clause`."
  [agg-operators :- [:maybe [:sequential OperatorWithColumns]]
   agg-clause]
  (when (seq agg-operators)
    (let [[op _ agg-col] agg-clause
          agg-temporal-unit (-> agg-col lib.options/options :temporal-unit)]
      (mapv (fn [agg-op]
              (cond-> agg-op
                (= (:short agg-op) op)
                (-> (assoc :selected? true)
                    (m/update-existing
                     :columns
                     (fn [cols]
                       (let [refs (mapv lib.ref/ref cols)
                             match (lib.equality/find-closest-matching-ref
                                    (lib.options/update-options agg-col dissoc :temporal-unit)
                                    refs)]
                         (if match
                           (mapv (fn [r c]
                                   (cond-> c
                                     (= r match) (assoc :selected? true)

                                     (some? agg-temporal-unit)
                                     (lib.temporal-bucket/with-temporal-bucket agg-temporal-unit)))
                                 refs cols)
                           cols)))))))
            agg-operators))))
