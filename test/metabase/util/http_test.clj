(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress)))

(set! *warn-on-reflection* true)

(deftest valid-host?-test
  (testing "external-only strategy (default)"
    (is (true? (http/valid-host? :external-only "https://example.com")))
    (is (false? (http/valid-host? :external-only "http://localhost")))
    (is (false? (http/valid-host? :external-only "http://192.168.1.1"))))
  (testing "external-only strategy explicitly"
    (is (true? (http/valid-host? :external-only "https://example.com")))
    (is (false? (http/valid-host? :external-only "http://localhost")))
    (is (false? (http/valid-host? :external-only "http://192.168.1.1"))))
  (testing "allow-private strategy allows private networks but not localhost"
    (is (true? (http/valid-host? :allow-private "https://example.com")))
    (is (true? (http/valid-host? :allow-private "http://192.168.1.1")))
    (is (true? (http/valid-host? :allow-private "http://10.0.0.1")))
    (is (true? (http/valid-host? :allow-private "http://172.16.0.1")))
    (is (false? (http/valid-host? :allow-private "http://localhost")))
    (is (false? (http/valid-host? :allow-private "http://127.0.0.1")))
    (is (false? (http/valid-host? :allow-private "http://169.254.1.1"))))
  (testing "allow-all strategy allows everything"
    (is (true? (http/valid-host? :allow-all "https://example.com")))
    (is (true? (http/valid-host? :allow-all "http://localhost")))
    (is (true? (http/valid-host? :allow-all "http://192.168.1.1")))
    (is (true? (http/valid-host? :allow-all "http://169.254.1.1")))))

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
   "ff02::1"])                    ; IPv6 multicast

(deftest ^:parallel public-address?-test
  (testing "globally-routable addresses are allowed"
    (doseq [ip public-ips]
      (is (true? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be public: " ip))))
  (testing "loopback/link-local/private/ULA/CGNAT/multicast addresses are rejected"
    (doseq [ip non-public-ips]
      (is (false? (boolean (http/public-address? (InetAddress/getByName ip))))
          (str "should be rejected: " ip)))))

(deftest ^:parallel ssrf-safe-dns-resolver-test
  (testing "the validating resolver throws when a host resolves to a non-public address"
    ;; `localhost` resolves to loopback (no network needed) -> must be refused
    (is (thrown? ExceptionInfo
                 (.resolve ^org.apache.http.conn.DnsResolver @#'http/ssrf-safe-dns-resolver "localhost")))))

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
