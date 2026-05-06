(ns metabase.agent-lib.test-util
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]))

(defn entity-summary
  [table-name]
  {:model   "table"
   :id      (meta/id table-name)
   :columns (mapv (fn [field-name]
                    {:id (meta/id table-name field-name)})
                  (meta/fields table-name))})

(defn table-context
  [table-name & surrounding-table-names]
  {:source-entity              (entity-summary table-name)
   :source-metadata            (meta/table-metadata table-name)
   :referenced-entities        []
   :referenced-metadata        []
   :surrounding-tables         (mapv entity-summary surrounding-table-names)
   :surrounding-table-metadata (mapv meta/table-metadata surrounding-table-names)
   :join-edges                 []})

(defn table-context-with-join-edges
  [table-name surrounding-table-names join-edges]
  {:source-entity              (entity-summary table-name)
   :source-metadata            (meta/table-metadata table-name)
   :referenced-entities        []
   :referenced-metadata        []
   :surrounding-tables         (mapv entity-summary surrounding-table-names)
   :surrounding-table-metadata (mapv meta/table-metadata surrounding-table-names)
   :join-edges                 join-edges})

(defn join-edge
  [from-table from-field to-table to-field]
  {:from_table_id (meta/id from-table)
   :from_field_id (meta/id from-table from-field)
   :to_table_id   (meta/id to-table)
   :to_field_id   (meta/id to-table to-field)})

(defn query-for-table
  [table-name]
  (lib/query meta/metadata-provider (meta/table-metadata table-name)))

(defn comparable-query
  [query]
  {:database (:database query)
   :legacy   (-> query
                 lib/->legacy-MBQL
                 lib.schema.util/remove-lib-uuids)})

(defn current-query-column
  [query field-id]
  (or (some #(when (= field-id (:id %)) %)
            (distinct
             (concat (lib/visible-columns query)
                     (lib/filterable-columns query)
                     (lib/breakoutable-columns query)
                     (lib/orderable-columns query))))
      (throw (ex-info "Expected field to be available in query context"
                      {:field-id field-id
                       :query    query}))))

(defn current-query-column-by-name
  [query column-name]
  (let [normalized-column-name (u/lower-case-en column-name)]
    (or (some (fn [column]
                (when (contains? (->> [(:name column)
                                       (:lib/source-column-alias column)
                                       (:lib/ref-name column)]
                                      (keep identity)
                                      (map u/lower-case-en)
                                      set)
                                 normalized-column-name)
                  column))
              (distinct
               (concat (lib/returned-columns query)
                       (lib/visible-columns query)
                       (lib/filterable-columns query)
                       (lib/breakoutable-columns query)
                       (lib/orderable-columns query))))
        (throw (ex-info "Expected named column to be available in query context"
                        {:column-name column-name
                         :query       query})))))

(defn previous-stage-aggregation-column
  [query ag-index]
  (let [previous-stage-number (lib.util/previous-stage-number query -1)
        source-uuid           (:lib/source-uuid
                               (get (vec (lib.aggregation/aggregations-metadata query previous-stage-number))
                                    ag-index))
        candidate-columns     (concat (lib/filterable-columns query)
                                      (lib/orderable-columns query)
                                      (lib/visible-columns query))]
    (or (some #(when (= source-uuid (:lib/source-uuid %)) %) candidate-columns)
        (throw (ex-info "Expected a previous-stage aggregation column"
                        {:query             query
                         :aggregation-index ag-index})))))

(defn current-aggregation-orderable
  [query ag-index]
  (or (lib/find-matching-column query
                                -1
                                (lib/aggregation-ref query ag-index)
                                (lib/orderable-columns query))
      (lib/aggregation-ref query ag-index)))
