(ns metabase.api.routes.common
  "Shared helpers used by [[metabase.api-routes.core/routes]] as well as premium-only routes
  like [[metabase-enterprise.sandbox.api.routes/routes]]."
  (:require
   [clojure.string :as str]
   [metabase.api.open-api :as open-api]
   [metabase.api.response :as api.response]
   [metabase.api.settings :as api.settings]
   [metabase.util.i18n :refer [deferred-trs deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

;;; these use vars rather than plain functions so changes to the underlying functions get propagated during REPL usage.

(defn wrap-middleware-for-open-api-spec-generation
  "Wrap Ring middleware so the resulting function supports [[open-api/open-api-spec]]."
  [middleware]
  (fn [handler]
    (open-api/handler-with-open-api-spec
     (middleware handler)
     (fn [prefix]
       (open-api/open-api-spec handler prefix)))))

(defn- public-exceptions
  "Catch any exceptions other than 404 thrown in the request handler body and rethrow a generic 400 exception instead.
  This minimizes information available to bad actors when exceptions occur on public endpoints."
  [handler]
  (fn [request respond _raise]
    (let [raise (fn [e]
                  (log/warn e "Exception in API call")
                  (if (= 404 (:status-code (ex-data e)))
                    (respond {:status 404, :body (deferred-tru "Not found.")})
                    (respond {:status 400, :body (deferred-tru "An error occurred.")})))]
      (try
        (handler request respond raise)
        (catch Throwable e
          (raise e))))))

(defn message-only-exceptions
  "Catch any exceptions thrown in the request handler body and rethrow a 400 exception that only has the message from
  the original instead (i.e., don't rethrow the original stacktrace). This reduces the information available to bad
  actors but still provides some information that will prove useful in debugging errors."
  [handler]
  (fn [request respond _raise]
    (let [raise (fn [^Throwable e]
                  (log/error e "Exception in API call")
                  (respond {:status 400, :body (ex-message e)}))]
      (try
        (handler request respond raise)
        (catch Throwable e
          (raise e))))))

(def ^:private mb-api-key-doc-url
  "Url for documentation on how to set MB_API_KEY."
  "https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_api_key")

(def ^:private key-not-set-response
  "Response when the MB_API_KEY is not set."
  {:status 403
   :body (deferred-trs "MB_API_KEY is not set. See {0} for details" mb-api-key-doc-url)})

(defn- enforce-static-api-key
  "Middleware that enforces validation of the client via API Key, canceling the request processing if the check fails.

  Validation is handled by first checking for the presence of the `:static-metabase-api-key` on the request. If the
  api key is available then we validate it by checking it against the configured `:mb-api-key` value set in our global
  config.

  If the request `:static-metabase-api-key` matches the configured `api-key` value then the request continues,
  otherwise we reject the request and return a 403 Forbidden response.

  This variable only works for /api/notify/db/:id endpoint"
  [handler]
  (fn [{:keys [static-metabase-api-key], :as request} respond raise]
    (cond (str/blank? (api.settings/api-key))
          (respond key-not-set-response)

          (not static-metabase-api-key)
          (respond api.response/response-forbidden)

          (= (api.settings/api-key) static-metabase-api-key)
          (handler request respond raise)

          :else
          (respond api.response/response-forbidden))))

(mu/defn- enforce-authentication :- ifn?
  "Middleware that returns a 401 response if `request` has no associated `:metabase-user-id`."
  [handler :- ifn?]
  (fn [{:keys [metabase-user-id] :as request} respond raise]
    (if metabase-user-id
      (handler request respond raise)
      (respond api.response/response-unauthentic))))

(def ^{:arglists '([handler])} +public-exceptions
  "Wrap `routes` so any Exception except 404 thrown is just returned as a generic 400, to prevent details from leaking
  in public endpoints."
  (wrap-middleware-for-open-api-spec-generation public-exceptions))

(def ^{:arglists '([handler])} +message-only-exceptions
  "Wrap `routes` so any Exception thrown is just returned as a 400 with only the message from the original
  Exception (i.e., remove the original stacktrace), to prevent details from leaking in public endpoints."
  (wrap-middleware-for-open-api-spec-generation message-only-exceptions))

(def ^{:arglists '([handler])} +static-apikey
  "Wrap `routes` so they may only be accessed with a correct API key header."
  (wrap-middleware-for-open-api-spec-generation enforce-static-api-key))

(def ^{:arglists '([handler])} +auth
  "Wrap `routes` so they may only be accessed with proper authentication credentials."
  (wrap-middleware-for-open-api-spec-generation enforce-authentication))
