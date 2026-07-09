(ns metabase.typed-schemas.api.schema.model
  "Model and action schema construction for typed-schema endpoints."
  (:require
   [clojure.string :as str]
   [metabase.actions.core :as actions]
   [metabase.typed-schemas.api.common :as typed-schemas.common]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- ->keyword
  "Coerces strings or keywords into a keyword for uniform type inspection."
  [v]
  (cond
    (keyword? v) v
    (string? v)  (keyword v)
    :else        nil))

(defn- param-type->js-type
  "Maps a Metabase parameter type (`:number`, `:string/=`, `:date/single`,
  `:=`, `:id`, …) to a JS-level type matching [[js-type]]'s convention.
  Returns nil for ambiguous types (`:=`, `:id`, `:category`, …) so the
  caller can fall back to other type sources like a backing template-tag."
  [param-type]
  (when-let [k (->keyword param-type)]
    (let [prefix (or (namespace k) (name k))]
      (case prefix
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-name-from-target
  "Extracts the template-tag name from a parameter's `:target`.
  Target shape: `[:variable [:template-tag <name>]]` (with keywords or strings
  at any position depending on serialization)."
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
  "For a query action, builds `{template-tag-name → tag-type}` from the
  saved `dataset_query`. Empty for non-query actions and for actions
  without a native query stage."
  [{:keys [type dataset_query]}]
  (when (and (= (->keyword type) :query) dataset_query)
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

(defn- action-parameter-schema
  "Each parameter on an Action. The `:slug` is the key the bundle uses in the
  execute payload (`execute({ <slug>: value, … })`). For implicit actions the
  slug is `(slugify column-name)`; for custom (query) actions it's whatever
  the user assigned."
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
    (typed-schemas.common/assoc-some
     {:slug resolved-slug
      :displayName (or display-name name resolved-slug)
      :jsType resolved-type}
     :required (when required true))))

(defn- action-schema
  "A pre-existing Metabase action. HTTP actions are filtered upstream because
  the execute endpoint refuses to run them."
  [{:keys [id name description type kind parameters entity_id] :as action}]
  (let [tag-types (query-action-template-tag-types action)
        implicit? (= (->keyword type) :implicit)]
    (typed-schemas.common/assoc-some
     {:kind       "action"
      :key        (typed-schemas.common/generated-key name id)
      :id         id
      :name       name
      :type       (some-> type clojure.core/name)
      :parameters (mapv #(action-parameter-schema tag-types %) parameters)}
     :description description
     :entityId entity_id
     :implicitKind (when implicit?
                     (some-> kind ->keyword u/qualified-name)))))

(defn- model-action-error-message
  ([model error-message]
   (format "Failed to build action schemas for model \"%s\" (card %s): %s"
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error")))
  ([model action error-message]
   (format "Failed to build action schema for action \"%s\" (action %s, type %s) on model \"%s\" (card %s): %s"
           (or (:name action) "Untitled")
           (:id action)
           (or (some-> (:type action) name) "unknown")
           (or (:name model) "Untitled")
           (:id model)
           (or error-message "unknown error"))))

(defn- model-action-error-data
  ([model m]
   (typed-schemas.common/assoc-some
    {:model-id   (:id model)
     :model-name (:name model)}
    :status-code (:status-code m)))
  ([model action m]
   (typed-schemas.common/assoc-some
    (assoc (model-action-error-data model m)
           :action-id   (:id action)
           :action-name (:name action)
           :action-type (:type action))
    :status-code (:status-code m))))

(defn- raw-model-actions
  [model-id]
  (t2/select :model/Action
             :model_id model-id
             :archived false
             :type [:not= "http"]))

(defn- dropped-actions
  [raw-actions actions]
  (let [action-ids (set (map :id actions))]
    (not-empty
     (remove #(contains? action-ids (:id %)) raw-actions))))

(defn- dropped-actions-message
  [model dropped-actions]
  (format "Failed to build action schemas for model \"%s\" (card %s): selected actions were dropped while normalizing action details: %s"
          (or (:name model) "Untitled")
          (:id model)
          (str/join ", "
                    (for [action dropped-actions]
                      (format "%s (action %s, type %s)"
                              (or (:name action) "Untitled")
                              (:id action)
                              (or (some-> (:type action) name) "unknown"))))))

(defn- dropped-actions-data
  [model dropped-actions]
  (assoc (model-action-error-data model nil)
         :dropped-actions (mapv #(select-keys % [:id :name :type]) dropped-actions)))

(defn- model-actions
  "Fetches non-archived, non-HTTP actions for a single model and emits each
  in schema form. Returns nil when the model has no executable actions."
  [model]
  (let [raw-actions (raw-model-actions (:id model))
        actions (try
                  (actions/select-actions
                   nil
                   :model_id (:id model)
                   :archived false
                   :type [:not= "http"])
                  (catch Exception e
                    (throw (ex-info (model-action-error-message model (ex-message e))
                                    (assoc (model-action-error-data model (ex-data e))
                                           :cause-message (ex-message e))
                                    e))))
        dropped (dropped-actions raw-actions actions)]
    (when dropped
      (throw (ex-info (dropped-actions-message model dropped)
                      (dropped-actions-data model dropped))))
    (when (seq actions)
      (mapv (fn [action]
              (try
                (action-schema action)
                (catch Exception e
                  (throw (ex-info (model-action-error-message model action (ex-message e))
                                  (assoc (model-action-error-data model action (ex-data e))
                                         :cause-message (ex-message e))
                                  e)))))
            actions))))

(defn- model-schema
  "A Metabase model (curated dataset) as an action namespace."
  [{:keys [id name] :as model}]
  (let [action-schemas (model-actions model)]
    (typed-schemas.common/assoc-some
     {:key              (typed-schemas.common/generated-key name id)
      :keyDisambiguator id}
     :actions (some-> action-schemas not-empty typed-schemas.common/keyed-map))))

(defn model-schemas
  "Returns schemas for readable model action namespaces."
  ([database-ids]
   (model-schemas database-ids nil))
  ([database-ids collection-ids]
   (for [card (schema.common/select-cards :model database-ids collection-ids)
         :let [details (schema.common/question-details card)
               schema  (some-> details model-schema)]
         :when schema]
     schema)))
