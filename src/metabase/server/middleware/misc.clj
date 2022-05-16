(ns metabase.server.middleware.misc
  "Misc Ring middleware."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            metabase.async.streaming-response
            [metabase.db :as mdb]
            [metabase.public-settings :as public-settings]
            [metabase.server.request.util :as request.u]
            [metabase.util.i18n :refer [trs]])
  (:import clojure.core.async.impl.channels.ManyToManyChannel
           metabase.async.streaming_response.StreamingResponse))

(comment metabase.async.streaming-response/keep-me)

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
             (if-not (request.u/api-call? request)
               respond
               (comp respond add-content-type*))
             raise)))

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

(def ^:dynamic *request*
  "The Ring request currently being handled by this thread, if any."
  nil)

(defn bind-request
  "Ring middleware that binds `*request*` for the duration of this Ring request."
  [handler]
  (fn [request respond raise]
    (binding [*request* request]
      (handler request respond raise))))
