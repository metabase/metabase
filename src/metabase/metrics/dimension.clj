(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.parameters.core :as parameters]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn annotate-dimensions-with-field-data :- [:sequential :map]
  "Given a vector of `:model/Field` columns and a seq of metrics (each carrying
   `:dimensions` and optional `:dimension_mappings`), batch-load those columns from
   the underlying Field row for each dimension and assoc them onto the dimension.
   Useful for pulling Field-stored metadata (e.g. `:dimension_interestingness`)
   onto API responses without round-tripping per dimension.

   Dimensions whose field-id can't be resolved get the columns assoc'd as nil.
   Returns the metrics seq with `:dimensions` updated in place. `metrics` is the
   last arg so this composes cleanly with `->>` pipelines."
  [field-cols :- [:sequential :keyword]
   metrics    :- [:sequential :map]]
  (let [resolve-fid (fn [metric dim]
                      (try
                        (lib-metric/resolve-dimension-to-field-id
                         (:dimensions metric)
                         (:dimension_mappings metric)
                         (:id dim))
                        (catch Exception _ nil)))
        field-ids   (into #{}
                          (for [m metrics, d (:dimensions m)
                                :let [fid (resolve-fid m d)]
                                :when fid]
                            fid))
        field->row  (when (seq field-ids)
                      (into {}
                            (map (juxt :id #(select-keys % field-cols)))
                            (t2/select (into [:model/Field :id] field-cols)
                                       :id [:in field-ids])))]
    (mapv (fn [metric]
            (if-let [dims (seq (:dimensions metric))]
              (assoc metric :dimensions
                     (mapv (fn [d]
                             (let [fid  (resolve-fid metric d)
                                   row  (get field->row fid)]
                               (merge d (zipmap field-cols (map #(get row %) field-cols)))))
                           dims))
              metric))
          metrics)))

(mu/defn dimension-values :- ms/FieldValuesResult
  "Fetch values for a dimension given its UUID.
   Uses the same logic as the field values API."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string]
  (let [field-id (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)
        field    (t2/select-one :model/Field :id field-id)]
    (parameters/field->values field)))

(mu/defn dimension-search-values :- [:sequential [:vector :string]]
  "Search for values of a dimension that contain the query string."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string
   query-string       :- ms/NonBlankString]
  (let [field-id (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)]
    (:values (parameters/search-values-from-field-id field-id query-string))))

(mu/defn dimension-remapped-value :- [:or [:tuple :any] [:tuple :any :string]]
  "Get the remapped value for a specific dimension value.
   Returns a pair like [value display-name] if remapping exists, or just [value] otherwise."
  [dimensions         :- [:maybe [:sequential :map]]
   dimension-mappings :- [:maybe [:sequential :map]]
   dimension-id       :- :string
   value              :- :string]
  (let [field-id        (lib-metric/resolve-dimension-to-field-id dimensions dimension-mappings dimension-id)
        field           (t2/select-one :model/Field :id field-id)
        parsed-value    (parameters/parse-query-param-value-for-field field value)
        remapped-fid    (parameters/remapped-field-id field-id)]
    (if remapped-fid
      (let [remapped-field (t2/select-one :model/Field :id remapped-fid)]
        (parameters/remapped-value field remapped-field parsed-value))
      ;; No remapping - return the value as-is
      [parsed-value])))
