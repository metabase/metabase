(ns metabase.middleware.ssl
  "Middleware for redirecting users to HTTPS sessions"
  (:require [metabase.middleware.session :as mw.session]
            [metabase.public-settings :as public-settings]
            [ring.middleware.ssl :refer [ssl-redirect-response]]))

(def no-redirect-https-uris
  "The set of URLs that should not be forced to redirect to their HTTPS equivalents"
  #{"/api/health"})

(defn redirect-to-https-middleware
  "Redirect users to HTTPS sessions when certain conditions are met.
   See `no-redirect-https-uris` for URIs excluded from https redirects."
  [handler]
  (fn [request respond raise]
    (cond
      (no-redirect-https-uris (:uri request))
      (handler request respond raise)

      (and
       (public-settings/redirect-all-requests-to-https)
       (not (mw.session/https-request? request)))
      (respond (ssl-redirect-response request {:ssl-port (public-settings/https-port)}))

      :else (handler request respond raise))))
