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
