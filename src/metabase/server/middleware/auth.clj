(ns metabase.server.middleware.auth
  "Middleware related to enforcing authentication/API keys (when applicable). Unlike most other middleware most of this
  is not used as part of the normal `app`; it is instead added selectively to appropriate routes.")

(def ^:private ^:const ^String static-metabase-api-key-header "x-metabase-apikey")

(defn- wrap-static-api-key* [{:keys [headers], :as request}]
  (if-let [api-key (headers static-metabase-api-key-header)]
    (assoc request :static-metabase-api-key api-key)
    request))

(defn wrap-static-api-key
  "Middleware that sets the `:static-metabase-api-key` keyword on the request if a valid API Key can be found. We check
  the request headers for `X-METABASE-APIKEY` and if it's not found then no keyword is bound to the request."
  [handler]
  (fn [request respond raise]
    (handler (wrap-static-api-key* request) respond raise)))
