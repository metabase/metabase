(ns metabase.middleware.misc
  "Misc Ring middleware."
  (:require [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [public-settings :as public-settings]]
            [metabase.middleware.util :as middleware.u]
            [metabase.util.i18n :refer [trs]]
            [puppetlabs.i18n.core :as puppet-i18n])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(defn- add-content-type* [request response]
  (update-in
   response
   [:headers "Content-Type"]
   (fn [content-type]
     (or content-type
         (when (middleware.u/api-call? request)
           (if (string? (:body response))
             "text/plain"
             "application/json; charset=utf-8"))))))

(defn add-content-type
  "Add an appropriate Content-Type header to response if it doesn't already have one. Most responses should already
  have one, so this is a fallback for ones that for one reason or another do not."
  [handler]
  (fn [request respond raise]
    (handler
     request
     (comp respond (partial add-content-type* request))
     raise)))


;;; ------------------------------------------------ SETTING SITE-URL ------------------------------------------------

;; It's important for us to know what the site URL is for things like returning links, etc. this is stored in the
;; `site-url` Setting; we can set it automatically by looking at the `Origin` or `Host` headers sent with a request.
;; Effectively the very first API request that gets sent to us (usually some sort of setup request) ends up setting
;; the (initial) value of `site-url`

(defn- maybe-set-site-url* [{{:strs [origin host] :as headers} :headers, :as request}]
  (when (mdb/db-is-setup?)
    (when-not (public-settings/site-url)
      (when-let [site-url (or origin host)]
        (log/info (trs "Setting Metabase site URL to {0}" site-url))
        (try
          (public-settings/site-url site-url)
          (catch Throwable e
            (log/warn e (trs "Failed to set site-url"))))))))

(defn maybe-set-site-url
  "Middleware to set the `site-url` Setting if it's unset the first time a request is made."
  [handler]
  (fn [request respond raise]
    (maybe-set-site-url* request)
    (handler request respond raise)))


;;; ------------------------------------------------------ i18n ------------------------------------------------------

(defn bind-user-locale
  "Middleware that binds locale info for the current User. (This is basically a copy of the
  `puppetlabs.i18n.core/locale-negotiator`, but reworked to handle async-style requests as well.)"
  ;; TODO - We should really just fork puppet i18n and put these changes there, or PR
  [handler]
  (fn [request respond raise]
    (let [headers    (:headers request)
          parsed     (puppet-i18n/parse-http-accept-header (get headers "accept-language"))
          wanted     (mapv first parsed)
          negotiated ^java.util.Locale (puppet-i18n/negotiate-locale wanted (puppet-i18n/available-locales))]
      (puppet-i18n/with-user-locale negotiated
        (handler request respond raise)))))


;;; ------------------------------------------ Disable Streaming Buffering -------------------------------------------

(defn- maybe-add-disable-buffering-header [{:keys [body], :as response}]
  (cond-> response
    (instance? ManyToManyChannel body)
    (assoc-in [:headers "X-Accel-Buffering"] "no")))

(defn disable-streaming-buffering
  "Tell nginx not to batch streaming responses -- otherwise the keepalive bytes aren't written and
  the entire purpose is defeated. See https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_cache"
  [handler]
  (fn [request respond raise]
    (handler
     request
     (comp respond maybe-add-disable-buffering-header)
     raise)))
