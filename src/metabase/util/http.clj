(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (com.google.common.net InetAddresses)
   (java.io ByteArrayOutputStream InputStream)
   (java.net Inet6Address InetAddress URI URL)
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
;; --------------------------------------------------------------------------------------------

(def ^:private fetch-default-timeout-ms 8000)
(def ^:private fetch-default-max-bytes (* 20 1024 1024))
;; A descriptive User-Agent: some hosts (e.g. Wikimedia) return 403 for default library UAs.
(def ^:private fetch-default-user-agent "Metabase (+https://www.metabase.com)")
(def ^:private blocked-fetch-hosts #{"localhost" "metadata" "metadata.google.internal"})
(def ^:private blocked-fetch-host-suffixes [".localhost" ".local" ".internal" ".lan" ".home.arpa"])

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

(defn host->inet-addresses
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

(def ^DnsResolver ^:dynamic *system-dns-resolver*
  "The underlying system DNS resolver. Exposed as a dynamic var so tests can inject a fake
  host->address mapping"
  (SystemDefaultDnsResolver.))

(defn network-policy-dns-resolver
  "A clj-http `:dns-resolver` that resolves `host` normally but throws unless *every* resolved address is
  permitted by `policy`.

  Returns nil for `:allow-all`, which restricts nothing: callers should omit `:dns-resolver` in that case
  and let clj-http use its default resolver."
  ^DnsResolver [policy]
  (when-not (= policy :allow-all)
    (reify DnsResolver
      (^"[Ljava.net.InetAddress;" resolve [_ ^String host]
        (let [addrs (.resolve *system-dns-resolver* host)]
          (if (every? #(address-allowed-for-network-policy? policy %) addrs)
            addrs
            (throw (ex-info "Refusing to connect to a non-permitted network address"
                            {:ssrf true :policy policy :host host}))))))))

(def ^DnsResolver ^:private ssrf-safe-dns-resolver
  "The strict `:external-only` resolver (public addresses only) used by [[fetch-bytes]].
  See [[network-policy-dns-resolver]]."
  (network-policy-dns-resolver :external-only))

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
