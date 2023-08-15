(ns metabase.lib.metadata
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def ^:deprecated ColumnMetadata
  [:ref ::lib.schema.metadata/column])

(def ^:deprecated CardMetadata
  [:ref ::lib.schema.metadata/card])

(def ^:deprecated SegmentMetadata
  [:ref ::lib.schema.metadata/segment])

(def ^:deprecated MetricMetadata
  [:ref ::lib.schema.metadata/metric])

(def ^:deprecated TableMetadata
  [:ref ::lib.schema.metadata/table])

(def ^:deprecated DatabaseMetadata
  [:ref ::lib.schema.metadata/database])

(def ^:deprecated MetadataProvider
  "Schema for something that satisfies the [[lib.metadata.protocols/MetadataProvider]] protocol."
  [:ref ::lib.schema.metadata/metadata-provider])

(def ^:deprecated MetadataProviderable
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
  (or (lib.metadata.protocols/table (->metadata-provider metadata-providerable) table-id)
      (throw (ex-info (i18n/tru "Table {0} does not exist" (pr-str table-id))
                      {:table-id table-id}))))

(mu/defn fields :- [:sequential ColumnMetadata]
  "Get metadata about all the Fields belonging to a specific Table."
  [metadata-providerable :- MetadataProviderable
   table-id              :- ::lib.schema.id/table]
  (lib.metadata.protocols/fields (->metadata-provider metadata-providerable) table-id))

(mu/defn field :- ColumnMetadata
  "Get metadata about a specific Field in the Database we're querying."
  [metadata-providerable :- MetadataProviderable
   field-id              :- ::lib.schema.id/field]
  (or (lib.metadata.protocols/field (->metadata-provider metadata-providerable) field-id)
      (throw (ex-info (i18n/tru "Field {0} does not exist" (pr-str field-id))
                      {:field-id field-id}))))

(def ^:deprecated StageMetadata
  [:ref ::lib.schema.metadata/stage])

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
