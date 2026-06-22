(ns metabase.metabot.schema.v1
  "Schemas for the v1 `metabot_message.data` storage formats, which are two sub-formats:
  one written by the deprecated external AI service and another for our native Clojure
  implementation."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::ai-service-entry
  "An entry written by the external ai-service, derived from an AI SDK v4 `DataStreamPart`
  (See https://github.com/vercel/ai, ai@4, packages/ui-utils/src/data-stream-parts.ts).
  The `:_type` tags are the v4 part names, uppercased, but the shapes diverge from v4's:

  - only a subset of the v4 part types were ever used
  - key names often use snake_case instead of camelCase
  - some fields are renamed:
    - `tool_call`'s `{toolCallId, toolName, args}` is stored as `:tool_calls [{:id :name :arguments}]`
    - `tool_result`'s `{toolCallId, result}` as `{tool_call_id, content}`"
  [:multi {:dispatch :_type}
   ["TEXT"           [:map {:closed true}
                      [:role [:= "assistant"]]
                      [:_type [:= "TEXT"]]
                      [:content :string]]]
   ["ERROR"          [:map {:closed true}
                      [:role [:= "assistant"]]
                      [:_type [:= "ERROR"]]
                      [:content :string]]]
   ["DATA"           [:map {:closed true}
                      [:_type [:= "DATA"]]
                      [:type :string]
                      [:version [:= 1]]
                      [:value :any]]]
   ["TOOL_CALL"      [:map {:closed true}
                      [:role [:= "assistant"]]
                      [:_type [:= "TOOL_CALL"]]
                      [:tool_calls [:sequential [:map {:closed true}
                                                 [:id :string]
                                                 [:name :string]
                                                 [:arguments :string]]]]]]
   ["TOOL_RESULT"    [:map {:closed true}
                      [:role [:= "tool"]]
                      [:_type [:= "TOOL_RESULT"]]
                      [:tool_call_id :string]
                      [:content :string]]]
   ["FINISH_MESSAGE" [:map {:closed true}
                      [:role [:= "assistant"]]
                      [:_type [:= "FINISH_MESSAGE"]]
                      [:finish_reason :string]
                      [:usage :map]]]])

(mr/def ::native-entry
  "An entry written by the native clojure agent."
  [:multi {:dispatch :type}
   ["text"        [:map {:closed true}
                   [:type [:= "text"]]
                   [:id {:optional true} [:maybe :string]]
                   [:text :string]]]
   ["tool-input"  [:map {:closed true}
                   [:type [:= "tool-input"]]
                   [:id :string]
                   [:function :string]
                   [:arguments [:maybe :map]]]]
   ["tool-output" [:map {:closed true}
                   [:type [:= "tool-output"]]
                   [:id :string]
                   [:function {:optional true} [:maybe :string]]
                   [:result [:maybe [:map
                                     [:output {:optional true} :any]
                                     [:structured-output {:optional true} :map]
                                     [:structured_output {:optional true} :map]]]]
                   [:error {:optional true} [:maybe [:or :map :string]]]
                   [:duration-ms {:optional true} [:maybe number?]]]]
   ["data"        [:map {:closed true}
                   [:type [:= "data"]]
                   [:data-type :string]
                   [:version {:optional true} [:= 1]]
                   [:data :any]]]
   ["error"       [:or
                   [:map {:closed true}
                    [:type [:= "error"]]
                    [:error :map]]
                   [:map {:closed true}
                    [:type [:= "error"]]
                    [:errorText :string]]]]])

(mr/def ::user-message
  "A user message."
  [:map {:closed true}
   [:role [:= "user"]]
   [:content :string]])

(mr/def ::empty-data
  "An empty `metabot_message.data` value: assistant placeholder rows and aborted turns."
  [:sequential {:max 0} :any])

(mr/def ::user-message-data
  "A `metabot_message.data` value holding a user message."
  [:sequential {:min 1} ::user-message])

(mr/def ::ai-service-data
  "A `metabot_message.data` value written by the deprecated external ai-service."
  [:sequential {:min 1} ::ai-service-entry])

(mr/def ::native-data
  "A `metabot_message.data` value written by the native clojure agent."
  [:sequential {:min 1} ::native-entry])

(mr/def ::message-data
  "`metabot_message.data` v1 column format. Entries within a row are homogeneous.
  Assistant placeholder rows are empty `[]`."
  [:or ::empty-data ::user-message-data ::ai-service-data ::native-data])

(comment
  ;; validate a CSV dump of the metabot_message table against the v1 schemas
  (require '[clojure.data.csv :as csv]
           '[clojure.java.io :as io]
           '[malli.error :as me]
           '[metabase.util.json :as json])

  (defn validate-csv [path]
    (with-open [reader (io/reader path)]
      (let [[header & rows] (csv/read-csv reader)
            column-index    (fn [column] (first (keep-indexed #(when (= column %2) %1) header)))
            id-idx          (column-index "id")
            data-idx        (column-index "data")
            explain         (mr/explainer ::message-data)]
        (reduce (fn [acc row]
                  (let [raw    (nth row data-idx)
                        parsed (try (json/decode+kw raw) (catch Exception e e))
                        error  (if (instance? Exception parsed)
                                 {:json-parse (ex-message parsed)}
                                 (some-> (explain parsed) me/humanize))]
                    (cond-> (update acc :row-count inc)
                      error (-> (update :failure-count inc)
                                (update :failures conj {:message-id (when id-idx (nth row id-idx))
                                                        :message    (if (instance? Exception parsed) raw parsed)
                                                        :error      error})))))
                {:row-count 0 :failure-count 0 :failures []}
                rows))))

  (validate-csv "./metabot_message_dump.csv"))
