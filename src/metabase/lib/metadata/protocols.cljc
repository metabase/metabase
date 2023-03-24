(ns metabase.lib.metadata.protocols
  (:require
   [medley.core :as m]
   #?@(:clj ([potemkin :as p]
             [pretty.core :as pretty]))))

(#?(:clj p/defprotocol+ :cljs defprotocol) MetadataProvider
  "Protocol for something that we can get information about Tables and Fields from. This can be provided in various ways
  various ways:

  1. By raw metadata attached to the query itself

  2. By the application database in Clj code

  3. By the Query Processor store in Clj code

  4. By the Redux store in JS

  5. By (hopefully cached) REST API calls

  This protocol is pretty limited at this point; in the future, we'll probably want to add:

  - methods for searching for Tables or Fields matching some string

  - paging, so if you have 10k Tables we don't do crazy requests that fetch them all at once

  For all of these methods: if no matching object can be found, you should generally return `nil` rather than throwing
  an Exception. Let [[metabase.lib.metadata]] worry about throwing exceptions."
  (database [this]
    "Metadata about the Database we're querying. Should match the [[metabase.lib.metadata/DatabaseMetadata]] schema.
  This includes important info such as the supported `:features` and the like.")

  (table [this table-id]
    "Return metadata for a specific Table. Metadata should satisfy [[metabase.lib.metadata/TableMetadata]].")

  (field [this field-id]
    "Return metadata for a specific Field. Metadata should satisfy [[metabase.lib.metadata/ColumnMetadata]].")

  (card [this card-id]
    "Return information about a specific Saved Question, aka a Card. This should
    match [[metabase.lib.metadata/CardMetadata]. Currently just used for display name purposes if you have a Card as a
    source query.")

  (metric [this metric-id]
    "Return metadata for a particular capital-M Metric, i.e. something from the `metric` table in the application
    database. Metadata should match [[metabase.lib.metadata/MetricMetadata]].")

  (segment [this segment-id]
    "Return metadata for a particular captial-S Segment, i.e. something from the `segment` table in the application
    database. Metadata should match [[metabase.lib.metadata/SegmentMetadata]]." )

  ;; these methods are only needed for using the methods BUILDING queries, so they're sort of optional I guess? Things
  ;; like the Query Processor, which is only manipulating already-built queries, shouldn't need to use these methods.
  ;; I'm on the fence about maybe putting these in a different protocol. They're part of this protocol for now tho so
  ;; implement them anyway.

  (tables [this]
    "Return a sequence of Tables in this Database. Tables should satisfy the [[metabase.lib.metadata/TableMetadata]]
  schema. This should also include things that serve as 'virtual' tables, e.g. Saved Questions or Models. But users of
  MLv2 should not need to know that! If we add support for Super Models or Quantum Questions in the future, they can
  just come back from this method in the same shape as everything else, the Query Builder can display them, and the
  internals can be tucked away here in MLv2.")

  (fields [this table-id]
    "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the [[metabase.lib.metadata/ColumnMetadata]] schema. If no such Table exists, this should error."))

(defn metadata-provider?
  "Whether `x` is a valid [[MetadataProvider]]."
  [x]
  (satisfies? MetadataProvider x))

;;;; Graph provider and impl

;;; TODO -- only used by tests, move this into tests.

(defn- graph-database [metadata-graph]
  (dissoc metadata-graph :tables))

(defn- graph-table [metadata-graph table-id]
  (some (fn [table-metadata]
          (when (= (:id table-metadata) table-id)
            (dissoc table-metadata :fields :metrics :segments)))
        (:tables metadata-graph)))

(defn- graph-field [metadata-graph field-id]
  (some (fn [table-metadata]
          (m/find-first #(= (:id %) field-id)
                        (:fields table-metadata)))
        (:tables metadata-graph)))

(defn- graph-metric [metadata-graph metric-id]
  (some (fn [table-metadata]
          (m/find-first #(= (:id %) metric-id)
                        (:metrics table-metadata)))
        (:tables metadata-graph)))

(defn- graph-segment [metadata-graph segment-id]
  (some (fn [table-metadata]
          (m/find-first #(= (:id %) segment-id)
                        (:segments table-metadata)))
        (:tables metadata-graph)))

(defn- graph-card [_metadata-graph _card-id]
  ;; not implemented for the simple graph metadata provider.
  nil)

(defn- graph-tables [metadata-graph]
  (for [table-metadata (:tables metadata-graph)]
    (dissoc table-metadata :fields :metrics :segments)))

(defn- graph-fields [metadata-graph table-id]
  (some (fn [table-metadata]
          (when (= (:id table-metadata) table-id)
            (:fields table-metadata)))
        (:tables metadata-graph)))

(deftype ^{:doc "A simple implementation of [[MetadataProvider]] that returns data from a complete graph
  e.g. the response provided by `GET /api/database/:id/metadata`."} SimpleGraphMetadataProvider [metadata-graph]
  MetadataProvider
  (database [_this]            (graph-database metadata-graph))
  (table    [_this table-id]   (graph-table    metadata-graph table-id))
  (field    [_this field-id]   (graph-field    metadata-graph field-id))
  (metric   [_this metric-id]  (graph-metric   metadata-graph metric-id))
  (segment  [_this segment-id] (graph-segment  metadata-graph segment-id))
  (card     [_this card-id]    (graph-card     metadata-graph card-id))
  (tables   [_this]            (graph-tables   metadata-graph))
  (fields   [_this table-id]   (graph-fields   metadata-graph table-id))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               ;; don't actually print the whole thing because it's going to make my eyes bleed to see all
               ;; of [[metabase.lib.test-metadata]] every single time a test fails
               `SimpleGraphMetadataProvider)]))

;;; TODO -- do we need Database methods as well?
(#?(:clj p/defprotocol+ :cljs defprotocol) WarmableMetadataProvider
  (store-tables! [metadata-provider tables])
  (store-fields! [metadata-provider fields])
  (store-cards! [metadata-provider cards])
  (store-metrics! [metadata-provider metrics])
  (store-segments! [metadata-provider segment-ids])
  (fetch-tables! [metadata-provider table-ids])
  (fetch-fields! [metadata-provider field-ids])
  (fetch-cards! [metadata-provider card-ids])
  (fetch-metrics! [metadata-provider metric-ids])
  (fetch-segments! [metadata-provider segment-ids]))
