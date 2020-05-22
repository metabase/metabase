(ns metabase.middleware.misc
  "Misc Ring middleware."
  (:require [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [public-settings :as public-settings]]
            [metabase.api.common :as api]
            metabase.async.streaming-response
            [metabase.middleware.util :as middleware.u]
            [metabase.util.i18n :refer [trs]])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           metabase.async.streaming_response.StreamingResponse))

(comment metabase.async.streaming-response/keep-me)

(defn- add-content-type* [request {:keys [body], {:strs [Content-Type]} :headers, :as response}]
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
             (if-not (middleware.u/api-call? request)
               respond
               (comp respond (partial add-content-type* request)))
             raise)))


;;; ------------------------------------------------ SETTING SITE-URL ------------------------------------------------

;; It's important for us to know what the site URL is for things like returning links, etc. this is stored in the
;; `site-url` Setting; we can set it automatically by looking at the `Origin`, `X-Forwarded-Host`, or `Host` headers
;; sent with a request.
;;
;; Effectively the very first API request that gets sent to us (usually some sort of setup request) ends up setting
;; the (initial) value of `site-url`
(defn- maybe-set-site-url* [{{:strs [origin x-forwarded-host host] :as headers} :headers, :as request}]
  (when (and (mdb/db-is-setup?)
             (not (public-settings/site-url))
             api/*current-user*)
    (when-let [site-url (or origin x-forwarded-host host)]
      (log/info (trs "Setting Metabase site URL to {0}" site-url))
      (try
        (public-settings/site-url site-url)
        (catch Throwable e
          (log/warn e (trs "Failed to set site-url")))))))

(defn maybe-set-site-url
  "Middleware to set the `site-url` Setting if it's unset the first time a request is made."
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
