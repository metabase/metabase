(ns metabase-enterprise.metabot-v3.client.schema
  (:require
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(mr/def ::role
  [:enum
   {:encode/api-request u/->snake_case_en
    :decode/api-response keyword}
   :system :user :assistant :tool])

(mr/def ::message
  [:and
   [:map
    {:decode/api-response (mr/with-key #(update-keys % metabot-v3.u/safe->kebab-case-en))}
    [:role                         ::role]
    [:content     {:optional true} [:maybe :string]]
    [:navigate-to {:optional true} [:maybe :string]]]
   [:map {:encode/api-request (mr/with-key #(update-keys % metabot-v3.u/safe->snake_case_en))}]])

(mr/def ::messages
  [:sequential ::message])

(mr/def ::metric
  "A metric as sent to the AI Service"
  [:map
   [:id integer?]
   [:name :string]
   [:description [:maybe :string]]])

(mr/def ::ai-service.response
  "Schema of the AI agent response."
  [:map
   [:messages ::messages]
   [:state :map]])
