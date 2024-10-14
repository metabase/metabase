(ns metabase.server.middleware.auth
  "Middleware related to enforcing authentication/API keys (when applicable). Unlike most other middleware most of this
  is not used as part of the normal `app`; it is instead added selectively to appropriate routes."
  (:require
   [metabase.models.setting :refer [defsetting]]
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

(defsetting api-key
  "When set, this API key is required for all API requests."
  :deprecated "0.50.0"
  :encryption :when-encryption-key-set
  :visibility :internal
  :doc "Decommissioned setting that previously allowed specifying a static API key required for all API requests to
        the `/notify` endpoints. No longer has any effect, as these endpoints are now protected by normal auth (with
        normal API keys set via the admin panel); purely keeping this around to emit a WARN log message on startup. We
        can remove this in a version or two.")
