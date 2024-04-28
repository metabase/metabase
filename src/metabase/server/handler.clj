(ns metabase.server.handler
  "Top-level Metabase Ring handler."
  (:require
   [metabase.config :as config]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.browser-cookie :as mw.browser-cookie]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.middleware.json :as mw.json]
   [metabase.server.middleware.log :as mw.log]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.server.middleware.security :as mw.security]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.middleware.ssl :as mw.ssl]
   [metabase.server.routes :as routes]
   [metabase.util.log :as log]
   [ring.core.protocols :as ring.protocols]
   [ring.middleware.cookies :refer [wrap-cookies]]
   [ring.middleware.gzip :refer [wrap-gzip]]
   [ring.middleware.json :as ring.json]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.params :refer [wrap-params]]))

(extend-protocol ring.protocols/StreamableResponseBody
  ;; java.lang.Double, java.lang.Long, and java.lang.Boolean will be given a Content-Type of "application/json; charset=utf-8"
  ;; so they should be strings, and will be parsed into their respective values.
  java.lang.Number
  (write-body-to-stream [num response output-stream]
    (ring.protocols/write-body-to-stream (str num) response output-stream))

  java.lang.Boolean
  (write-body-to-stream [bool response output-stream]
    (ring.protocols/write-body-to-stream (str bool) response output-stream))

  clojure.lang.Keyword
  (write-body-to-stream [kkey response output-stream]
    (ring.protocols/write-body-to-stream
     (if-let  [key-ns (namespace kkey)]
       (str key-ns "/" (name kkey))
       (name kkey))
     response output-stream)))

(def ^:private middleware
  ;; ▼▼▼ POST-PROCESSING ▼▼▼ happens from TOP-TO-BOTTOM
  [#'mw.exceptions/catch-uncaught-exceptions    ; catch any Exceptions that weren't passed to `raise`
   #'mw.exceptions/catch-api-exceptions         ; catch exceptions and return them in our expected format
   #'mw.log/log-api-call
   #'mw.browser-cookie/ensure-browser-id-cookie ; add cookie to identify browser; add `:browser-id` to the request
   #'mw.security/add-security-headers           ; Add HTTP headers to API responses to prevent them from being cached
   #(ring.json/wrap-json-body % {:keywords? true}) ; extracts json POST body and makes it available on request
   #'mw.offset-paging/handle-paging             ; binds per-request parameters to handle paging
   #'mw.json/wrap-streamed-json-response        ; middleware to automatically serialize suitable objects as JSON in responses
   #'wrap-keyword-params                        ; converts string keys in :params to keyword keys
   #'wrap-params                                ; parses GET and POST params as :query-params/:form-params and both as :params
   #'mw.misc/maybe-set-site-url                 ; set the value of `site-url` if it hasn't been set yet
   #'mw.session/reset-session-timeout           ; Resets the timeout cookie for user activity to [[mw.session/session-timeout]]
   #'mw.session/bind-current-user               ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
   #'mw.session/wrap-current-user-info          ; looks for :metabase-session-id and sets :metabase-user-id and other info if Session ID is valid
   #'mw.session/wrap-session-id                 ; looks for a Metabase Session ID and assoc as :metabase-session-id
   #'mw.auth/wrap-static-api-key                ; looks for a static Metabase API Key on the request and assocs as :metabase-api-key
   #'wrap-cookies                               ; Parses cookies in the request map and assocs as :cookies
   #'mw.misc/add-content-type                   ; Adds a Content-Type header for any response that doesn't already have one
   #'mw.misc/disable-streaming-buffering        ; Add header to streaming (async) responses so ngnix doesn't buffer keepalive bytes
   #'wrap-gzip                                  ; GZIP response if client can handle it
   #'mw.misc/bind-request                       ; bind `metabase.middleware.misc/*request*` for the duration of the request
   #'mw.ssl/redirect-to-https-middleware])
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP

(defn- apply-middleware
  [handler]
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
    (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                               (log/infof "%s changed, rebuilding %s" varr #'app)
                               (alter-var-root #'app (constantly (apply-middleware routes/routes)))))))
