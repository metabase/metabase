(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations."
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.query :as lib.query]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; ============================================================================
;; Import: Convert representation refs to Metabase IDs
;; ============================================================================

(defn- resolve-source-card
  [card-ref ref-index _mp]
  (when (v0-common/ref? card-ref)
    (-> ref-index
        (v0-common/lookup-id card-ref)
        (v0-common/ensure-not-nil))))

(defn- resolve-source-table
  "Resolves refs in the raw MBQL map, replacing them with IDs for import."
  [source-table _ref-index mp]
  (when (v0-common/table-ref? source-table)
    (->> (lib.metadata/tables mp)
         (filter #(and (= (:schema source-table) (:schema %))
                       (= (:table  source-table) (:name   %))))
         first
         :id
         v0-common/ensure-not-nil)))

(defn- resolve-field
  [field-ref ref-index mp]
  (when (v0-common/field-ref? field-ref)
    (let [table-id (resolve-source-table (dissoc field-ref :field) ref-index mp)]
      (->> (lib.metadata/fields mp table-id)
           (filter #(= (:field field-ref) (:name %)))
           first
           :id
           v0-common/ensure-not-nil))))

(defrecord V0ImportVisitor []
  lib/QueryVisitor
  (visit-database-id [_ _mp ref-index database-ref]
    (when (v0-common/ref? database-ref)
      (lookup/lookup-database-id ref-index database-ref)))
  (visit-table-id [_ mp ref-index table-ref]
    (when (v0-common/table-ref? table-ref)
      (resolve-source-table table-ref ref-index mp)))
  (visit-card-id [_ mp ref-index card-ref]
    (when (v0-common/ref? card-ref)
      (resolve-source-card card-ref ref-index mp)))
  (visit-field-id [_ mp ref-index field-ref]
    (when (v0-common/field-ref? field-ref)
      (resolve-field field-ref ref-index mp))))

(def ^:private import-visitor (->V0ImportVisitor))

(defn- normalize-field-references [query]
  (walk/postwalk (fn [node]
                   (if (and (vector? node)
                            (= "field" (first node)))
                     (update node 0 keyword)
                     node))
                 query))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure."
  [{:keys [query database]} ref-index]
  (let [db-id (lookup/lookup-database-id ref-index database)
        mp (lib-be/application-database-metadata-provider db-id)
        ;; normalize and import-walk have trouble with fields as we use them with strings and our own version of the
        ;; field-ref, so manually convert "field" to :field
        query (normalize-field-references query)
        query' (if (string? query)
                 (lib/native-query mp query)
                 (mu/disable-enforcement
                   (lib.normalize/normalize
                    (lib.query/query-with-stages mp query))))]
    (mu/disable-enforcement
      (lib/import-walk query' import-visitor ref-index))))

;; ============================================================================
;; Export: Convert Metabase IDs to representation refs
;; ============================================================================

(defn- table-ref
  "Convert a table ID to a representation ref map."
  [mp table-id]
  (when-some [t (lib.metadata/table mp table-id)]
    (-> {:schema (:schema t)
         :table (:name t)}

        u/remove-nils)))

(defn- field-ref
  "Convert a field id to a representation ref map."
  [mp field-id]
  (let [field (lib.metadata/field mp field-id)
        tr (table-ref mp (:table-id field))]
    (assoc tr :field (:name field))))

(defrecord V0MBQLExportVisitor []
  lib/QueryVisitor
  (visit-database-id [_ _mp _context database-id]
    (when (int? database-id)
      (v0-common/->ref database-id :database)))
  (visit-table-id [_ mp _context table-id]
    (when (int? table-id)
      (table-ref mp table-id)))
  (visit-card-id  [_ mp _context card-id]
    (when-some [card (lib.metadata/card mp card-id)]
      (v0-common/->ref (:id card) (:type card))))
  (visit-field-id [_ mp _context field-id]
    (when (int? field-id)
      (field-ref mp field-id))))

(def ^:private export-visitor (->V0MBQLExportVisitor))

(defn export-dataset-query
  "Export a dataset query to representation compatible format.
  Will have database (as a ref) and query."
  [query]
  (let [patched-query (lib/export-walk query export-visitor nil)]
    {:database (:database patched-query)
     :query (if (lib/native-only-query? query)
              (lib/raw-native-query query)
              (:stages patched-query))}))
