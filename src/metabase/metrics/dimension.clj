(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.parameters.core :as parameters]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- dimension-field-id
  "Field id behind `dim` on `metric`, or nil when it can't be resolved — the dimension is
   missing from the metric, orphaned, or mapped to a column name rather than a Field id.
   Logged rather than swallowed outright: the caller's only signal is a dimension annotated
   with nil columns, which is otherwise indistinguishable from a Field that has no value."
  [metric dim]
  (try
    (lib-metric/resolve-dimension-to-field-id
     (:dimensions metric)
     (:dimension_mappings metric)
     (:id dim))
    (catch Exception e
      (log/debugf e "Could not resolve dimension %s to a field id; annotating it with nil columns"
                  (:id dim))
      nil)))

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
  ;; Resolve each (metric, dimension) pair exactly once and carry the field id alongside its
  ;; dimension, so the merge pass below reads it instead of resolving all over again.
  (let [dims+fids  (mapv (fn [metric]
                           (mapv (fn [dim] [dim (dimension-field-id metric dim)])
                                 (:dimensions metric)))
                         metrics)
        field-ids  (into #{} (comp cat (keep second)) dims+fids)
        field->row (when (seq field-ids)
                     (t2/select-pk->fn #(select-keys % field-cols)
                                       (into [:model/Field :id] field-cols)
                                       :id [:in field-ids]))
        nil-cols   (zipmap field-cols (repeat nil))]
    (mapv (fn [metric pairs]
            (cond-> metric
              (seq pairs) (assoc :dimensions
                                 (mapv (fn [[dim fid]]
                                         (merge dim nil-cols (get field->row fid)))
                                       pairs))))
          metrics
          dims+fids)))

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
