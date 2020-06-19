(ns metabase.middleware.ssl
  "Middleware for redirecting users to HTTPS sessions"
  (:require [clojure.string :as str]
            [metabase.middleware.session :as mw.session]
            [metabase.public-settings :as public-settings]
            [ring.util
             [request :as req]
             [response :as resp]]))

(def no-redirect-https-uris
  "The set of URLs that should not be forced to redirect to their HTTPS equivalents"
  #{"/api/health"})

(defn- get-request? [{method :request-method}]
  (or (= method :head)
      (= method :get)))

(defn- https-url [url-string]
  (let [url (java.net.URL. url-string)
        site-url (java.net.URL. (public-settings/site-url))]
    (str (java.net.URL. "https" (.getHost site-url) (.getPort site-url) (.getFile url)))))

(defn- ssl-redirect-response
  "Given a HTTP request, return a redirect response to the equivalent HTTPS URL."
  [request]
  (-> (resp/redirect (https-url (req/request-url request)))
      (resp/status   (if (get-request? request) 301 307))))

(defn redirect-to-https-middleware
  "Redirect users to HTTPS sessions when certain conditions are met.
   See `no-redirect-https-uris` for URIs excluded from https redirects."
  [handler]
  (fn [request respond raise]
    (cond
      (str/blank? (public-settings/site-url))
      (handler request respond raise)

      (not (str/starts-with? (public-settings/site-url) "https:"))
      (handler request respond raise)

      (no-redirect-https-uris (:uri request))
      (handler request respond raise)

      (and
       (public-settings/redirect-all-requests-to-https)
       (not (mw.session/https-request? request)))
      (respond (ssl-redirect-response request))

      :else (handler request respond raise))))
