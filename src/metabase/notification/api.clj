(ns metabase.notification.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.notification.api.notification]
   [metabase.notification.api.unsubscribe]
   [potemkin :as p]))

(p/import-vars
 [metabase.notification.api.notification
  list-notifications
  get-notification
  unsubscribe-user!])

(def ^{:arglists '([request respond raise])} notification-routes
  "`/api/notification` routes."
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.notification.api.unsubscribe})
   (routes.common/+auth (api.macros/ns-handler 'metabase.notification.api.notification))))
