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
   [:permissions-set    {:optional true} [:set :string]]
   ;; only API-key auth resolves these two: `:api-key-id` identifies the key itself (for per-key usage analytics) and
   ;; `:tenant-id` is the authenticated user's tenant, read off the same auth query rather than looked up again later.
   [:api-key-id         {:optional true} pos-int?]
   [:tenant-id          {:optional true} [:maybe pos-int?]]])
