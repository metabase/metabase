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

(defn- graph-segment [metadata-graph segment-id]
  (some (fn [table-metadata]
          (m/find-first #(= (:id %) segment-id)
                        (:segments table-metadata)))
        (:tables metadata-graph)))

(defn- graph-card [_metadata-graph _card-id]
  ;; not implemented for the simple graph metadata provider.
  nil)

(defn- graph-metadatas [metadata-graph metadata-type ids]
  (let [f (case metadata-type
            :metadata/table         graph-table
            :metadata/column        graph-field
            :metadata/segment       graph-segment
            :metadata/card          graph-card)]
    (into []
          (keep (fn [id]
                  (f metadata-graph id)))
          ids)))

(defn- graph-tables [metadata-graph]
  (for [table-metadata (:tables metadata-graph)]
    (dissoc table-metadata :fields :metrics :segments)))

(defn- graph-metadatas-for-table [metadata-graph metadata-type table-id]
  (let [k     (case metadata-type
                :metadata/column        :fields
                :metadata/metric        :cards
                :metadata/segment       :segments)
        table (find-table metadata-graph table-id)]
    (cond->> (get table k)
      (= metadata-type :metadata/metric)
      (filterv #(and (= (:type %) :metric)
                     (not (:archived %)))))))

(defn- graph-setting [metadata-graph setting-name]
  (get-in metadata-graph [:settings (keyword setting-name)]))

(deftype ^{:doc "A simple implementation of [[MetadataProvider]] that returns data from a complete graph
  e.g. the response provided by `GET /api/database/:id/metadata`."} SimpleGraphMetadataProvider [metadata-graph]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (graph-database metadata-graph))
  (metadatas [_this metadata-type ids]
    (graph-metadatas metadata-graph metadata-type ids))
  (tables [_this]
    (graph-tables metadata-graph))
  (metadatas-for-table [_this metadata-type table-id]
    (graph-metadatas-for-table metadata-graph metadata-type table-id))
  (metadatas-for-card [_this _metadata-type _card-id]
    ;; not implemented for the simple graph metadata provider
    nil)
  (setting [_this setting-key]
    (graph-setting metadata-graph setting-key))

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
