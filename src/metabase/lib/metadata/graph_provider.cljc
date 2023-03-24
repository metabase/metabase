(ns metabase.lib.metadata.graph-provider
  (:require [medley.core :as m]
            [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

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
  lib.metadata.protocols/MetadataProvider
  (database [_this]            (graph-database metadata-graph))
  (table    [_this table-id]   (graph-table    metadata-graph table-id))
  (field    [_this field-id]   (graph-field    metadata-graph field-id))
  (metric   [_this metric-id]  (graph-metric   metadata-graph metric-id))
  (segment  [_this segment-id] (graph-segment  metadata-graph segment-id))
  (card     [_this card-id]    (graph-card     metadata-graph card-id))
  (tables   [_this]            (graph-tables   metadata-graph))
  (fields   [_this table-id]   (graph-fields   metadata-graph table-id)))
