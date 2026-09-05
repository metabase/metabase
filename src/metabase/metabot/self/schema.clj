(ns metabase.metabot.self.schema
  "Schema filtering for feature-gated properties.

  Walks Malli schemas and removes map entries whose `:feature` property
  indicates a feature that is not available in the current context.

  Also home to [[tool-function]], the provider-neutral half of converting a
  ToolEntry into a provider tool declaration."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [metabase.metabot.self.features :as features]))

(defn- filter-map-entries
  "Filter map schema entries, keeping only those whose :feature is available.

   Each map entry is [key props child-schema]. If props contains :feature,
   check availability. Strip :feature from output props (internal metadata)."
  [schema]
  (let [props    (mc/properties schema)
        children (mc/children schema)]
    (into [:map props]
          (for [[k entry-props child-schema :as entry] children
                :let [feature (:feature entry-props)]
                :when (or (nil? feature)
                          (features/feature-available? feature))]
            (if feature
              [k (dissoc entry-props :feature) child-schema]
              entry)))))

(defn filter-schema-by-features
  "Walk a schema and remove any map properties that require unavailable features.

   Uses Malli's schema-walker to recursively process nested schemas.
   Only :map schemas are filtered; other schema types pass through unchanged."
  [schema]
  (mc/walk schema
           (mc/schema-walker
            (fn [s]
              (if (= :map (mc/type s))
                (filter-map-entries s)
                s)))))

(defn tool-function
  "Converts a ToolEntry map (`:tool-name`, `:doc`, `:schema`) into the provider-neutral parts of a tool declaration:
  `{:name ... :description ... :parameters <JSON Schema>}`. Adapters wrap this in their provider's envelope.

  Filters feature-gated properties from the parameter schema (see [[filter-schema-by-features]]) and strips the
  `Inputs: ...` block that `mu/defn` appends to the docstring."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params                     (filter-schema-by-features params)
        doc                        (if (str/starts-with? (or doc "") "Inputs: ")
                                     ;; Strip the text that mu/defn adds.
                                     (second (str/split doc #"\n\n  " 2))
                                     doc)]
    {:name        tool-name
     :description doc
     :parameters  (mjs/transform params {:additionalProperties false})}))
