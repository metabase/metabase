(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.test.util.dynamic-redefs :refer [with-dynamic-fn-redefs]]
   [metabase.util.http :as http]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (clojure.lang ExceptionInfo)
   (java.io ByteArrayInputStream)
   (java.net InetAddress)
   (org.apache.http.conn DnsResolver)
   (org.apache.http.impl.conn InMemoryDnsResolver)
   (org.eclipse.jetty.server Server)))

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

(deftest ^:parallel default-network-policy-test
  (testing "the policy applied when a caller names none refuses a non-public address"
    ;; `localhost` resolves to loopback (no network needed) -> must be refused
    (is (thrown? ExceptionInfo
                 (.resolve ^DnsResolver (http/network-policy-dns-resolver @#'http/default-network-policy)
                           "localhost")))))

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

;;; ------------------------------------------------ request ------------------------------------------------

(defn- blocked-address-ex?
  "Whether `e`, or anything that caused it, is the policy resolver's refusal."
  [e]
  (loop [^Throwable t e]
    (cond
      (nil? t)                       false
      (:blocked-address (ex-data t)) true
      :else                          (recur (.getCause t)))))

(defn- addresses [& ips]
  (into-array InetAddress (map #(InetAddress/getByName %) ips)))

(defn- do-with-redirect-server
  "Calls `f` with the port of a local server. `/start` redirects to `/final` on a different hostname,
  so the two hops resolve separately."
  [f]
  (let [port           (promise)
        handler        (fn [{:keys [uri] :as req}]
                         (case uri
                           ;; echo back what the request carried
                           "/echo" {:status 200
                                    :body   (str (name (:request-method req))
                                                 "|" (get-in req [:headers "content-type"])
                                                 "|" (slurp (:body req)))}
                           "/start" {:status  302
                                     :headers {"Location" (str "http://hop.test:" @port "/final")}
                                     :body    ""}
                           ;; a Location with no hostname to resolve
                           "/start-ip" {:status  302
                                        :headers {"Location" (str "http://127.0.0.2:" @port "/final")}
                                        :body    ""}
                           "/final" {:status 200, :body "final"}
                           {:status 404, :body ""}))
        ^Server server (ring-jetty/run-jetty handler {:join? false, :port 0})]
    (try
      (deliver port (.. server getURI getPort))
      (f @port)
      (finally (.stop server)))))

(deftest request-applies-a-policy-by-default-test
  (testing "a caller that names no policy still gets one"
    (do-with-redirect-server
     (fn [port]
       (let [e (is (thrown? Exception (http/get (str "http://localhost:" port "/final") {})))]
         (is (blocked-address-ex? e)))))))

(deftest request-honors-an-explicit-policy-test
  (testing ":allow-all reaches a loopback server"
    (do-with-redirect-server
     (fn [port]
       (is (= 200 (:status (http/get (str "http://localhost:" port "/final")
                                     {:network-policy :allow-all}))))))))

(deftest request-ignores-a-caller-supplied-resolver-test
  (testing "a permissive :dns-resolver in opts does not get to override the policy"
    (do-with-redirect-server
     (fn [port]
       (let [permissive (doto (InMemoryDnsResolver.)
                          (.add "localhost" (addresses "127.0.0.1")))
             e          (is (thrown? Exception
                                     (http/get (str "http://localhost:" port "/final")
                                               {:dns-resolver permissive})))]
         (is (blocked-address-ex? e)))))))

(deftest request-policy-gates-redirect-hops-test
  (testing "the policy is applied to the redirect target, not only to the first host"
    (do-with-redirect-server
     (fn [port]
       (let [checked (atom #{})]
         (binding [http/*system-dns-resolver* (doto (InMemoryDnsResolver.)
                                               (.add "start.test" (addresses "127.0.0.1"))
                                               (.add "hop.test"   (addresses "127.0.0.2")))]
           ;; permit the first hop's address and refuse the redirect target's, so only a check on
           ;; the redirect hop can stop this
           (with-dynamic-fn-redefs [http/address-allowed-for-network-policy?
                                    (fn [_policy ^InetAddress addr]
                                      (let [ip (.getHostAddress addr)]
                                        (swap! checked conj ip)
                                        (= "127.0.0.1" ip)))]
             (let [e (is (thrown? Exception (http/get (str "http://start.test:" port "/start") {})))]
               (is (blocked-address-ex? e))
               (is (contains? @checked "127.0.0.2")
                   "the redirect target was put through the policy check")))))))))

(deftest request-checks-an-ip-literal-host-test
  (testing "a host written as an IP literal is checked, not waved through for having no name to resolve"
    (do-with-redirect-server
     (fn [port]
       (let [e (is (thrown? Exception (http/get (str "http://127.0.0.1:" port "/final") {})))]
         (is (blocked-address-ex? e)))))))

(deftest request-policy-gates-a-redirect-to-an-ip-literal-test
  (testing "an IP literal in Location goes through the policy too"
    (do-with-redirect-server
     (fn [port]
       (let [checked (atom #{})]
         (binding [http/*system-dns-resolver* (doto (InMemoryDnsResolver.)
                                               (.add "start.test" (addresses "127.0.0.1"))
                                               ;; what the system resolver does with a literal: hands it back
                                               (.add "127.0.0.2" (addresses "127.0.0.2")))]
           (with-dynamic-fn-redefs [http/address-allowed-for-network-policy?
                                    (fn [_policy ^InetAddress addr]
                                      (let [ip (.getHostAddress addr)]
                                        (swap! checked conj ip)
                                        (= "127.0.0.1" ip)))]
             (let [e (is (thrown? Exception (http/get (str "http://start.test:" port "/start-ip") {})))]
               (is (blocked-address-ex? e))
               (is (contains? @checked "127.0.0.2")
                   "the IP-literal redirect target was put through the policy check")))))))))

(deftest post-payload-travels-in-opts-test
  (testing "a body in `opts` reaches the server, and clj-http's own middleware still runs on it"
    (do-with-redirect-server
     (fn [port]
       (let [url (str "http://127.0.0.1:" port "/echo")]
         (testing "an explicit :body with :content-type"
           (is (= "post|application/json|{\"a\":1}"
                  (:body (http/post url {:body           "{\"a\":1}"
                                         :content-type   :json
                                         :network-policy :allow-all})))))
         (testing ":form-params, which only clj-http's middleware knows how to encode"
           (is (= "post|application/x-www-form-urlencoded|a=1&b=2"
                  (:body (http/post url {:form-params    {:a 1 :b 2}
                                         :network-policy :allow-all}))))))))))

(deftest request-rejects-a-nil-url-test
  (testing "an unset URL setting gets a readable error rather than an obscure failure"
    (is (thrown-with-msg? IllegalArgumentException #"URL cannot be nil"
                          (http/get nil {:network-policy :allow-all})))))
