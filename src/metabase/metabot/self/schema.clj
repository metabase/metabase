(ns metabase.metabot.self.schema
  "Schema filtering for feature-gated properties.

  Walks Malli schemas and removes map entries whose `:feature` property
  indicates a feature that is not available in the current context."
  (:require
   [malli.core :as mc]
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
