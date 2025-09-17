(ns metabase-enterprise.metabot-v3.client.schema
  (:require
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

(mr/def ::metric
  "A metric as sent to the AI Service"
  [:map
   [:id integer?]
   [:name :string]
   [:description [:maybe :string]]])

(mr/def ::usage
  "Usage information with break down by model"
  [:map-of :string [:map
                    [:prompt number?]
                    [:completion number?]]])

(mr/def ::ai-service.response
  "Schema of the AI agent response."
  [:map
   [:messages ::messages]
   [:state :map]
   [:usage ::usage]])
