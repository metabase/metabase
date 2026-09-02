(ns metabase.request.util
  "Utility functions for HTTP (Ring) requests, and for getting device/location info from `User-Agent`/IP Address, etc."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.config.core :as config]
   [metabase.embedding.util :as embed.util]
   [metabase.request.settings :as request.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.json :as json]
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
        (re-matches #"^/app/dist/.+\.[a-f0-9]+\.(js|css)$" uri)
        ;; any resource that is named as a cache-busting hex string (e.g. images)
        (re-matches #"^/app/dist/[a-f0-9]+.*$" uri)
        ;; font files are static and should be cached
        (re-matches #"^/app/fonts/.+\.(woff2?|ttf|otf|eot)$" uri))))

(defn https-state
  "Whether the request the frontend client (i.e., browser) made reached us over HTTPS:

    `:https`   - it did: a TLS-terminating proxy said so, or the connection to us is itself TLS
    `:http`    - it did not
    `:unknown` - nothing states the transport. Only the client's `Origin` suggests HTTPS, and the client chooses that
                 freely; it names the page that issued the request rather than the transport the request arrived on.
                 It is still worth something -- a proxy that terminates TLS but strips the forwarded headers leaves
                 exactly this trace -- so callers decide what to make of it rather than being handed a `true` or a
                 `false` that hides the ambiguity. Treat `:unknown` as HTTPS when deciding whether to *add* protection
                 (marking a cookie `Secure`, say) -- doing that on a request that turns out to be plaintext costs
                 nothing. Require `:https` when deciding whether to *skip* a protection, so the client cannot opt out
                 by asserting an `Origin`.

  In many production instances, a reverse proxy such as an ELB or nginx handles SSL termination, so the request Jetty
  sees is plain HTTP and only the forwarded headers carry the original scheme."
  [{{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https origin]} :headers
    :keys                                                                                                [scheme]}]
  (let [proto (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
        ssl   (or x-forwarded-ssl front-end-https)]
    (cond
      ;; A proxy told us the scheme directly. Several alternate headers mean the same thing, see
      ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
      proto             (if (= "https" (u/lower-case-en proto)) :https :http)
      ;; `X-Forwarded-Ssl`/`Front-End-Https` are `on` when the original request was HTTPS.
      ssl               (if (= "on" (u/lower-case-en ssl)) :https :http)
      ;; No proxy in front of us: the connection we answered is the one the client made.
      (= scheme :https) :https
      ;; Plain HTTP to us, but the client says its page was HTTPS. See `:unknown` above.
      (and origin (str/starts-with? (u/lower-case-en origin) "https")) :unknown
      :else             :http)))

(defn embedded?
  "Whether this frontend client that made this request is embedded inside an `<iframe>`."
  [request]
  (some-> request (get-in [:headers "x-metabase-embedded"]) Boolean/parseBoolean))

(defn ip-address
  "The IP address a Ring `request` came from. Looks at the `request.settings/source-address-header` header (by default
  `X-Forwarded-For`, or the `(:remote-addr request)` if not set, or if disabled via MB_NOT_BEHIND_PROXY=true."
  [{:keys [headers remote-addr]}]
  (let [header-ip-address (some->> (request.settings/source-address-header)
                                   (get headers))
        source-address    (if (or (request.settings/not-behind-proxy)
                                  (not header-ip-address))
                            remote-addr
                            header-ip-address)]
    (some-> source-address
            (str/split #"\s*,\s*")
            ;; last entry is our own proxy's, the only hop we can trust -- everything earlier,
            ;; including the "first" entry conventionally called the client, is attacker-suppliable
            ;;. Assumes a single trusted hop.
            last
            ;; strip out non-ip-address characters like square brackets which we get sometimes
            (str/replace #"[^0-9a-fA-F.:]" ""))))

(def DeviceInfo
  "Schema for the device info returned by `device-info`."
  [:map {:closed true}
   [:device_id          ms/NonBlankString]
   [:device_description ms/NonBlankString]
   [:embedded           ms/BooleanValue]
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
     :device_description (or description (trs "unknown")),
     :embedded           (embed.util/is-modular-embedding-request? request)
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
                             json/decode+kw)
                result (into {} (for [info response]
                                  [(:ip info) {:description (or (describe-location info)
                                                                "Unknown location")
                                               :timezone    (u/ignore-exceptions (some-> (:timezone info) t/zone-id))}]))]
            (analytics/inc! :metabase-geocoding/requests)
            result)
          (catch Throwable e
            (analytics/inc! :metabase-geocoding/errors)
            (log/error e "Error geocoding IP addresses" {:url url})
            nil))))))
