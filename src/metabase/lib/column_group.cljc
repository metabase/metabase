(ns metabase.lib.column-group
  (:require
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
    [:group-type/join.explicit
     [:map
      [:join-alias [:ref ::lib.schema.common/non-blank-string]]]]
    [:group-type/join.implicit
     [:map
      [:table-id [:ref ::lib.schema.id/table]]]]]])

(defmethod lib.metadata.calculation/metadata-method :metadata/column-group
  [_query _stage-number column-group]
  column-group)

(defmethod lib.metadata.calculation/display-info-method :metadata/column-group
  [query stage-number column-group]
  (merge
   {:name "group", :display_name "<Group>"}
   (case (::group-type column-group)
     :group-type/main
     (let [stage (lib.util/query-stage query stage-number)]
       (when-let [table-id (:source-table stage)]
         (when-let [table (lib.metadata/table query table-id)]
           (lib.metadata.calculation/display-info query stage-number table))))

     :group-type/join.explicit
     (let [join-alias (:join-alias column-group)]
       (when-let [join (lib.join/resolve-join query stage-number join-alias)]
         (lib.metadata.calculation/display-info query stage-number join)))

     :group-type/join.implicit
     (let [table-id (:table-id column-group)]
       (when-let [table (lib.metadata/table query table-id)]
         (lib.metadata.calculation/display-info query stage-number table))))))

(mu/defn ^:private column-group-info :- [:map [::group-type GroupType]]
  "The value we should use to `group-by` inside [[group-columns]]."
  [{source :lib/source, :as column-metadata} :- lib.metadata/ColumnMetadata]
  (case source
    :source/implicitly-joinable
    {::group-type :group-type/join.implicit, :table-id (:table_id column-metadata)}

    :source/joins
    {::group-type :group-type/join.explicit, :join-alias (lib.join/current-join-alias column-metadata)}

    {::group-type :group-type/main}))

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
