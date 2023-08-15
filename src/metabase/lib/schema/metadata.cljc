(ns metabase.lib.schema.metadata
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

;;; Schema for something that satisfies the [[lib.metadata.protocols/MetadataProvider]] protocol.
(mr/def ::metadata-provider
  [:fn
   {:error/message "Valid MetadataProvider"}
   #'lib.metadata.protocols/metadata-provider?])

;;; Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider
;;; in the key `:lib/metadata` (i.e., a query).
(mr/def ::metadata-providerable
  [:or
   [:ref ::metadata-provider]
   [:map
    {:error/message "map with a MetadataProvider in the key :lib/metadata (i.e. a query)"}
    [:lib/metadata [:ref ::metadata-provider]]]])

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

(mr/def ::column.source
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
   ;; columns added by external remapping (Dimensions) to human-readable values
   :source/external-remaps
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

(def  truncate-alias-max-length-bytes
  "Length to truncate column and table identifiers to. See [[metabase.driver.impl/default-alias-max-length-bytes]] for
  reasoning."
  60)

(mr/def ::column.desired-alias
  [:string {:min 1, :max truncate-alias-max-length-bytes}])

;;; This comes from [[metabase.models.Dimension]]. See
;;; the [[metabase.query-processor.middleware.add-dimension-projections]] docstring for more info.
(mr/def ::column.external-remap
  [:map
   ;; `dimension.id`. Not really important for MLv2, but the QP uses this as a key for things.
   [:id       ::lib.schema.id/dimension]
   ;; `dimension.name`. Display name for the remapping.
   [:name     ::lib.schema.common/non-blank-string]
   ;; `dimension.human_readable_field_id`. ID of the FK Field to remap values to. E.g. if the original Field is
   ;; `venues.category_id`, this is probably something like `categories.name`.
   [:field-id ::lib.schema.id/field]])

;;; Malli schema for a valid map of column metadata, which can mean one of two things:
;;;
;;;  1. Metadata about a particular Field in the application database. This will always have an `:id`
;;;
;;;  2. Results metadata from a column in `data.cols` and/or `data.results_metadata.columns` in a Query Processor
;;;     response, or saved in something like `Card.result_metadata`. These *may* have an `:id`, or may not -- columns
;;;     coming back from native queries or things like `SELECT count(*)` aren't associated with any particular `Field`
;;;     and thus will not have an `:id`.
;;;
;;;  Now maybe these should be two different schemas, but `:id` being there or not is the only real difference; besides
;;;  that they are largely compatible. So they're the same for now. We can revisit this in the future if we actually want
;;;  to differentiate between the two versions.
(mr/def ::column
  [:map
   {:error/message "Valid column metadata"}
   [:lib/type  [:= :metadata/column]]
   [:name      ::lib.schema.common/non-blank-string]
   ;; TODO -- ignore `base_type` and make `effective_type` required; see #29707
   [:base-type ::lib.schema.common/base-type]
   [:id             {:optional true} ::lib.schema.id/field]
   [:display-name   {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]
   ;; if this is a field from another table (implicit join), this is the field in the current table that should be
   ;; used to perform the implicit join. e.g. if current table is `VENUES` and this field is `CATEGORIES.ID`, then the
   ;; `fk_field_id` would be `VENUES.CATEGORY_ID`. In a `:field` reference this is saved in the options map as
   ;; `:source-field`.
   [:fk-field-id    {:optional true} [:maybe ::lib.schema.id/field]]
   ;; Join alias of the table we're joining against, if any. Not really 100% clear why we would need this on top
   ;; of [[metabase.lib.join/current-join-alias]], which stores the same info under a namespaced key. I think we can
   ;; remove it.
   [:source-alias   {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; the order in which this column appears in the data warehouse itself. Query results are usually returned in the
   ;; same order.
   [:position       {:optional true} [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   ;; what top-level clause in the query this metadata originated from, if it is calculated (i.e., if this metadata
   ;; was generated by [[metabase.lib.metadata.calculation/metadata]])
   [:lib/source     {:optional true} [:ref ::column.source]]
   ;;
   ;; this stuff is adapted from [[metabase.query-processor.util.add-alias-info]]. It is included in
   ;; the [[metabase.lib.metadata.calculation/metadata]]
   ;;
   ;; the alias that should be used to this clause on the LHS of a `SELECT <lhs> AS <rhs>` or equivalent, i.e. the
   ;; name of this clause as exported by the previous stage, source table, or join.
   [:lib/source-column-alias {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; the name we should export this column as, i.e. the RHS of a `SELECT <lhs> AS <rhs>` or equivalent. This is
   ;; guaranteed to be unique in each stage of the query.
   [:lib/desired-column-alias {:optional true} [:maybe [:ref ::column.desired-alias]]]
   ;; when column metadata is returned by certain things
   ;; like [[metabase.lib.aggregation/selected-aggregation-operators]] or [[metabase.lib.field/fieldable-columns]], it
   ;; might include this key, which tells you whether or not that column is currently selected or not already, e.g.
   ;; for [[metabase.lib.field/fieldable-columns]] it means its already present in `:fields`
   [:selected? {:optional true} :boolean]
   ;;
   ;; EXTERNAL REMAPPING.
   ;;
   [:lib/external-remap {:optional true} [:maybe [:ref ::column.external-remap]]]
   ;; the desired-alias of the Field added by the external remap. e.g. if `venues.category-id` is remapped to
   ;; `categories.id`, then `venues.category-id` should have this key with a value like `CATEGORIES__NAME` or
   ;; something like that.
   [:remapped-to        {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; for Fields added by an external remap, the desired alias of the original Field. e.g. if `venues.category-id` is
   ;; remapped to `categories.id`, then `categories.id` should have this key with a value like `CATEGORY_ID`
   [:remapped-from      {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

;;; Schema for metadata about a specific Saved Question (which may or may not be a Model). More or less the same as
;;;  a [[metabase.models.card]], but with kebab-case keys. Note that the `:dataset-query` is not necessarily converted
;;;  to pMBQL yet. Probably safe to assume it is normalized however. Likewise, `:result-metadata` is probably not
;;;  quite massaged into a sequence of column metadatas just yet. See [[metabase.lib.card/card-metadata-columns]] that
;;;  converts these as needed.
(mr/def ::card
  [:map
   {:error/message "Valid Card metadata"}
   [:lib/type [:= :metadata/card]]
   [:id   ::lib.schema.id/card]
   [:name ::lib.schema.common/non-blank-string]
   ;; saved query. This is possibly still a legacy query, but should already be normalized.
   ;; Call [[metabase.lib.convert/->pMBQL]] on it as needed
   [:dataset-query   {:optional true} :map]
   ;; vector of column metadata maps; these are ALMOST the correct shape to be [[ColumnMetadata]], but they're
   ;; probably missing `:lib/type` and probably using `:snake_case` keys.
   [:result-metadata {:optional true} [:maybe [:sequential :map]]]
   ;; whether this Card is a Model or not.
   [:dataset         {:optional true} :boolean]
   ;; I think Database ID is always supposed to be present for a Card, altho our mock metadata in tests might not have
   ;; it. It's `NOT NULL` in the application database. Probably safe to generally assume it's there.
   ;;
   ;; TODO -- confirm whether we can make this non-optional in the schema or not.
   [:database-id     {:optional true} [:maybe ::lib.schema.id/database]]
   ;; Table ID is nullable in the application database, because native queries are not necessarily associated with a
   ;; particular Table (unless they are against MongoDB)... for MBQL queries it should be populated however.
   [:table-id        {:optional true} [:maybe ::lib.schema.id/table]]])

;;; More or less the same as a [[metabase.models.segment]], but with kebab-case keys.
(mr/def ::segment
  [:map
   {:error/message "Valid Segment metadata"}
   [:lib/type [:= :metadata/segment]]
   [:id       ::lib.schema.id/segment]
   [:name     ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Segment; this may still be in legacy
   ;; format. [[metabase.lib.segment/segment-definition]] handles conversion to pMBQL if needed.
   [:definition :map]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

;;; Malli schema for a legacy v1 [[metabase.models.metric]], but with kebab-case keys. A Metric defines an MBQL
;;; snippet with an aggregation and optionally a filter clause. You can add a `:metric` reference to the
;;; `:aggregations` in an MBQL stage, and the QP treats it like a macro and expands it to the underlying clauses --
;;; see [[metabase.query-processor.middleware.expand-macros]].
(mr/def ::metric
  [:map
   {:error/message "Valid Metric metadata"}
   [:lib/type   [:= :metadata/metric]]
   [:id         ::lib.schema.id/metric]
   [:name       ::lib.schema.common/non-blank-string]
   [:table-id   ::lib.schema.id/table]
   ;; the MBQL snippet defining this Metric; this may still be in legacy
   ;; format. [[metabase.lib.metric/metric-definition]] handles conversion to pMBQL if needed.
   [:definition :map]
   [:description {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

;;; Schema for metadata about a specific [[metabase.models.table]]. More or less the same as
;;; a [[metabase.models.table]], but with kebab-case keys.
(mr/def ::table
  [:map
   {:error/message "Valid Table metadata"}
   [:lib/type [:= :metadata/table]]
   [:id       ::lib.schema.id/table]
   [:name     ::lib.schema.common/non-blank-string]
   [:display-name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:schema       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

;;; Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available
;;; to the frontend Query Builder.
(mr/def ::database
  [:map
   {:error/message "Valid Database metadata"}
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; Like `:fields` for [[TableMetadata]], this is now optional -- we can fetch the Tables separately if needed.
   [:tables   {:optional true} [:sequential [:ref ::table]]]
   ;; TODO -- this should validate against the driver features list in [[metabase.driver/driver-features]] if we're in
   ;; Clj mode
   [:features {:optional true} [:set :keyword]]])

;;;  Metadata about the columns returned by a particular stage of a pMBQL query. For example a single-stage native query
;;;  like
;;;
;;;    {:database 1
;;;     :lib/type :mbql/query
;;;     :stages   [{:lib/type :mbql.stage/mbql
;;;                 :native   \"SELECT id, name FROM VENUES;\"}]}
;;;
;;;  might have stage metadata like
;;;
;;;    {:columns [{:name \"id\", :base-type :type/Integer}
;;;               {:name \"name\", :base-type :type/Text}]}
;;;
;;;  associated with the query's lone stage.
;;;
;;;  At some point in the near future we will hopefully attach this metadata directly to each stage in a query, so a
;;;  multi-stage query will have `:lib/stage-metadata` for each stage. The main goal is to facilitate things like
;;;  returning lists of visible or filterable columns for a given stage of a query. This is TBD, see #28717 for a WIP
;;;  implementation of this idea.
;;;
;;;  This is the same format as the results metadata returned with QP results in `data.results_metadata`. The `:columns`
;;;  portion of this (`data.results_metadata.columns`) is also saved as `Card.result_metadata` for Saved Questions.
;;;
;;;  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
;;;  Frontend actually *merges* these together -- see `applyMetadataDiff` in
;;;  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
;;;  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future.
(mr/def ::stage
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential [:ref ::column]]]])
