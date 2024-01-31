(ns metabase.lib.fe-util
  (:require
   [metabase.lib.common :as lib.common]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.shared.util.i18n :as i18n]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private ExpressionParts
  [:map
   [:lib/type [:= :mbql/expression-parts]]
   [:operator [:or :keyword :string]]
   [:options ::lib.schema.common/options]
   [:args [:sequential :any]]])

(mu/defn expression-parts :- ExpressionParts
  "Return the parts of the filter clause `expression-clause` in query `query` at stage `stage-number`."
  ([query expression-clause]
   (expression-parts query -1 expression-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    expression-clause :- ::lib.schema.expression/expression]
   (let [[op options & args] expression-clause
         ->maybe-col #(when (lib.util/ref-clause? %)
                        (lib.filter/add-column-operators
                          (lib.field/extend-column-metadata-from-ref
                            query stage-number
                            (lib.metadata.calculation/metadata query stage-number %)
                            %)))]
     {:lib/type :mbql/expression-parts
      :operator op
      :options  options
      :args     (mapv (fn [arg]
                        (if (lib.util/clause? arg)
                          (if-let [col (->maybe-col arg)]
                            col
                            (expression-parts query stage-number arg))
                          arg))
                      args)})))

(defmethod lib.common/->op-arg :mbql/expression-parts
  [{:keys [operator options args] :or {options {}}}]
  (lib.common/->op-arg (lib.options/ensure-uuid (into [(keyword operator) options]
                                                      (map lib.common/->op-arg)
                                                      args))))

(mu/defn expression-clause :- ::lib.schema.expression/expression
  "Returns a standalone clause for an `operator`, `options`, and arguments."
  [operator :- :keyword
   args     :- [:sequential :any]
   options  :- [:maybe :map]]
  (lib.options/ensure-uuid (into [operator options] (map lib.common/->op-arg) args)))

(mu/defn filter-args-display-name :- :string
  "Provides a reasonable display name for the `filter-clause` excluding the column-name.
   Can be expanded as needed but only currently defined for a narrow set of date filters.

   Falls back to the full filter display-name"
  [query stage-number filter-clause]
  (let [->temporal-name #(shared.ut/format-unit % nil)
        temporal? #(lib.util/original-isa? % :type/Temporal)
        unit-is (fn [unit-or-units]
                  (let [units (set (u/one-or-many unit-or-units))]
                    (fn [maybe-clause]
                      (clojure.core/and
                        (temporal? maybe-clause)
                        (lib.util/clause? maybe-clause)
                        (clojure.core/contains? units (:temporal-unit (second maybe-clause)))))))]
    (mbql.u/match-one filter-clause
      [:= _ (x :guard (unit-is lib.schema.temporal-bucketing/datetime-truncation-units)) (y :guard string?)]
      (shared.ut/format-relative-date-range y 0 (:temporal-unit (second x)) nil nil {:include-current true})

      [:= _ (x :guard temporal?) (y :guard (some-fn int? string?))]
      (lib.temporal-bucket/describe-temporal-pair x y)

      [:!= _ (x :guard temporal?) (y :guard (some-fn int? string?))]
      (i18n/tru "Excludes {0}" (lib.temporal-bucket/describe-temporal-pair x y))

      [:< _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "Before {0}" (->temporal-name y))

      [:> _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "After {0}" (->temporal-name y))

      [:between _ (x :guard temporal?) (y :guard string?) (z :guard string?)]
      (shared.ut/format-diff y z)

      [:is-null & _]
      (i18n/tru "Is Empty")

      [:not-null & _]
      (i18n/tru "Is Not Empty")

      [:time-interval _ (x :guard temporal?) n unit]
      (lib.temporal-bucket/describe-temporal-interval n unit)

      _
      (lib.metadata.calculation/display-name query stage-number filter-clause))))

(defn- query-dependents
  [metadata-providerable query-or-join]
  (let [base-stage (first (:stages query-or-join))
        database-id (:database query-or-join -1)]
    (concat
     (when (pos? database-id)
       [{:type :database, :id database-id}
        {:type :schema,   :id database-id}])
     ;; cf. frontend/src/metabase-lib/queries/NativeQuery.ts
     (when (= (:lib/type base-stage) :mbql.stage/native)
       (for [{tag-type :type, [dim-tag _opts id] :dimension} (vals (:template-tags base-stage))
             :when (and (= tag-type :dimension)
                        (= dim-tag :field)
                        (integer? id))]
         {:type :field, :id id}))
     ;; cf. frontend/src/metabase-lib/Question.ts and frontend/src/metabase-lib/queries/StructuredQuery.ts
     (when-let [card-id (:source-card base-stage)]
       (let [card-metadata (lib.metadata/card metadata-providerable card-id)]
         (cond-> (for [column (:result-metadata card-metadata)
                       :let [column (u/normalize-map column)
                             fk-target (:fk-target-field-id column)]
                       :when (and (integer? fk-target)
                                  (lib.types.isa/foreign-key? column))]
                   {:type :field, :id fk-target})
           ;; the FE code mentions this, but #36974 doesn't
           #_#_:always (conj {:type :question, :id card-id})
           (:dataset card-metadata) (conj {:type :table, :id (str "card__" card-id)}))))
     (when-let [table-id (:source-table base-stage)]
       [{:type :table, :id table-id}])
     (for [stage (:stages query-or-join)
           join (:joins stage)
           dependent (query-dependents metadata-providerable join)]
       dependent))))

(def ^:private DependentItem
  [:and
   [:map
    [:type [:enum :database :schema :table :field]]]
   [:multi {:dispatch :type}
    [:database [:map [:id ::lib.schema.id/database]]]
    [:schema   [:map [:id ::lib.schema.id/database]]]
    [:table    [:map [:id [:or ::lib.schema.id/table :string]]]]
    [:field    [:map [:id ::lib.schema.id/field]]]]])

(mu/defn dependent-metadata :- [:sequential DependentItem]
  "Return the IDs and types of entities the metadata about is required
  for the FE to function properly."
  [query :- ::lib.schema/query]
  (into [] (distinct) (query-dependents query query)))
