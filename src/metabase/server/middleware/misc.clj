(ns metabase.server.middleware.misc
  "Misc Ring middleware."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.server.streaming-response]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (clojure.core.async.impl.channels ManyToManyChannel)
   (metabase.server.streaming_response StreamingResponse)))

(comment metabase.server.streaming-response/keep-me)

(defn- add-version*
  "Assoc the `x-metabase-version` header onto the response."
  [response]
  (assoc-in response
            [:headers "x-metabase-version"]
            (:tag config/mb-version-info)))

(defn add-version
  "Middleware that adds an `x-metabase-version` header (from `:tag mb-version-info`)
   to all API-call responses. Non-API calls are left untouched."
  [handler]
  (fn [request respond raise]
    (handler request
             (if-not (request/api-call? request)
               respond
               (comp respond add-version*))
             raise)))

(defn- add-content-type* [{:keys [body], {:strs [Content-Type]} :headers, :as response}]
  (cond-> response
    (not Content-Type)
    (assoc-in [:headers "Content-Type"] (if (string? body)
                                          "text/plain"
                                          "application/json; charset=utf-8"))))

(defn add-content-type
  "Add an appropriate Content-Type header to response if it doesn't already have one. Most responses should already
  have one, so this is a fallback for ones that for one reason or another do not."
  [handler]
  (fn [request respond raise]
    (handler request
             (if-not (or (request/api-call? request) (request/auth-call? request))
               respond
               (comp respond add-content-type*))
             raise)))

;;; ------------------------------------------------ SETTING SITE-URL ------------------------------------------------

;; It's important for us to know what the site URL is for things like returning links, etc. this is stored in the
;; `site-url` Setting; we can set it automatically by looking at the `Origin`, `X-Forwarded-Host`, or `Host` headers
;; sent with a request.
;;
;; Effectively the very first API request that gets sent to us (usually some sort of setup request) ends up setting
;; the (initial) value of `site-url`
(defn- forwarded-scheme
  "The scheme a TLS-terminating proxy used to reach us, inferred from the same forwarded headers as [[u/https?]]."
  [{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https]}]
  ;; Proto-style headers carry the scheme directly. Take the first hop of a comma-separated chain (`https, http`)
  ;; and lower-case it: URL schemes are case-insensitive (RFC 3986) but normalize-site-url's "http" prefix check
  ;; is not, so `HTTPS` would be mangled as scheme-less. Normalize first and branch on the result so a blank
  ;; proto header (e.g. `X-Forwarded-Proto: ""`) falls through to the boolean-style HTTPS indicators below.
  (or (some-> (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
              (str/split #",") first str/trim not-empty u/lower-case-en)
      ;; Boolean-style headers are `on` when the original request was HTTPS.
      (when-let [ssl (or x-forwarded-ssl front-end-https)]
        (when (= "on" (u/lower-case-en ssl)) "https"))))

(defn- maybe-set-site-url* [{headers :headers, uri :uri}]
  (let [{:strs [origin x-forwarded-host host user-agent]} headers]
    (when (and (mdb/db-is-set-up?)
               (not (system/site-url))
               (not (#{"/api/health" "/livez" "/readyz"} uri))
               (or (nil? user-agent) ((complement str/includes?) user-agent "HealthChecker")))
      ;; `origin` already carries a scheme; the `*-host` headers normally don't, so prepend the scheme the proxy
      ;; terminated TLS with -- otherwise `normalize-site-url` defaults to `http://` and a TLS-terminating proxy ends
      ;; up advertising `http://` auth/discovery URLs over an `https` origin, breaking MCP OAuth (BOT-1617). Only
      ;; prepend when the host is scheme-less; a scheme-bearing host passes through untouched.
      (when-let [site-url (or origin
                              (when-let [host (or x-forwarded-host host)]
                                (if-let [scheme (and (not (str/includes? host "://"))
                                                     (forwarded-scheme headers))]
                                  (str scheme "://" host)
                                  host)))]
        (log/infof "Setting Metabase site URL to %s" site-url)
        (try
          (system/site-url! site-url)
          (catch Throwable e
            (log/warn e "Failed to set site-url")))))))

(defn maybe-set-site-url
  "Middleware to set the `site-url` setting on the initial setup request"
  [handler]
  (fn [request respond raise]
    (maybe-set-site-url* request)
    (handler request respond raise)))

;;; ------------------------------------------ Disable Streaming Buffering -------------------------------------------

(defn- maybe-add-disable-buffering-header [{:keys [body], :as response}]
  (cond-> response
    (or (instance? StreamingResponse body)
        (instance? ManyToManyChannel body))
    (assoc-in [:headers "X-Accel-Buffering"] "no")))

(defn disable-streaming-buffering
  "Tell nginx not to batch streaming responses -- otherwise load balancers are liable to cancel our request prematurely
  if they aren't configured for longer timeouts. See
  https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache"
  [handler]
  (fn [request respond raise]
    (handler
     request
     (comp respond maybe-add-disable-buffering-header)
     raise)))

;;; -------------------------------------------------- Bind request --------------------------------------------------

(defn bind-request
  "Ring middleware that binds `*request*` for the duration of this Ring request."
  [handler]
  (fn [request respond raise]
    (request/with-current-request request
      (handler request respond raise))))
