(ns metabase.server.middleware.auth
  "Middleware related to enforcing authentication/API keys (when applicable). Unlike most other middleware most of this
  is not used as part of the normal `app`; it is instead added selectively to appropriate routes."
  (:require
   [metabase.server.request.util :as req.util]))

(defn enforce-authentication
  "Middleware that returns a 401 response if `request` has no associated `:metabase-user-id`."
  [handler]
  (with-meta
   (fn [{:keys [metabase-user-id] :as request} respond raise]
     (if metabase-user-id
       (handler request respond raise)
       (respond req.util/response-unauthentic)))
   (meta handler)))
