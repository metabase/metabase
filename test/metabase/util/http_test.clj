(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress InetSocketAddress Proxy Proxy$Type ProxySelector)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn InMemoryDnsResolver)))

(set! *warn-on-reflection* true)

(deftest ^:parallel host-allowed-external-only-test
  (testing "external-only allows only globally reachable addresses"
    (are [host expected] (= expected (http/host-allowed-for-network-policy? :external-only host))
      "https://example.com"    true
      "8.8.8.8"                true
      "http://localhost"       false
      "http://127.0.0.1"       false
      "http://192.168.1.1"     false
      "http://10.0.0.1"        false
      "http://169.254.1.1"     false
      ;; the ranges the old `valid-host?` let through: IPv6 unique-local, CGNAT, any-local
      "https://[fd12:3456::1]" false
      "http://100.64.0.1"      false
      "http://0.0.0.0"         false)))

(deftest ^:parallel host-allowed-allow-private-test
  (testing "allow-private additionally allows private networks, but never loopback or link-local"
    (are [host expected] (= expected (http/host-allowed-for-network-policy? :allow-private host))
      "https://example.com"    true
      "http://192.168.1.1"     true
      "http://10.0.0.1"        true
      "http://172.16.0.1"      true
      "http://100.64.0.1"      true
      "https://[fd12:3456::1]" true
      "http://localhost"       false
      "http://127.0.0.1"       false
      "http://169.254.1.1"     false
      "http://169.254.169.254" false)))

(deftest ^:parallel host-allowed-allow-all-test
  (testing "allow-all short-circuits before any lookup"
    (are [host] (true? (http/host-allowed-for-network-policy? :allow-all host))
      "https://example.com"
      "http://localhost"
      "http://192.168.1.1"
      "http://169.254.1.1"
      "metadata.google.internal"
      "not-a-url"
      ""))
  (testing "an unknown policy is a programming error, not a silent allow"
    (is (thrown? ExceptionInfo (http/host-allowed-for-network-policy? :allow-everything "http://127.0.0.1")))))

(deftest ^:parallel host-allowed-unresolvable-test
  (testing "a host we cannot resolve is allowed -- a DNS outage on a real warehouse must not be reported as an
           internal address, and a name we cannot resolve is not dialable by the driver either"
    (are [host expected] (= expected (http/host-allowed-for-network-policy? :external-only host))
      "https://metabase-ssrf-test.invalid" true
      "http://127.0.0.1"                   false
      ;; nothing hostname-like at all is still refused
      ""                                   false
      "   "                                false)))

(deftest ^:parallel host-allowed-host-shapes-test
  (testing "hosts are accepted in any of the shapes `->hostname` understands"
    (are [host expected] (= expected (http/host-allowed-for-network-policy? :external-only host))
      "127.0.0.1"                         false
      "127.0.0.1:5432"                    false
      "[::1]:5432"                        false
      "jdbc:postgresql://10.0.0.1/db"     false
      (java.net.URL. "http://10.0.0.1/x") false)))

(deftest ^:parallel host-allowed-alternate-encodings-test
  (testing "alternate encodings of a non-public address are refused, however they resolve"
    (doseq [host ["2130706433"          ; decimal form of 127.0.0.1
                  "127.1"               ; short form of 127.0.0.1
                  "0"                   ; 0.0.0.0
                  "[::1]"
                  "::1"]]
      (is (false? (http/host-allowed-for-network-policy? :external-only host)) host)))
  (testing "public IP literals are allowed however they are written"
    (doseq [host ["8.8.8.8" "1.1.1.1" "2606:4700:4700::1111" "[2606:4700:4700::1111]"]]
      (is (true? (http/host-allowed-for-network-policy? :external-only host)) host))))

;; --------------------------------------------------------------------------------------------
;; SSRF-hardened fetch ([[metabase.util.http/fetch-bytes]] and its helpers). Everything below is
;; intentionally network-free -- the URL/address predicates are pure, the DNS resolver is exercised
;; against `localhost` (resolves to loopback without network IO), and `fetch-bytes` is only checked
;; on URLs that short-circuit at the validation gate before any request is made.
;; --------------------------------------------------------------------------------------------

(def ^:private allowed-urls
  ["https://example.com/a.png"
   "https://sub.example.co.uk/path/to/img.jpg?x=1&y=2"
   "https://example.com:8443/a.png"                 ; non-default https port is fine
   "HTTPS://Example.COM/a.png"                       ; scheme/host are case-insensitive
   "https://xn--80ak6aa92e.com/a.png"])              ; punycode IDN host

(def ^:private blocked-urls
  ["http://example.com/a.png"                        ; not https
   "ftp://example.com/a.png"                          ; not https
   "file:///etc/passwd"                               ; not https
   "javascript:alert(1)"                              ; not https / malformed
   "https://169.254.169.254/latest/meta-data/"        ; link-local IP literal (AWS/GCP IMDS)
   "https://10.0.0.5/x.png"                           ; RFC1918 IP literal
   "https://192.168.1.1/x.png"
   "https://172.16.0.1/x.png"
   "https://127.0.0.1/x.png"                          ; loopback IP literal
   "https://[::1]/x.png"                              ; IPv6 loopback literal
   "https://[fe80::1]/x.png"                          ; IPv6 link-local literal
   "https://2130706433/x.png"                         ; decimal form of 127.0.0.1
   "https://0177.0.0.1/x.png"                         ; octal-ish IP form
   "https://localhost/x.png"                          ; localhost
   "https://LOCALHOST/x.png"
   "https://foo.localhost/x.png"                      ; .localhost suffix
   "https://svc.internal/x.png"                       ; .internal suffix
   "https://host.local/x.png"                         ; .local suffix
   "https://box.lan/x.png"                            ; .lan suffix
   "https://metadata.google.internal/x.png"           ; GCP metadata host
   "https://metadata/x.png"
   "https://user:pass@example.com/x.png"              ; userinfo (credential smuggling)
   "https:///x.png"                                   ; no host
   "not a url"
   ""])

(deftest ^:parallel safe-url?-test
  (testing "allowed URLs"
    (doseq [url allowed-urls]
      (is (true? (boolean (http/safe-url? url))) (str "should be allowed: " url))))
  (testing "blocked URLs (SSRF / non-https / bad host)"
    (doseq [url blocked-urls]
      (is (false? (boolean (http/safe-url? url))) (str "should be blocked: " url)))))

(def ^:private public-ips
  ["8.8.8.8"
   "1.1.1.1"
   "93.184.216.34"
   "100.63.255.255"                ; one below the CGNAT 100.64.0.0/10 range
   "100.128.0.0"                   ; one above the CGNAT range
   "192.0.0.9"                     ; globally reachable exception inside 192.0.0.0/24
   "192.0.0.10"
   "192.31.196.1"                  ; AS112-v4
   "192.52.193.1"                  ; AMT
   "192.175.48.1"                  ; direct delegation AS112 service
   "198.17.255.255"                ; one below the benchmarking range
   "198.20.0.0"                    ; one above the benchmarking range
   "64:ff9b::808:808"              ; NAT64 well-known prefix, translating to 8.8.8.8
   "2000::1"                       ; bottom of the allocated global-unicast space 2000::/3
   "2c0f:ffff::1"                  ; top of the allocated global-unicast space
   "2001:1::1"                     ; globally reachable exceptions inside 2001::/23
   "2001:1::2"
   "2001:1::3"
   "2001:3::1"
   "2001:4:112::1"
   "2001:20::1"
   "2001:30::1"
   "2001:200::1"                   ; first /32 beyond 2001::/23
   "2620:4f:8000::1"               ; direct delegation AS112 service
   "2606:4700:4700::1111"])        ; public IPv6

(def ^:private non-global-special-ips
  ["192.0.0.0"                    ; IETF protocol assignments
   "192.0.0.8"
   "192.0.0.11"
   "192.0.0.255"
   "192.0.2.0"                    ; TEST-NET-1
   "192.0.2.255"
   "192.88.99.1"                  ; deprecated 6to4 relay anycast
   "192.88.99.2"
   "198.18.0.0"                   ; benchmarking
   "198.19.255.255"
   "198.51.100.1"                 ; TEST-NET-2
   "203.0.113.1"                  ; TEST-NET-3
   "64:ff9b:1::1"                 ; local-use IPv4/IPv6 translation
   "64:ff9b::1"                   ; NAT64 of 0.0.0.1, in "this network"
   "64:ff9b::7f00:1"              ; NAT64 of 127.0.0.1
   "64:ff9b::a9fe:a9fe"           ; NAT64 of the 169.254.169.254 metadata address
   "100::1"                       ; discard-only
   "100:0:0:1::1"                 ; dummy IPv6 prefix
   "2001::1"                      ; non-global entry inside IETF protocol assignments
   "2001:1::4"                    ; outside the globally reachable /128 exceptions
   "2001:2::1"                    ; benchmarking
   "2001:10::1"                   ; deprecated ORCHID
   "2001:db8::1"                  ; documentation
   "2002::1"                      ; 6to4
   "5f00::1"                      ; segment-routing SIDs
   "1::1"                         ; reserved IPv6 space outside 2000::/3
   "4000::1"
   "6000::1"
   "8000::1"
   "e000::1"])

(def ^:private reserved-global-unicast-ips
  ;; inside 2000::/3, but above the part IANA has allocated
  ["2d00::1"
   "2e00::1"
   "3000::1"
   "3ffe::1"
   "3fff::1"                      ; documentation
   "3fff:1000::1"                 ; just past the documentation block, still reserved
   "3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"])

(def ^:private non-public-ips
  (into ["127.0.0.1"               ; loopback
         "169.254.169.254"        ; link-local (cloud metadata)
         "10.1.2.3"               ; RFC1918
         "172.16.0.1"
         "172.31.255.255"
         "192.168.0.1"
         "0.0.0.0"                ; any-local
         "224.0.0.1"              ; multicast
         "100.64.0.1"             ; CGNAT
         "100.127.255.255"        ; CGNAT (top)
         "::1"                    ; IPv6 loopback
         "fe80::1"                ; IPv6 link-local
         "fc00::1"                ; IPv6 ULA (fc)
         "fd12:3456::1"           ; IPv6 ULA (fd)
         "ff02::1"                ; IPv6 multicast
         "0.1.2.3"                ; "this network" 0.0.0.0/8
         "0.255.255.255"
         "240.0.0.1"              ; reserved 240.0.0.0/4
         "255.255.255.255"        ; limited broadcast (inside 240.0.0.0/4)
         "::ffff:127.0.0.1"       ; IPv4-mapped loopback
         "::ffff:10.0.0.1"]       ; IPv4-mapped RFC1918
        (concat non-global-special-ips reserved-global-unicast-ips)))

(deftest ^:parallel nat64-address-is-judged-by-the-ipv4-it-reaches-test
  (testing (str "a NAT64 gateway translates the low 32 bits of 64:ff9b::/96 to an IPv4 address, so the prefix "
                "being globally reachable says nothing about where a connection to it ends up")
    (are [ip expected] (= expected (http/public-address? (InetAddress/getByName ip)))
      "64:ff9b::808:808"    true       ; 8.8.8.8
      "64:ff9b::7f00:1"     false      ; 127.0.0.1
      "64:ff9b::a00:1"      false      ; 10.0.0.1
      "64:ff9b::a9fe:a9fe"  false))    ; 169.254.169.254
  (testing "and allow-private admits the private ones the way it admits the IPv4 they reach"
    (is (true? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName "64:ff9b::a00:1"))))
    (is (false? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName "64:ff9b::7f00:1"))))))

(deftest ^:parallel public-address?-test
  (testing "globally reachable addresses are allowed"
    (doseq [ip public-ips]
      (is (true? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be public: " ip))))
  (testing "loopback/link-local/private/ULA/CGNAT/multicast addresses are rejected"
    (doseq [ip non-public-ips]
      (is (false? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be rejected: " ip)))))

(defn- proxy-selector
  ^ProxySelector [proxies]
  (proxy [ProxySelector] []
    (select [_uri] proxies)
    (connectFailed [_uri _sa _ioe] nil)))

(deftest ^:parallel jvm-proxied-url?-test
  (testing "a JVM proxy in front of a URL is reported, so a caller knows its :dns-resolver sees only the proxy"
    (binding [http/*proxy-selector* (proxy-selector [(Proxy. Proxy$Type/HTTP (InetSocketAddress. "10.0.0.9" 3128))])]
      (is (true? (http/jvm-proxied-url? "https://api.anthropic.com/v1")))
      (testing "a string that is not a URI is not proxied either"
        (is (false? (http/jvm-proxied-url? "not a url"))))))
  (testing "DIRECT, no selector, and an empty answer all mean unproxied"
    (doseq [proxies [[Proxy/NO_PROXY] []]]
      (binding [http/*proxy-selector* (proxy-selector proxies)]
        (is (false? (http/jvm-proxied-url? "https://api.anthropic.com/v1")))))))

(deftest ^:parallel address-allowed-for-network-policy?-test
  (testing "external-only admits only globally reachable addresses"
    (doseq [ip public-ips]
      (is (true? (http/address-allowed-for-network-policy? :external-only (InetAddress/getByName ip))) ip))
    (doseq [ip non-public-ips]
      (is (false? (http/address-allowed-for-network-policy? :external-only (InetAddress/getByName ip))) ip)))
  (testing "allow-private re-admits exactly the private ranges -- RFC1918, IPv6 ULA and CGNAT"
    (doseq [ip ["10.1.2.3" "172.16.0.1" "172.31.255.255" "192.168.0.1"
                "100.64.0.1" "100.127.255.255" "fc00::1" "fd12:3456::1"
                "64:ff9b::a00:1"]]
      (is (true? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName ip))) ip)))
  (testing "allow-private still refuses loopback, link-local, any-local and multicast"
    (doseq [ip ["127.0.0.1" "::1" "169.254.169.254" "fe80::1" "0.0.0.0" "224.0.0.1" "ff02::1"]]
      (is (false? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName ip))) ip)))
  (testing "allow-private does not admit other non-global special-purpose ranges"
    (doseq [ip non-global-special-ips]
      (is (false? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName ip))) ip)))
  (testing "loopback-and-private admits loopback and the private ranges"
    (doseq [ip ["127.0.0.1" "127.0.1.5" "::1" "10.1.2.3" "192.168.0.1" "100.64.0.1" "fc00::1"]]
      (is (true? (http/address-allowed-for-network-policy? :loopback-and-private (InetAddress/getByName ip))) ip)))
  (testing "loopback-and-private refuses public addresses"
    (doseq [ip public-ips]
      (is (false? (http/address-allowed-for-network-policy? :loopback-and-private (InetAddress/getByName ip))) ip)))
  (testing "loopback-and-private still refuses link-local"
    (doseq [ip ["169.254.169.254" "fe80::1" "0.0.0.0" "224.0.0.1" "ff02::1"]]
      (is (false? (http/address-allowed-for-network-policy? :loopback-and-private (InetAddress/getByName ip))) ip)))
  (testing "allow-all admits everything"
    (doseq [ip (concat public-ips non-public-ips)]
      (is (true? (http/address-allowed-for-network-policy? :allow-all (InetAddress/getByName ip))) ip)))
  (testing "an unknown policy throws rather than silently allowing"
    (is (thrown? ExceptionInfo
                 (http/address-allowed-for-network-policy? :allow-everything (InetAddress/getByName "127.0.0.1"))))))

(deftest ^:parallel ssrf-safe-dns-resolver-test
  (testing "the validating resolver throws when a host resolves to a non-public address"
    ;; `localhost` resolves to loopback (no network needed) -> must be refused
    (is (thrown? ExceptionInfo
                 (.resolve ^DnsResolver @#'http/ssrf-safe-dns-resolver "localhost")))))

(deftest ^:parallel network-policy-dns-resolver-test
  (testing ":allow-all imposes no restriction, so there is no resolver (clj-http uses its default)"
    (is (nil? (http/network-policy-dns-resolver :allow-all))))
  (testing "the resolver refuses a host that resolves to a disallowed address"
    ;; `localhost` resolves to loopback with no network IO; loopback is denied by both policies
    (doseq [policy [:external-only :allow-private]]
      (is (thrown-with-msg? ExceptionInfo #"non-permitted"
                            (.resolve ^DnsResolver (http/network-policy-dns-resolver policy) "localhost"))
          (str policy))))
  (testing "the resolver honors the policy: an injected private address passes :allow-private but not :external-only,
           closing the DNS-rebinding gap that up-front-only validation leaves open"
    (binding [http/*system-dns-resolver* (doto (InMemoryDnsResolver.)
                                           (.add "rebind.example"
                                                 (into-array [(InetAddress/getByName "10.0.0.1")])))]
      (is (thrown-with-msg? ExceptionInfo #"non-permitted"
                            (.resolve ^DnsResolver (http/network-policy-dns-resolver :external-only) "rebind.example")))
      (is (= 1 (alength ^"[Ljava.net.InetAddress;"
                (.resolve ^DnsResolver (http/network-policy-dns-resolver :allow-private) "rebind.example"))))))
  (testing "the resolver refuses non-global special-purpose addresses under both restricted policies"
    (binding [http/*system-dns-resolver* (doto (InMemoryDnsResolver.)
                                           (.add "benchmark.example"
                                                 (into-array [(InetAddress/getByName "198.18.0.1")])))]
      (doseq [policy [:external-only :allow-private]]
        (is (thrown-with-msg? ExceptionInfo #"non-permitted"
                              (.resolve ^DnsResolver (http/network-policy-dns-resolver policy)
                                        "benchmark.example"))
            (str policy))))))

(deftest ^:parallel fetch-bytes-blocks-without-network-test
  (testing "blocked URLs return nil at the validation gate, never reaching the network"
    (doseq [url ["https://169.254.169.254/latest/meta-data/"
                 "http://example.com/x.png"
                 "https://10.0.0.1/x.png"
                 "https://localhost/x.png"
                 "https://metadata.google.internal/x.png"]]
      (is (nil? (http/fetch-bytes url)) (str "should not fetch: " url)))))

(deftest ^:parallel read-bounded-test
  (testing "reads the whole stream when under the cap"
    (is (= "hello" (String. ^bytes (#'http/read-bounded (ByteArrayInputStream. (.getBytes "hello")) 100)))))
  (testing "reads exactly up to the cap (inclusive)"
    (is (= 5 (count (#'http/read-bounded (ByteArrayInputStream. (.getBytes "12345")) 5)))))
  (testing "returns nil when the stream exceeds the cap"
    (is (nil? (#'http/read-bounded (ByteArrayInputStream. (.getBytes "0123456789")) 5)))))
