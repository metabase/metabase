(ns metabase.lib.test-metadata.graph-provider
  (:require
   [clojure.core.protocols]
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   #?@(:clj
       ([pretty.core :as pretty]))))

(defn- graph-database [metadata-graph]
  (dissoc metadata-graph :tables))

(defn- find-table [metadata-graph table-id]
  (m/find-first #(= (:id %) table-id)
                (:tables metadata-graph)))

(defn- graph-table [metadata-graph table-id]
  (dissoc (find-table metadata-graph table-id) :fields :metrics :segments))

(defn- graph-field [metadata-graph field-id]
  (some (fn [table-metadata]
          (m/find-first #(= (:id %) field-id)
                        (:fields table-metadata)))
        (:tables metadata-graph)))

(defn- graph-legacy-metric [metadata-graph metric-id]
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
  (:fields (find-table metadata-graph table-id)))

(defn- graph-legacy-metrics [metadata-graph table-id]
  (:metrics (find-table metadata-graph table-id)))

(defn- graph-segments [metadata-graph table-id]
  (:segments (find-table metadata-graph table-id)))

(defn- graph-setting [metadata-graph setting-name]
  (get-in metadata-graph [:settings (keyword setting-name)]))

(deftype ^{:doc "A simple implementation of [[MetadataProvider]] that returns data from a complete graph
  e.g. the response provided by `GET /api/database/:id/metadata`."} SimpleGraphMetadataProvider [metadata-graph]
  lib.metadata.protocols/MetadataProvider
  (database       [_this]            (graph-database       metadata-graph))
  (table          [_this table-id]   (graph-table          metadata-graph table-id))
  (field          [_this field-id]   (graph-field          metadata-graph field-id))
  (legacy-metric  [_this metric-id]  (graph-legacy-metric  metadata-graph metric-id))
  (segment        [_this segment-id] (graph-segment        metadata-graph segment-id))
  (card           [_this card-id]    (graph-card           metadata-graph card-id))
  (tables         [_this]            (graph-tables         metadata-graph))
  (fields         [_this table-id]   (graph-fields         metadata-graph table-id))
  (legacy-metrics [_this table-id]   (graph-legacy-metrics metadata-graph table-id))
  (segments       [_this table-id]   (graph-segments       metadata-graph table-id))
  (setting        [_this setting]    (graph-setting        metadata-graph setting))

  clojure.core.protocols/Datafiable
  (datafy [_this]
    (list `->SimpleGraphMetadataProvider metadata-graph))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? SimpleGraphMetadataProvider another)
         (= metadata-graph
            (#?(:clj .metadata-graph :cljs .-metadata-graph) ^SimpleGraphMetadataProvider another))))

  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               (if (identical? metadata-graph @(requiring-resolve 'metabase.lib.test-metadata/metadata))
                 'metabase.lib.test-metadata/metadata-provider
                 (list `->SimpleGraphMetadataProvider metadata-graph)))]))

(deftest ^:parallel equality-test
  (is (= (->SimpleGraphMetadataProvider {})
         (->SimpleGraphMetadataProvider {}))))
