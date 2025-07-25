(ns metabase.parameters.field.search-values-query
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.warehouse-schema.metadata-from-qp :as warehouse-schema.metadata-from-qp]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]))

(defn search-values-query
  "Generate the MBQL query used to power FieldValues search in [[metabase.parameters.field/search-values]]. The actual
  query generated differs slightly based on whether the two Fields are the same Field.

  Note: the generated MBQL query assume that both `field` and `search-field` are from the same table."
  [field search-field value limit]
  (if-let [value->human-readable-value (schema.metadata-queries/human-readable-remapping-map (u/the-id field))]
    (let [query (some-> value u/lower-case-en)]
      (cond->> value->human-readable-value
        value (filter #(str/includes? (-> % val u/lower-case-en) query))
        true  (sort-by key)))
    (-> (warehouse-schema.metadata-from-qp/table-query
         (:table_id field)
         {:filter   (when (some? value)
                      [:contains [:field (u/the-id search-field) nil] value {:case-sensitive false}])
          ;; if both fields are the same then make sure not to refer to it twice in the `:breakout` clause.
          ;; Otherwise this will break certain drivers like BigQuery that don't support duplicate
          ;; identifiers/aliases
          :breakout (if (= (u/the-id field) (u/the-id search-field))
                      [[:field (u/the-id field) nil]]
                      [[:field (u/the-id field) nil]
                       [:field (u/the-id search-field) nil]])
          :limit    limit})
        :data :rows)))
