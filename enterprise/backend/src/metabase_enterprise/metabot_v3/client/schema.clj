(ns metabase-enterprise.metabot-v3.client.schema
  (:require
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(mr/def ::role
  [:enum
   {:encode/api-request u/->snake_case_en
    :decode/api-request keyword}
   :system :user :assistant :tool])

(mr/def ::message.tool-call
  [:map
   [:id        {:description "Internal ID used by the LLM."} :string]
   [:name      ::metabot-v3.tools.interface/metadata.name]
   [:arguments [:map-of
                {:decode/api-response (fn [x]
                                        (cond-> x
                                          (string? x) (json/decode true)))
                 :encode/api-request  (fn [x]
                                        (cond-> x
                                          (map? x) json/encode))}
                ::metabot-v3.tools.interface/metadata.parameter.name
                :any]]])

(mr/def ::message
  [:map
   [:role    ::role]
   [:content {:optional true} [:maybe :string]]
   [:tool-calls {:optional true} [:maybe [:sequential ::message.tool-call]]]])

(mr/def ::messages
  [:sequential ::message])

(mr/def ::metric
  "A metric as sent to the AI Service"
  [:map
   [:id integer?]
   [:name :string]
   [:description [:maybe :string]]])

(mr/def ::select-metric-request
  "Shape of the request body we send to AI Service for Select Metric requests"
  [:map
   [:query :string]
   [:metrics [:sequential ::metric]]])

(mr/def ::ai-proxy.response
  "Shape of the response we get back from the AI Proxy."
  [:map
   [:message ::message]])

(mr/def ::ai-proxy.response-v2
  "Schema of the V2 AI agent response."
  [:map
   [:messages ::messages]
   [:state :map]])
