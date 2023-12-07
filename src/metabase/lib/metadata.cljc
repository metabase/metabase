(ns metabase.lib.metadata
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

;;; Column vs Field?
;;;
;;; Lately I've been using `Field` to only mean a something that lives in the application database, i.e. something
;;; that is associated with row in the `Field` table and has an `:id`. I'm using `Column` as a more generic term that
;;; includes not only `Field`s but also the columns returned by a stage of a query, e.g. `SELECT count(*) AS count`
;;; returns a `Column` called `count`, but it's not a `Field` because it's not associated with an actual Field in the
;;; application database.


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
  [:ref ::lib.schema.metadata/column])

(def CardMetadata
  "Schema for metadata about a specific Saved Question (which may or may not be a Model). More or less the same as
  a [[metabase.models.card]], but with kebab-case keys. Note that the `:dataset-query` is not necessarily converted to
  pMBQL yet. Probably safe to assume it is normalized however. Likewise, `:result-metadata` is probably not quite
  massaged into a sequence of `ColumnMetadata`s just yet. See [[metabase.lib.card/card-metadata-columns]] that
  converts these as needed."
  [:ref ::lib.schema.metadata/card])

(def SegmentMetadata
  "More or less the same as a [[metabase.models.segment]], but with kebab-case keys."
  [:ref ::lib.schema.metadata/segment])

(def MetricMetadata
  "Malli schema for a legacy v1 [[metabase.models.metric]], but with kebab-case keys. A Metric defines an MBQL snippet
  with an aggregation and optionally a filter clause. You can add a `:metric` reference to the `:aggregations` in an
  MBQL stage, and the QP treats it like a macro and expands it to the underlying clauses --
  see [[metabase.query-processor.middleware.expand-macros]]."
  [:ref ::lib.schema.metadata/metric])

(def TableMetadata
  "Schema for metadata about a specific [[metabase.models.table]]. More or less the same as a [[metabase.models.table]],
  but with kebab-case keys."
  [:ref ::lib.schema.metadata/table])

(def DatabaseMetadata
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:ref ::lib.schema.metadata/database])

(def MetadataProvider
  "Schema for something that satisfies the [[lib.metadata.protocols/MetadataProvider]] protocol."
  [:ref ::lib.schema.metadata/metadata-provider])

(def MetadataProviderable
  "Something that can be used to get a MetadataProvider. Either a MetadataProvider, or a map with a MetadataProvider in
  the key `:lib/metadata` (i.e., a query)."
  [:ref ::lib.schema.metadata/metadata-providerable])

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

(mu/defn field :- [:maybe ColumnMetadata]
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

(mu/defn editable? :- :boolean
  "Given a query, returns whether it is considered editable.

  There's no editable flag! Instead, a query is **not** editable if:
  - Database is missing from the metadata (no permissions at all);
  - Database is present but tables (at least the `:source-table`) are missing (missing table permissions); or
  - Similarly, the card specified by `:source-card` is missing from the metadata.
  If metadata for the `:source-table` or `:source-card` can be found, then the query is editable."
  [query :- ::lib.schema/query]
  (let [{:keys [source-table source-card] :as stage0} (lib.util/query-stage query 0)]
    (boolean (and (database query)
                  (or (and source-table (table query source-table))
                      (and source-card  (card  query source-card))
                      (= (:lib/type stage0) :mbql.stage/native))))))
