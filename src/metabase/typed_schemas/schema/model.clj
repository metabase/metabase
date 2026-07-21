(ns metabase.typed-schemas.schema.model
  "Typed schema generation for models and actions."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.typed-schemas.common :as common]
   [metabase.typed-schemas.schema.common :as schema.common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- keyword-or-string?
  "Returns true for values that can be normalized to keywords."
  [value]
  ((some-fn keyword? string?) value))

(defn- keyword-name
  "Returns a display string for Toucan-normalized action type/kind keywords."
  [value]
  (when (keyword? value)
    (u/qualified-name value)))

(defn- action-type-name
  "Returns a display-safe action type name."
  [action]
  (or (keyword-name (:type action)) "unknown"))

(defn- model-action-error-data
  "Returns structured error data for model action schema failures."
  ([model error-data]
   (m/assoc-some
    {:model-id   (:id model)
     :model-name (:name model)}
    :status-code (:status-code error-data)))
  ([model action error-data]
   (m/assoc-some
    (assoc (model-action-error-data model error-data)
           :action-id   (:id action)
           :action-name (:name action)
           :action-type (:type action))
    :status-code (:status-code error-data))))

(defn- action-rows
  "Returns raw rows so we can detect actions that cannot be resolved to action details."
  [model-ids]
  (t2/select [:model/Action :id :model_id :name :type]
             :model_id [:in model-ids]
             :archived false
             :type [:not= "http"]))

(defn- unresolved-action-rows
  "Returns action rows missing from resolved action details."
  [action-rows action-details]
  (let [action-ids (set (map :id action-details))]
    (not-empty
     (remove #(contains? action-ids (:id %)) action-rows))))

(defn- unresolved-action-rows-message
  "Returns the error message for action rows that cannot be resolved."
  [model unresolved-action-rows]
  (format "Failed to build action schemas for model \"%s\" (card %s): action rows could not be resolved: %s"
          (or (:name model) "Untitled")
          (:id model)
          (str/join ", "
                    (for [action unresolved-action-rows]
                      (format "%s (action %s, type %s)"
                              (or (:name action) "Untitled")
                              (:id action)
                              (action-type-name action))))))

(defn- unresolved-action-rows-data
  "Returns structured error data for action rows that cannot be resolved."
  [model unresolved-action-rows]
  (assoc (model-action-error-data model nil)
         :unresolved-action-rows (mapv #(select-keys % [:id :name :type]) unresolved-action-rows)))

(defn- throw-if-unresolved-action-rows!
  "Surfaces action rows that cannot be resolved into action details."
  [model action-rows action-details]
  (when-let [unresolved-rows (unresolved-action-rows action-rows action-details)]
    (throw (ex-info (unresolved-action-rows-message model unresolved-rows)
                    (unresolved-action-rows-data model unresolved-rows)))))

(defn- param-type->js-type
  "Returns the JS type for a Metabase action parameter type."
  [param-type]
  (when (keyword-or-string? param-type)
    (let [param-type-keyword (lib.schema.common/normalize-keyword param-type)
          prefix             (or (namespace param-type-keyword) (name param-type-keyword))]
      (case prefix
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-name-from-target
  "Returns the template-tag name referenced by an action parameter target."
  [target]
  (when (sequential? target)
    (let [[op inner] target]
      (when (and (or (= op :variable) (= op "variable"))
                 (sequential? inner))
        (let [[tag-op tag-name] inner]
          (when (or (= tag-op :template-tag) (= tag-op "template-tag"))
            (cond
              (string? tag-name)  tag-name
              (keyword? tag-name) (clojure.core/name tag-name)
              :else               nil)))))))

(defn- query-action-template-tag-types
  "Returns template-tag types for query action parameters."
  [{:keys [type dataset_query]}]
  (when (and (= (lib.schema.common/normalize-keyword type) :query) dataset_query)
    (let [stage-tags (some-> dataset_query :stages first :template-tags)
          native-tags (some-> dataset_query :native :template-tags)
          tags (or stage-tags native-tags)]
      (into {}
            (for [[tag-key tag] tags]
              [(or (:name tag)
                   (cond
                     (string? tag-key)  tag-key
                     (keyword? tag-key) (clojure.core/name tag-key)
                     :else              nil))
               (:type tag)])))))

(defn- model-action-error-message
  "Returns the error message for model action schema failures."
  ([model error-message]
   (format "Failed to build action schemas for model \"%s\" (card %s): %s"
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error")))
  ([model action error-message]
   (format "Failed to build action schema for action \"%s\" (action %s, type %s) on model \"%s\" (card %s): %s"
           (or (:name action) "Untitled")
           (:id action)
           (action-type-name action)
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error"))))

(defn- error-data-with-cause-message
  "Adds the original exception message to structured error data."
  [error-data exception]
  (assoc error-data :cause-message (ex-message exception)))

(defn- action-parameter-schema
  "Returns the schema for an action execute parameter."
  [tag-types
   {:keys [id slug name display-name type target required]}]
  (let [resolved-slug (or slug
                          (some-> id clojure.core/name)
                          (some-> name u/slugify))
        resolved-type (or (param-type->js-type type)
                          (param-type->js-type
                           (get tag-types
                                (template-tag-name-from-target target)))
                          "unknown")]
    (m/assoc-some
     {:slug resolved-slug
      :displayName (or display-name name resolved-slug)
      :jsType resolved-type}
     :required (when required true))))

(defn- action-detail-schema
  "Returns the typed schema entry for resolved action details."
  [{:keys [id name description type kind parameters entity_id] :as action}]
  (let [tag-types (query-action-template-tag-types action)
        implicit? (= (lib.schema.common/normalize-keyword type) :implicit)]
    (m/assoc-some
     {:kind       "action"
      :key        (common/generated-key name id)
      :id         id
      :name       name
      :type       (keyword-name type)
      :parameters (mapv #(action-parameter-schema tag-types %) parameters)}
     :description description
     :entityId entity_id
     :implicitKind (when implicit? (keyword-name kind)))))

(defn- resolved-action-details
  "Returns action details from the actions module, preserving lookup error context."
  [model]
  (try
    (actions/select-actions
     nil
     :model_id (:id model)
     :archived false
     :type [:not= "http"])
    (catch Exception exception
      (throw (ex-info (model-action-error-message model (ex-message exception))
                      (error-data-with-cause-message
                       (model-action-error-data model (ex-data exception))
                       exception)
                      exception)))))

(defn- resolved-action-details-for-models
  "Returns resolved action details for selected models."
  [models]
  (let [model-ids (set (map :id models))]
    (try
      (actions/select-actions
       models
       :model_id [:in model-ids]
       :archived false
       :type [:not= "http"])
      (catch Exception exception
        (throw (ex-info (format "Failed to build action schemas for selected models: %s" (ex-message exception))
                        (error-data-with-cause-message
                         {:model-ids   model-ids
                          :status-code (:status-code (ex-data exception))}
                         exception)
                        exception))))))

(defn- model-action-schema
  "Returns an action schema, preserving which model/action failed to render."
  [model action]
  (try
    (action-detail-schema action)
    (catch Exception exception
      (throw (ex-info (model-action-error-message model action (ex-message exception))
                      (error-data-with-cause-message
                       (model-action-error-data model action (ex-data exception))
                       exception)
                      exception)))))

(defn- model-action-schemas
  "Returns action schemas for a model, preserving action lookup error context."
  ([model]
   (model-action-schemas model
                         (action-rows #{(:id model)})
                         (resolved-action-details model)))
  ([model action-rows action-details]
   (throw-if-unresolved-action-rows! model action-rows action-details)
   (not-empty
    (mapv #(model-action-schema model %) action-details))))

(defn model-schema
  "Returns the model schema with actions, or nil when the model has no executable actions."
  ([model]
   (model-schema model (model-action-schemas model)))
  ([{:keys [id name]} action-schemas]
   (when (seq action-schemas)
     {:key              (common/generated-key name id)
      :keyDisambiguator id
      :actions          (common/keyed-map action-schemas)})))

(defn model-schemas
  "Returns model schemas, with optional database and collection scopes."
  ([database-ids]
   (model-schemas database-ids nil))
  ([database-ids collection-ids]
   (let [models (schema.common/select-schema-cards :model database-ids collection-ids)]
     (if (seq models)
       (let [model-ids                  (set (map :id models))
             action-rows-by-model-id    (group-by :model_id (action-rows model-ids))
             action-details-by-model-id (group-by :model_id (resolved-action-details-for-models models))]
         (for [model models
               :let [action-schemas (model-action-schemas model
                                                          (get action-rows-by-model-id (:id model))
                                                          (get action-details-by-model-id (:id model)))
                     schema         (model-schema model action-schemas)]
               :when schema]
           schema))
       []))))
