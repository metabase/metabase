(ns metabase.server.handler
  "Top-level Metabase Ring handler."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.macros :as api.macros]
   [metabase.config.core :as config]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.browser-cookie :as mw.browser-cookie]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.middleware.json :as mw.json]
   [metabase.server.middleware.log :as mw.log]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.server.middleware.request-id :as mw.request-id]
   [metabase.server.middleware.security :as mw.security]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.middleware.ssl :as mw.ssl]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [ring.core.protocols :as ring.protocols]
   [ring.middleware.cookies :refer [wrap-cookies]]
   [ring.middleware.gzip :refer [wrap-gzip]]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.params :refer [wrap-params]]))

;; TODO: this needed?
(comment analytics/keep-me)

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

(def wrap-reload-dev-mw
  "In dev, reload files on the fly if they've changed. Returns nil in prod."
  (when-let [wrap-reload (try (and
                               config/is-dev?
                               (not *compile-files*)
                               ;; `*enable-wrap-reload*` is set to true `dev.clj` when the `--hot-reload` flag is passed to the :dev-start alias
                               (true? @(requiring-resolve 'user/*enable-hot-reload*))
                               ;; this middleware is only available in dev
                               (requiring-resolve 'ring.middleware.reload/wrap-reload))
                              (catch Exception _ nil))]
    wrap-reload))

(def ^:private middleware
  ;; ▼▼▼ POST-PROCESSING ▼▼▼ happens from TOP-TO-BOTTOM
  (->> [#'mw.exceptions/catch-uncaught-exceptions    ; catch any Exceptions that weren't passed to `raise`
        #'mw.exceptions/catch-api-exceptions         ; catch exceptions and return them in our expected format
        #'mw.log/log-api-call                        ; log info about the request, db call counts etc.
        #'mw.browser-cookie/ensure-browser-id-cookie ; add cookie to identify browser; add `:browser-id` to the request
        #'mw.security/add-security-headers           ; Add HTTP headers to API responses to prevent them from being cached
        #'mw.json/wrap-json-body                     ; extracts json POST/PUT body and makes it available on request
        #'mw.offset-paging/handle-paging             ; binds per-request parameters to handle paging
        #'mw.json/wrap-streamed-json-response        ; middleware to automatically serialize suitable objects as JSON in responses
        #'wrap-keyword-params                        ; converts string keys in :params to keyword keys
        #'wrap-params                                ; parses GET and POST params as :query-params/:form-params and both as :params
        #'mw.misc/maybe-set-site-url                 ; set the value of `site-url` if it hasn't been set yet
        #'mw.session/reset-session-timeout           ; Resets the timeout cookie for user activity to [[metabase.request.cookies/session-timeout]]
        #'mw.session/bind-current-user               ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
        #'mw.session/wrap-current-user-info          ; looks for :metabase-session-key and sets :metabase-user-id and other info if Session ID is valid
        #'analytics/embedding-mw                     ; reads sdk client headers, binds them to *client* and *version*, and tracks sdk-response metrics
        #'mw.session/wrap-session-key                ; looks for a Metabase Session ID and assoc as :metabase-session-key
        #'mw.auth/wrap-static-api-key                ; looks for a static Metabase API Key on the request and assocs as :metabase-api-key
        #'wrap-cookies                               ; Parses cookies in the request map and assocs as :cookies
        #'mw.misc/add-content-type                   ; Adds a Content-Type header for any response that doesn't already have one
        #'mw.misc/disable-streaming-buffering        ; Add header to streaming (async) responses so ngnix doesn't buffer keepalive bytes
        #'wrap-gzip                                  ; GZIP response if client can handle it
        #'mw.request-id/wrap-request-id              ; Add a unique request ID to the request
        #'mw.misc/bind-request                       ; bind `metabase.middleware.misc/*request*` for the duration of the request
        #'mw.ssl/redirect-to-https-middleware
        wrap-reload-dev-mw]
       (remove nil?)))
;; ▲▲▲ PRE-PROCESSING ▲▲▲ happens from BOTTOM-TO-TOP

(mu/defn- apply-middleware :- ::api.macros/handler
  [handler :- ::api.macros/handler]
  (reduce
   (fn [handler middleware-fn]
     (middleware-fn handler))
   handler
   middleware))

;;; for interactive dev we'll create a handler that rebuilds itself (reapplies the middleware) whenever any of it
;;; changes.
(mu/defn- dev-handler :- ::api.macros/handler
  [server-routes :- ::api.macros/handler]
  (let [handler (atom (apply-middleware server-routes))]
    (doseq [varr  middleware
            :when (instance? clojure.lang.IRef varr)]
      (add-watch varr ::reload (fn [_key _ref _old-state _new-state]
                                 (log/infof "%s changed, rebuilding handler" varr)
                                 (reset! handler (apply-middleware server-routes)))))
    (fn dev-handler* [request respond raise]
      (@handler request respond raise))))

(mu/defn make-handler :- ::api.macros/handler
  "Create the primary entry point to the Ring HTTP server."
  [server-routes :- ::api.macros/handler]
  (if config/is-dev?
    (dev-handler server-routes)
    (apply-middleware server-routes)))
