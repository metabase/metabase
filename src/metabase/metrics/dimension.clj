(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.parameters.core :as parameters]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- API Shape -------------------------------------------------
;;; Convert internal (kebab) dimensions to the snake_case shape the frontend expects.
;;; Mirrors the metric-dimensions branch's `->api-dimension` layer so the two converge.

(defn ->api-group
  "Convert an internal dimension group `{:id :type :display-name}` to the API shape."
  [group]
  (when group
    {:id           (:id group)
     :type         (:type group)
     :display_name (:display-name group)}))

(defn- ->api-source
  [source]
  {:type     (:type source)
   :field-id (:field-id source)})

(defn ->api-dimension
  "Convert an internal (kebab) persisted or computed dimension to the API shape consumed by the
   frontend: snake_case top-level keys, fully-qualified type strings, and a `:sources` list
   whose entries keep the kebab `field-id` key."
  [dim]
  (cond-> {:id             (:id dim)
           :name           (:name dim)
           :display_name   (or (:display-name dim) (:name dim))
           :effective_type (some-> (:effective-type dim) u/qualified-name)
           :semantic_type  (some-> (:semantic-type dim) u/qualified-name)}
    (:has-field-values dim)         (assoc :has_field_values (u/qualified-name (:has-field-values dim)))
    (:status dim)                   (assoc :status (:status dim))
    (:status-message dim)           (assoc :status_message (:status-message dim))
    (some? (:dimension-interestingness dim))
    (assoc :dimension_interestingness (:dimension-interestingness dim))
    (:group dim)                    (assoc :group (->api-group (:group dim)))
    (:sources dim)                  (assoc :sources (mapv ->api-source (:sources dim)))))

(defn ->api-dimensions
  "Convert a sequence of internal dimensions to the API shape. nil-safe (returns `[]`)."
  [dims]
  (mapv ->api-dimension dims))

(defn ->api-dimension-mapping
  "Convert an internal (kebab) dimension mapping to the API shape: snake_case keys, with the
   MBQL `:target` ref passing through untouched."
  [mapping]
  (cond-> {:dimension_id (:dimension-id mapping)
           :target       (:target mapping)}
    (:type mapping)     (assoc :type (:type mapping))
    (:table-id mapping) (assoc :table_id (:table-id mapping))))

(defn ->api-dimension-mappings
  "Convert a sequence of internal dimension mappings to the API shape. nil-safe (returns `[]`)."
  [mappings]
  (mapv ->api-dimension-mapping mappings))

(defn api->dimension
  "Convert an API-shape (snake_case) dimension object to the internal kebab-case shape.
   Mechanical: kebab-cases the top-level keys and a nested `:group`; `:sources` entries and
   `:target` refs are kebab-case on both sides and pass through untouched."
  [dim]
  (cond-> (update-keys dim u/->kebab-case-en)
    (:group dim) (update :group #(update-keys % u/->kebab-case-en))))

(defn api->dimensions
  "Convert a sequence of API-shape dimensions to the internal shape. nil-safe (returns `[]`)."
  [dims]
  (mapv api->dimension dims))

(defn api->dimension-mapping
  "Convert an API-shape (snake_case) dimension mapping to the internal kebab-case shape.
   `:target` (an MBQL ref) passes through untouched."
  [mapping]
  (update-keys mapping u/->kebab-case-en))

(defn api->dimension-mappings
  "Convert a sequence of API-shape dimension mappings to the internal shape. nil-safe (returns `[]`)."
  [mappings]
  (mapv api->dimension-mapping mappings))

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
   Useful for pulling Field-stored metadata (e.g. the `dimension_interestingness`
   column, annotated onto dimensions as `:dimension-interestingness`) onto API
   responses without round-tripping per dimension. Column names are snake_case
   (they address the Field table); the keys merged onto the dimension are their
   kebab-case forms, matching the canonical dimension shape.

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
                     (t2/select-pk->fn #(update-keys (select-keys % field-cols) u/->kebab-case-en)
                                       (into [:model/Field :id] field-cols)
                                       :id [:in field-ids]))
        nil-cols   (zipmap (map u/->kebab-case-en field-cols) (repeat nil))]
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
