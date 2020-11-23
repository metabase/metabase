(ns metabase.middleware.auth
  "Middleware related to enforcing authentication/API keys (when applicable). Unlike most other middleware most of this
  is not used as part of the normal `app`; it is instead added selectively to appropriate routes."
  (:require [metabase.middleware.util :as middleware.u]
            [metabase.models.setting :refer [defsetting]]))

(def ^:private ^:const ^String metabase-api-key-header "x-metabase-apikey")

(defn enforce-authentication
  "Middleware that returns a 401 response if `request` has no associated `:metabase-user-id`."
  [handler]
  (fn [{:keys [metabase-user-id] :as request} respond raise]
    (if metabase-user-id
      (handler request respond raise)
      (respond middleware.u/response-unauthentic))))

(defn- wrap-api-key* [{:keys [headers], :as request}]
  (if-let [api-key (headers metabase-api-key-header)]
    (assoc request :metabase-api-key api-key)
    request))

(defn wrap-api-key
  "Middleware that sets the `:metabase-api-key` keyword on the request if a valid API Key can be found. We check the
  request headers for `X-METABASE-APIKEY` and if it's not found then then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (handler (wrap-api-key* request) respond raise)))

(defsetting api-key
  "When set, this API key is required for all API requests."
  :visibility :internal)

(defn enforce-api-key
  "Middleware that enforces validation of the client via API Key, canceling the request processing if the check fails.

  Validation is handled by first checking for the presence of the `:metabase-api-key` on the request.  If the api key
  is available then we validate it by checking it against the configured `:mb-api-key` value set in our global config.

  If the request `:metabase-api-key` matches the configured `api-key` value then the request continues, otherwise we
  reject the request and return a 403 Forbidden response."
  [handler]
  (fn [{:keys [metabase-api-key], :as request} respond raise]
    (if (= (api-key) metabase-api-key)
      (handler request respond raise)
      ;; default response is 403
      (respond middleware.u/response-forbidden))))
