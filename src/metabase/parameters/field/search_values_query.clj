(ns metabase.parameters.field.search-values-query
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.metadata-from-qp :as warehouse-schema.metadata-from-qp]
   [metabase.warehouse-schema.metadata-queries :as schema.metadata-queries]
   [toucan2.core :as t2]))

(mu/defn search-values-query
  "Generate the MBQL query used to power FieldValues search in [[metabase.parameters.field/search-values]]. The actual
  query generated differs slightly based on whether the two Fields are the same Field.

  Note: the generated MBQL query assume that both `field` and `search-field` are from the same table."
  [field        :- [:or
                    (ms/InstanceOf :model/Field)
                    ::lib.schema.metadata/column]
   search-field :- [:or
                    (ms/InstanceOf :model/Field)
                    ::lib.schema.metadata/column]
   value
   limit       :- pos-int?]
  (if-let [value->human-readable-value (schema.metadata-queries/human-readable-remapping-map (u/the-id field))]
    (let [query-string (some-> value u/lower-case-en)]
      (cond->> value->human-readable-value
        value (filter #(str/includes? (-> % val u/lower-case-en) query-string))
        true  (sort-by key)))
    (let [field        (cond-> field
                         (t2/model field) (lib-be/instance->metadata :metadata/column))
          search-field (cond-> search-field
                         (t2/model search-field) (lib-be/instance->metadata :metadata/column))
          query-xform  (fn query-xform  [query]
                         (-> query
                             (cond-> (some? value)
                               (lib/filter (-> (lib/contains search-field value)
                                               (lib/update-options assoc :case-sensitive false))))
                             ;; if both fields are the same then make sure not to refer to it twice in the `:breakout` clause.
                             ;; Otherwise this will break certain drivers like BigQuery that don't support duplicate
                             ;; identifiers/aliases
                             (lib/breakout field)
                             (cond-> (not= (u/the-id field) (u/the-id search-field))
                               (lib/breakout search-field))
                             (lib/limit limit)))]
      (-> (warehouse-schema.metadata-from-qp/table-query (:table-id field) query-xform)
          :data :rows))))
