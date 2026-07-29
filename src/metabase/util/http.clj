(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (com.google.common.net InetAddresses)
   (java.io ByteArrayOutputStream InputStream)
   (java.net Inet6Address InetAddress URL)
   (java.util Locale)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn SystemDefaultDnsResolver)))

(set! *warn-on-reflection* true)

;; A local locale-independent lower-case (equivalent to `metabase.util/lower-case-en`); inlined to
;; avoid a load cycle, since `metabase.util` transitively requires this namespace.
(defn- lower-case-en ^String [s] (.toLowerCase (str s) Locale/ENGLISH))

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

;; --------------------------------------------------------------------------------------------
;; SSRF-hardened fetch of an untrusted (user-provided) URL.
;;
;; Fetching a user-provided URL server-side is the classic SSRF risk. Defenses:
;;  - HTTPS only; reject IP-literal hosts and localhost/metadata/internal hostnames.
;;  - Validate every *resolved* IP is a public unicast address via a custom DnsResolver -- this
;;    runs inside the connection the client actually opens, closing the DNS-rebinding TOCTOU gap.
;;    It rejects loopback, link-local (incl. cloud metadata 169.254.169.254), site-local (RFC1918),
;;    any-local, multicast, IPv6 ULA (fc00::/7), and IPv4 CGNAT (100.64/10).
;;  - No redirects (a 3xx would be a bypass vector; here it just fails).
;;  - No cookies/credentials (a fresh clj-http GET carries no Metabase session).
;;  - Cap the download bytes and (optionally) restrict to an allowlist of content-types.
;;
;; TODO (bshepherdson 2026-06-09) -- this hardened fetch (rebinding-safe [[ssrf-safe-dns-resolver]]
;; + [[public-address?]] + size/content-type caps) supersedes the weaker [[valid-host?]] above,
;; which validates only a single up-front DNS resolution (a TOCTOU/DNS-rebinding gap) and misses
;; IPv6 ULA, IPv4 CGNAT, any-local, multicast, and IP-literal hosts. Migrate the existing
;; `valid-host?` callers -- `metabase.geojson`, `metabase.sso.oidc.http`,
;; `metabase.channel.impl.http` -- onto this, and add SSRF validation to
;; `metabase.actions.http-action` (which currently has none).
;; --------------------------------------------------------------------------------------------

(def ^:private fetch-default-timeout-ms 8000)
(def ^:private fetch-default-max-bytes (* 20 1024 1024))
;; A descriptive User-Agent: some hosts (e.g. Wikimedia) return 403 for default library UAs.
(def ^:private fetch-default-user-agent "Metabase (+https://www.metabase.com)")
(def ^:private blocked-fetch-hosts #{"localhost" "metadata" "metadata.google.internal"})
(def ^:private blocked-fetch-host-suffixes [".localhost" ".local" ".internal" ".lan" ".home.arpa"])

(defn public-address?
  "True only for globally-routable unicast IP addresses (rejects loopback, link-local, site-local,
  any-local, multicast, IPv6 unique-local fc00::/7, and IPv4 CGNAT 100.64.0.0/10)."
  [^InetAddress addr]
  (let [b (.getAddress addr)]
    (not (or (.isLoopbackAddress addr)
             (.isLinkLocalAddress addr)
             (.isSiteLocalAddress addr)
             (.isAnyLocalAddress addr)
             (.isMulticastAddress addr)
             (and (instance? Inet6Address addr)              ; IPv6 unique-local fc00::/7
                  (= 0xfc (bit-and (aget b 0) 0xfe)))
             (and (= 4 (alength b))                          ; IPv4 CGNAT 100.64.0.0/10
                  (= 100 (bit-and (aget b 0) 0xff))
                  (<= 64 (bit-and (aget b 1) 0xff) 127))))))

(def ^DnsResolver ^:private ssrf-safe-dns-resolver
  "A `DnsResolver` that resolves normally but throws unless *every* resolved address is public.
  Used as clj-http's `:dns-resolver` so the check runs inside the connection actually opened,
  closing the DNS-rebinding TOCTOU gap (validating up front then re-resolving would not)."
  (let [system (SystemDefaultDnsResolver.)]
    (reify DnsResolver
      (^"[Ljava.net.InetAddress;" resolve [_ ^String host]
        (let [addrs (.resolve system host)]
          (if (every? public-address? addrs)
            addrs
            (throw (ex-info "Refusing to fetch from a non-public address" {:ssrf true}))))))))

(defn safe-url?
  "True if `url` is safe to fetch from untrusted input: HTTPS scheme, no userinfo, and a real DNS
  hostname (not an IP literal, not localhost/metadata/internal). Note this is a cheap pre-check;
  the resolved-IP validation in [[ssrf-safe-dns-resolver]] is what closes the rebinding gap."
  [^String url]
  (try
    (let [parsed (URL. url)
          host   (some-> (.getHost parsed) lower-case-en (str/replace #"^\[|\]$" ""))]
      (and (= "https" (lower-case-en (str (.getProtocol parsed))))
           (str/blank? (str (.getUserInfo parsed)))
           (not (str/blank? host))
           (boolean (re-find #"[a-z]" host))    ; a real hostname has a letter; blocks decimal/octal IP forms
           (not (InetAddresses/isInetAddress host))
           (not (contains? blocked-fetch-hosts host))
           (not (some #(str/ends-with? host %) blocked-fetch-host-suffixes))))
    (catch Throwable _ false)))

(defn- read-bounded
  "Read up to `max` bytes from `in`; returns the byte[] or nil if the stream exceeds `max`."
  ^bytes [^InputStream in max]
  (let [out (ByteArrayOutputStream.)
        buf (byte-array 8192)]
    (loop [total 0]
      (let [n (.read in buf)]
        (cond
          (neg? n)            (.toByteArray out)
          (> (+ total n) max) nil
          :else               (do (.write out buf 0 n) (recur (+ total n))))))))

(defn fetch-bytes
  "SSRF-hardened GET of `url`. Returns `{:bytes <byte[]> :content-type <lower-cased string>}` on a
  200 response whose (parameter-stripped, lower-cased) content-type is allowed and whose body is
  within the byte cap; otherwise nil. Never throws -- on any failure (unsafe URL, network error,
  non-200, disallowed content-type, oversized body) it returns nil, so callers can fall back.

  Defenses are described in the section comment above. Options:
   :allowed-content-types  set of lower-cased content-types to accept; nil/empty accepts any
   :max-bytes              download cap in bytes (default 20 MB)
   :timeout-ms             socket + connection timeout (default 8000)
   :user-agent             `User-Agent` header (default a descriptive Metabase UA)"
  ([url] (fetch-bytes url nil))
  ([url {:keys [allowed-content-types max-bytes timeout-ms user-agent]
         :or   {max-bytes  fetch-default-max-bytes
                timeout-ms fetch-default-timeout-ms
                user-agent fetch-default-user-agent}}]
   (when (safe-url? url)
     (try
       (let [resp              (http/get url {:as                 :stream
                                              :redirect-strategy  :none
                                              :socket-timeout     timeout-ms
                                              :connection-timeout timeout-ms
                                              :throw-exceptions   false
                                              :headers            {"User-Agent" user-agent}
                                              :dns-resolver       ssrf-safe-dns-resolver})
             ctype             (some-> (get-in resp [:headers :content-type])
                                       (str/split #";") first str/trim lower-case-en)
             ^InputStream body (:body resp)]
         (try
           (when (and (= 200 (:status resp))
                      (or (empty? allowed-content-types) (contains? allowed-content-types ctype)))
             (when-let [bytes (read-bounded body max-bytes)]
               {:bytes bytes :content-type ctype}))
           (finally (some-> body .close))))
       (catch Throwable _ nil)))))
