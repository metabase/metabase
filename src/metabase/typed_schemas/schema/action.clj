(ns metabase.typed-schemas.schema.action
  "Typed schema generation for actions that belong to no model."
  (:require
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.common :as common]
   [metabase.typed-schemas.db :as typed-schemas.db]
   [metabase.typed-schemas.schema.common :as schema.common]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- param-type->js-type
  "Returns the JS type for a Metabase action parameter type."
  [param-type]
  (when ((some-fn keyword? string?) param-type)
    (let [param-type-keyword (lib.schema.common/normalize-keyword param-type)
          prefix             (or (namespace param-type-keyword) (name param-type-keyword))]
      (case prefix
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-value-type
  "Returns the type a template tag's values carry: a field filter's `:type` is always `:dimension`, so its
  `:widget-type` (e.g. `:date/single`) is what tells us the value type."
  [{:keys [type widget-type]}]
  (if (= type :dimension)
    widget-type
    type))

(defn- template-tag-types
  "Returns template-tag value types keyed by tag name, or nil when the action has no usable query."
  [{:keys [dataset_query]}]
  ;; a stored query that failed to deserialize comes back as {}, which Lib rejects
  (some-> dataset_query not-empty lib/all-template-tags-map (update-vals template-tag-value-type)))

(defn- parameter-schema
  "Returns the schema for an action execute parameter."
  [tag-types {:keys [id slug name display-name type target required]}]
  (let [resolved-slug (or slug
                          (some-> id clojure.core/name)
                          (some-> name u/slugify))
        resolved-type (or (param-type->js-type type)
                          (param-type->js-type
                           (get tag-types (some-> target lib/parameter-target-template-tag-name)))
                          "unknown")]
    (m/assoc-some
     {:slug        resolved-slug
      :displayName (or display-name name resolved-slug)
      :jsType      resolved-type}
     :required (when required true))))

(defn action-schema
  "Returns the typed schema entry for a query action."
  [{:keys [id name description parameters entity_id] :as action}]
  (let [tag-types (template-tag-types action)]
    (m/assoc-some
     {:kind       "action"
      :key        (common/generated-key name id)
      :id         id
      :name       name
      :type       "query"
      :parameters (mapv #(parameter-schema tag-types %) parameters)}
     :description description
     :entityId entity_id)))

(defn action-schemas
  "Returns schema entries for the readable query actions without a model among `database-ids` (nil for unscoped)."
  [database-ids]
  (let [rows            (filter mi/can-read? (typed-schemas.db/model-less-query-actions database-ids))
        details-by-id   (when (seq rows)
                          (into {} (map (juxt :id identity)) (actions/select-actions-for-ids nil (mapv :id rows))))
        details         (keep #(get details-by-id (:id %)) rows)
        destination-ids (schema.common/destination-db-ids (into #{} (keep :database_id) details))]
    (into []
          (comp (remove #(contains? destination-ids (:database_id %)))
                (map action-schema))
          details)))
