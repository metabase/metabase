(ns metabase-enterprise.metabot-v3.util
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

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

;;; AI SDK support

(def TYPE-PREFIX
  "AI SDK type to prefix"
  ;; NOTE: if we ever get prefix longer than 2 chars, you need to fix parsing to be more generic
  {:TEXT           "0:"
   :DATA           "2:"
   :ERROR          "3:"
   :FINISH_MESSAGE "d:"
   :TOOL_CALL      "9:"
   :TOOL_RESULT    "a:"})

(def PREFIX-TYPE "AI SDK prefix to type" (set/map-invert TYPE-PREFIX))

(defn aisdk-lines->chunks
  "Convert AI SDK line format into an array of parsed chunks."
  [lines]
  (reduce
   (fn [acc line]
     ;; NOTE: depends on all prefixes being 2 chars long
     (let [value (json/decode+kw (subs line 2))
           type  (get PREFIX-TYPE (subs line 0 2))]
       (cond
         (and (string? value) (string? (u/last acc))) (update acc (dec (count acc)) str value)
         (string? value)                              (conj acc value)
         :else                                        (conj acc (assoc value :_type type)))))
   []
   lines))
