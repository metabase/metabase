(ns metabase-enterprise.metabot-v3.util
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [metabase.util :as u]
   [metabase.util.json :as json]))

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
  "AI SDK type to prefix, same names as in FE or ai-service"
  ;; NOTE: if we ever get prefix longer than 2 chars, you need to fix parsing to be more generic
  {:TEXT           "0:"
   :DATA           "2:"
   :ERROR          "3:"
   :FINISH_MESSAGE "d:"
   :FINISH_STEP    "e:"
   :START_STEP     "f:"
   :TOOL_CALL      "9:"
   :TOOL_RESULT    "a:"})

(def PREFIX-TYPE "AI SDK prefix to type" (set/map-invert TYPE-PREFIX))

(defn aisdk->messages
  "Convert AI SDK line format into an array of parsed messages."
  [role lines]
  (into [] (comp
            (map (fn [line] [(get PREFIX-TYPE (subs line 0 2)) (json/decode+kw (subs line 2))]))
            (partition-by first)
            (mapcat (fn [block]
                      (let [type (ffirst block)]
                        (case type
                          (:TEXT
                           :ERROR)        [{:role    role
                                            :_type   type
                                            :content (transduce (map second) str block)}]
                          :DATA           (map #(-> (second %) (assoc :_type type)) block)
                          :TOOL_CALL      [{:role       role
                                            :_type      type
                                            :tool_calls (map (fn [[_ v]]
                                                               {:id        (:toolCallId v)
                                                                :name      (:toolName v)
                                                                :arguments (:args v)})
                                                             block)}]
                          :TOOL_RESULT    (map (fn [[_ v]]
                                                 {:role         "tool"
                                                  :_type        type
                                                  :tool_call_id (:toolCallId v)
                                                  :content      (:result v)})
                                               block)
                          :FINISH_MESSAGE (map (fn [[_ v]]
                                                 {:role          role
                                                  :_type         type
                                                  :finish_reason (:finishReason v)
                                                  :usage         (-> (:usage v)
                                                                     (dissoc :promptTokens :completionTokens))})
                                               block))))))
        lines))
