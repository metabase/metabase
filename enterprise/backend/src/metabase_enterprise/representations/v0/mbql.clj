(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations."
  (:require
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
  lib/ImportVisitor
  (import-database [_ _mp ref-index database-ref]
    (lookup/lookup-database-id ref-index database-ref))
  (import-source-table [_ mp ref-index source-table-info]
    (resolve-source-table source-table-info ref-index mp))
  (import-source-card [_ mp ref-index source-card-info]
    (resolve-source-card source-card-info ref-index mp))
  (import-field [_ mp ref-index field-ref]
    (resolve-field field-ref ref-index mp)))

(def ^:private import-visitor (->V0ImportVisitor))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure."
  [{:keys [query database]} ref-index]
  (let [db-id (lookup/lookup-database-id ref-index database)
        mp (lib-be/application-database-metadata-provider db-id)
        query' (if (string? query)
                 (lib/native-query mp query)
                 (mu/disable-enforcement
                   (lib.query/query-with-stages mp query)))]
    (lib/import-walk query' import-visitor ref-index)))

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
  lib/ExportVisitor
  (export-database [_ _mp _context database-id]
    (v0-common/->ref database-id :database))
  (export-source-table [_ mp _context source-table-id]
    (table-ref mp source-table-id))
  (export-source-card  [_ mp _context source-card-id]
    (v0-common/entity->ref (lib.metadata/card mp source-card-id)))
  (export-field [_ mp _context field-id]
    (field-ref mp field-id)))

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

