(ns metabase.lib.test-metadata.graph-provider
  (:refer-clojure :exclude [get-in])
  (:require
   #?@(:clj
       ([pretty.core :as pretty]))
   [clojure.core.protocols]
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.performance :refer [get-in]]))

(defn- graph-database [metadata-graph]
  (dissoc metadata-graph :tables))

(defn- find-table [metadata-graph table-id]
  (m/find-first #(= (:id %) table-id)
                (:tables metadata-graph)))

(defn- graph-metadatas
  [metadata-graph {metadata-type :lib/type, :keys [table-id], :as metadata-spec}]
  (let [objects (case metadata-type
                  :metadata/table   (:tables metadata-graph)
                  :metadata/column  (if table-id
                                      (:fields (find-table metadata-graph table-id))
                                      (mapcat :fields (:tables metadata-graph)))
                  :metadata/metric  (if table-id
                                      (:metrics (find-table metadata-graph table-id))
                                      (mapcat :metrics (:tables metadata-graph)))
                  :metadata/segment (if table-id
                                      (:segments (find-table metadata-graph table-id))
                                      (mapcat :segments (:tables metadata-graph)))
                  #_else
                  ;; not implemented for the simple graph metadata provider.
                  nil)]
    (into []
          (comp (lib.metadata.protocols/default-spec-filter-xform metadata-spec)
                (map #(assoc % :lib/type metadata-type))
                (map #(cond-> %
                        (= metadata-type :metadata/table) (dissoc :fields :metrics :segments))))
          objects)))

(defn- graph-setting [metadata-graph setting-name]
  (get-in metadata-graph [:settings (keyword setting-name)]))

(deftype ^{:doc "A simple implementation of [[MetadataProvider]] that returns data from a complete graph
  e.g. the response provided by `GET /api/database/:id/metadata`."} SimpleGraphMetadataProvider [metadata-graph]
  lib.metadata.protocols/MetadataProvider
  (database [_this]
    (graph-database metadata-graph))
  (metadatas [_this metadata-spec]
    (graph-metadatas metadata-graph metadata-spec))
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
