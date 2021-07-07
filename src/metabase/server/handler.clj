(ns metabase.server.handler
  "Top-level Metabase Ring handler."
  (:require [metabase.config :as config]
            [metabase.plugins.classloader :as classloader]
            [metabase.server.middleware.auth :as mw.auth]
            [metabase.server.middleware.browser-cookie :as mw.browser]
            [metabase.server.middleware.exceptions :as mw.exceptions]
            [metabase.server.middleware.json :as mw.json]
            [metabase.server.middleware.log :as mw.log]
            [metabase.server.middleware.misc :as mw.misc]
            [metabase.server.middleware.offset-paging :as mw.offset-paging]
            [metabase.server.middleware.security :as mw.security]
            [metabase.server.middleware.session :as mw.session]
            [metabase.server.middleware.ssl :as mw.ssl]
            [metabase.server.routes :as routes]
            [ring.middleware.cookies :refer [wrap-cookies]]
            [ring.middleware.gzip :refer [wrap-gzip]]
            [ring.middleware.keyword-params :refer [wrap-keyword-params]]
            [ring.middleware.params :refer [wrap-params]]))

;; required here because this namespace is not actually used anywhere but we need it to be loaded because it adds
;; impls for handling `core.async` channels as web server responses
(classloader/require 'metabase.async.api-response)

(def ^:private middleware
  ;; ▼▼▼ POST-PROCESSING ▼▼▼ happens from TOP-TO-BOTTOM
  [#'mw.exceptions/catch-uncaught-exceptions ; catch any Exceptions that weren't passed to `raise`
   #'mw.exceptions/catch-api-exceptions      ; catch exceptions and return them in our expected format
   #'mw.log/log-api-call
   #'mw.browser/ensure-browser-id-cookie     ; add cookie to identify browser; add `:browser-id` to the request
   #'mw.security/add-security-headers        ; Add HTTP headers to API responses to prevent them from being cached
   #'mw.json/wrap-json-body                  ; extracts json POST body and makes it avaliable on request
   #'mw.json/wrap-streamed-json-response     ; middleware to automatically serialize suitable objects as JSON in responses
   #'mw.offset-paging/handle-paging          ; binds per-request parameters to handle paging
   #'wrap-keyword-params                     ; converts string keys in :params to keyword keys
   #'wrap-params                             ; parses GET and POST params as :query-params/:form-params and both as :params
   #'mw.misc/maybe-set-site-url              ; set the value of `site-url` if it hasn't been set yet
   #'mw.session/bind-current-user            ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
   #'mw.session/wrap-current-user-info       ; looks for :metabase-session-id and sets :metabase-user-id and other info if Session ID is valid
   #'mw.session/wrap-session-id              ; looks for a Metabase Session ID and assoc as :metabase-session-id
   #'mw.auth/wrap-api-key                    ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
   #'wrap-cookies                            ; Parses cookies in the request map and assocs as :cookies
   #'mw.misc/add-content-type                ; Adds a Content-Type header for any response that doesn't already have one
   #'mw.misc/disable-streaming-buffering     ; Add header to streaming (async) responses so ngnix doesn't buffer keepalive bytes
   #'wrap-gzip                               ; GZIP response if client can handle it
   #'mw.misc/bind-request                    ; bind `metabase.middleware.misc/*request*` for the duration of the request
   #'mw.ssl/redirect-to-https-middleware])
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP

(defn- apply-middleware [handler]
  (reduce
   (fn [handler middleware-fn]
     (middleware-fn handler))
   handler
   middleware))

(def app
  "The primary entry point to the Ring HTTP server."
  (apply-middleware routes/routes))

;; during interactive dev, recreate `app` whenever a middleware var or `routes/routes` changes.
(when config/is-dev?
  (doseq [varr  (cons #'routes/routes middleware)
          :when (instance? clojure.lang.IRef varr)]
    (add-watch varr ::reload (fn [_ _ _ _]
                               (printf "%s changed, rebuilding %s" varr #'app)
                               (alter-var-root #'app (constantly (apply-middleware routes/routes)))))))
