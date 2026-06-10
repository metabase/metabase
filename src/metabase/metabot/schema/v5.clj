(ns metabase.metabot.schema.v5
  "Schemas for the AI SDK v5 message formats: `UIMessageChunk` (wire/SSE) and
  `UIMessage`/`UIMessagePart` (at-rest). One family covers both v5 and v6 — it encodes the v6
  superset with v6-only members optional, so payloads from either version validate. Validates
  keywordized values (post JSON decode).

  Deliberate divergences from upstream:

  - map keys are snake_case keywords where upstream uses camelCase (`toolCallId` →
    `:tool_call_id`); `:type` and `:state` string values are unchanged
  - fields that are `z.unknown()` upstream (`:input`, `:output`, `:data`, `:message_metadata`)
    are required keys here unless the TypeScript type marks the value `| undefined`
  - maps are closed; upstream's `validateUIMessages` schema ignores unknown keys on at-rest
    parts

  Derived (ported from TypeScript/Zod to Malli) from the Vercel AI SDK, used under the
  Apache License 2.0, © 2023 Vercel, Inc.:

    - UIMessageChunk (wire):    packages/ai/src/ui-message-stream/ui-message-chunks.ts
    - UIMessage/part (at-rest): packages/ai/src/ui/ui-messages.ts and
                                packages/ai/src/ui/validate-ui-messages.ts

  Upstream: https://github.com/vercel/ai (pinned to ai@6.0.37)
  License:  https://github.com/vercel/ai/blob/main/LICENSE"
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- data-type? [t] (and (string? t) (str/starts-with? t "data-")))
(defn- tool-type? [t] (and (string? t) (str/starts-with? t "tool-")))

(mr/def ::provider-metadata
  ;; mirrors providerMetadataSchema — Record<string, Record<string, JSONValue>>
  [:map-of :keyword [:map-of :keyword :any]])

(mr/def ::ui-message-chunk
  ;; mirrors uiMessageChunkSchema; v6-only members included so v5 and v6 streams both validate
  [:multi {:dispatch (fn [chunk]
                       (let [t (:type chunk)]
                         (if (data-type? t) ::data t)))}
   ["text-start"            [:map {:closed true}
                             [:type [:= "text-start"]]
                             [:id :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["text-delta"            [:map {:closed true}
                             [:type [:= "text-delta"]]
                             [:id :string]
                             [:delta :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["text-end"              [:map {:closed true}
                             [:type [:= "text-end"]]
                             [:id :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["error"                 [:map {:closed true}
                             [:type [:= "error"]]
                             [:error_text :string]]]
   ["tool-input-start"      [:map {:closed true}
                             [:type [:= "tool-input-start"]]
                             [:tool_call_id :string]
                             [:tool_name :string]
                             [:provider_executed {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]
                             [:title {:optional true} :string]]]
   ["tool-input-delta"      [:map {:closed true}
                             [:type [:= "tool-input-delta"]]
                             [:tool_call_id :string]
                             [:input_text_delta :string]]]
   ["tool-input-available"  [:map {:closed true}
                             [:type [:= "tool-input-available"]]
                             [:tool_call_id :string]
                             [:tool_name :string]
                             [:input :any]
                             [:provider_executed {:optional true} :boolean]
                             [:provider_metadata {:optional true} ::provider-metadata]
                             [:dynamic {:optional true} :boolean]
                             [:title {:optional true} :string]]]
   ["tool-input-error"      [:map {:closed true}
                             [:type [:= "tool-input-error"]]
                             [:tool_call_id :string]
                             [:tool_name :string]
                             [:input :any]
                             [:provider_executed {:optional true} :boolean]
                             [:provider_metadata {:optional true} ::provider-metadata]
                             [:dynamic {:optional true} :boolean]
                             [:error_text :string]
                             [:title {:optional true} :string]]]
   ["tool-approval-request" [:map {:closed true}
                             [:type [:= "tool-approval-request"]]
                             [:approval_id :string]
                             [:tool_call_id :string]]]
   ["tool-output-available" [:map {:closed true}
                             [:type [:= "tool-output-available"]]
                             [:tool_call_id :string]
                             [:output :any]
                             [:provider_executed {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]
                             [:preliminary {:optional true} :boolean]]]
   ["tool-output-error"     [:map {:closed true}
                             [:type [:= "tool-output-error"]]
                             [:tool_call_id :string]
                             [:error_text :string]
                             [:provider_executed {:optional true} :boolean]
                             [:dynamic {:optional true} :boolean]]]
   ["tool-output-denied"    [:map {:closed true}
                             [:type [:= "tool-output-denied"]]
                             [:tool_call_id :string]]]
   ["reasoning-start"       [:map {:closed true}
                             [:type [:= "reasoning-start"]]
                             [:id :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["reasoning-delta"       [:map {:closed true}
                             [:type [:= "reasoning-delta"]]
                             [:id :string]
                             [:delta :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["reasoning-end"         [:map {:closed true}
                             [:type [:= "reasoning-end"]]
                             [:id :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["source-url"            [:map {:closed true}
                             [:type [:= "source-url"]]
                             [:source_id :string]
                             [:url :string]
                             [:title {:optional true} :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["source-document"       [:map {:closed true}
                             [:type [:= "source-document"]]
                             [:source_id :string]
                             [:media_type :string]
                             [:title :string]
                             [:filename {:optional true} :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
   ["file"                  [:map {:closed true}
                             [:type [:= "file"]]
                             [:url :string]
                             [:media_type :string]
                             [:provider_metadata {:optional true} ::provider-metadata]]]
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
                             [:message_id {:optional true} :string]
                             [:message_metadata {:optional true} :any]]]
   ["finish"                [:map {:closed true}
                             [:type [:= "finish"]]
                             [:finish_reason {:optional true}
                              [:enum "stop" "length" "content-filter" "tool-calls" "error" "other"]]
                             [:message_metadata {:optional true} :any]]]
   ["abort"                 [:map {:closed true}
                             [:type [:= "abort"]]
                             [:reason {:optional true} :string]]]
   ["message-metadata"      [:map {:closed true}
                             [:type [:= "message-metadata"]]
                             [:message_metadata :any]]]])

(mr/def ::tool-ui-part
  ;; mirrors ToolUIPart / UIToolInvocation; v6 approval states included
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "input-streaming"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input {:optional true} :any]]]
   ["input-available"    [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "input-available"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]]]
   ["approval-requested" [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "approval-requested"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]]]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "output-available"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:output :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "output-error"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:raw_input {:optional true} :any]
                          [:error_text :string]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:tool_call_id :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

(mr/def ::dynamic-tool-ui-part
  ;; mirrors DynamicToolUIPart — carries :tool_name explicitly
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "input-streaming"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input {:optional true} :any]]]
   ["input-available"    [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "input-available"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]]]
   ["approval-requested" [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "approval-requested"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]]]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "output-available"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:output :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "output-error"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:raw_input {:optional true} :any]
                          [:error_text :string]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:tool_name :string]
                          [:tool_call_id :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:provider_executed {:optional true} :boolean]
                          [:input :any]
                          [:call_provider_metadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

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
                       [:provider_metadata {:optional true} ::provider-metadata]]]
   ["reasoning"       [:map {:closed true}
                       [:type [:= "reasoning"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:provider_metadata {:optional true} ::provider-metadata]]]
   ["source-url"      [:map {:closed true}
                       [:type [:= "source-url"]]
                       [:source_id :string]
                       [:url :string]
                       [:title {:optional true} :string]
                       [:provider_metadata {:optional true} ::provider-metadata]]]
   ["source-document" [:map {:closed true}
                       [:type [:= "source-document"]]
                       [:source_id :string]
                       [:media_type :string]
                       [:title :string]
                       [:filename {:optional true} :string]
                       [:provider_metadata {:optional true} ::provider-metadata]]]
   ["file"            [:map {:closed true}
                       [:type [:= "file"]]
                       [:media_type :string]
                       [:filename {:optional true} :string]
                       [:url :string]
                       [:provider_metadata {:optional true} ::provider-metadata]]]
   ["step-start"      [:map {:closed true}
                       [:type [:= "step-start"]]]]
   ["dynamic-tool"    ::dynamic-tool-ui-part]
   [::tool            ::tool-ui-part]
   [::data            [:map {:closed true}
                       [:type [:fn data-type?]]
                       [:id {:optional true} :string]
                       [:data :any]]]])

(mr/def ::ui-message
  ;; mirrors UIMessage; nonempty :parts per the uiMessagesSchema runtime validator
  [:map {:closed true}
   [:id :string]
   [:role [:enum "system" "user" "assistant"]]
   [:metadata {:optional true} :any]
   [:parts [:sequential {:min 1} ::ui-message-part]]])
