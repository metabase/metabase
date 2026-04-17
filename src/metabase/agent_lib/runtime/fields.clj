(ns metabase.agent-lib.runtime.fields
  "Field lookup and query-stage field resolution for structured MBQL runtime bindings."
  (:require
   [metabase.agent-lib.common.errors :as errors]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn build-table-lookup
  "Build a lowercase table-name lookup for `table-ids`.

  Only the explicitly-requested tables are loaded — the runtime is scoped to entities the program
  actually references (source + referenced + surrounding), not every table in the database.
  Unknown tables are silently dropped; out-of-scope lookups will surface as nice errors at use time."
  [metadata-provider table-ids]
  (into {}
        (keep (fn [tid]
                (when-let [table (lib.metadata/table metadata-provider tid)]
                  [(u/lower-case-en (:name table)) table])))
        table-ids))

(defn build-field-lookups
  "Build both the `fields-by-table` and `fields-by-id` lookups for the tables in `tables-by-name`.

  `fields-by-table` is a `{lower-case-table-name {lower-case-field-name field}}` map.
  `fields-by-id` is a `{field-id field}` map.

  Both maps are scoped to the tables passed in — typically the in-scope set computed from the
  evaluation context, not every table in the database."
  [metadata-provider tables-by-name]
  (reduce-kv (fn [acc table-name table-meta]
               (let [fields (lib.metadata/fields metadata-provider (:id table-meta))]
                 (-> acc
                     (assoc-in [:fields-by-table table-name]
                               (into {}
                                     (map (fn [field]
                                            [(u/lower-case-en (:name field)) field]))
                                     fields))
                     (update :fields-by-id
                             (fn [m]
                               (reduce (fn [m field] (assoc m (:id field) field)) m fields))))))
             {:fields-by-table {} :fields-by-id {}}
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
