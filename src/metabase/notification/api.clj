(ns metabase.notification.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.notification.api.notification]
   [metabase.notification.api.unsubscribe]))

(def ^{:arglists '([request respond raise])} notification-routes
  "`/api/notification` routes."
  (handlers/routes
   (handlers/route-map-handler
    {"/unsubscribe" 'metabase.notification.api.unsubscribe})
   (routes.common/+auth (api.macros/ns-handler 'metabase.notification.api.notification))))
