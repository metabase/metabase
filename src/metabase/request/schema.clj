(ns metabase.request.schema
  (:require
   [metabase.util.malli.registry :as mr]))

;;; TODO (Cam 8/13/25) -- should this map be closed, that way we can make sure all the keys we might be using are
;;; enumerated here?
(mr/def ::current-user-info
  [:map
   [:metabase-user-id        {:optional true} pos-int?]
   [:is-superuser?           {:optional true} :boolean]
   [:user-locale             {:optional true} [:maybe string?]]
   [:permissions-set         {:optional true} [:set :string]]
   ;; only when `:advanced-permissions` is enabled.
   [:is-group-manager?       {:optional true} :boolean]
   ;; only for workspace tokens.
   ;;
   ;; if this is specified, restrict permissions to only this Collections. Added
   ;; by [[metabase.server.middleware.session/current-user-info-for-api-key]] for API keys created
   ;; with [[metabase-enterprise.workspaces.common/create-workspace!]].
   ;; [[metabase.request.session/current-user-info->permissions-set]] handles restricting the permissions set.
   [:workspace/collection-id {:optional true} [:maybe pos-int?]]
   ;; TODO (Cam 8/14/25) -- need real schema for this.
   [:workspace/attributes    {:optional true} [:maybe [:map-of :any :any]]]])
