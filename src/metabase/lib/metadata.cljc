(ns metabase.lib.metadata
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;; Column vs Field?
;;;
;;; Lately I've been using `Field` to only mean a something that lives in the application database, i.e. something
;;; that is associated with row in the `Field` table and has an `:id`. I'm using `Column` as a more generic term that
;;; includes not only `Field`s but also the columns returned by a stage of a query, e.g. `SELECT count(*) AS count`
;;; returns a `Column` called `count`, but it's not a `Field` because it's not associated with an actual Field in the
;;; application database.
;;;
;;; Column = any column returned by a query or stage of a query
;;; Field  = a Column that is associated with a capital-F Field in the application database, i.e. has an `:id`
;;;
;;; All Fields are Columns, but not all Columns are Fields.
;;;
;;; Also worth a mention: we also have `Dimension`s, associated with the `dimension` table in the application
;;; database, which can act like psuedo-Fields or affect how we treat normal Fields. For example, Dimensions are used
;;; to implement column remapping, e.g. the GUI might display values of `categories.name` when it presents filter
;;; options for `venues.category_id` -- you can remap a meaningless integer FK column to something more helpful.
;;; 'Human readable values' like these can also be entered manually from the GUI, for example for enum columns. How
;;; will this affect what MLv2 needs to know or does? Not clear at this point, but we'll probably want to abstract
;;; away dealing with Dimensions in the future so the FE QB GUI doesn't need to special case them.

(mr/def ::column-source
  [:enum
   ;; these are for things from some sort of source other than the current stage;
   ;; they must be referenced with string names rather than Field IDs
   :source/card
   :source/native
   :source/previous-stage
   ;; these are for things that were introduced by the current stage of the query; `:field` references should be
   ;; referenced with Field IDs if available.
   ;;
   ;; default columns returned by the `:source-table` for the current stage.
   :source/table-defaults
   ;; specifically introduced by the corresponding top-level clauses.
   :source/fields
   :source/aggregations
   :source/breakouts
   ;; introduced by a join, not necessarily ultimately returned.
   :source/joins
   ;; Introduced by `:expressions`; not necessarily ultimately returned.
   :source/expressions
   ;; Not even introduced, but 'visible' because this column is implicitly joinable.
   :source/implicitly-joinable])

;;; External remapping (Dimension) for a column. From the [[metabase.models.dimension]] with `type = external`
;;; associated with a `Field` in the application database.
;;; See [[metabase.query-processor.middleware.add-dimension-projections]] for what this means.
(mr/def ::column.remapping.external
  [:map
   [:lib/type [:= :metadata.column.remapping/external]]
   [:id       ::lib.schema.id/dimension]
   ;; from `dimension.name`
   [:name     ::lib.schema.common/non-blank-string]
   ;; `dimension.human_readable_field_id` in the application database. ID of the Field to get human-readable values
   ;; from. e.g. if the column in question is `venues.category-id`, then this would be the ID of `categories.name`
   [:field-id ::lib.schema.id/field]])

;;; Internal remapping (FieldValues) for a column. From [[metabase.models.dimension]] with `type = internal` and
;;; the [[metabase.models.field-values]] associated with a `Field` in the application database.
;;; See [[metabase.query-processor.middleware.add-dimension-projections]] for what this means.
(mr/def ::column.remapping.internal
  [:map
   [:lib/type              [:= :metadata.column.remapping/internal]]
   [:id                    ::lib.schema.id/dimension]
   ;; from `dimension.name`
   [:name                  ::lib.schema.common/non-blank-string]
   ;; From `metabase_fieldvalues.values`. Original values
   [:values                [:sequential :any]]
   ;; From `metabase_fieldvalues.human_readable_values`. Human readable remaps for the values at the same indexes in
   ;; `:values`
   [:human-readable-values [:sequential :any]]])

(def ColumnMetadata
  "Malli schema for a valid map of column metadata, which can mean one of two things:

  1. Metadata about a particular Field in the application database. This will always have an `:id`

  2. Results metadata from a column in `data.cols` and/or `data.results_metadata.columns` in a Query Processor
     response, or saved in something like `Card.result_metadata`. These *may* have an `:id`, or may not -- columns
     coming back from native queries or things like `SELECT count(*)` aren't associated with any particular `Field`
     and thus will not have an `:id`.

  Now maybe these should be two different schemas, but `:id` being there or not is the only real difference; besides
  that they are largely compatible. So they're the same for now. We can revisit this in the future if we actually want
  to differentiate between the two versions."
  [:map
   {:error/message "Valid column metadata"}
   [:lib/type  [:= :metadata/column]]
   ;; column names are allowed to be empty strings in SQL Server :/
   [:name      :string]
   ;; TODO -- ignore `base_type` and make `effective_type` required; see #29707
   [:base-type ::lib.schema.common/base-type]
   [:id             {:optional true} ::lib.schema.id/field]
   [:display-name   {:optional true} [:maybe :string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   ;; if this is a field from another table (implicit join), this is the field in the current table that should be
   ;; used to perform the implicit join. e.g. if current table is `VENUES` and this field is `CATEGORIES.ID`, then the
   ;; `fk_field_id` would be `VENUES.CATEGORY_ID`. In a `:field` reference this is saved in the options map as
   ;; `:source-field`.
   [:fk-field-id        {:optional true} [:maybe ::lib.schema.id/field]]
   ;; `metabase_field.fk_target_field_id` in the application database; recorded during the sync process. This Field is
   ;; an foreign key, and points to this Field ID. This is mostly used to determine how to add implicit joins by
   ;; the [[metabase.query-processor.middleware.add-implicit-joins]] middleware.
   [:fk-target-field-id {:optional true} [:maybe ::lib.schema.id/field]]
   ;; Join alias of the table we're joining against, if any. Not really 100% clear why we would need this on top
   ;; of [[metabase.lib.join/current-join-alias]], which stores the same info under a namespaced key. I think we can
   ;; remove it.
   [:source-alias       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; what top-level clause in the query this metadata originated from, if it is calculated (i.e., if this metadata
   ;; was generated by [[metabase.lib.metadata.calculation/metadata]])
   [:lib/source         {:optional true} [:ref ::column-source]]
   ;; ID of the Card this came from, if this came from Card results metadata. Mostly used for creating column groups.
   [:lib/card-id        {:optional true} [:maybe ::lib.schema.id/card]]
   ;;
   ;; this stuff is adapted from [[metabase.query-processor.util.add-alias-info]]. It is included in
   ;; the [[metabase.lib.metadata.calculation/metadata]]
   ;;
   ;; the alias that should be used to this clause on the LHS of a `SELECT <lhs> AS <rhs>` or equivalent, i.e. the
   ;; name of this clause as exported by the previous stage, source table, or join.
   [:lib/source-column-alias {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; the name we should export this column as, i.e. the RHS of a `SELECT <lhs> AS <rhs>` or equivalent. This is
   ;; guaranteed to be unique in each stage of the query.
   [:lib/desired-column-alias {:optional true} [:maybe [:string {:min 1, :max 60}]]]
   ;; when column metadata is returned by certain things
   ;; like [[metabase.lib.aggregation/selected-aggregation-operators]] or [[metabase.lib.field/fieldable-columns]], it
   ;; might include this key, which tells you whether or not that column is currently selected or not already, e.g.
   ;; for [[metabase.lib.field/fieldable-columns]] it means its already present in `:fields`
   [:selected? {:optional true} :boolean]
   ;;
   ;; REMAPPING
   ;;
   [:lib/external-remap {:optional true} [:maybe [:ref ::column.remapping.external]]]
   [:lib/internal-remap {:optional true} [:maybe [:ref ::column.remapping.internal]]]])

;;; Definition spec for a cached table.
(mr/def ::persisted-info.definition
  [:map
   [:table-name        ::lib.schema.common/non-blank-string]
   [:field-definitions [:maybe [:sequential
                                [:map
                                 [:field-name ::lib.schema.common/non-blank-string]
                                 ;; TODO check (isa? :type/Integer :type/*)
                                 [:base-type  ::lib.schema.common/base-type]]]]]])

;;; Persisted Info = Cached Table (?). See [[metabase.models.persisted-info]]
(mr/def ::persisted-info
  [:map
   [:active     :boolean]
   [:state      ::lib.schema.common/non-blank-string]
   [:table-name ::lib.schema.common/non-blank-string]
   [:definition {:optional true} [:maybe [:ref ::persisted-info.definition]]]
   [:query-hash {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def CardMetadata
  "Schema for metadata about a specific Saved Question (which may or may not be a Model). More or less the same as
  a [[metabase.models.card]], but with kebab-case keys. Note that the `:dataset-query` is not necessarily converted to
  pMBQL yet. Probably safe to assume it is normalized however. Likewise, `:result-metadata` is probably not quite
  massaged into a sequence of `ColumnMetadata`s just yet. See [[metabase.lib.card/card-metadata-columns]] that
  converts these as needed."
  [:map
   {:error/message "Valid Card metadata"}
   [:lib/type    [:= :metadata/card]]
   [:id          ::lib.schema.id/card]
   [:name        ::lib.schema.common/non-blank-string]
   [:database-id ::lib.schema.id/database]
   ;; saved query. This is possibly still a legacy query, but should already be normalized.
   ;; Call [[metabase.lib.convert/->pMBQL]] on it as needed
   [:dataset-query   {:optional true} :map]
   ;; vector of column metadata maps; these are ALMOST the correct shape to be [[ColumnMetadata]], but they're
   ;; probably missing `:lib/type` and probably using `:snake_case` keys.
   [:result-metadata {:optional true} [:maybe [:sequential :map]]]
   ;; whether this Card is a Model or not.
   [:dataset         {:optional true} :boolean]
   ;; Table ID is nullable in the application database, because native queries are not necessarily associated with a
   ;; particular Table (unless they are against MongoDB)... for MBQL queries it should be populated however.
   [:table-id        {:optional true} [:maybe ::lib.schema.id/table]]
   ;;
   ;; PERSISTED INFO: This comes from the [[metabase.models.persisted-info]] model.
   ;;
   [:lib/persisted-info {:optional true} [:maybe [:ref ::persisted-info]]]])

(def SegmentMetadata
  "More or less the same as a [[metabase.models.segment]], but with kebab-case keys."
  [:map
   {:error/message "Valid Segment metadata"}
   [:lib/type [:= :metadata/segment]]
   [:id       ::lib.schema.id/segment]
   [:name     ::lib.schema.common/non-blank-string]
   [:table-id ::lib.schema.id/table]
   ;; the MBQL snippet defining this Segment; this may still be in legacy
   ;; format. [[metabase.lib.segment/segment-definition]] handles conversion to pMBQL if needed.
   [:definition [:maybe :map]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def MetricMetadata
  "Malli schema for a legacy v1 [[metabase.models.metric]], but with kebab-case keys. A Metric defines an MBQL snippet
  with an aggregation and optionally a filter clause. You can add a `:metric` reference to the `:aggregations` in an
  MBQL stage, and the QP treats it like a macro and expands it to the underlying clauses --
  see [[metabase.query-processor.middleware.expand-macros]]."
  [:map
   {:error/message "Valid Metric metadata"}
   [:lib/type   [:= :metadata/metric]]
   [:id         ::lib.schema.id/metric]
   [:name       ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Metric; this may still be in legacy
   ;; format. [[metabase.lib.metric/metric-definition]] handles conversion to pMBQL if needed.
   [:definition [:maybe :map]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def TableMetadata
  "Schema for metadata about a specific [[metabase.models.table]]. More or less the same as a [[metabase.models.table]],
  but with kebab-case keys."
  [:map
   {:error/message "Valid Table metadata"}
   [:lib/type [:= :metadata/table]]
   [:id       ::lib.schema.id/table]
   [:name     ::lib.schema.common/non-blank-string]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:schema       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def DatabaseMetadata
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   {:error/message "Valid Database metadata"}
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; TODO -- this should validate against the driver features list in [[metabase.driver/driver-features]] if we're in
   ;; Clj mode
   [:dbms-version {:optional true} [:maybe :map]]
   [:details      {:optional true} :map]
   [:engine       {:optional true} :keyword]
   [:features     {:optional true} [:set :keyword]]
   [:is-audit     {:optional true} :boolean]
   [:settings     {:optional true} [:maybe :map]]])

(def MetadataProvider
  "Schema for something that satisfies the [[lib.metadata.protocols/MetadataProvider]] protocol."
  [:fn
   {:error/message "Valid MetadataProvider"}
   #'lib.metadata.protocols/metadata-provider?])

(def MetadataProviderable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:or
   MetadataProvider
   [:map
    {:error/message "map with a MetadataProvider in the key :lib/metadata (i.e. a query)"}
    [:lib/metadata MetadataProvider]]])

(mu/defn ->metadata-provider :- MetadataProvider
  "Get a MetadataProvider from something that can provide one."
  [metadata-providerable :- MetadataProviderable]
  (if (lib.metadata.protocols/metadata-provider? metadata-providerable)
    metadata-providerable
    (:lib/metadata metadata-providerable)))

(mu/defn database :- DatabaseMetadata
  "Get metadata about the Database we're querying."
  [metadata-providerable :- MetadataProviderable]
  (lib.metadata.protocols/database (->metadata-provider metadata-providerable)))

(mu/defn tables :- [:sequential TableMetadata]
  "Get metadata about all Tables for the Database we're querying."
  [metadata-providerable :- MetadataProviderable]
  (lib.metadata.protocols/tables (->metadata-provider metadata-providerable)))

(mu/defn table :- TableMetadata
  "Find metadata for a specific Table, either by string `table-name`, and optionally `schema`, or by ID."
  [metadata-providerable :- MetadataProviderable
   table-id              :- ::lib.schema.id/table]
  (lib.metadata.protocols/table (->metadata-provider metadata-providerable) table-id))

(mu/defn fields :- [:sequential ColumnMetadata]
  "Get metadata about all the Fields belonging to a specific Table."
  [metadata-providerable :- MetadataProviderable
   table-id              :- ::lib.schema.id/table]
  (lib.metadata.protocols/fields (->metadata-provider metadata-providerable) table-id))

(mu/defn field :- ColumnMetadata
  "Get metadata about a specific Field in the Database we're querying."
  [metadata-providerable :- MetadataProviderable
   field-id              :- ::lib.schema.id/field]
  (lib.metadata.protocols/field (->metadata-provider metadata-providerable) field-id))

(mu/defn setting :- any?
  "Get the value of a Metabase setting for the instance we're querying."
  ([metadata-providerable :- MetadataProviderable
    setting-key           :- [:or string? keyword?]]
   (lib.metadata.protocols/setting (->metadata-provider metadata-providerable) setting-key)))

;;;; Stage metadata

(def StageMetadata
  "Metadata about the columns returned by a particular stage of a pMBQL query. For example a single-stage native query
  like

    {:database 1
     :lib/type :mbql/query
     :stages   [{:lib/type :mbql.stage/mbql
                 :native   \"SELECT id, name FROM VENUES;\"}]}

  might have stage metadata like

    {:columns [{:name \"id\", :base-type :type/Integer}
               {:name \"name\", :base-type :type/Text}]}

  associated with the query's lone stage.

  At some point in the near future we will hopefully attach this metadata directly to each stage in a query, so a
  multi-stage query will have `:lib/stage-metadata` for each stage. The main goal is to facilitate things like
  returning lists of visible or filterable columns for a given stage of a query. This is TBD, see #28717 for a WIP
  implementation of this idea.

  This is the same format as the results metadata returned with QP results in `data.results_metadata`. The `:columns`
  portion of this (`data.results_metadata.columns`) is also saved as `Card.result_metadata` for Saved Questions.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential ColumnMetadata]]])

(mu/defn stage :- [:maybe StageMetadata]
  "Get metadata associated with a particular `stage-number` of the query, if any. `stage-number` can be a negative
  index.

  Currently, only returns metadata if it is explicitly attached to a stage; in the future we will probably dynamically
  calculate this stuff if possible based on DatabaseMetadata and previous stages. Stay tuned!"
  [query        :- :map
   stage-number :- :int]
  (:lib/stage-metadata (lib.util/query-stage query stage-number)))

(mu/defn stage-column :- [:maybe ColumnMetadata]
  "Metadata about a specific column returned by a specific stage of the query, e.g. perhaps the first stage of the
  query has an expression `num_cans`, then

    (lib.metadata/stage-column query stage \"num_cans\")

  should return something like

    {:name \"num_cans\", :base-type :type/Integer, ...}

  This is currently a best-effort thing and will only return information about columns if stage metadata is attached
  to a particular stage. In the near term future this should be better about calculating that metadata dynamically and
  returning correct info here."
  ([query       :- :map
    column-name :- ::lib.schema.common/non-blank-string]
   (stage-column query -1 column-name))

  ([query        :- :map
    stage-number :- :int
    column-name  :- ::lib.schema.common/non-blank-string]
   (some (fn [column]
           (when (= (:name column) column-name)
             column))
         (:columns (stage query stage-number)))))

(mu/defn card :- [:maybe CardMetadata]
  "Get metadata for a Card, aka Saved Question, with `card-id`, if it can be found."
  [metadata-providerable :- MetadataProviderable
   card-id               :- ::lib.schema.id/card]
  (lib.metadata.protocols/card (->metadata-provider metadata-providerable) card-id))

(mu/defn segment :- [:maybe SegmentMetadata]
  "Get metadata for the Segment with `segment-id`, if it can be found."
  [metadata-providerable :- MetadataProviderable
   segment-id            :- ::lib.schema.id/segment]
  (lib.metadata.protocols/segment (->metadata-provider metadata-providerable) segment-id))

(mu/defn metric :- [:maybe MetricMetadata]
  "Get metadata for the Metric with `metric-id`, if it can be found."
  [metadata-providerable :- MetadataProviderable
   metric-id             :- ::lib.schema.id/metric]
  (lib.metadata.protocols/metric (->metadata-provider metadata-providerable) metric-id))

(mu/defn table-or-card :- [:maybe [:or CardMetadata TableMetadata]]
  "Convenience, for frontend JS usage (see #31915): look up metadata based on Table ID, handling legacy-style
  `card__<id>` strings as well. Throws an Exception (Clj-only, due to Malli validation) if passed an integer Table ID
  and the Table does not exist, since this is a real error; however if passed a `card__<id>` that does not exist,
  simply returns `nil` (since we do not have a strict expectation that Cards always be present in the
  MetadataProvider)."
  [metadata-providerable :- MetadataProviderable
   table-id              :- [:or ::lib.schema.id/table :string]]
  (if-let [card-id (lib.util/legacy-string-table-id->card-id table-id)]
    (card metadata-providerable card-id)
    (table metadata-providerable table-id)))
