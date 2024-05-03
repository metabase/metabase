(ns metabase.lib.schema.metadata
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
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

;;; The way FieldValues/remapping works is hella confusing, because it involves the FieldValues table and Dimension
;;; table, and the `has_field_values` column, nobody knows why life is like this TBH. The docstrings
;;; in [[metabase.models.field-values]], [[metabase.models.params.chain-filter]],
;;; and [[metabase.query-processor.middleware.add-dimension-projections]] explain this stuff in more detail, read
;;; those and then maybe you will understand what the hell is going on.

(def column-has-field-values-options
  "Possible options for column metadata `:has-field-values`. This is used to determine whether we keep FieldValues for a
  Field (during sync), and which type of widget should be used to pick values of this Field when filtering by it in
  the Query Builder. Not otherwise used by MLv2 (except for [[metabase.lib.field/field-values-search-info]], which is
  a frontend convenience) or QP at the time of this writing. For column remapping purposes in the Query Processor and
  MLv2 we just ignore `has_field_values` and only look for FieldValues/Dimension."
  ;; AUTOMATICALLY-SET VALUES, SET DURING SYNC
  ;;
  ;; `nil` -- means infer which widget to use based on logic in [[metabase.lib.field/infer-has-field-values]]; this
  ;; will either return `:search` or `:none`.
  ;;
  ;; This is the default state for Fields not marked `auto-list`. Admins cannot explicitly mark a Field as
  ;; `has_field_values` `nil`. This value is also subject to automatically change in the future if the values of a
  ;; Field change in such a way that it can now be marked `auto-list`. Fields marked `nil` do *not* have FieldValues
  ;; objects.
  ;;
  #{;; The other automatically-set option. Automatically marked as a 'List' Field based on cardinality and other factors
    ;; during sync. Store a FieldValues object; use the List Widget. If this Field goes over the distinct value
    ;; threshold in a future sync, the Field will get switched back to `has_field_values = nil`.
    ;;
    ;; Note that when this comes back from the REST API or [[metabase.lib.field/field-values-search-info]] we always
    ;; return this as `:list` instead of `:auto-list`; this is done by [[metabase.lib.field/infer-has-field-values]].
    ;; I guess this is because the FE isn't supposed to need to care about whether this is `:auto-list` vs `:list`;
    ;; those distinctions are only important for sync I guess.
    :auto-list
    ;;
    ;; EXPLICITLY-SET VALUES, SET BY AN ADMIN
    ;;
    ;; Admin explicitly marked this as a 'Search' Field, which means we should *not* keep FieldValues, and should use
    ;; Search Widget.
    :search
    ;; Admin explicitly marked this as a 'List' Field, which means we should keep FieldValues, and use the List
    ;; Widget. Unlike `auto-list`, if this Field grows past the normal cardinality constraints in the future, it will
    ;; remain `List` until explicitly marked otherwise.
    :list
    ;; Admin explicitly marked that this Field shall always have a plain-text widget, neither allowing search, nor
    ;; showing a list of possible values. FieldValues not kept.
    :none})

(mr/def ::column.has-field-values
  (into [:enum] (sort column-has-field-values-options)))

(mr/def ::column.remapping.external
  "External remapping (Dimension) for a column. From the [[metabase.models.dimension]] with `type = external` associated
  with a `Field` in the application database. See [[metabase.query-processor.middleware.add-dimension-projections]]
  for what this means."
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

(mr/def ::column
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
   [:fk-field-id {:optional true} [:maybe ::lib.schema.id/field]]
   ;; `metabase_field.fk_target_field_id` in the application database; recorded during the sync process. This Field is
   ;; an foreign key, and points to this Field ID. This is mostly used to determine how to add implicit joins by
   ;; the [[metabase.query-processor.middleware.add-implicit-joins]] middleware.
   [:fk-target-field-id {:optional true} [:maybe ::lib.schema.id/field]]
   ;; Join alias of the table we're joining against, if any. Not really 100% clear why we would need this on top
   ;; of [[metabase.lib.join/current-join-alias]], which stores the same info under a namespaced key. I think we can
   ;; remove it.
   [:source-alias {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; name of the expression where this column metadata came from. Should only be included for expressions introduced
   ;; at THIS STAGE of the query. If it's included elsewhere, that's an error. Thus this is the definitive way to know
   ;; if a column is "custom" in this stage (needs an `:expression` reference) or not.
   [:lib/expression-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; what top-level clause in the query this metadata originated from, if it is calculated (i.e., if this metadata
   ;; was generated by [[metabase.lib.metadata.calculation/metadata]])
   [:lib/source {:optional true} [:ref ::column-source]]
   ;; ID of the Card this came from, if this came from Card results metadata. Mostly used for creating column groups.
   [:lib/card-id {:optional true} [:maybe ::lib.schema.id/card]]
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
   ;; REMAPPING & FIELD VALUES
   ;;
   ;; See notes above for more info. `:has-field-values` comes from the application database and is used to decide
   ;; whether to sync FieldValues when running sync, and what certain FE QB widgets should
   ;; do. (See [[metabase.lib.field/field-values-search-info]]). Note that all metadata providers may not return this
   ;; column. The JVM provider currently does not, since the QP doesn't need it for anything.
   [:has-field-values {:optional true} [:maybe [:ref ::column.has-field-values]]]
   ;;
   ;; these next two keys are derived by looking at `FieldValues` and `Dimension` instances associated with a `Field`;
   ;; they are used by the Query Processor to add column remappings to query results. To see how this maps to stuff in
   ;; the application database, look at the implementation for fetching a `:metadata/column`
   ;; in [[metabase.lib.metadata.jvm]]. I don't think this is really needed on the FE, at any rate the JS metadata
   ;; provider doesn't add these keys.
   [:lib/external-remap {:optional true} [:maybe [:ref ::column.remapping.external]]]
   [:lib/internal-remap {:optional true} [:maybe [:ref ::column.remapping.internal]]]])

(mr/def ::persisted-info.definition
  "Definition spec for a cached table."
  [:map
   [:table-name        ::lib.schema.common/non-blank-string]
   [:field-definitions [:maybe [:sequential
                                [:map
                                 [:field-name ::lib.schema.common/non-blank-string]
                                 ;; TODO check (isa? :type/Integer :type/*)
                                 [:base-type  ::lib.schema.common/base-type]]]]]])

(mr/def ::persisted-info
  "Persisted Info = Cached Table (?). See [[metabase.models.persisted-info]]"
  [:map
   [:active     :boolean]
   [:state      ::lib.schema.common/non-blank-string]
   [:table-name ::lib.schema.common/non-blank-string]
   [:definition {:optional true} [:maybe [:ref ::persisted-info.definition]]]
   [:query-hash {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::card.type
  [:enum
   :question
   :model
   :metric])

(mr/def ::type
  [:enum :metadata/database :metadata/table :metadata/column :metadata/card :metadata/legacy-metric :metadata/segment])

(mr/def ::card
  "Schema for metadata about a specific Saved Question (which may or may not be a Model). More or less the same as
  a [[metabase.models.card]], but with kebab-case keys. Note that the `:dataset-query` is not necessarily converted to
  pMBQL yet. Probably safe to assume it is normalized however. Likewise, `:result-metadata` is probably not quite
  massaged into a sequence of [[::column]] metadata just yet. See [[metabase.lib.card/card-metadata-columns]] that
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
   ;; what sort of saved query this is, e.g. a normal Saved Question or a Model or a V2 Metric.
   [:type            {:optional true} [:maybe [:ref ::card.type]]]
   ;; Table ID is nullable in the application database, because native queries are not necessarily associated with a
   ;; particular Table (unless they are against MongoDB)... for MBQL queries it should be populated however.
   [:table-id        {:optional true} [:maybe ::lib.schema.id/table]]
   ;;
   ;; PERSISTED INFO: This comes from the [[metabase.models.persisted-info]] model.
   ;;
   [:lib/persisted-info {:optional true} [:maybe [:ref ::persisted-info]]]])

(mr/def ::segment
  "More or less the same as a [[metabase.models.segment]], but with kebab-case keys."
  [:map
   {:error/message "Valid Segment metadata"}
   [:lib/type   [:= :metadata/segment]]
   [:id         ::lib.schema.id/segment]
   [:name       ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Segment; this may still be in legacy
   ;; format. [[metabase.lib.segment/segment-definition]] handles conversion to pMBQL if needed.
   [:definition [:maybe :map]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::legacy-metric
  "Malli schema for a legacy v1 [[metabase.models.legacy-metric]], but with kebab-case keys. A Metric defines an MBQL
  snippet with an aggregation and optionally a filter clause. You can add a `:metric` reference to the `:aggregations`
  in an MBQL stage, and the QP treats it like a macro and expands it to the underlying clauses --
  see [[metabase.query-processor.middleware.expand-macros]]."
  [:map
   {:error/message "Valid legacy (v1) Metric metadata"}
   [:lib/type   [:= :metadata/legacy-metric]]
   [:id         ::lib.schema.id/legacy-metric]
   [:name       ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Metric; this may still be in legacy
   ;; format. [[metabase.lib.legacy-metric/metric-definition]] handles conversion to pMBQL if needed.
   [:definition [:maybe :map]]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::table
  "Schema for metadata about a specific [[metabase.models.table]]. More or less the same as a [[metabase.models.table]],
  but with kebab-case keys."
  [:map
   {:error/message "Valid Table metadata"}
   [:lib/type [:= :metadata/table]]
   [:id       ::lib.schema.id/table]
   [:name     ::lib.schema.common/non-blank-string]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:schema       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(mr/def ::database.methods.escape-alias
  "MLv2 wrapper around [[metabase.driver/escape-alias]]. Note that this doesn't take `driver` as an argument. It has the
  signature

    (escape-alias string) => string"
  [:=> [:cat :string] :string])

(mr/def ::database.methods
  "A map of wrappers around [[metabase.driver]] methods that we may need to use inside MLv2 such
  as [[metabase.driver/escape-alias]], so we can decouple the driver interface from MLv2. Since driver methods are
  Clojure-only, we should only expect these to be bound in Clojure-land usage (e.g. the QP) and not in Cljs usage.
  MetadataProviders can pass these methods in as part of the database under the `:lib/methods` key. See the
  `:metabase.lib.schema.metadata/database.methods` schema for more info."
  [:map
   [:escape-alias {:optional true} [:ref ::database.methods.escape-alias]]])

(mr/def ::database
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   {:error/message "Valid Database metadata"}
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; TODO -- this should validate against the driver features list in [[metabase.driver/features]] if we're in
   ;; Clj mode
   [:dbms-version {:optional true} [:maybe :map]]
   [:details      {:optional true} :map]
   [:engine       {:optional true} :keyword]
   [:features     {:optional true} [:set :keyword]]
   [:is-audit     {:optional true} :boolean]
   [:settings     {:optional true} [:maybe :map]]
   [:lib/methods  {:optional true} [:maybe [:ref ::database.methods]]]])

(mr/def ::metadata-provider
  "Schema for something that satisfies the [[metabase.lib.metadata.protocols/MetadataProvider]] protocol."
  [:ref :metabase.lib.metadata.protocols/metadata-provider])

(mr/def ::metadata-providerable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:ref :metabase.lib.metadata.protocols/metadata-providerable])

(mr/def ::stage
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
   [:columns [:sequential ::column]]])
