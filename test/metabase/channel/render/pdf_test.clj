(ns metabase.channel.render.pdf-test
  "Tests for backend dashboard->PDF rendering. This first installment covers the security-critical
  SSRF defenses around fetching user-provided Markdown image URLs. Everything here is intentionally
  network-free (pure predicates, the DNS resolver exercised against `localhost`, and in-memory
  streams) so the suite is fast and not flaky."
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.pdf :as pdf])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress)))

(set! *warn-on-reflection* true)

;; --------------------------------------------------------------------------------------------
;; SSRF: URL validation matrix (safe-image-url?)
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

(deftest safe-image-url?-test
  (testing "allowed image URLs"
    (doseq [url allowed-urls]
      (is (true? (boolean (#'pdf/safe-image-url? url))) (str "should be allowed: " url))))
  (testing "blocked image URLs (SSRF / non-https / bad host)"
    (doseq [url blocked-urls]
      (is (false? (boolean (#'pdf/safe-image-url? url))) (str "should be blocked: " url)))))

;; --------------------------------------------------------------------------------------------
;; SSRF: resolved-address validation matrix (public-address?)
;; --------------------------------------------------------------------------------------------

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

(deftest public-address?-test
  (testing "globally-routable addresses are allowed"
    (doseq [ip public-ips]
      (is (true? (boolean (#'pdf/public-address? (InetAddress/getByName ip))))
          (str "should be public: " ip))))
  (testing "loopback/link-local/private/ULA/CGNAT/multicast addresses are rejected"
    (doseq [ip non-public-ips]
      (is (false? (boolean (#'pdf/public-address? (InetAddress/getByName ip))))
          (str "should be rejected: " ip)))))

;; --------------------------------------------------------------------------------------------
;; SSRF: DNS resolver closes the rebinding gap, and the fetch short-circuits before any network IO
;; --------------------------------------------------------------------------------------------

(deftest ssrf-safe-dns-resolver-test
  (testing "the validating resolver throws when a host resolves to a non-public address"
    ;; `localhost` resolves to loopback (no network needed) -> must be refused
    (is (thrown? ExceptionInfo
                 (.resolve ^org.apache.http.conn.DnsResolver @#'pdf/ssrf-safe-dns-resolver "localhost")))))

(deftest fetch-image-bytes-blocks-without-network-test
  (testing "blocked URLs return nil at the validation gate, never reaching the network"
    (doseq [url ["https://169.254.169.254/latest/meta-data/"
                 "http://example.com/x.png"
                 "https://10.0.0.1/x.png"
                 "https://localhost/x.png"
                 "https://metadata.google.internal/x.png"]]
      (is (nil? (#'pdf/fetch-image-bytes url)) (str "should not fetch: " url)))))

;; --------------------------------------------------------------------------------------------
;; Download size cap (read-bounded)
;; --------------------------------------------------------------------------------------------

(deftest read-bounded-test
  (testing "reads the whole stream when under the cap"
    (is (= "hello" (String. ^bytes (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "hello")) 100)))))
  (testing "reads exactly up to the cap (inclusive)"
    (is (= 5 (count (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "12345")) 5)))))
  (testing "returns nil when the stream exceeds the cap"
    (is (nil? (#'pdf/read-bounded (ByteArrayInputStream. (.getBytes "0123456789")) 5)))))

;; --------------------------------------------------------------------------------------------
;; Markdown: furigana {base|reading} parsing
;; --------------------------------------------------------------------------------------------

(deftest parse-ruby-test
  (let [strip (fn [runs] (mapv #(dissoc % :href) runs))]
    (testing "{base|reading} becomes a ruby run; surrounding text stays as text runs"
      (is (= [{:ruby? true :base "参加希望" :reading "さんかきぼう"} {:text "の方は"}]
             (strip (#'pdf/parse-ruby "{参加希望|さんかきぼう}の方は" {} nil)))))
    (testing "multiple furigana groups interleaved with text"
      (is (= [{:text "a"} {:ruby? true :base "x" :reading "y"}
              {:text "b"} {:ruby? true :base "c" :reading "d"}]
             (strip (#'pdf/parse-ruby "a{x|y}b{c|d}" {} nil)))))
    (testing "plain text without ruby is a single text run"
      (is (= [{:text "hello world"}] (strip (#'pdf/parse-ruby "hello world" {} nil)))))
    (testing "braces without a pipe are not treated as ruby"
      (is (= [{:text "{not ruby}"}] (strip (#'pdf/parse-ruby "{not ruby}" {} nil)))))
    (testing "the run's style keys are carried onto base/reading runs"
      (is (= [{:bold? true :ruby? true :base "x" :reading "y"}]
             (strip (#'pdf/parse-ruby "{x|y}" {:bold? true} nil)))))))
