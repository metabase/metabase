(ns metabase.request.schema
  (:require
   [metabase.util.malli.registry :as mr]))

;;; TODO (Cam 8/13/25) -- should this map be closed, that way we can make sure all the keys we might be using are
;;; enumerated here?
(mr/def ::current-user-info
  [:map
   [:metabase-user-id   {:optional true} pos-int?]
   [:is-superuser?      {:optional true} :boolean]
   [:is-data-analyst?   {:optional true} :boolean]
   [:user-locale        {:optional true} [:maybe string?]]
   [:is-group-manager?  {:optional true} :boolean]
   [:permissions-set    {:optional true} [:set :string]]])
