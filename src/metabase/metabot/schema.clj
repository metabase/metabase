(ns metabase.metabot.schema
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema.common :as lib.schema.common]
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

(mr/def ::state-map-key
  "A dynamic state-map key, normalized to its canonical string representation."
  [:or {:decode/normalize lib.schema.common/normalize-string-key}
   :string
   :keyword])

(mr/def ::state
  [:map
   [:queries {:optional true} [:map-of ::state-map-key :map]]
   [:charts {:optional true} [:map-of ::state-map-key :map]]
   [:chart-configs {:optional true} [:map-of ::state-map-key :map]]
   [:todos {:optional true} [:sequential :map]]
   [:transforms {:optional true} [:map-of ::state-map-key :map]]
   [:link-registry {:optional true} [:map-of ::state-map-key :string]]])

(defn normalize-state
  "Normalize dynamic state-map keys to strings according to [[::state]]."
  [state]
  (mc/decode ::state state (mtx/transformer {:name :normalize})))

;;; ------------------------------- Client message shape -------------------------------

(mr/def ::client-message-part
  "One part of a persisted message: its a text, tool call, or data blob."
  [:multi {:dispatch :type}
   ["text"
    [:map
     [:id      :string]
     [:role    [:enum "user" "agent"]]
     [:type    [:= "text"]]
     [:message :string]]]
   ["tool_call"
    [:map
     [:id       :string]
     [:role     [:= "agent"]]
     [:type     [:= "tool_call"]]
     [:name     :string]
     [:args     [:maybe :string]]
     [:status   [:enum "started" "ended"]]
     ;; both can be absent if a call is unresolved  and
     ;; conversation is loaded while agent loop is still running
     [:result   {:optional true} [:maybe :string]]
     [:is_error {:optional true} :boolean]]]
   ["data_part"
    [:map
     [:id   :string]
     [:role [:= "agent"]]
     [:type [:= "data_part"]]
     [:part [:map
             [:type :string]
             [:data :any]]]]]])

(mr/def ::client-message-status
  "Where a message's turn got to."
  [:multi {:dispatch :type}
   ["done" [:map [:type [:= "done"]]]]
   ["aborted" [:map [:type [:= "aborted"]]]]
   ["in_progress" [:map [:type [:= "in_progress"]]]]
   ["errored"
    [:map
     [:type  [:= "errored"]]
     ;; the decoded `error` column, or its raw text when it isn't JSON
     [:error [:or
              :string
              [:map
               [:message {:optional true} :string]
               [:type    {:optional true} :string]
               [:data    {:optional true} :any]]]]]]])

(mr/def ::client-message
  "One persisted message as the client models it."
  [:map
   [:id         :string]
   [:externalId {:optional true} :string]
   [:role       [:enum "user" "agent"]]
   [:parts      [:sequential ::client-message-part]]
   [:status     ::client-message-status]])
