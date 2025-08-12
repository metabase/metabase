(ns metabase.request.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::current-user-info
  [:map
   [:metabase-user-id  pos-int?]
   [:is-superuser?     {:optional true} :boolean]
   [:user-locale       {:optional true} [:maybe string?]]
   [:is-group-manager? {:optional true} :boolean]
   [:permissions-set   {:optional true} [:set :string]]
   ;; if this is specified, restrict permissions to only this Collections. Added
   ;; by [[metabase.server.middleware.session/current-user-info-for-api-key]] for API keys created
   ;; with [[metabase.api-keys.models.api-key/create-single-collection-api-key!]].
   ;; [[metabase.request.session/current-user-info->permissions-set]] handles restricting the permissions set.
   [:api-key/allowed-collection-id {:optional true} [:maybe pos-int?]]])
