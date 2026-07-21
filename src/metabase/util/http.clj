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
  "Fetch `url`, parse the JSON body, return it. `opts` is merged into the clj-http request -- pass
  [[ssrf-safe-request-opts]] for untrusted URLs; omit only for trusted, hardcoded ones."
  ([url headers] (*fetch-as-json* url headers nil))
  ([url headers opts]
   (let [headers  (cond-> headers
                    (string? headers) parse-http-headers)
         response (http/get url (merge (m/assoc-some {:as :json} :headers headers) opts))]
     (:body response))))

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
;; `valid-host?` was removed; callers validate via [[public-address?]] -- through
;; [[ssrf-safe-request-opts]] / [[fetch-bytes]] / [[external-host?]]. `metabase.actions.http-action`
;; is not yet routed through these.
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

(def ssrf-safe-request-opts
  "clj-http request options that make an outbound request external-only: pins every resolved IP to a
  public address ([[ssrf-safe-dns-resolver]]) and disables redirects. Merge into a request map for
  callers needing an arbitrary method, an `http://` target, or the raw response (where [[fetch-bytes]]
  is too strict). Public IP-literal URLs are allowed. Single place to add a strategy knob later."
  {:dns-resolver      ssrf-safe-dns-resolver
   :redirect-strategy :none})

(defn external-host?
  "Advisory check: true when `url`'s host resolves and every IP is public ([[public-address?]]);
  accepts hostnames and IP literals. A single up-front resolution (rebinding-prone), so use only for
  create-time/fast-fail -- the authoritative gate is [[ssrf-safe-request-opts]] / [[fetch-bytes]]."
  [url]
  (try
    (let [^URL u (if (instance? URL url) url (URL. (str url)))
          host   (some-> (.getHost u) (str/replace #"^\[|\]$" ""))   ; strip IPv6 literal brackets
          addrs  (when-not (str/blank? host) (InetAddress/getAllByName host))]
      (boolean (and (seq addrs) (every? public-address? addrs))))
    (catch Throwable _ false)))

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
