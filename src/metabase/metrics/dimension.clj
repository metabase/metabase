(ns metabase.metrics.dimension
  "API-layer functions for fetching dimension values from the metrics API endpoints."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.parameters.core :as parameters]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- API Shape -------------------------------------------------
;;; Convert internal (kebab) dimensions to the snake_case shape the dimension-editor frontend expects.

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
   dimension editor: snake_case top-level keys, fully-qualified type strings, and a `:sources` list
   whose entries keep the kebab `field-id` key."
  [dim]
  (cond-> {:id             (:id dim)
           :display_name   (or (:display-name dim) (:name dim))
           :description    (:description dim)
           :effective_type (some-> (:effective-type dim) u/qualified-name)
           :semantic_type  (some-> (:semantic-type dim) u/qualified-name)
           :default        (boolean (:default dim))}
    (:status dim)  (assoc :status (:status dim))
    (:group dim)   (assoc :group (->api-group (:group dim)))
    (:sources dim) (assoc :sources (mapv ->api-source (:sources dim)))))

(defn ->api-addable-dimension
  "Convert a computed dimension/mapping pair to the API shape used when adding dimensions."
  [{:keys [dimension mapping]}]
  (assoc (->api-dimension dimension)
         :mapping_target (lib-metric/field-ref->key (:target mapping))))

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
