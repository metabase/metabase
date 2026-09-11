(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn InMemoryDnsResolver)))

(set! *warn-on-reflection* true)

(deftest ^:parallel host-allowed-external-only-test
  (testing "external-only allows only globally-routable addresses"
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
   "2606:4700:4700::1111"])        ; public IPv6

(def ^:private non-public-ips
  ["127.0.0.1"                     ; loopback
   "169.254.169.254"              ; link-local (cloud metadata)
   "10.1.2.3"                     ; RFC1918
   "172.16.0.1"
   "172.31.255.255"
   "192.168.0.1"
   "0.0.0.0"                      ; any-local
   "224.0.0.1"                    ; multicast
   "100.64.0.1"                   ; CGNAT
   "100.127.255.255"              ; CGNAT (top)
   "::1"                          ; IPv6 loopback
   "fe80::1"                      ; IPv6 link-local
   "fc00::1"                      ; IPv6 ULA (fc)
   "fd12:3456::1"                 ; IPv6 ULA (fd)
   "ff02::1"                      ; IPv6 multicast
   "0.1.2.3"                      ; "this network" 0.0.0.0/8
   "0.255.255.255"
   "240.0.0.1"                    ; reserved 240.0.0.0/4
   "255.255.255.255"              ; limited broadcast (inside 240.0.0.0/4)
   "::ffff:127.0.0.1"             ; IPv4-mapped loopback
   "::ffff:10.0.0.1"])            ; IPv4-mapped RFC1918

(deftest ^:parallel public-address?-test
  (testing "globally-routable addresses are allowed"
    (doseq [ip public-ips]
      (is (true? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be public: " ip))))
  (testing "loopback/link-local/private/ULA/CGNAT/multicast addresses are rejected"
    (doseq [ip non-public-ips]
      (is (false? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be rejected: " ip)))))

(deftest ^:parallel address-allowed-for-network-policy?-test
  (testing "external-only admits only globally-routable addresses"
    (doseq [ip public-ips]
      (is (true? (http/address-allowed-for-network-policy? :external-only (InetAddress/getByName ip))) ip))
    (doseq [ip non-public-ips]
      (is (false? (http/address-allowed-for-network-policy? :external-only (InetAddress/getByName ip))) ip)))
  (testing "allow-private re-admits exactly the private ranges -- RFC1918, IPv6 ULA and CGNAT"
    (doseq [ip ["10.1.2.3" "172.16.0.1" "172.31.255.255" "192.168.0.1"
                "100.64.0.1" "100.127.255.255" "fc00::1" "fd12:3456::1"]]
      (is (true? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName ip))) ip)))
  (testing "allow-private still refuses loopback, link-local, any-local and multicast"
    (doseq [ip ["127.0.0.1" "::1" "169.254.169.254" "fe80::1" "0.0.0.0" "224.0.0.1" "ff02::1"]]
      (is (false? (http/address-allowed-for-network-policy? :allow-private (InetAddress/getByName ip))) ip)))
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
                (.resolve ^DnsResolver (http/network-policy-dns-resolver :allow-private) "rebind.example")))))))

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
