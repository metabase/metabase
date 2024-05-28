(ns metabase.server.request.util
  "Utility functions for Ring requests."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [user-agent :as user-agent])
  (:import
   (java.time ZoneId)))

(set! *warn-on-reflection* true)

(defn api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (str/starts-with? uri "/api"))

(defn public?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/public/.*$" uri))

(defn embed?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/embed/.*$" uri))

(defn cacheable?
  "Can the ring request be permanently cached?"
  [{:keys [request-method uri], :as _request}]
  (and (= request-method :get)
       (or
        ;; match requests that are js/css and have a cache-busting hex string
        (re-matches #"^/app/dist/.+\.[a-f0-9]{20}\.(js|css)$" uri)
        ;; any resource that is named as a cache-busting hex string (e.g. fonts, images)
        (re-matches #"^/app/dist/[a-f0-9]{20}.*$" uri))))

(defn https?
  "True if the original request made by the frontend client (i.e., browser) was made over HTTPS.

  In many production instances, a reverse proxy such as an ELB or nginx will handle SSL termination, and the actual
  request handled by Jetty will be over HTTP."
  [{{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https origin]} :headers
    :keys                                                                                                [scheme]}]
  (cond
    ;; If `X-Forwarded-Proto` is present use that. There are several alternate headers that mean the same thing. See
    ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
    (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
    (= "https" (u/lower-case-en (or x-forwarded-proto x-forwarded-protocol x-url-scheme)))

    ;; If none of those headers are present, look for presence of `X-Forwarded-Ssl` or `Frontend-End-Https`, which
    ;; will be set to `on` if the original request was over HTTPS.
    (or x-forwarded-ssl front-end-https)
    (= "on" (u/lower-case-en (or x-forwarded-ssl front-end-https)))

    ;; If none of the above are present, we are most not likely being accessed over a reverse proxy. Still, there's a
    ;; good chance `Origin` will be present because it should be sent with `POST` requests, and most auth requests are
    ;; `POST`. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
    origin
    (str/starts-with? (u/lower-case-en origin) "https")

    ;; Last but not least, if none of the above are set (meaning there are no proxy servers such as ELBs or nginx in
    ;; front of us), we can look directly at the scheme of the request sent to Jetty.
    scheme
    (= scheme :https)))

(defn embedded?
  "Whether this frontend client that made this request is embedded inside an `<iframe>`."
  [request]
  (some-> request (get-in [:headers "x-metabase-embedded"]) Boolean/parseBoolean))

(defn ip-address
  "The IP address a Ring `request` came from. Looks at the `public-settings/source-address-header` header (by default
  `X-Forwarded-For`, or the `(:remote-addr request)` if not set."
  [{:keys [headers remote-addr]}]
  (some-> (or (some->> (public-settings/source-address-header) (get headers))
              remote-addr)
          ;; first IP (if there are multiple) is the actual client -- see
          ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For
          (str/split #"\s*,\s*")
          first
          ;; strip out non-ip-address characters like square brackets which we get sometimes
          (str/replace #"[^0-9a-fA-F.:]" "")))

(def DeviceInfo
  "Schema for the device info returned by `device-info`."
  [:map {:closed true}
   [:device_id          ms/NonBlankString]
   [:device_description ms/NonBlankString]
   [:ip_address         ms/NonBlankString]])

(mu/defn device-info :- DeviceInfo
  "Information about the device that made this request, as recorded by the `LoginHistory` table."
  [{{:strs [user-agent]} :headers, :keys [browser-id], :as request}]
  (let [id          (or browser-id
                        (log/warn "Login request is missing device ID information"))
        description (or user-agent
                        (log/warn "Login request is missing user-agent information"))
        ip-address  (or (ip-address request)
                        (log/warn "Unable to determine login request IP address"))]
    (when-not (and id description ip-address)
      (log/warn "Error determining login history for request"))
    {:device_id          (or id (trs "unknown"))
     :device_description (or description (trs "unknown"))
     :ip_address         (or ip-address (trs "unknown"))}))

(defn describe-user-agent
  "Format a user-agent string from a request in a human-friendly way."
  [user-agent-string]
  (when-not (str/blank? user-agent-string)
    (when-let [{device-type     :type-name
                {os-name :name} :os
                browser-name    :name} (some-> user-agent-string user-agent/parse not-empty)]
      (let [non-blank    (fn [s]
                           (when-not (str/blank? s)
                             s))
            device-type  (or (non-blank device-type)
                             (tru "Unknown device type"))
            os-name      (or (non-blank os-name)
                             (tru "Unknown OS"))
            browser-name (or (non-blank browser-name)
                             (tru "Unknown browser"))]
        (format "%s (%s/%s)" device-type browser-name os-name)))))

(defn- describe-location [{:keys [city region country]}]
  (when-let [info (not-empty (remove str/blank? [city region country]))]
    (str/join ", " info)))

(def ^:private gecode-ip-address-timeout-ms
  "Max amount of time to wait for a IP address geocoding request to complete. We send emails on the first login from a
  new device using this information, so the timeout has to be fairly short in case the request is hanging for one
  reason or another."
  5000)

(def ^:private IPAddress->Info
  [:map-of
   [:and {:error/message "valid IP address string"}
    ms/NonBlankString [:fn u/ip-address?]]
   [:map {:closed true}
    [:description ms/NonBlankString]
    [:timezone    [:maybe (ms/InstanceOfClass ZoneId)]]]])

;; TODO -- replace with something better, like built-in database once we find one that's GPL compatible
;; issue: https://github.com/metabase/metabase/issues/39352
(mu/defn geocode-ip-addresses :- [:maybe IPAddress->Info]
  "Geocode multiple IP addresses, returning a map of IP address -> info, with each info map containing human-friendly
  `:description` of the location and a `java.time.ZoneId` `:timezone`, if that information is available."
  [ip-addresses :- [:maybe [:sequential :string]]]
  (let [ip-addresses (set (filter u/ip-address? ip-addresses))]
    (when (seq ip-addresses)
      (let [url (str "https://get.geojs.io/v1/ip/geo.json?ip=" (str/join "," ip-addresses))]
        (try
         (let [response (-> (http/get url {:headers            {"User-Agent" config/mb-app-id-string}
                                           :socket-timeout     gecode-ip-address-timeout-ms
                                           :connection-timeout gecode-ip-address-timeout-ms})
                            :body
                            (json/parse-string true))]
           (into {} (for [info response]
                      [(:ip info) {:description (or (describe-location info)
                                                    "Unknown location")
                                   :timezone    (u/ignore-exceptions (some-> (:timezone info) t/zone-id))}])))
         (catch Throwable e
           (log/error e "Error geocoding IP addresses" {:url url})
           nil))))))

(def response-unauthentic
  "Generic `401 (Unauthenticated)` Ring response map."
  {:status 401, :body "Unauthenticated"})

(def response-forbidden
  "Generic `403 (Forbidden)` Ring response map."
  {:status 403, :body "Forbidden"})
