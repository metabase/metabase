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
   [malli.error :as me]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def current-data-version
  "The `metabot_message.data_version` written by all current code paths: the at-rest
  format is [[::message-data]] (v2). Bump in lockstep when a v3 format lands."
  2)

(defn- data-type? [t] (and (string? t) (str/starts-with? t "data-")))
(defn- tool-type? [t] (and (string? t) (str/starts-with? t "tool-")))

(defn tool-part?
  "True when `part` is a tool part — its `:type` is `\"tool-<name>\"`."
  [part]
  (tool-type? (:type part)))

(defn data-part?
  "True when `part` is a data part — its `:type` is `\"data-<name>\"`."
  [part]
  (data-type? (:type part)))

(defn text-part?
  "True when `part` is a text part — its `:type` is `\"text\"`."
  [part]
  (= "text" (:type part)))

(defn tool-part-name
  "The tool name encoded in a tool part's `:type`:
  `{:type \"tool-create_sql_query\" ...}` -> `\"create_sql_query\"`."
  [part]
  (subs (:type part) (count "tool-")))

(mr/def ::anthropic-provider-metadata
  "Anthropic-specific data carried on a reasoning part: a redacted-thinking block's opaque
  payload, or a signed-thinking block's signature."
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:66"}
   [:redactedData {:optional true} [:maybe :string]]
   [:signature    {:optional true} [:maybe :string]]])

(mr/def ::openai-provider-metadata
  "OpenAI-specific data carried on a reasoning part, needed to replay it across tool-call
  round-trips despite `store:false`."
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:73"}
   [:encryptedContent {:optional true} [:maybe :string]]
   [:itemId           {:optional true} [:maybe :string]]])

(mr/def ::google-provider-metadata
  "Google-specific data carried on a tool-input part: the thought signature Gemini 3.x requires
  when a functionCall is replayed in the current turn."
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:80"}
   [:thoughtSignature {:optional true} [:maybe :string]]])

(mr/def ::provider-metadata
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:84"}
   [:anthropic {:optional true} [:maybe ::anthropic-provider-metadata]]
   [:openai    {:optional true} [:maybe ::openai-provider-metadata]]
   [:google    {:optional true} [:maybe ::google-provider-metadata]]])

(mr/def ::never
  "`z.never().optional()`: the key must be absent. (zod also tolerates a present `undefined`
  value, which JSON cannot represent.)"
  [:fn {:error/message "must be absent"} (fn [_] false)])

(mr/def ::tool-payload
  "A metabot tool's `:structured-output`/`:structured_output`, `:resources`, or `:data-parts` data: a
  closed bag of the field names metabot tools actually set."
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:97"}
   [:result-type    {:optional true} [:maybe [:or :string :keyword]]]
   [:type           {:optional true} [:maybe [:or :string :keyword]]]
   [:list-type      {:optional true} [:maybe [:or :string :keyword]]]
   [:message        {:optional true} [:maybe :string]]
   [:path           {:optional true} [:maybe :string]]
   [:question       {:optional true} [:maybe :string]]
   [:options        {:optional true} [:maybe [:sequential :string]]]
   [:data           {:optional true} [:maybe [:or [:ref ::tool-payload] [:sequential [:ref ::tool-payload]]]]]
   [:total_count    {:optional true} [:maybe :int]]
   [:weak_match     {:optional true} [:maybe :boolean]]
   [:tables         {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:models         {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:metrics        {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:errors         {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:results        {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:id             {:optional true} [:maybe [:or :int :string]]]
   [:name           {:optional true} [:maybe :string]]
   [:description    {:optional true} [:maybe :string]]
   [:content        {:optional true} [:maybe :string]]
   [:document       {:optional true} [:maybe :string]]
   [:items          {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:total          {:optional true} [:maybe :int]]
   [:page           {:optional true} [:maybe :int]]
   [:pages          {:optional true} [:maybe :int]]
   [:card-id        {:optional true} [:maybe :int]]
   [:card_id        {:optional true} [:maybe :int]]
   [:collection-id  {:optional true} [:maybe :int]]
   [:collection_id  {:optional true} [:maybe :int]]
   [:destination    {:optional true} [:maybe [:or :string [:ref ::tool-payload]]]]
   [:todos          {:optional true} [:maybe [:sequential :metabase.metabot.schema/todo]]]
   [:todo_count     {:optional true} [:maybe :int]]
   [:events         {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:timestamp      {:optional true} [:maybe :string]]
   [:time_matters   {:optional true} [:maybe :boolean]]
   [:timezone       {:optional true} [:maybe :string]]
   [:status         {:optional true} [:maybe :string]]
   [:priority       {:optional true} [:maybe :string]]
   [:verified       {:optional true} [:maybe :boolean]]
   [:next-page-uri  {:optional true} [:maybe :string]]
   [:tabs           {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:approved       {:optional true} [:maybe :boolean]]
   [:success        {:optional true} [:maybe :boolean]]
   [:bad_transforms {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:bad_questions  {:optional true} [:maybe [:sequential [:ref ::tool-payload]]]]
   [:query          {:optional true} [:maybe :metabase.metabot.schema/query]]
   [:query-id       {:optional true} [:maybe :string]]
   [:query_id       {:optional true} [:maybe :string]]
   [:query-content  {:optional true} [:maybe :string]]
   [:query-json     {:optional true} [:maybe :string]]
   [:result-columns {:optional true} [:maybe [:sequential :string]]]
   [:database       {:optional true} [:maybe :int]]
   [:database_id    {:optional true} [:maybe :int]]
   [:sql_engine     {:optional true} [:maybe :string]]
   [:chart-type     {:optional true} [:maybe [:or :string :keyword]]]
   [:chart_type     {:optional true} [:maybe [:or :string :keyword]]]
   [:chart-id       {:optional true} [:maybe :string]]
   [:display        {:optional true} [:maybe [:or :string :keyword]]]
   [:tool           {:optional true} [:maybe :string]]
   [:dataset_query  {:optional true} [:maybe :metabase.metabot.schema/query]]
   [:transform      {:optional true} [:maybe :metabase.metabot.schema/transform]]
   [:target         {:optional true} [:maybe [:ref ::tool-payload]]]
   [:source         {:optional true} [:maybe [:ref ::tool-payload]]]
   [:schema         {:optional true} [:maybe :string]]
   [:url            {:optional true} [:maybe :string]]
   [:title          {:optional true} [:maybe :string]]
   [:entity_id      {:optional true} [:maybe :int]]
   [:link           {:optional true} [:maybe :string]]])

(mr/def ::structured-output
  "The `persisted-structured-output-keys` subset of a tool's `:structured-output`/
  `:structured_output`, as stored on a v2 tool part's `:output`
  (see `metabase.metabot.persistence/tool-result->storable-output`)."
  [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:170"}
   [:query-id      {:optional true} [:maybe :string]]
   [:query-content {:optional true} [:maybe :string]]
   [:query         {:optional true} [:maybe :metabase.metabot.schema/query]]
   [:database      {:optional true} [:maybe :int]]
   [:chart-type    {:optional true} [:maybe [:or :string :keyword]]]])

(mr/def ::stored-tool-output
  "A v2 tool part's `:output`: the trimmed value
  `metabase.metabot.persistence/tool-result->storable-output` stores, either a tool's bare
  scalar result or the `:output`/`:structured_output` map trimmed from it."
  [:or
   :string
   :keyword
   number?
   :boolean
   :nil
   [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:187"}
    [:output            {:optional true} [:maybe :string]]
    [:structured_output {:optional true} [:maybe ::structured-output]]]])

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

(mr/def ::tool-io
  "A tool call's `:input`/`:rawInput`/`:output`: an arbitrary JSON value whose shape the calling tool (or the LLM
  provider) owns, not us."
  [:schema {::mr/deliberately-open true, :description "arbitrary tool call arguments or result"} :any])

(mr/def ::tool-ui-part
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:324"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} ::tool-io]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:approval {:optional true} ::never]]]
   ["input-available"    [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:333"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} ::tool-io]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::never]]]
   ["approval-requested" [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:343"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:352"}
                                      [:id :string]
                                      [:approved {:optional true} ::never]
                                      [:reason {:optional true} ::never]]]]]
   ["approval-responded" [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:356"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:365"}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:369"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} ::tool-io]
                          [:output {:optional true} ::stored-tool-output]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:379"}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:383"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} ::tool-io]
                          [:rawInput {:optional true} ::tool-io]
                          [:output {:optional true} ::never]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:393"}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:397"}
                          [:type [:fn tool-type?]]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:providerExecuted {:optional true} :boolean]
                          [:input {:optional true} ::tool-io]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:406"}
                                      [:id :string]
                                      [:approved [:= false]]
                                      [:reason {:optional true} :string]]]]]])

(mr/def ::dynamic-tool-ui-part
  [:multi {:dispatch :state}
   ["input-streaming"    [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:413"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-streaming"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:approval {:optional true} ::never]]]
   ["input-available"    [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:423"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "input-available"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} ::never]]]
   ["approval-requested" [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:434"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-requested"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:444"}
                                      [:id :string]
                                      [:approved {:optional true} ::never]
                                      [:reason {:optional true} ::never]]]]]
   ["approval-responded" [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:448"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "approval-responded"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:458"}
                                      [:id :string]
                                      [:approved :boolean]
                                      [:reason {:optional true} :string]]]]]
   ["output-available"   [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:462"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-available"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::stored-tool-output]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:preliminary {:optional true} :boolean]
                          [:approval {:optional true} [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:473"}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-error"       [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:477"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-error"]]
                          [:input {:optional true} ::tool-io]
                          [:rawInput {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText :string]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval {:optional true} [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:488"}
                                                       [:id :string]
                                                       [:approved [:= true]]
                                                       [:reason {:optional true} :string]]]]]
   ["output-denied"      [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:492"}
                          [:type [:= "dynamic-tool"]]
                          [:toolName :string]
                          [:toolCallId :string]
                          [:state [:= "output-denied"]]
                          [:input {:optional true} ::tool-io]
                          [:providerExecuted {:optional true} :boolean]
                          [:output {:optional true} ::never]
                          [:errorText {:optional true} ::never]
                          [:callProviderMetadata {:optional true} ::provider-metadata]
                          [:approval [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:502"}
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
   ["text"            [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:515"}
                       [:type [:= "text"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["reasoning"       [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:520"}
                       [:type [:= "reasoning"]]
                       [:text :string]
                       [:state {:optional true} [:enum "streaming" "done"]]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-url"      [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:525"}
                       [:type [:= "source-url"]]
                       [:sourceId :string]
                       [:url :string]
                       [:title {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["source-document" [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:531"}
                       [:type [:= "source-document"]]
                       [:sourceId :string]
                       [:mediaType :string]
                       [:title :string]
                       [:filename {:optional true} :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["file"            [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:538"}
                       [:type [:= "file"]]
                       [:mediaType :string]
                       [:filename {:optional true} :string]
                       [:url :string]
                       [:providerMetadata {:optional true} ::provider-metadata]]]
   ["step-start"      [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:544"}
                       [:type [:= "step-start"]]]]
   ["dynamic-tool"    ::dynamic-tool-ui-part]
   [::tool            ::tool-ui-part]
   [::data            [:map {:closed true, :probe/id "src/metabase/metabot/schema/v2.clj:548"}
                       [:type [:fn data-type?]]
                       [:id {:optional true} :string]
                       [:data {:optional true} [:maybe ::tool-io]]]]])

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

(defn- check
  [schema context value]
  (when-let [error (some-> (mr/explain schema value) me/humanize)]
    (if (or config/is-dev? config/is-test?)
      (throw (ex-info (str "Invalid " context) {:context context :error error :value value}))
      (log/warn "Invalid metabot v2 payload" {:context context :error error})))
  value)

(defn check-message-data
  "Validate an at-rest `metabot_message.data` value against `::message-data`.
  On mismatch, throw in dev/test and log a warning in prod. Returns `value`
  either way, so prod callers proceed with the original value."
  [context value]
  (check ::message-data context value))

(defn check-ui-message-chunk
  "Validate a wire-format stream event against `::ui-message-chunk`. On
  mismatch, throw in dev/test and log a warning in prod. Returns `value`
  either way, so prod callers proceed with the original value."
  [context value]
  (check ::ui-message-chunk context value))
