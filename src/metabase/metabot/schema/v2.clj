(ns metabase.metabot.schema.v2
  "Schemas for the v2 message formats, ported from AI SDK v6's `UIMessageChunk` (wire/SSE)
  and `UIMessage`/`UIMessagePart` (at-rest) definitions. Validates keywordized values (post
  JSON decode).

  Deliberate divergences from upstream:

  - fields that are `z.unknown()` upstream (`:input`, `:output`, `:data`, `:messageMetadata`)
    are required keys here unless the TypeScript type marks the value `| undefined`
  - maps are closed; upstream's `validateUIMessages` schema ignores unknown keys on at-rest
    parts

  Derived (ported from TypeScript/Zod to Malli) from the Vercel AI SDK, used under the
  Apache License 2.0, © 2023 Vercel, Inc.:

    - UIMessageChunk (wire):    packages/ai/src/ui-message-stream/ui-message-chunks.ts
    - UIMessage/part (at-rest): packages/ai/src/ui/ui-messages.ts and
                                packages/ai/src/ui/validate-ui-messages.ts

  Upstream: https://github.com/vercel/ai (pinned to ai@6.0.37)
  License:  https://github.com/vercel/ai/blob/ai%406.0.37/LICENSE"
  (:require
   [clojure.string :as str]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- data-type? [t] (and (string? t) (str/starts-with? t "data-")))
(defn- tool-type? [t] (and (string? t) (str/starts-with? t "tool-")))

(mr/def ::provider-metadata
  [:map-of :keyword [:map-of :keyword :any]])

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
                             [:finishReason {:optional true}
                              [:enum "stop" "length" "content-filter" "tool-calls" "error" "other"]]
                             [:messageMetadata {:optional true} :any]]]
   ["abort"                 [:map {:closed true}
                             [:type [:= "abort"]]
                             [:reason {:optional true} :string]]]
   ["message-metadata"      [:map {:closed true}
                             [:type [:= "message-metadata"]]
                             [:messageMetadata :any]]]])

(mr/def ::tool-ui-part
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
                          [:approval [:map {:closed true}
                                      [:id :string]]]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
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
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
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
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

(mr/def ::dynamic-tool-ui-part
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
                          [:approval [:map {:closed true}
                                      [:id :string]]]]]
   ["approval-responded" [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
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
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:rawInput {:optional true} :any]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map {:closed true}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:title {:optional true} :string]
                          [:providerExecuted {:optional true} :boolean]
                          [:input :any]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true}
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
  [:map {:closed true}
   [:id :string]
   [:role [:enum "system" "user" "assistant"]]
   [:metadata {:optional true} :any]
   [:parts [:sequential {:min 1} ::ui-message-part]]])
