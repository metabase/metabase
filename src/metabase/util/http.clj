(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (com.google.common.net InetAddresses)
   (java.net Inet6Address InetAddress URI URL)))

(set! *warn-on-reflection* true)

(defn- parse-http-headers [headers]
  (json/decode headers))

(defn ^:dynamic *fetch-as-json*
  "Fetches url and parses body as json, returning it."
  [url headers]
  (let [headers (cond-> headers
                  (string? headers) parse-http-headers)
        response (http/get url (m/assoc-some {:as :json} :headers headers))]
    (:body response)))

(def ^:private invalid-hosts
  #{"metadata.google.internal"}) ; internal metadata for GCP

(defn valid-host?
  "Check whether url is valid based on the given strategy:
   :external-only - only external hosts
   :allow-private - external + private networks but not localhost/loopback
   :allow-all - no restrictions"
  [strategy url]
  (case strategy
    :allow-all true
    ;; For both :external-only and :allow-private, we need to check the host
    (let [^URL url   (if (string? url) (URL. url) url)
          host       (.getHost url)
          host-name  (InetAddress/getByName host)]
      (and
       (not (contains? invalid-hosts host))
       (not (.isLinkLocalAddress host-name))
       (not (.isLoopbackAddress host-name))
       ;; Only block site-local (private) addresses for :external-only
       (or (= strategy :allow-private)
           (not (.isSiteLocalAddress host-name)))))))

(defn public-address?
  "True only for globally-routable unicast IP addresses (rejects loopback, link-local, site-local,
  any-local, multicast, IPv6 unique-local fc00::/7, IPv4 CGNAT 100.64.0.0/10, IPv4 \"this network\"
  0.0.0.0/8, and IPv4 reserved 240.0.0.0/4 -- which includes the 255.255.255.255 broadcast address)."
  [^InetAddress addr]
  (let [b     (.getAddress addr)
        ipv4? (= 4 (alength b))
        b0    (bit-and (aget b 0) 0xff)]
    (not (or (.isLoopbackAddress addr)
             (.isLinkLocalAddress addr)
             (.isSiteLocalAddress addr)
             (.isAnyLocalAddress addr)
             (.isMulticastAddress addr)
             (and (instance? Inet6Address addr)              ; IPv6 unique-local fc00::/7
                  (= 0xfc (bit-and (aget b 0) 0xfe)))
             (and ipv4?                                      ; IPv4 CGNAT 100.64.0.0/10
                  (= 100 b0)
                  (<= 64 (bit-and (aget b 1) 0xff) 127))
             (and ipv4? (zero? b0))                          ; IPv4 "this network" 0.0.0.0/8
             (and ipv4? (<= 240 b0))))))                     ; IPv4 reserved 240.0.0.0/4 + broadcast

(defn- private-address?
  "True for addresses that are private but may be intentionally reachable from a self-hosted deployment."
  [^InetAddress addr]
  (let [b     (.getAddress addr)
        ipv4? (= 4 (alength b))]
    (or (.isSiteLocalAddress addr)
        (and (instance? Inet6Address addr)                    ; IPv6 unique-local fc00::/7
             (= 0xfc (bit-and (aget b 0) 0xfe)))
        (and ipv4?                                           ; IPv4 CGNAT 100.64.0.0/10
             (= 100 (bit-and (aget b 0) 0xff))
             (<= 64 (bit-and (aget b 1) 0xff) 127)))))

(defn address-allowed-for-network-policy?
  "Whether `addr` is allowed by `policy`.

  `:external-only` allows only globally routable public addresses. `:allow-private` additionally allows private,
  unique-local, and carrier-grade NAT addresses, but still rejects loopback, link-local, any-local, multicast, and
  reserved addresses. `:allow-all` imposes no address restriction."
  [policy ^InetAddress addr]
  (case policy
    :external-only (public-address? addr)
    :allow-private (or (public-address? addr) (private-address? addr))
    :allow-all     true
    (throw (ex-info (str "Unknown network policy: " (pr-str policy)) {:policy policy}))))

;; one or more scheme segments, so nested schemes (`jdbc:postgresql://...`) are stripped too
(def ^:private scheme-prefix-regex #"(?i)^(?:[a-z][a-z0-9+.-]*:)+//")

(defn ->hostname
  "Best-effort extraction of a hostname from a string that may be a bare hostname (`db.example.com`), a `host:port`
  pair, a bracketed IPv6 literal (`[::1]` / `[::1]:5432`), or a full URL (`https://db.example.com:8443/x`)."
  [s]
  (let [s (str/trim (str s))]
    (when-not (str/blank? s)
      (let [s (cond-> s
                (re-find scheme-prefix-regex s)
                (#(or (try (.getHost (URI. %)) (catch Throwable _ nil))
                      ;; not a well-formed URI -- carry on with whatever followed the scheme
                      (str/replace % scheme-prefix-regex ""))))
            s (-> (str s)
                  (str/replace #"[/?#].*$" "")                 ; path / query / fragment
                  (str/replace #"^.*@" ""))                    ; userinfo
            s (cond
                (str/starts-with? s "[") (subs s 1 (or (str/index-of s "]") (count s)))
                ;; one colon means `host:port`; several means a bare (unbracketed) IPv6 literal
                (= 1 (count (filter #{\:} s))) (subs s 0 (str/index-of s ":"))
                :else s)]
        (not-empty (str/trim s))))))

(defn ip-literal?
  "Whether `host` is an IP address written out rather than a name that would have to be resolved. Deciding this takes
  no DNS lookup, which is what makes it safe to ask of a value that may not be a host at all."
  [host]
  (boolean (when-let [host (not-empty (str/trim (str host)))]
             (InetAddresses/isInetAddress (str/replace host #"^\[|\]$" "")))))

(defn- host->inet-addresses
  "Resolve `host` to its `InetAddress`es, returning nil if it is blank or cannot be resolved. Strips the brackets
  around an IPv6 literal (`[::1]`), which `InetAddress` accepts but which we may also see already stripped."
  [host]
  (when-not (str/blank? host)
    (let [host (-> (str/trim host) (str/replace #"^\[|\]$" ""))]
      (try
        (seq (InetAddress/getAllByName host))
        (catch Throwable _ nil)))))

(defn host-allowed-for-network-policy?
  "Whether Metabase may open a connection to `host` under `policy`.

  `host` may be written as a bare hostname, an IP literal, a `host:port` pair, or a full URL or `java.net.URL`;
  see [[->hostname]]. Every address it resolves to must satisfy [[address-allowed-for-network-policy?]].
  `:allow-all` short-circuits before any lookup.

  A host that cannot be resolved is **allowed** -- a DNS outage on a legitimate warehouse should surface as the
  connection error it is, not as an accusation that the host is an internal address."
  [policy host]
  (or (= policy :allow-all)
      (boolean
       (when-let [hostname (->hostname host)]
         (every? #(address-allowed-for-network-policy? policy %)
                 (host->inet-addresses hostname))))))
