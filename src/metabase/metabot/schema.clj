(ns metabase.metabot.schema
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(mr/def ::role
  [:enum
   {:encode/api-request u/->snake_case_en
    :decode/api-response keyword}
   :system :user :assistant :tool])

(mr/def ::message
  [:map
   [:role                          ::role]
   [:content    {:optional true}   [:maybe :string]]
   [:tool_calls {:optional true}   [:maybe [:vector [:map
                                                     [:id :string]
                                                     [:name :string]
                                                     [:arguments :string]]]]]
   [:tool_call_id {:optional true} [:maybe :string]]])

(mr/def ::messages
  [:sequential ::message])

;;; -----------------------------------------------------------------------------------------
;;; AI-SDK message-format schemas (v4 legacy + v5/v6).
;;;
;;; The v5/v6 schemas are derived (ported from TypeScript/Zod to Malli) from the Vercel AI
;;; SDK, used under the Apache License 2.0, © 2023 Vercel, Inc.:
;;;   - UIMessageChunk (wire):    packages/ai/src/ui-message-stream/ui-message-chunks.ts
;;;   - UIMessage/part (at-rest): packages/ai/src/ui/ui-messages.ts
;;; Upstream: https://github.com/vercel/ai (pinned to ai@6.0.37)
;;; License:  https://github.com/vercel/ai/blob/main/LICENSE
;;; -----------------------------------------------------------------------------------------

(defn- data-type? [t] (and (string? t) (str/starts-with? t "data-")))
(defn- tool-type? [t] (and (string? t) (str/starts-with? t "tool-")))

(mr/def ::provider-metadata
  ;; mirrors providerMetadataSchema — Record<string, Record<string, JSONValue>>, open by design
  :map)

(mr/def ::ui-message-chunk
  ;; mirrors uiMessageChunkSchema; v6-only members included so v5 and v6 streams both validate
  [:multi {:dispatch (fn [chunk]
                       (let [t (:type chunk)]
                         (if (data-type? t) ::data t)))}
   ["text-start"            [:map {:closed true}
                             [:type [:= "text-start"]]
                             [:id :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["text-delta"            [:map {:closed true}
                             [:type [:= "text-delta"]]
                             [:id :string]
                             [:delta :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["text-end"              [:map {:closed true}
                             [:type [:= "text-end"]]
                             [:id :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning-start"       [:map {:closed true}
                             [:type [:= "reasoning-start"]]
                             [:id :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning-delta"       [:map {:closed true}
                             [:type [:= "reasoning-delta"]]
                             [:id :string]
                             [:delta :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning-end"         [:map {:closed true}
                             [:type [:= "reasoning-end"]]
                             [:id :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["error"                 [:map {:closed true}
                             [:type [:= "error"]]
                             [:errorText :string]]]
   ["tool-input-start"      [:map {:closed true}
                             [:type [:= "tool-input-start"]]
                             [:toolCallId :string]
                             [:toolName :string]
                             [:providerExecuted {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]
                             [:title {:optional true} :string]]]
   ["tool-input-delta"      [:map {:closed true}
                             [:type [:= "tool-input-delta"]]
                             [:toolCallId :string]
                             [:inputTextDelta :string]]]
   ["tool-input-available"  [:map {:closed true}
                             [:type [:= "tool-input-available"]]
                             [:toolCallId :string]
                             [:toolName :string]
                             [:input :any]
                             [:providerExecuted {:optional true} :boolean]
                             [:providerMetadata {:optional true} ::provider-metadata]
                             [:dynamic {:optional true} :boolean]
                             [:title {:optional true} :string]]]
   ["tool-input-error"      [:map {:closed true}
                             [:type [:= "tool-input-error"]]
                             [:toolCallId :string]
                             [:toolName :string]
                             [:input :any]
                             [:providerExecuted {:optional true} :boolean]
                             [:providerMetadata {:optional true} ::provider-metadata]
                             [:dynamic {:optional true} :boolean]
                             [:errorText :string]
                             [:title {:optional true} :string]]]
   ["tool-approval-request" [:map {:closed true}
                             [:type [:= "tool-approval-request"]]
                             [:approvalId :string]
                             [:toolCallId :string]]]
   ["tool-output-available" [:map {:closed true}
                             [:type [:= "tool-output-available"]]
                             [:toolCallId :string]
                             [:output :any]
                             [:providerExecuted {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]
                             [:preliminary {:optional true} :boolean]]]
   ["tool-output-error"     [:map {:closed true}
                             [:type [:= "tool-output-error"]]
                             [:toolCallId :string]
                             [:errorText :string]
                             [:providerExecuted {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]]]
   ["tool-output-denied"    [:map {:closed true}
                             [:type [:= "tool-output-denied"]]
                             [:toolCallId :string]]]
   ["source-url"            [:map {:closed true}
                             [:type [:= "source-url"]]
                             [:sourceId :string]
                             [:url :string]
                             [:title {:optional true} :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-document"       [:map {:closed true}
                             [:type [:= "source-document"]]
                             [:sourceId :string]
                             [:mediaType :string]
                             [:title :string]
                             [:filename {:optional true} :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   ["file"                  [:map {:closed true}
                             [:type [:= "file"]]
                             [:url :string]
                             [:mediaType :string]
                             [:providerMetadata {:optional true} ::provider-metadata]]]
   [::data                  [:map {:closed true}
                             [:type [:fn data-type?]]
                             [:id {:optional true} :string]
                             [:data :any]
                             [:transient {:optional true} :boolean]]]
   ["start-step"            [:map {:closed true}
                             [:type [:= "start-step"]]]]
   ["finish-step"           [:map {:closed true}
                             [:type [:= "finish-step"]]]]
   ["start"                 [:map {:closed true}
                             [:type [:= "start"]]
                             [:messageId {:optional true} :string]
                             [:messageMetadata {:optional true} :any]]]
   ["finish"                [:map {:closed true}
                             [:type [:= "finish"]]
                             [:finishReason {:optional true} [:enum "stop" "length" "content-filter" "tool-calls" "error" "other"]]
                             [:messageMetadata {:optional true} :any]]]
   ["abort"                 [:map {:closed true}
                             [:type [:= "abort"]]
                             [:reason {:optional true} :string]]]
   ["message-metadata"      [:map {:closed true}
                             [:type [:= "message-metadata"]]
                             [:messageMetadata :any]]]])

(mr/def ::tool-approval
  ;; mirrors the per-state approval objects of UIToolInvocation, collapsed into one shape
  [:map {:closed true}
   [:id :string]
   [:approved {:optional true} :boolean]
   [:reason {:optional true} :string]])

(mr/def ::tool-ui-part
  ;; mirrors ToolUIPart / UIToolInvocation; v6 approval states included
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]]]
   ["input-available"    [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]]]
   ["approval-requested" [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]
   ["output-available"   [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:output :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} ::tool-approval]]]
   ["output-error"       [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:rawInput {:optional true} :any]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::tool-approval]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]])

(mr/def ::dynamic-tool-ui-part
  ;; mirrors DynamicToolUIPart — carries :toolName explicitly, no rawInput in output-error
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]]]
   ["input-available"    [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]]]
   ["approval-requested" [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]
   ["output-available"   [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:output :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} ::tool-approval]]]
   ["output-error"       [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::tool-approval]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval ::tool-approval]]]])

(mr/def ::ui-message-part
  ;; mirrors UIMessagePart
  [:multi {:dispatch (fn [part]
                       (let [t (:type part)]
                         (cond
                           (= "dynamic-tool" t) t
                           (tool-type? t)       ::tool
                           (data-type? t)       ::data
                           :else                t)))}
   ["text"            [:map {:closed true}
                       [:type [:= "text"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning"       [:map {:closed true}
                       [:type [:= "reasoning"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-url"      [:map {:closed true}
                       [:type [:= "source-url"]]
                       [:sourceId :string]
                       [:url :string]
                       [:title {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-document" [:map {:closed true}
                       [:type [:= "source-document"]]
                       [:sourceId :string]
                       [:mediaType :string]
                       [:title :string]
                       [:filename {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["file"            [:map {:closed true}
                       [:type [:= "file"]]
                       [:mediaType :string]
                       [:filename {:optional true} :string]
                       [:url :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["step-start"      [:map {:closed true}
                       [:type [:= "step-start"]]]]
   ["dynamic-tool"    ::dynamic-tool-ui-part]
   [::tool            ::tool-ui-part]
   [::data            [:map {:closed true}
                       [:type [:fn data-type?]]
                       [:id {:optional true} :string]
                       [:data :any]]]])

(mr/def ::ui-message
  ;; mirrors UIMessage
  [:map {:closed true}
   [:id :string]
   [:role [:enum "system" "user" "assistant"]]
   [:metadata {:optional true} :any]
   [:parts [:sequential ::ui-message-part]]])

(mr/def ::metabase-ui-message-part
  "The subset of [[::ui-message-part]] that Metabase persists in `metabot_message.data` (v2
  format). Unlike upstream `ToolUIPart`, the tool part carries an explicit `:toolName` and only
  the three states the converter emits."
  [:multi {:dispatch (fn [part]
                       (let [t (:type part)]
                         (cond
                           (tool-type? t) ::tool
                           (data-type? t) ::data
                           :else          t)))}
   ["text" [:map {:closed true}
            [:type [:= "text"]]
            [:text :string]]]
   [::tool [:map {:closed true}
            [:type [:fn tool-type?]]
            [:toolCallId :string]
            [:toolName :string]
            [:state [:enum "input-available" "output-available" "output-error"]]
            [:input [:or :map :string]]
            [:output {:optional true} :any]
            [:errorText {:optional true} :string]]]
   [::data [:map {:closed true}
            [:type [:fn data-type?]]
            [:data :any]]]])

(mr/def ::metabase-ui-message-parts
  [:sequential ::metabase-ui-message-part])

;;; v4 at-rest — the legacy persisted `metabot_message.data` formats (no upstream source).
;;; Validates post-select values: JSON keys are keywordized, all values are strings.

(mr/def ::v4-external-ai-service-entry
  "An entry written by the external-ai-service path — the at-rest form of
  [[metabase.metabot.util/aisdk->messages]] output."
  [:multi {:dispatch :_type}
   ["TEXT"           [:map {:closed true}
                      [:role :string]
                      [:_type [:= "TEXT"]]
                      [:content :string]]]
   ["ERROR"          [:map {:closed true}
                      [:role :string]
                      [:_type [:= "ERROR"]]
                      [:content :string]]]
   ["DATA"           [:map {:closed true}
                      [:_type [:= "DATA"]]
                      [:type :string]
                      [:version :int]
                      [:value :any]]]
   ["TOOL_CALL"      [:map {:closed true}
                      [:role :string]
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
                      [:role :string]
                      [:_type [:= "FINISH_MESSAGE"]]
                      [:finish_reason :string]
                      [:usage :map]]]])

(mr/def ::v4-native-entry
  "An entry written by the native agent loop — the at-rest form of the parts built by
  `aisdk-chunks->part` after `finalize-assistant-turn!` filtering and `strip-tool-output-bloat`."
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
                   [:result [:maybe [:map {:closed true}
                                     [:output {:optional true} :any]
                                     [:structured-output {:optional true} :map]
                                     [:structured_output {:optional true} :map]]]]
                   [:error {:optional true} [:maybe [:or :map :string]]]
                   [:duration-ms {:optional true} [:maybe number?]]]]
   ["data"        [:map {:closed true}
                   [:type [:= "data"]]
                   [:data-type :string]
                   [:version {:optional true} :int]
                   [:data :any]]]
   ["error"       [:map {:closed true}
                   [:type [:= "error"]]
                   [:error [:or :map :string]]]]])

(mr/def ::v4-user-message-entry
  [:map {:closed true}
   [:role [:= "user"]]
   [:content :string]])

(mr/def ::v4-message-data
  "A whole `metabot_message.data` value in the legacy v4 format. Rows are written wholesale by a
  single writer, so entries within a row are homogeneous; assistant placeholder rows are `[]`."
  [:or
   [:sequential {:max 0} :any]
   [:sequential {:min 1} ::v4-user-message-entry]
   [:sequential {:min 1} ::v4-external-ai-service-entry]
   [:sequential {:min 1} ::v4-native-entry]])

(defn normalize-v4-entry
  "Maps historically-persisted entry shapes that predate the v4 spec onto their spec-compliant
  equivalents; entries already compliant pass through unchanged. Two deviations exist in
  production data:
  - native `tool-output` entries written before `strip-tool-output-bloat` carry the full tool
    result (`:instructions`, `:resources`, `:data-parts`, …) — trimmed to the persisted subset
  - a short-lived writer persisted errors as `{:type \"error\" :errorText ...}` — rewritten to
    the spec'd `{:type \"error\" :error ...}`"
  [entry]
  (cond
    (not (map? entry))
    entry

    (= "tool-output" (:type entry))
    (update entry :result #(some-> % (select-keys [:output :structured-output :structured_output])))

    (and (= "error" (:type entry)) (contains? entry :errorText))
    (-> entry
        (assoc :error (:errorText entry))
        (dissoc :errorText))

    :else entry))

(comment
  ;; validate a CSV dump of metabot_message (`id` and `data` columns, header row) against the
  ;; v4 at-rest schema, e.g. from psql:
  ;;   \copy (select id, data from metabot_message) to 'dump.csv' with csv header
  (require '[clojure.data.csv :as csv]
           '[clojure.java.io :as io]
           '[malli.error :as me]
           '[metabase.util.json :as json])

  (defn validate-v4-csv [path]
    (with-open [reader (io/reader path)]
      (let [[header & rows] (csv/read-csv reader)
            column-index    (fn [column] (first (keep-indexed #(when (= column %2) %1) header)))
            id-idx          (column-index "id")
            data-idx        (column-index "data")
            explain         (mr/explainer ::v4-message-data)]
        (reduce (fn [acc row]
                  (let [raw    (nth row data-idx)
                        parsed (try (json/decode+kw raw) (catch Exception e e))
                        parsed (cond->> parsed
                                 (sequential? parsed) (mapv normalize-v4-entry))
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

  (validate-v4-csv "/path/to/metabot_message.csv"))
