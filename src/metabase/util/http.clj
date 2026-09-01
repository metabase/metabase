(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (com.google.common.net InetAddresses)
   (java.io ByteArrayOutputStream InputStream)
   (java.net Inet6Address InetAddress Proxy Proxy$Type ProxySelector URI URL)
   (java.util Arrays Locale)
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
;;    any-local, multicast, IPv6 ULA (fc00::/7), IPv4 CGNAT (100.64/10), non-global IANA
;;    special-purpose ranges, and IPv6 space IANA has not allocated.
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

(defn- address-prefix
  [address prefix-length]
  (let [bytes (.getAddress ^InetAddress (InetAddresses/forString address))]
    (assert (<= 0 prefix-length (* 8 (alength bytes))))
    [bytes prefix-length]))

(defn- address-in-prefix?
  [^InetAddress addr [network prefix-length]]
  (let [address-bytes    (.getAddress addr)
        ^bytes network  network
        whole-byte-count (quot prefix-length 8)
        remaining-bits   (mod prefix-length 8)]
    (and (= (alength address-bytes) (alength network))
         (loop [i 0]
           (or (= i whole-byte-count)
               (and (= (aget address-bytes i) (aget network i))
                    (recur (inc i)))))
         (or (zero? remaining-bits)
             (let [mask (bit-and 0xff (bit-shift-left 0xff (- 8 remaining-bits)))]
               (= (bit-and (aget address-bytes whole-byte-count) mask)
                  (bit-and (aget network whole-byte-count) mask)))))))

(def ^:private globally-reachable-special-prefixes
  ;; More-specific exceptions inside the broad non-global prefixes below. Keep this aligned with the IANA IPv4 and
  ;; IPv6 Special-Purpose Address Registries' "Globally Reachable" column.
  ;; https://www.iana.org/assignments/iana-ipv4-special-registry
  ;; https://www.iana.org/assignments/iana-ipv6-special-registry
  [(address-prefix "192.0.0.9" 32)       ; PCP anycast
   (address-prefix "192.0.0.10" 32)      ; TURN anycast
   (address-prefix "2001:1::1" 128)      ; PCP anycast
   (address-prefix "2001:1::2" 128)      ; TURN anycast
   (address-prefix "2001:1::3" 128)      ; DNS-SD service registration anycast
   (address-prefix "2001:3::" 32)        ; AMT
   (address-prefix "2001:4:112::" 48)    ; AS112-v6
   (address-prefix "2001:20::" 28)       ; ORCHIDv2
   (address-prefix "2001:30::" 28)])     ; Drone Remote ID protocol entity tags

(def ^:private non-global-special-prefixes
  ;; Additional IANA special-purpose blocks that are not globally reachable and are not already handled by
  ;; `InetAddress` or the checks in [[public-address?]]. Entries whose registry value is N/A or blank are also refused:
  ;; they do not carry the external-reachability guarantee required by `:external-only`. IPv6 blocks outside 2000::/3
  ;; (discard-only, local-use translation, segment-routing SIDs, ...) need no entry: everything outside the
  ;; global-unicast space is refused wholesale unless listed above.
  ;; https://www.iana.org/assignments/iana-ipv4-special-registry
  ;; https://www.iana.org/assignments/iana-ipv6-special-registry
  [(address-prefix "192.0.0.0" 24)       ; IETF protocol assignments
   (address-prefix "192.0.2.0" 24)       ; TEST-NET-1
   (address-prefix "192.88.99.0" 24)     ; deprecated 6to4 relay anycast
   (address-prefix "198.18.0.0" 15)      ; benchmarking
   (address-prefix "198.51.100.0" 24)    ; TEST-NET-2
   (address-prefix "203.0.113.0" 24)     ; TEST-NET-3
   (address-prefix "2001::" 23)          ; IETF protocol assignments
   (address-prefix "2001:db8::" 32)      ; documentation
   (address-prefix "2002::" 16)])        ; 6to4

(def ^:private reserved-global-unicast-prefixes
  ;; 2000::/3 is the global-unicast space, but everything in it from 2d00:: up is unallocated: the fifteen blocks
  ;; the registry marks RESERVED -- which include the 3fff::/20 documentation block -- and the space above them it
  ;; does not list at all. No ISP routes any of it, so a name resolving there is either a mistake or an internal
  ;; network squatting on reserved space. Shrink this when IANA allocates from the top of the /3.
  ;; The smaller unallocated holes below 2d00:: are left alone: they sit between live RIR allocations, which is
  ;; where the next ones are handed out from, and refusing them would age badly.
  ;; https://www.iana.org/assignments/ipv6-unicast-address-assignments
  [(address-prefix "2d00::" 8)
   (address-prefix "2e00::" 7)
   (address-prefix "3000::" 4)])

(def ^:private non-global-prefixes
  "Every prefix `:external-only` refuses, unless [[globally-reachable-special-prefixes]] carves it back out."
  (into non-global-special-prefixes reserved-global-unicast-prefixes))

(def ^:private nat64-well-known-prefix
  ;; 64:ff9b::/96, whose low 32 bits are the IPv4 address a NAT64 gateway translates to (RFC 6052).
  (address-prefix "64:ff9b::" 96))

(defn- translated-address
  "The address a connection to `addr` actually reaches: the IPv4 embedded in the NAT64 well-known prefix, or `addr`
  itself. RFC 6052 says the well-known prefix may not carry a non-global IPv4, but nothing on this side of the
  gateway enforces that, and `64:ff9b::7f00:1` would otherwise be a public address that reaches 127.0.0.1."
  ^InetAddress [^InetAddress addr]
  (if (address-in-prefix? addr nat64-well-known-prefix)
    (InetAddress/getByAddress (Arrays/copyOfRange (.getAddress addr) 12 16))
    addr))

(defn public-address?
  "True only for globally reachable unicast IP addresses.

  In addition to the address classes recognized by `java.net.InetAddress`, this rejects the non-global blocks in the
  IANA IPv4 and IPv6 Special-Purpose Address Registries while preserving their more-specific globally reachable
  entries. IPv6 addresses outside the *allocated* part of the global-unicast space are rejected unless a registry
  marks them globally reachable: an internal network can route reserved space.

  A NAT64 address is judged by the IPv4 it translates to; see [[translated-address]]."
  [^InetAddress addr]
  (let [addr  (translated-address addr)
        b     (.getAddress addr)
        ipv4? (= 4 (alength b))
        b0    (bit-and (aget b 0) 0xff)]
    (and (not (or (.isLoopbackAddress addr)
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
                  (and ipv4? (<= 240 b0))))                       ; IPv4 reserved 240.0.0.0/4 + broadcast
         (or (some #(address-in-prefix? addr %) globally-reachable-special-prefixes)
             (and (or ipv4?
                      (= 0x20 (bit-and b0 0xe0)))                 ; IPv6 global unicast 2000::/3
                  (not-any? #(address-in-prefix? addr %) non-global-prefixes))))))

(defn- private-address?
  "True for addresses that are private but may be intentionally reachable from a self-hosted deployment."
  [^InetAddress addr]
  (let [addr  (translated-address addr)
        b     (.getAddress addr)
        ipv4? (= 4 (alength b))]
    (or (.isSiteLocalAddress addr)
        (and (instance? Inet6Address addr)                    ; IPv6 unique-local fc00::/7
             (= 0xfc (bit-and (aget b 0) 0xfe)))
        (and ipv4?                                           ; IPv4 CGNAT 100.64.0.0/10
             (= 100 (bit-and (aget b 0) 0xff))
             (<= 64 (bit-and (aget b 1) 0xff) 127)))))

(defn address-allowed-for-network-policy?
  "Whether `addr` is allowed by `policy`.

  `:external-only` allows only globally reachable public addresses.
  `:allow-private` adds private, unique-local and carrier-grade NAT addresses.
  `:loopback-and-private` allows *only* loopback plus those same private ranges
  `:allow-all` imposes no address restriction."
  [policy ^InetAddress addr]
  (case policy
    :external-only        (public-address? addr)
    :allow-private        (or (public-address? addr) (private-address? addr))
    :loopback-and-private (or (private-address? addr) (.isLoopbackAddress addr))
    :allow-all            true
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

(def ^:dynamic *proxy-selector*
  "The `ProxySelector` [[jvm-proxied-url?]] asks. nil reads `ProxySelector/getDefault` at call time, which is what
  Apache HttpClient's route planner does; tests bind it rather than installing a selector process-wide."
  nil)

(defn jvm-proxied-url?
  "Whether the JVM's proxy configuration -- `-Dhttps.proxyHost` and friends, or `java.net.useSystemProxies` -- puts a
  proxy in front of `url`.

  This decides whether a `:dns-resolver` can enforce anything. clj-http's default route planner honours the JVM
  proxy settings, and the connection it then opens is to the *proxy*: the resolver is handed the proxy's hostname,
  and the target is resolved by the proxy, out of reach. A caller enforcing a network policy has to check the target
  host itself in that case."
  [url]
  (boolean
   (when-let [^ProxySelector selector (or *proxy-selector* (ProxySelector/getDefault))]
     (try
       (some #(not= Proxy$Type/DIRECT (.type ^Proxy %)) (.select selector (URI. (str url))))
       ;; not a URI the selector can be asked about -- nothing is being proxied on its behalf either
       (catch Throwable _ false)))))

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

(defn response-content-type
  "Return the lower-case media type from a clj-http response, without parameters."
  [resp]
  (some-> (get-in resp [:headers :content-type])
          (str/split #";") first str/trim lower-case-en))

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
             ctype             (response-content-type resp)
             ^InputStream body (:body resp)]
         (try
           (when (and (= 200 (:status resp))
                      (or (empty? allowed-content-types) (contains? allowed-content-types ctype)))
             (when-let [bytes (read-bounded body max-bytes)]
               {:bytes bytes :content-type ctype}))
           (finally (some-> body .close))))
       (catch Throwable _ nil)))))
