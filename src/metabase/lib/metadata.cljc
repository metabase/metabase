(ns metabase.lib.metadata
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

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
   [:lib/type [:= :metadata/field]] ; TODO -- should this be changed to `:metadata/column`?
   [:id {:optional true} ::lib.schema.id/field]
   [:name ::lib.schema.common/non-blank-string]
   [:display_name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

(def ^:private CardMetadata
  [:map
   [:lib/type [:= :metadata/card]]
   [:id ::lib.schema.id/card]
   [:name ::lib.schema.common/non-blank-string]])

(def ^:private SegmentMetadata
  [:map
   [:lib/type [:= :metadata/segment]]
   [:id ::lib.schema.id/segment]
   [:name ::lib.schema.common/non-blank-string]])

(def ^:private MetricMetadata
  [:map
   [:lib/type [:= :metadata/metric]]
   [:id ::lib.schema.id/metric]
   [:name ::lib.schema.common/non-blank-string]])

(def ^:private TableMetadata
  [:map
   [:lib/type [:= :metadata/table]]
   [:id ::lib.schema.id/table]
   [:name ::lib.schema.common/non-blank-string]
   [:display_name {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:schema       {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   ;; This is now optional! If the [[MetadataProvider]] provides it, great, but if not we can always make the
   ;; subsequent request to fetch fields separately.
   [:fields   {:optional true} [:maybe [:sequential ColumnMetadata]]]
   [:segments {:optional true} [:maybe [:sequential SegmentMetadata]]]
   [:metrics  {:optional true} [:maybe [:sequential MetricMetadata]]]])

(def DatabaseMetadata
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   ;; Like `:fields` for [[TableMetadata]], this is now optional -- we can fetch the Tables separately if needed.
   [:tables {:optional true} [:sequential TableMetadata]]])

(def MetadataProvider
  "Schema for something that satisfies the [[lib.metadata.protocols/MetadataProvider]] protocol."
  [:fn lib.metadata.protocols/metadata-provider?])

(defmulti ^:private ->metadata-provider*
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->metadata-provider* :default
  [x]
  x)

(defmethod ->metadata-provider* :mbql/query
  [query]
  (->metadata-provider* (:lib/metadata query)))

(mu/defn ^:private ->metadata-provider :- MetadataProvider
  [x :- some?]
  (if (lib.metadata.protocols/metadata-provider? x)
    x
    (->metadata-provider* x)))

(mu/defn database :- DatabaseMetadata
  "Get metadata about the Database we're querying."
  [metadata-provider]
  (lib.metadata.protocols/database (->metadata-provider metadata-provider)))

(mu/defn tables :- [:sequential TableMetadata]
  "Get metadata about all Tables for the Database we're querying."
  [metadata-provider]
  (lib.metadata.protocols/tables (->metadata-provider metadata-provider)))

(mu/defn table :- TableMetadata
  "Find metadata for a specific Table, either by string `table-name`, and optionally `schema`, or by ID."
  ([metadata-provider
    table-id          :- ::lib.schema.id/table]
   (lib.metadata.protocols/table (->metadata-provider metadata-provider) table-id))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string]
   (some (fn [table-metadata]
           (when (and (or (nil? table-schema)
                          (= (:schema table-metadata) table-schema))
                      (= (:name table-metadata) table-name))
             table-metadata))
         (tables metadata-provider))))

(mu/defn fields :- [:sequential ColumnMetadata]
  "Get metadata about all the Fields belonging to a specific Table."
  ([metadata-provider
    table-id          :- ::lib.schema.id/table]
   (lib.metadata.protocols/fields (->metadata-provider metadata-provider) table-id))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string]
   (fields metadata-provider
           (:id (table metadata-provider table-schema table-name)))))

(mu/defn field :- ColumnMetadata
  "Get metadata about a specific Field in the Database we're querying."
  ([metadata-provider
    field-id          :- ::lib.schema.id/field]
   (lib.metadata.protocols/field (->metadata-provider metadata-provider) field-id))

  ;; TODO -- we need to figure out how to deal with nested fields... should field-name be a varargs thing?
  ([metadata-provider
    table-id          :- ::lib.schema.id/table
    field-name        :- ::lib.schema.common/non-blank-string]
   (some (fn [field-metadata]
           (when (= (:name field-metadata) field-name)
             field-metadata))
         (fields metadata-provider table-id)))

  ([metadata-provider
    table-schema      :- [:maybe ::lib.schema.common/non-blank-string]
    table-name        :- ::lib.schema.common/non-blank-string
    field-name        :- ::lib.schema.common/non-blank-string]
   (let [table-metadata (table metadata-provider table-schema table-name)]
     (field metadata-provider (:id table-metadata) field-name))))

;;;; Stage metadata

(def StageMetadata
  "Metadata about the columns returned by a particular stage of a pMBQL query. For example a single-stage native query
  like

    {:database 1
     :type     :pipeline
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

    (lib.metadata/stage-column-metadata query stage \"num_cans\")

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
  [metadata-provider
   card-id :- ::lib.schema.id/card]
  (lib.metadata.protocols/card (->metadata-provider metadata-provider) card-id))

(mu/defn segment :- [:maybe SegmentMetadata]
  "Get metadata for the Segment with `segment-id`, if it can be found."
  [metadata-provider
   segment-id :- ::lib.schema.id/segment]
  (lib.metadata.protocols/segment (->metadata-provider metadata-provider) segment-id))

(mu/defn metric :- [:maybe MetricMetadata]
  "Get metadata for the Metric with `metric-id`, if it can be found."
  [metadata-provider
   metric-id :- ::lib.schema.id/metric]
  (lib.metadata.protocols/metric (->metadata-provider metadata-provider) metric-id))
