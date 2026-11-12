(ns metabase.help-assistant.api
  "`/api/help-assistant` endpoints for the prototype Help page assistant."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.help-assistant.core :as help-assistant]))

(set! *warn-on-reflection* true)

(def ^:private Source
  [:map {:closed true}
   [:title :string]
   [:url :string]])

(def ^:private Step
  "One thing the assistant did to get an answer: load a skill, search the docs, read a page, or run out of steps.
  `:earlier` marks a skill loaded earlier in the conversation."
  [:map {:closed true}
   [:type [:enum "skill" "search" "read" "limit"]]
   [:label :string]
   [:skill_id {:optional true} :string]
   [:url {:optional true} :string]
   [:earlier {:optional true} :boolean]])

(api.macros/defendpoint :post "/chat" :- [:map {:closed true}
                                          [:reply :string]
                                          [:sources [:sequential Source]]
                                          [:steps [:sequential Step]]]
  "Send the conversation so far to the Help page assistant and get its reply. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:messages [:sequential [:map {:closed true}
                                     [:role [:enum "user" "assistant"]]
                                     [:content :string]]]]
            [:diagnostic_info {:optional true} [:maybe :string]]
            [:loaded_skills {:optional true} [:maybe [:sequential :string]]]]]
  (api/check-superuser)
  (help-assistant/chat {:messages        (:messages body)
                        :diagnostic-info (:diagnostic_info body)
                        :loaded-skills   (:loaded_skills body)}))

(api.macros/defendpoint :post "/feedback" :- :nil
  "Rate one of the Help page assistant's answers. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:positive :boolean]
            [:comment {:optional true} [:maybe :string]]
            [:question :string]
            [:answer :string]
            [:sources {:optional true} [:sequential Source]]]]
  (api/check-superuser)
  (help-assistant/log-feedback! body)
  nil)

(api.macros/defendpoint :get "/settings" :- [:map {:closed true}
                                             [:flags_enabled :boolean]]
  "Which optional Help page assistant features are on. Admins only."
  []
  (api/check-superuser)
  {:flags_enabled (some? (help-assistant/flags-dir))})

(api.macros/defendpoint :post "/flag" :- [:map {:closed true}
                                          [:file :string]]
  "Save a chat for review, to turn into an eval case. The chat ends with the flagged answer. Only works when
  `MB_HELP_ASSISTANT_FLAGS_DIR` is set. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:note :string]
            [:messages [:sequential {:min 1} [:map {:closed true}
                                              [:role [:enum "user" "assistant"]]
                                              [:content :string]
                                              [:steps {:optional true} [:maybe [:sequential Step]]]]]]]]
  (api/check-superuser)
  {:file (help-assistant/save-flag! body)})
