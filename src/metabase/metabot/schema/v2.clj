(ns metabase.metabot.schema.v2
  "Schemas for the v2 `metabot_message.data` storage and over the wire message format.

  These schemas strictly reimplement Vercel AI SDK v6's message formats:
    - UIMessageChunk (wire):    packages/ai/src/ui-message-stream/ui-message-chunks.ts
    - UIMessage/part (at-rest): packages/ai/src/ui/ui-messages.ts and
                                packages/ai/src/ui/validate-ui-messages.ts

  Apache License 2.0, © 2023 Vercel, Inc.
  Upstream: https://github.com/vercel/ai (pinned to ai@6.0.37)
  License:  https://github.com/vercel/ai/blob/ai%406.0.37/LICENSE

  The goal is exact equivalence with upstream's runtime validation behavior (verified
  empirically against `validateUIMessages`/`uiMessageChunkSchema` under the zod version the
  AI SDK pins). The zod -> malli transcription conventions:

  - `z.strictObject` (all wire chunks) -> closed maps
  - `z.object` (all at-rest parts) -> open maps: upstream strips undeclared keys from its
    parse result rather than rejecting them, so undeclared keys must not fail validation
  - `z.unknown()` fields (`:input`, `:output`, `:data`, `:messageMetadata`) -> optional `:any`
    keys: zod does not enforce key presence for `unknown` fields, whether or not `.optional()`
    is chained (https://github.com/colinhacks/zod/issues/1628)
  - `z.never().optional()` fields -> optional `::never` keys, rejecting the key when present.
    This is what keeps the tool-state variants mutually exclusive"
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- data-type? [t] (and (string? t) (str/starts-with? t "data-")))
(defn- tool-type? [t] (and (string? t) (str/starts-with? t "tool-")))

(mr/def ::provider-metadata
  [:map-of :keyword [:map-of :keyword :any]])

(mr/def ::never
  "`z.never().optional()`: the key must be absent. (zod also tolerates a present `undefined`
  value, which JSON cannot represent.)"
  [:not :any])

(mr/def ::ui-message-chunk
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
                             [:input {:optional true} :any]
                             [:providerExecuted {:optional true} :boolean]
                             [:providerMetadata {:optional true} ::provider-metadata]
                             [:dynamic {:optional true} :boolean]
                             [:title {:optional true} :string]]]
   ["tool-input-error"      [:map {:closed true}
                             [:type [:= "tool-input-error"]]
                             [:toolCallId :string]
                             [:toolName :string]
                             [:input {:optional true} :any]
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
                             [:output {:optional true} :any]
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
                             [:data {:optional true} :any]
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
                             [:finishReason {:optional true}
                              [:enum "stop" "length" "content-filter" "tool-calls" "error" "other"]]
                             [:messageMetadata {:optional true} :any]]]
   ["abort"                 [:map {:closed true}
                             [:type [:= "abort"]]
                             [:reason {:optional true} :string]]]
   ["message-metadata"      [:map {:closed true}
                             [:type [:= "message-metadata"]]
                             [:messageMetadata {:optional true} :any]]]])

(mr/def ::tool-ui-part
  [:multi {:dispatch :state}
   ["input-streaming"    [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:approval {:optional true} ::never]]]
   ["input-available"    [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::never]]]
   ["approval-requested" [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved {:optional true} ::never]
                                      [:reason {:optional true} ::never]]]]]
   ["approval-responded" [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:output {:optional true} :any]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:rawInput {:optional true} :any]
                          [:output {:optional true} ::never]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} :any]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

(mr/def ::dynamic-tool-ui-part
  [:multi {:dispatch :state}
   ["input-streaming"    [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:approval {:optional true} ::never]]]
   ["input-available"    [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::never]]]
   ["approval-requested" [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved {:optional true} ::never]
                                      [:reason {:optional true} ::never]]]]]
   ["approval-responded" [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} :any]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:input {:optional true} :any]
                          [:rawInput {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:input {:optional true} :any]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

(mr/def ::ui-message-part
  [:multi {:dispatch (fn [part]
                       (let [t (:type part)]
                         (cond
                           (= "dynamic-tool" t) t
                           (tool-type? t)       ::tool
                           (data-type? t)       ::data
                           :else                t)))}
   ["text"            [:map
                       [:type [:= "text"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning"       [:map
                       [:type [:= "reasoning"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-url"      [:map
                       [:type [:= "source-url"]]
                       [:sourceId :string]
                       [:url :string]
                       [:title {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-document" [:map
                       [:type [:= "source-document"]]
                       [:sourceId :string]
                       [:mediaType :string]
                       [:title :string]
                       [:filename {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["file"            [:map
                       [:type [:= "file"]]
                       [:mediaType :string]
                       [:filename {:optional true} :string]
                       [:url :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["step-start"      [:map
                       [:type [:= "step-start"]]]]
   ["dynamic-tool"    ::dynamic-tool-ui-part]
   [::tool            ::tool-ui-part]
   [::data            [:map
                       [:type [:fn data-type?]]
                       [:id {:optional true} :string]
                       [:data {:optional true} :any]]]])

(mr/def ::ui-message
  [:map
   [:id :string]
   [:role [:enum "system" "user" "assistant"]]
   [:metadata {:optional true} :any]
   [:parts [:sequential {:min 1} ::ui-message-part]]])

(mr/def ::message-data
  "A whole `metabot_message.data` value in the v2 format: the at-rest projection of a
  message's `UIMessagePart`s. Assistant placeholder rows are `[]`."
  [:sequential ::ui-message-part])
