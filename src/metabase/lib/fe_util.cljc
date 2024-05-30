(ns metabase.lib.fe-util
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.common :as lib.common]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.formatting.date :as fmt.date]
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

(def ^:private expandable-time-units #{:hour})

(def ^:private expandable-date-units #{:week :month :quarter :year})

(def ^:private expandable-temporal-units
  (into expandable-time-units expandable-date-units))

(defn- expandable-temporal-expression?
  [[operator _options & [maybe-clause-arg other-arg :as args]]]
  (boolean (and (= := operator)
                (= 2 (count args))
                (lib.util/clause? maybe-clause-arg)
                (contains? expandable-temporal-units
                           (:temporal-unit (lib.options/options maybe-clause-arg)))
                (shared.ut/timestamp-coercible? other-arg))))

(defn- expand-temporal-expression
  "Modify expression in a way, that its resulting [[expression-parts]] are digestable by filter picker.

   Current filter picker implementation is unable to handle expression parts of expressions of a form
   `[:= {...} [:field {:temporal-unit :week} 11] \"2024-05-12\"]` -- expresions that check for equality of a column
   with `:temporal-unit` set to value other than `:day` or `:minute` to some date time value.

   To mitigate that expressions are converted to `:between` form which is handled correctly by filter picker. For more
   info on the issue see the comment [https://github.com/metabase/metabase/issues/12496#issuecomment-1629317661].
   This functionality is backend approach to \"smaller solution\"."
  [[_operator options column-arg dt-arg :as _expression-clause]]
  (let [temporal-unit (:temporal-unit (lib.options/options column-arg))
        interval (shared.ut/to-range (shared.ut/coerce-to-timestamp dt-arg) {:unit temporal-unit :n 1})
        formatter (if (contains? expandable-time-units temporal-unit)
                    fmt.date/datetime->iso-string
                    fmt.date/date->iso-string)]
    (into [:between options column-arg] (map formatter) interval)))

(defn- maybe-expand-temporal-expression
  [expression-clause]
  (if (expandable-temporal-expression? expression-clause)
    (expand-temporal-expression expression-clause)
    expression-clause))

(mu/defn expression-parts :- ExpressionParts
  "Return the parts of the filter clause `expression-clause` in query `query` at stage `stage-number`."
  ([query expression-clause]
   (expression-parts query -1 expression-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    expression-clause :- ::lib.schema.expression/expression]
   (let [[op options & args] (maybe-expand-temporal-expression expression-clause)
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
    (lib.util.match/match-one filter-clause
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

(defn- query-dependents-foreign-keys
  [metadata-providerable columns]
  (for [column columns
        :let [fk-target-field-id (:fk-target-field-id column)]
        :when (and fk-target-field-id (lib.types.isa/foreign-key? column))]
    (if-let [fk-target-field (lib.metadata/field metadata-providerable fk-target-field-id)]
      {:type :table, :id (:table-id fk-target-field)}
      {:type :field, :id fk-target-field-id})))

(defn- query-dependents
  [metadata-providerable query-or-join]
  (let [base-stage (first (:stages query-or-join))
        database-id (:database query-or-join -1)]
    (concat
     (when (pos? database-id)
       [{:type :database, :id database-id}
        {:type :schema,   :id database-id}])
     (when (= (:lib/type base-stage) :mbql.stage/native)
       (for [{tag-type :type, [dim-tag _opts id] :dimension} (vals (:template-tags base-stage))
             :when (and (= tag-type :dimension)
                        (= dim-tag :field)
                        (integer? id))]
         {:type :field, :id id}))
     (when-let [card-id (:source-card base-stage)]
       (concat [{:type :table, :id (str "card__" card-id)}]
               (when-let [card-columns (lib.card/saved-question-metadata metadata-providerable card-id)]
                 (query-dependents-foreign-keys metadata-providerable card-columns))))
     (when-let [table-id (:source-table base-stage)]
       (cons {:type :table, :id table-id}
             (query-dependents-foreign-keys metadata-providerable
                                            (lib.metadata/fields metadata-providerable table-id))))
     (for [stage (:stages query-or-join)
           join (:joins stage)
           dependent (query-dependents metadata-providerable join)]
       dependent))))

(def ^:private DependentItem
  [:and
   [:map
    [:type [:enum :database :schema :table :card :field]]]
   [:multi {:dispatch :type}
    [:database [:map [:id ::lib.schema.id/database]]]
    [:schema   [:map [:id ::lib.schema.id/database]]]
    [:table    [:map [:id [:or ::lib.schema.id/table :string]]]]
    [:field    [:map [:id ::lib.schema.id/field]]]]])

(mu/defn dependent-metadata :- [:sequential DependentItem]
  "Return the IDs and types of entities the metadata about is required
  for the FE to function properly.  `card-id` is provided
  when editing the card with that ID and in this case `a-query` is its
  definition (i.e., the dataset-query). `card-type` specifies the type
  of the card being created or edited."
  [query     :- ::lib.schema/query
   card-id   :- [:maybe ::lib.schema.id/card]
   card-type :- ::lib.schema.metadata/card.type]
  (into []
        (distinct)
        (concat
         (query-dependents query query)
         (when (and (some? card-id)
                    (#{:model :metric} card-type))
           (cons {:type :table, :id (str "card__" card-id)}
                 (when-let [card (lib.metadata/card query card-id)]
                   (query-dependents query (lib.query/query query card))))))))
