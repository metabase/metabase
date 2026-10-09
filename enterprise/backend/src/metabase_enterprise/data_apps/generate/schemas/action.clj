(ns metabase-enterprise.data-apps.generate.schemas.action
  "The schema of the query actions that belong to no model."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.generate.schemas.common :as schemas.common]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.permissions.core :as perms]
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

(defn- hidden-parameter-ids
  "The ids of the parameters the action's form hides; execute refuses a value for them."
  [{:keys [visualization_settings]}]
  (into #{} (keep #(when (:hidden %) (:id %))) (vals (:fields visualization_settings))))

(defn action-schema
  "Returns the typed schema entry for a query action, leaving out the parameters its form hides."
  [{:keys [id name description parameters entity_id] :as action}]
  (let [tag-types (template-tag-types action)
        hidden?   (hidden-parameter-ids action)]
    (m/assoc-some
     {:kind       "action"
      :key        (schemas.common/generated-key name id)
      :id         id
      :name       name
      :type       "query"
      :parameters (into [] (comp (remove (comp hidden? :id))
                                 (map #(parameter-schema tag-types %)))
                        parameters)}
     :description description
     :entityId entity_id)))

(defn action-schemas
  "Returns standalone Data Action schemas, excluding data app copies and routing destinations."
  []
  (let [ids             (data-apps.db/model-less-query-action-ids (set (perms/data-app-collection-ids)))
        details-by-id   (when (seq ids) (u/index-by :id (actions/select-actions-for-ids nil ids)))
        details         (keep details-by-id ids)
        destination-ids (data-apps.db/destination-database-ids (into #{} (keep :database_id) details))]
    (into []
          (comp (remove #(contains? destination-ids (:database_id %)))
                (map action-schema))
          details)))
