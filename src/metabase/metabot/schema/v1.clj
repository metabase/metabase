(ns metabase.metabot.schema.v1
  "Schemas for the v1 at-rest `metabot_message.data` formats — the bespoke legacy formats
  written before the AI SDK upgrade. A `data` value is a vector in one of three self-describing
  shapes: ai-service entries (tagged by uppercase `:_type`), native entries (message parts
  keyed by lowercase `:type`), or a user message. Validates post-select values, i.e. JSON
  decoded with keywordized keys.

  These are internal formats: the ai-service entries borrow names and concepts from AI SDK v4
  `DataStreamPart`s (https://github.com/vercel/ai, ai@4, packages/ui-utils/src/data-stream-parts.ts)
  but do not conform to them."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::data-type
  "The data-part type vocabulary, shared by both entry formats."
  [:enum "adhoc_viz" "code_edit" "navigate_to" "state" "static_viz" "todo_list"
   "transform_suggestion"])

(mr/def ::ai-service-entry
  "An entry written by the external ai-service, derived from an AI SDK v4 `DataStreamPart`.
  The `:_type` tags are the v4 part names, uppercased, but the shapes diverge from v4's:

  - fields are renamed: `tool_call`'s `{toolCallId, toolName, args}` is stored as
    `:tool_calls [{:id :name :arguments}]`, `tool_result`'s `{toolCallId, result}` as
    `:tool_call_id`/`:content`, and `finish_message`'s `finishReason` as `:finish_reason`
  - only a subset of the v4 union appears; the other part types (`start_step`, `reasoning`,
    `tool_call_delta`, …) never reach the column"
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
                      [:type ::data-type]
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
  "An entry written by the clojure-native agent: a message part keyed by lowercase `:type`."
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
                   [:data-type ::data-type]
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

(mr/def ::message-data
  "A whole `metabot_message.data` value in the v1 format. Entries within a row are homogeneous;
  assistant placeholder rows are `[]`."
  [:or
   [:sequential {:max 0} :any]
   [:sequential {:min 1} ::user-message]
   [:sequential {:min 1} ::ai-service-entry]
   [:sequential {:min 1} ::native-entry]])

(comment
  ;; validate a CSV dump of metabot_message (`id` and `data` columns, header row) against the
  ;; v1 at-rest schema, e.g. from psql:
  ;;   \copy (select id, data from metabot_message) to 'dump.csv' with csv header
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
