(ns metabase.agent-lib.runtime.fields
  "Field lookup and query-stage field resolution for structured MBQL runtime bindings."
  (:require
   [metabase.agent-lib.common.errors :as errors]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn build-table-lookup
  "Build a lowercase table-name lookup from metadata."
  [metadata-provider]
  (into {}
        (map (fn [table] [(u/lower-case-en (:name table)) table]))
        (lib.metadata/tables metadata-provider)))

(defn build-field-lookup
  "Build a lowercase field-name lookup keyed by lowercase table name."
  [metadata-provider tables-by-name]
  (into {}
        (map (fn [[table-name table-meta]]
               [table-name
                (into {}
                      (map (fn [field] [(u/lower-case-en (:name field)) field]))
                      (lib.metadata/fields metadata-provider (:id table-meta)))]))
        tables-by-name))

(defn build-field-id-lookup
  "Build a field-id lookup from metadata."
  [metadata-provider tables-by-name]
  (into {}
        (mapcat (fn [[_table-name table-meta]]
                  (map (fn [field] [(:id field) field])
                       (lib.metadata/fields metadata-provider (:id table-meta)))))
        tables-by-name))

(defn- table-name-for-field-lookup
  [metadata-provider tables-by-name table-name-or-id]
  (if (number? table-name-or-id)
    (if-let [table-meta (lib.metadata/table metadata-provider (int table-name-or-id))]
      (u/lower-case-en (:name table-meta))
      (errors/lookup-error! (str "Table not found by ID: " table-name-or-id)
                            {:table-id table-name-or-id}
                            {:available (keys tables-by-name)}))
    (u/lower-case-en table-name-or-id)))

(defn resolve-field-from-table
  "Resolve a field by explicit table and field identifiers."
  [metadata-provider tables-by-name fields-by-table table-name-or-id field-name]
  (let [table-name            (table-name-for-field-lookup metadata-provider tables-by-name table-name-or-id)
        normalized-field-name (u/lower-case-en field-name)
        table-fields          (get fields-by-table table-name)]
    (or (get table-fields normalized-field-name)
        (errors/lookup-error! (str "Field not found: "
                                   (if (number? table-name-or-id)
                                     (str "(table " table-name-or-id ")")
                                     table-name-or-id)
                                   "." field-name)
                              {:table-name table-name
                               :field-name field-name}
                              (when table-fields
                                {:available (keys table-fields)})))))

(defn resolve-field-in-query
  "Resolve a metadata field against the columns available in the current query stage."
  [fields-by-id query raw-field]
  (mbql/resolve-field-in-query fields-by-id query raw-field
                               (mbql/current-query-field-candidates query)))
