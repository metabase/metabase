(ns metabase.notification.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.notification.api.admin]
   [metabase.notification.api.notification]
   [metabase.notification.api.unsubscribe]
   [metabase.notification.write]
   [potemkin :as p]))

(p/import-vars
 [metabase.notification.api.notification
  list-notifications]
 [metabase.notification.write
  create-notification-with-perm-checks!
  get-notification
  publish-notification-update!
  unsubscribe-user!
  update-notification-with-perm-checks!])

(def ^{:arglists '([request respond raise])} notification-routes
  "`/api/notification` routes."
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.notification.api.unsubscribe
     "/admin"       (routes.common/+auth (api.macros/ns-handler 'metabase.notification.api.admin))})
   (routes.common/+auth (api.macros/ns-handler 'metabase.notification.api.notification))))
