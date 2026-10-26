(ns metabase-enterprise.data-apps.typed-schema
  "The TypeScript module of a data app's queries and actions: a `defineQuery` call for each question in the app's
  resource collection, typed by its result columns, and a `defineAction` call for each action, typed by its
  parameters, each addressed by its entity ID."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.types.core]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(comment metabase.types.core/keep-me)

(defn- column-js-type
  "The JavaScript type of a value of a column with `base-type`."
  [base-type]
  (let [base-type (some-> base-type keyword)]
    (cond
      (nil? base-type)                   "unknown"
      (isa? base-type :type/Boolean)     "boolean"
      (isa? base-type :type/Number)      "number"
      (isa? base-type :type/Temporal)    "Date"
      (isa? base-type :type/TextLike)    "string"
      (isa? base-type :type/Text)        "string"
      :else                              "unknown")))

(defn- column-schema
  "The schema of a card's result `column`."
  [{:keys [name display_name base_type effective_type semantic_type]}]
  (let [effective-type (or effective_type base_type)]
    (m/assoc-some
     {:type        "column"
      :name        name
      :displayName (or display_name name)
      :jsType      (column-js-type effective-type)}
     :baseType      base_type
     :effectiveType effective-type
     :semanticType  semantic_type)))

(defn- query-definition
  "The `defineQuery` argument of `card`: a card source with its result columns."
  [{:keys [name entity_id result_metadata]}]
  {:source (m/assoc-some {:type     "card"
                          :entityId entity_id
                          :name     name}
                         :columns (some->> result_metadata (mapv column-schema)))})

(defn- param-type->js-type
  "The JavaScript type of a value of an action parameter of `param-type`."
  [param-type]
  (when ((some-fn keyword? string?) param-type)
    (let [param-type (lib.schema.common/normalize-keyword param-type)]
      (case (or (namespace param-type) (name param-type))
        ("number" "numeric") "number"
        ("text" "string")    "string"
        "date"               "Date"
        "boolean"            "boolean"
        nil))))

(defn- template-tag-types
  "The value types of the template tags of `action`'s query, keyed by tag name. A field filter's `:type` is always
  `:dimension`, so its `:widget-type` is what tells the value type."
  [{:keys [dataset_query]}]
  (some-> dataset_query
          not-empty
          lib/all-template-tags-map
          (update-vals (fn [{:keys [type widget-type]}]
                         (if (= type :dimension) widget-type type)))))

(defn- parameter-schema
  "The schema of an action's execute parameter."
  [tag-types {:keys [id slug name display-name type target required]}]
  (let [slug (or slug (some-> id clojure.core/name) (some-> name u/slugify))]
    (m/assoc-some
     {:slug        slug
      :displayName (or display-name name slug)
      :jsType      (or (param-type->js-type type)
                       (param-type->js-type (get tag-types (some-> target lib/parameter-target-template-tag-name)))
                       "unknown")}
     :required (when required true))))

(defn- hidden-parameter-ids
  "The IDs of the parameters `action`'s form hides, which execution refuses a value for."
  [{:keys [visualization_settings]}]
  (into #{} (keep #(when (:hidden %) (:id %))) (vals (:fields visualization_settings))))

(defn- action-definition
  "The `defineAction` argument of the query `action`: its entity ID and parameters."
  [{:keys [entity_id name description type parameters] :as action}]
  (let [tag-types (template-tag-types action)
        hidden?   (hidden-parameter-ids action)]
    {:action (m/assoc-some
              {:kind       "action"
               :id         entity_id
               :name       name
               :type       type
               :parameters (into [] (comp (remove (comp hidden? :id))
                                          (map #(parameter-schema tag-types %)))
                                 parameters)}
              :description description)}))

(defn- identifier-part
  "`s` with the characters a JavaScript identifier can't hold removed."
  [s]
  (str/replace s #"[^\p{L}\p{N}_$]" ""))

(defn- export-key
  "A JavaScript identifier for an entity named `entity-name` with `entity-id`, the same on every instance."
  [entity-name entity-id]
  (let [k (some-> entity-name u/->camelCaseEn identifier-part)]
    (cond
      (str/blank? k)                (str "entity_" (identifier-part entity-id))
      (re-find #"^\p{N}" k)        (str "_" k)
      :else                         k)))

(defn- keyed
  "`entities` keyed by a unique JavaScript identifier made from each one's name, in their order."
  [entities]
  (let [ks (map #(export-key (:name %) (:entity_id %)) entities)
        n  (frequencies ks)]
    (map (fn [entity k]
           [(cond-> k (> (n k) 1) (str "_" (identifier-part (:entity_id entity)))) entity])
         entities ks)))

(defn- identifier? [k]
  (re-matches #"[A-Za-z_$][A-Za-z0-9_$]*" k))

(defn- render
  "`value` as a TypeScript literal indented by `indent`."
  [value indent]
  (let [inner (str indent "  ")]
    (cond
      (map? value)        (if (empty? value)
                            "{}"
                            (str "{\n"
                                 (str/join (for [[k v] value
                                                 :let  [k (u/qualified-name k)]]
                                             (str inner (if (identifier? k) k (json/encode k)) ": "
                                                  (render v inner) ",\n")))
                                 indent "}"))
      (sequential? value) (if (empty? value)
                            "[]"
                            (str "[\n"
                                 (str/join (for [v value] (str inner (render v inner) ",\n")))
                                 indent "]"))
      :else               (json/encode value))))

(defn- render-entries
  "The `export const` of `export-name`: an object of `entities` keyed by name, each its `define-fn` call on its
  `definition`."
  [export-name define-fn definition entities]
  (str "export const " export-name " = {\n"
       (str/join (for [[k entity] (keyed entities)]
                   (str "  " k ": " define-fn "(" (render (definition entity) "  ") "),\n")))
       "};\n"))

(defn generate
  "The TypeScript module of the queries and actions of the data app `app`."
  [{slug :name, collection-id :resource_collection_id}]
  (let [cards   (data-apps.db/resource-cards collection-id)
        action-ids (data-apps.db/resource-action-ids collection-id)
        actions (when (seq action-ids)
                  (let [by-id (u/index-by :id (actions/select-actions-for-ids action-ids))]
                    (keep by-id action-ids)))]
    (str "// The queries and actions of the data app \"" slug "\", generated by Metabase from the questions and\n"
         "// actions in the app's collection. Do not edit: after changing them, fetch it again with\n"
         "// mb data-app typed-schema " slug " --out src/metabase.ts\n"
         "import { defineAction, defineQuery } from \"@metabase/embedding-sdk-react/data-app\";\n"
         "\n"
         (render-entries "queries" "defineQuery" query-definition cards)
         "\n"
         (render-entries "actions" "defineAction" action-definition actions))))
