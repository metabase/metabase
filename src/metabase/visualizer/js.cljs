(ns metabase.visualizer.js
  "JavaScript API for visualizer compatibility checking.
   This exposes the CLJC compatibility functions to the frontend."
  (:require
   [metabase.util :as u]
   [metabase.visualizer.compat :as compat]))

(defn- field->clj
  "Convert a JS field object to Clojure map with keyword keys."
  [js-field]
  (-> js-field
      js->clj
      (u/update-keys-recursively u/->kebab-case-en)
      (update :base-type keyword)
      (update :semantic-type #(when % (keyword %)))))

(defn- fields->clj
  "Convert array of JS field objects to Clojure vector."
  [js-fields]
  (mapv field->clj js-fields))

(defn ^:export isCompatible
  "Check if a target dataset is compatible with current visualization.
   
   Args:
   - currentDisplay: string - visualization type (bar, line, area, scatter)
   - currentColumns: array - current visualization columns
   - currentSettings: object - current visualization settings
   - targetFields: array - fields from target dataset
   
   Returns: boolean"
  [current-display current-columns current-settings target-fields]
  (compat/compatible?
   {:current-display current-display
    :current-columns (fields->clj current-columns)
    :current-settings (js->clj current-settings)
    :target-fields (fields->clj target-fields)}))

(defn ^:export findCompatibleColumns
  "Find which columns from target dataset are compatible with current visualization.
   
   Args:
   - currentDisplay: string - visualization type (bar, line, area, scatter)
   - currentColumns: array - current visualization columns
   - currentSettings: object - current visualization settings
   - targetFields: array - fields from target dataset
   
   Returns: object with keys being slot names and values being arrays of compatible fields"
  [current-display current-columns current-settings target-fields]
  (let [result (compat/find-compatible-columns
                {:current-display current-display
                 :current-columns (fields->clj current-columns)
                 :current-settings (js->clj current-settings)
                 :target-fields (fields->clj target-fields)})]
    (clj->js result)))