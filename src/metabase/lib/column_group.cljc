(ns metabase.lib.column-group
  (:require
   [metabase.lib.card :as lib.card]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(def ^:private GroupType
  [:enum
   ;; the `:group-type/main` group includes all the columns from the source Table/Card/previous stage as well as ones
   ;; added in this stage.
   :group-type/main
   ;; the other two group types are for various types of joins.
   :group-type/join.explicit
   :group-type/join.implicit])

(def ^:private ColumnGroup
  "Schema for the metadata returned by [[group-columns]], and accepted by [[columns-group-columns]]."
  [:and
   [:map
    [:lib/type    [:= :metadata/column-group]]
    [::group-type GroupType]
    [::columns    [:sequential lib.metadata/ColumnMetadata]]]
   [:multi
    {:dispatch ::group-type}
    [:group-type/main
     any?]
    ;; if we're in the process of BUILDING a join and using this in combination
    ;; with [[metabase.lib.join/join-condition-rhs-columns]], the alias won't be present yet, so group things by the
    ;; joinable -- either the Card we're joining, or the Table we're joining. See #32493
    [:group-type/join.explicit
     [:and
      [:map
       [:join-alias {:optional true} [:ref ::lib.schema.common/non-blank-string]]
       [:table-id   {:optional true} [:ref ::lib.schema.id/table]]
       [:card-id    {:optional true} [:ref ::lib.schema.id/card]]]
      [:fn
       {:error/message ":group-type/join.explicit should only have at most one of :join-alias, :table-id, or :card-id"}
       (fn [m]
         (>= (count (keys (select-keys m [:join-alias :table-id :card-id]))) 1))]]]
    [:group-type/join.implicit
     [:map
      [:fk-field-id [:ref ::lib.schema.id/field]]]]]])

(defmethod lib.metadata.calculation/metadata-method :metadata/column-group
  [_query _stage-number column-group]
  column-group)

(defmulti ^:private display-info-for-group-method
  {:arglists '([query stage-number column-group])}
  (fn [_query _stage-number column-group]
    (::group-type column-group)))

(defmethod display-info-for-group-method :group-type/main
  [query stage-number _column-group]
  (merge
   (let [stage (lib.util/query-stage query stage-number)]
     (or
      (when-let [table (some->> (:source-table stage) (lib.metadata/table query))]
        (lib.metadata.calculation/display-info query stage-number table))
      (when-let [card (some->> (:source-card stage) (lib.metadata/card query))]
        (lib.metadata.calculation/display-info query stage-number card))
      ;; for multi-stage queries return an empty string (#30108)
      (when (next (:stages query))
        {:display-name ""})
      ;; if this is a native query or something else that doesn't have a source Table or source Card then use the
      ;; stage display name.
      {:display-name (lib.metadata.calculation/display-name query stage-number stage)}))
   {:is-from-join           false
    :is-implicitly-joinable false}))

(defmethod display-info-for-group-method :group-type/join.explicit
  [query stage-number {:keys [join-alias table-id card-id], :as _column-group}]
  (merge
   (or
    (when join-alias
      (when-let [join (lib.join/resolve-join query stage-number join-alias)]
        (lib.metadata.calculation/display-info query stage-number join)))
    (when table-id
      (when-let [table (lib.metadata/table query table-id)]
        (lib.metadata.calculation/display-info query stage-number table)))
    (when card-id
      (if-let [card (lib.metadata/card query card-id)]
        (lib.metadata.calculation/display-info query stage-number card)
        {:display-name (lib.card/fallback-display-name card-id)})))
   {:is-from-join           true
    :is-implicitly-joinable false}))

(defmethod display-info-for-group-method :group-type/join.implicit
  [query stage-number {:keys [fk-field-id], :as _column-group}]
  (merge
   (when-let [field (lib.metadata/field query fk-field-id)]
     (let [field-info (lib.metadata.calculation/display-info query stage-number field)]
       ;; Implicitly joined column pickers don't use the target table's name, they use the FK field's name with
       ;; "ID" dropped instead.
       ;; This is very intentional: one table might have several FKs to one foreign table, each with different
       ;; meaning (eg. ORDERS.customer_id vs. ORDERS.supplier_id both linking to a PEOPLE table).
       ;; See #30109 for more details.
       (assoc field-info :fk-reference-name (lib.util/strip-id (:display-name field-info)))))
   {:is-from-join           false
    :is-implicitly-joinable true}))

(defmethod lib.metadata.calculation/display-info-method :metadata/column-group
  [query stage-number column-group]
  (display-info-for-group-method query stage-number column-group))

(defmulti ^:private column-group-info-method
  {:arglists '([column-metadata])}
  :lib/source)

(defmethod column-group-info-method :source/implicitly-joinable
  [column-metadata]
  {::group-type :group-type/join.implicit, :fk-field-id (:fk-field-id column-metadata)})

(defmethod column-group-info-method :source/joins
  [{:keys [table-id], :lib/keys [card-id], :as column-metadata}]
  (merge
   {::group-type :group-type/join.explicit}
   ;; if we're in the process of BUILDING a join and using this in combination
   ;; with [[metabase.lib.join/join-condition-rhs-columns]], the alias won't be present yet, so group things by the
   ;; joinable -- either the Card we're joining, or the Table we're joining. Prefer `:lib/card-id` because when we
   ;; join a Card the Fields might have `:table-id` but we want the entire Card to appear as one group. See #32493
   (or
    (when-let [join-alias (lib.join/current-join-alias column-metadata)]
      {:join-alias join-alias})
    (when card-id
      {:card-id card-id})
    (when table-id
      {:table-id table-id}))))

(defmethod column-group-info-method :default
  [_column-metadata]
  {::group-type :group-type/main})

(mu/defn ^:private column-group-info :- [:map [::group-type GroupType]]
  "The value we should use to `group-by` inside [[group-columns]]."
  [column-metadata :- lib.metadata/ColumnMetadata]
  (column-group-info-method column-metadata))

(mu/defn group-columns :- [:sequential ColumnGroup]
  "Given a group of columns returned by a function like [[metabase.lib.order-by/orderable-columns]], group the columns
  by Table or equivalent (e.g. Saved Question) so that they're in an appropriate shape for showing in the Query
  Builder. e.g a sequence of columns like

    [venues.id
     venues.name
     venues.category-id
     ;; implicitly joinable
     categories.id
     categories.name]

  would get grouped into groups like

    [{::columns [venues.id
                 venues.name
                 venues.category-id]}
     {::columns [categories.id
                 categories.name]}]

  Groups have the type `:metadata/column-group` and can be passed directly
  to [[metabase.lib.metadata.calculation/display-info]]."
  [column-metadatas :- [:sequential lib.metadata/ColumnMetadata]]
  (mapv (fn [[group-info columns]]
          (assoc group-info
                 :lib/type :metadata/column-group
                 ::columns columns))
        (group-by column-group-info column-metadatas)))

(mu/defn columns-group-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get the columns associated with a column group"
  [column-group :- ColumnGroup]
  (::columns column-group))
