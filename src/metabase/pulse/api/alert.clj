(ns ^:deprecated metabase.pulse.api.alert
  "/api/alert endpoints.

  Deprecated: will soon be migrated to notification APIs."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.notification.api :as notification.api]
   [metabase.pulse.update-alerts :as update-alerts]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(when config/ee-available?
  (classloader/require 'metabase-enterprise.advanced-permissions.common))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch alerts which the current user has created or will receive, or all alerts if the user is an admin.
  The optional `user_id` will return alerts created by the corresponding user, but is ignored for non-admin users."
  [_route-params
   {:keys [archived user_id]} :- [:map
                                  [:archived {:default false} [:maybe ms/BooleanValue]]
                                  [:user_id  {:optional true} [:maybe ms/PositiveInt]]]]
  (let [user-id (if api/*is-superuser?*
                  user_id
                  api/*current-user-id*)]
    (->> (notification.api/list-notifications
          {:payload_type   :notification/card
           :legacy-user-id user-id
           :legacy-active  (not archived)})
         (map update-alerts/notification->pulse)
         (remove nil?))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch an alert by ID"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (update-alerts/get-alert id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/subscription"
  "For users to unsubscribe themselves from the given alert."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (notification.api/unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
