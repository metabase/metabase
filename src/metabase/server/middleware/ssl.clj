(ns metabase.server.middleware.ssl
  "Middleware for redirecting users to HTTPS sessions"
  (:require
   [clojure.string :as str]
   [metabase.request.core :as request]
   [metabase.server.settings :as server.settings]
   [metabase.system.core :as system]
   [ring.util.request :as req]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def no-redirect-https-uris
  "The set of URLs that should not be forced to redirect to their HTTPS equivalents"
  #{"/api/health" "/livez" "/readyz"})

(defn- get-request? [{method :request-method}]
  (or (= method :head)
      (= method :get)))

(defn- https-url [url-string]
  (let [url (java.net.URL. url-string)
        site-url (java.net.URL. (system/site-url))]
    (str (java.net.URL. "https" (.getHost site-url) (.getPort site-url) (.getFile url)))))

(defn- ssl-redirect-response
  "Given a HTTP request, return a redirect response to the equivalent HTTPS URL."
  [request]
  (-> (response/redirect (https-url (req/request-url request)))
      (response/status   (if (get-request? request) 301 307))))

(defn redirect-to-https-middleware
  "Redirect users to HTTPS sessions when certain conditions are met.
   See `no-redirect-https-uris` for URIs excluded from https redirects."
  [handler]
  (fn [request respond raise]
    (cond
      (str/blank? (system/site-url))
      (handler request respond raise)

      (not (str/starts-with? (system/site-url) "https:"))
      (handler request respond raise)

      (no-redirect-https-uris (:uri request))
      (handler request respond raise)

      (and
       (server.settings/redirect-all-requests-to-https)
       (not (request/https? request)))
      (respond (ssl-redirect-response request))

      :else (handler request respond raise))))
