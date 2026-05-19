(ns metabase.agent-lib.runtime.lookup
  "Metadata and field lookup helpers for structured runtime bindings."
  (:require
   [metabase.agent-lib.common.errors :as errors]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime.fields :as fields]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn lookup-table
  "Resolve a table by numeric id or case-insensitive name."
  [metadata-provider tables-by-name table-identifier]
  (let [available-names (keys tables-by-name)]
    (if (number? table-identifier)
      (or (lib.metadata/table metadata-provider (int table-identifier))
          (errors/lookup-error! (str "Table not found by ID: " table-identifier)
                                {:table-id table-identifier}
                                {:available available-names}))
      (let [normalized (u/lower-case-en table-identifier)]
        (or (get tables-by-name normalized)
            (errors/lookup-error! (str "Table not found: " table-identifier)
                                  {:table-name table-identifier}
                                  {:available available-names}))))))

(defn lookup-card
  "Resolve a saved-question source, rejecting metrics."
  [metadata-provider card-id]
  (if (number? card-id)
    (if-let [card-meta (lib.metadata/card metadata-provider (int card-id))]
      (if (= (:type card-meta) :metric)
        (errors/lookup-error! (str "Card " card-id " is a metric.")
                              {:card-id card-id}
                              {:suggestion (str "Use (metric " card-id ") instead.")})
        card-meta)
      (errors/lookup-error! (str "Card not found by ID: " card-id)
                            {:card-id card-id}))
    (errors/lookup-error! (str "Card lookup requires a numeric ID, got: " (pr-str card-id))
                          {:card-id card-id})))

(defn lookup-metric
  "Resolve a metric by numeric id."
  [metadata-provider metric-id]
  (if (number? metric-id)
    (or (lib.metadata/metric metadata-provider (int metric-id))
        (errors/lookup-error! (str "Metric not found by ID: " metric-id)
                              {:metric-id metric-id}))
    (errors/lookup-error! (str "Metric lookup requires a numeric ID, got: " (pr-str metric-id))
                          {:metric-id metric-id})))

(defn lookup-measure
  "Resolve a measure by numeric id."
  [metadata-provider measure-id]
  (if (number? measure-id)
    (or (lib.metadata/measure metadata-provider (int measure-id))
        (errors/lookup-error! (str "Measure not found by ID: " measure-id)
                              {:measure-id measure-id}))
    (errors/lookup-error! (str "Measure lookup requires a numeric ID, got: " (pr-str measure-id))
                          {:measure-id measure-id})))

(defn lookup-field
  "Resolve a field by id, unique name, or explicit table/name pair."
  ([metadata-provider _tables-by-name fields-by-table fields-by-id field-name-or-id]
   (if (number? field-name-or-id)
     (or (get fields-by-id (int field-name-or-id))
         (lib.metadata/field metadata-provider (int field-name-or-id))
         (errors/lookup-error! (str "Field not found by ID: " field-name-or-id)
                               {:field-id field-name-or-id}))
     (let [field-name (u/lower-case-en field-name-or-id)
           matches    (into []
                            (keep (fn [[table-name field-map]]
                                    (when-let [field (get field-map field-name)]
                                      [table-name field])))
                            fields-by-table)]
       (cond
         (= 1 (count matches))
         (second (first matches))

         (> (count matches) 1)
         (errors/lookup-error! (str "Ambiguous field \"" field-name-or-id "\".")
                               {:field-name field-name-or-id}
                               {:tables     (mapv first matches)
                                :suggestion "Use (field \"TABLE\" \"FIELD\") to disambiguate."})

         :else
         (errors/lookup-error! (str "Field not found: \"" field-name-or-id "\".")
                               {:field-name field-name-or-id}
                               {:suggestion "Use (field \"TABLE\" \"FIELD\") with explicit table name."})))))
  ([metadata-provider _tables-by-name fields-by-table _fields-by-id table-name-or-id field-name]
   (fields/resolve-field-from-table metadata-provider
                                    _tables-by-name
                                    fields-by-table
                                    table-name-or-id
                                    field-name)))

(defn query-relative-field
  "Resolve a requested field against the current query stage."
  ([metadata-provider tables-by-name fields-by-table fields-by-id query field-name-or-id]
   (fields/resolve-field-in-query fields-by-id
                                  query
                                  (lookup-field metadata-provider
                                                tables-by-name
                                                fields-by-table
                                                fields-by-id
                                                field-name-or-id)))
  ([metadata-provider tables-by-name fields-by-table fields-by-id query table-name-or-id field-name]
   (let [raw-field (lookup-field metadata-provider
                                 tables-by-name
                                 fields-by-table
                                 fields-by-id
                                 table-name-or-id
                                 field-name)]
     (or (when (mbql/query? query)
           (lib/find-matching-column query
                                     -1
                                     raw-field
                                     (mbql/current-query-field-candidates query)))
         (fields/resolve-field-in-query fields-by-id query raw-field)
         raw-field))))

(defn metadata-bindings
  "Return metadata and field lookup bindings for the structured runtime."
  [metadata-provider tables-by-name fields-by-table fields-by-id]
  {'table   (partial lookup-table metadata-provider tables-by-name)
   'card    (partial lookup-card metadata-provider)
   'metric  (partial lookup-metric metadata-provider)
   'measure (partial lookup-measure metadata-provider)
   'field   (fn
              ([field-name-or-id]
               (lookup-field metadata-provider
                             tables-by-name
                             fields-by-table
                             fields-by-id
                             field-name-or-id))
              ([a b]
               ;; 2-arity: (field query field-name-or-id) or (field table-name field-name).
               ;; Queries are always maps; table names are always strings or numbers.
               (if (map? a)
                 (query-relative-field metadata-provider
                                       tables-by-name
                                       fields-by-table
                                       fields-by-id
                                       a
                                       b)
                 (lookup-field metadata-provider
                               tables-by-name
                               fields-by-table
                               fields-by-id
                               a
                               b)))
              ([query table-name-or-id field-name]
               (query-relative-field metadata-provider
                                     tables-by-name
                                     fields-by-table
                                     fields-by-id
                                     query
                                     table-name-or-id
                                     field-name)))})
