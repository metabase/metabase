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
  {:text           "0:"
   :data           "2:"
   :error          "3:"
   :finish-message "d:"
   :tool-call      "9:"
   :tool-result    "a:"})

(def PREFIX-TYPE "AI SDK prefix to type" (set/map-invert TYPE-PREFIX))

(defn aisdk-lines->message
  "Convert chunks in AI SDK format into a single combined message."
  [lines]
  (let [chunks (mapv (fn [line] [(get PREFIX-TYPE (subs line 0 2))
                                 (json/decode+kw (subs line 2))])
                     lines)
        types  (into #{} (map first chunks))
        last-c (nth chunks (dec (count chunks)))]
    (when-not (set/subset? types #{:text :tool-call :finish-message})
      (log/error "Unhandled chunk types appeared" {:chunk-types types}))
    (u/remove-nils
     {:content    (apply str (for [[type c] chunks
                                   :when    (= type :text)]
                               c))
      :tool_calls (-> (for [[type c] chunks
                            :when    (= type :tool-call)]
                        {:id        (:toolCallId c)
                         :name      (:toolName c)
                         :arguments (:args c)})
                      vec
                      not-empty)
      :data (->> (filter #(= (first %) :data) chunks)
                 (mapv second)) ;; [{:type :navigate_to :value "xxx"}]
      #_#_:data       (when-let [navigate-to (first (for [[type c] chunks
                                                          :when    (and (= type :data)
                                                                        (= (:type c) :navigate_to))]
                                                      (:value c)))]
                        {:navigate_to navigate-to})
      :metadata   {:usage (when (= (first last-c) :finish-message)
                            (:usage (second last-c)))}})))
