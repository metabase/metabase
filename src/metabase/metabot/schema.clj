(ns metabase.metabot.schema
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

(mr/def ::state
  [:map
   [:queries {:optional true} [:map-of [:or :string :keyword] :map]]
   [:charts {:optional true} [:map-of [:or :string :keyword] :map]]
   [:chart-configs {:optional true} [:map-of [:or :string :keyword] :map]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of [:or :string :keyword] :map]]
   [:link-registry {:optional true} [:map-of [:or :string :keyword] :string]]])
