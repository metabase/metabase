(ns metabase.help-assistant.api
  "`/api/help-assistant` endpoints for the prototype Help page assistant."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.help-assistant.core :as help-assistant]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/chat"
  "Send the conversation so far to the Help page assistant and get its reply. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:messages [:sequential [:map {:closed true}
                                     [:role [:enum "user" "assistant"]]
                                     [:content :string]]]]
            [:diagnostic_info {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (help-assistant/chat {:messages        (:messages body)
                        :diagnostic-info (:diagnostic_info body)}))

(api.macros/defendpoint :post "/feedback" :- :nil
  "Rate one of the Help page assistant's answers. Admins only."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:positive :boolean]
            [:comment {:optional true} [:maybe :string]]
            [:question :string]
            [:answer :string]
            [:sources {:optional true} [:sequential [:map {:closed true}
                                                     [:title :string]
                                                     [:url :string]]]]]]
  (api/check-superuser)
  (help-assistant/log-feedback! body)
  nil)
