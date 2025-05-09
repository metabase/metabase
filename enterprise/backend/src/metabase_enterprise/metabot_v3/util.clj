(ns metabase-enterprise.metabot-v3.util
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u]))

(defn- safe-case-updater
  [f]
  #(cond-> % (or (string? %) (keyword? %)) f))

(def safe->kebab-case-en
  "Convert strings or keywords to kebab-case."
  (safe-case-updater u/->kebab-case-en))

(def safe->snake_case_en
  "Convert strings or keywords to snake_case"
  (safe-case-updater u/->snake_case_en))

(defn recursive-update-keys
  "Recursively convert map keys in `form` with `f`."
  [form f]
  (walk/walk #(cond-> % (coll? %) (recursive-update-keys f))
             #(cond-> % (map? %) (update-keys f))
             form))
