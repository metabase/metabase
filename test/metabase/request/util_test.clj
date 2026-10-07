(ns metabase.request.util-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.reader.edn :as edn]
   [java-time.api :as t]
   [metabase.request.current :as request.current]
   [metabase.request.user-agent :as request.user-agent]
   [metabase.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [ring.mock.request :as ring.mock]))

(defn- cacheable? [uri]
  (req.util/cacheable? {:request-method :get :uri uri}))

(deftest ^:parallel cacheable?-test
  (testing "a content hash in the name makes an asset cacheable, whatever its extension"
    (are [uri] (true? (cacheable? uri))
      "/app/dist/main.abc123def.js"
      "/app/dist/styles.abc123def.css"
      "/app/dist/abc123def456.png"
      "/app/dist/abc123def456.svg"
      "/app/dist/e6cb5532b88aec25.gif"
      ;; the build emits bare `<hash>.<ext>` today, but a named variant must stay cacheable
      "/app/dist/embed-js-example.a1b2c3d4e5f6.png"
      ;; compressed and sourcemap companions keep the hash of the file they belong to
      "/app/dist/home.713b08815fb2dac3.js.map"
      "/app/dist/0f617f82e97365e8.svg.br"))
  (testing "fonts are cacheable"
    (are [uri] (true? (cacheable? uri))
      "/app/fonts/Lato/lato-v16-latin-regular.woff2"
      "/app/fonts/Lato/lato-v16-latin-regular.woff"
      "/app/fonts/CustomFont/custom.ttf"
      "/app/fonts/CustomFont/custom.otf"
      "/app/fonts/CustomFont/custom.eot"))
  (testing "a name without a content hash is never cacheable, even when it starts with hex digits"
    (are [uri] (false? (cacheable? uri))
      "/app/dist/main.js"
      "/app/dist/favicon.png"
      "/app/dist/abc.png"
      "/app/dist/deadbee.css"))
  (testing "only GETs are cacheable"
    (is (false? (req.util/cacheable? {:request-method :post :uri "/app/dist/abc123def456.png"}))))
  (testing "other paths are not cacheable"
    (are [uri] (false? (cacheable? uri))
      "/api/dashboard/1"
      "/app/assets/img/logo.svg")))

(deftest ^:parallel https-state-test
  (doseq [[headers expected] {{"x-forwarded-proto" "https"}    :https
                              {"x-forwarded-proto" "http"}     :http
                              {"x-forwarded-protocol" "https"} :https
                              {"x-forwarded-protocol" "http"}  :http
                              {"x-url-scheme" "https"}         :https
                              {"x-url-scheme" "http"}          :http
                              {"x-forwarded-ssl" "on"}         :https
                              {"x-forwarded-ssl" "off"}        :http
                              {"front-end-https" "on"}         :https
                              {"front-end-https" "off"}        :http
                              ;; `Origin` names the page that issued the request, not the transport it arrived on,
                              ;; and the client picks it, so it can only leave the transport unknown
                              {"origin" "https://mysite.com"}  :unknown
                              {"origin" "http://mysite.com"}   :http
                              ;; a blank proto header must fall through to the boolean HTTPS indicators (BOT-1617)
                              {"x-forwarded-proto" "" "x-forwarded-ssl" "on"}          :https
                              {"x-forwarded-proto" "" "front-end-https" "on"}          :https
                              {"x-forwarded-proto" "  " "origin" "https://mysite.com"} :unknown
                              ;; the first hop of a comma-separated chain wins
                              {"x-forwarded-proto" "https, http"} :https
                              {"x-forwarded-proto" "HTTPS"}       :https}]
    (testing (pr-str (list 'https-state {:headers headers}))
      (is (= expected
             (req.util/https-state {:headers headers}))))))

(def ^:private mock-request
  (delay (edn/read-string (slurp "test/metabase/server/request/sample-request.edn"))))

(deftest ^:parallel device-info-test
  (testing "Regular, non-embedded request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           false
            :ip_address         "0:0:0:0:0:0:0:1"
            :token_exchange     false}
           (req.util/device-info @mock-request))))
  (testing "SDK request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           true
            :ip_address         "0:0:0:0:0:0:0:1"
            :token_exchange     false}
           (req.util/device-info (update @mock-request :headers assoc "x-metabase-client" "embedding-sdk-react")))))
  (testing "Modular embedding request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           true
            :ip_address         "0:0:0:0:0:0:0:1"
            :token_exchange     false}
           (req.util/device-info (update @mock-request :headers assoc "x-metabase-client" "embedding-simple"))))))

(deftest ^:parallel describe-user-agent-test
  (are [user-agent expected] (= expected (request.user-agent/describe-user-agent user-agent))
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"
    "Browser (Chrome/Windows)"

    "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML  like Gecko) Version/10.0 Mobile/14E304 Safari/602.1"
    "Mobile Browser (Mobile Safari/iOS)"

    "Apache-HttpClient/4.5.10 (Java/14.0.1)"
    "Library (Apache-HttpClient/JVM (Java))"

    "wow"
    "Unknown device type (unknown/unknown)"

    "   "
    nil

    nil
    nil))

(deftest ip-address-test
  (let [request (ring.mock/request :get "api/session")]
    (testing "request with no forwarding"
      (is (= "127.0.0.1"
             (request.current/ip-address request))))
    (testing "request with forwarding"
      (let [mock-request (-> (ring.mock/request :get "api/session")
                             (ring.mock/header "X-Forwarded-For" "5.6.7.8"))]
        (is (= "5.6.7.8"
               (request.current/ip-address mock-request))))
      (testing "multiple IP addresses -- takes the last (proxy-appended, trusted) entry, not the first"
        (let [mock-request (-> (ring.mock/request :get "api/session")
                               (ring.mock/header "X-Forwarded-For" "1.2.3.4, 5.6.7.8"))]
          (is (= "5.6.7.8"
                 (request.current/ip-address mock-request)))))
      (testing "different header than default X-Forwarded-For"
        (mt/with-temporary-setting-values [source-address-header "X-ProxyUser-Ip"]
          (let [mock-request (-> (ring.mock/request :get "api/session")
                                 (ring.mock/header "x-proxyuser-ip" "1.2.3.4"))]
            (is (= "1.2.3.4"
                   (request.current/ip-address mock-request)))))))
    (testing "forwarding explicitly disabled via MB_NOT_BEHIND_PROXY=true"
      (mt/with-temp-env-var-value! [mb-not-behind-proxy "true"]
        (let [mock-request (-> (ring.mock/request :get "api/session")
                               (ring.mock/header "X-Forwarded-For" "5.6.7.8"))]
          (is (= "127.0.0.1"
                 (request.current/ip-address mock-request))))))))

(def ^:private mock-geojs-responses
  "Canned GeoJS responses for test IPs. These mock what GeoJS would return."
  {"8.8.8.8"              {:city "" :region "" :country "United States" :timezone "America/Chicago"}
   "185.233.100.23"       {:city "Paris" :region "" :country "France" :timezone "Europe/Paris"}
   "127.0.0.1"            {:city "" :region "" :country "" :timezone nil}
   "0:0:0:0:0:0:0:1"      {:city "" :region "" :country "" :timezone nil}
   "52.206.149.9"         {:city "" :region "Virginia" :country "United States" :timezone "America/New_York"}
   "2001:4860:4860::8844" {:city "" :region "" :country "United States" :timezone "America/Chicago"}})

(defn- mock-geojs-http-get
  "Mock HTTP GET that returns canned GeoJS responses for test IPs."
  [url _opts]
  (let [ips (-> url (str/split #"\?ip=") second (str/split #","))]
    {:body (json/encode (mapv #(assoc (get mock-geojs-responses % {}) :ip %) ips))}))

(deftest geocode-ip-addresses-test
  ;; Not ^:parallel because with-redefs mutates global state
  (with-redefs [http/get mock-geojs-http-get]
    (are [ip-addresses expected] (malli= expected
                                         (req.util/geocode-ip-addresses ip-addresses))
      ;; Google DNS
      ["8.8.8.8"]
      [:map
       ["8.8.8.8" [:map
                   [:description [:= "United States"]]
                   [:timezone    [:= (t/zone-id "America/Chicago")]]]]]

      ;; this is from the MaxMind sample high-risk IP address list https://www.maxmind.com/en/high-risk-ip-sample-list
      ["185.233.100.23"]
      [:map
       ["185.233.100.23" [:map
                          [:description [:= "Paris, France"]]
                          [:timezone    [:= (t/zone-id "Europe/Paris")]]]]]

      ["127.0.0.1"]
      [:map
       ["127.0.0.1" [:map
                     [:description [:= "Unknown location"]]
                     [:timezone    :nil]]]]

      ["0:0:0:0:0:0:0:1"]
      [:map
       ["0:0:0:0:0:0:0:1" [:map
                           [:description [:= "Unknown location"]]
                           [:timezone    :nil]]]]

      ;; multiple addresses at once
      ;; store.metabase.com, Google DNS
      ["52.206.149.9" "2001:4860:4860::8844"]
      [:map
       ["52.206.149.9"         [:map
                                [:description [:= "Virginia, United States"]]
                                [:timezone    [:= (t/zone-id "America/New_York")]]]]
       ["2001:4860:4860::8844" [:map
                                [:description [:= "United States"]]
                                [:timezone    [:= (t/zone-id "America/Chicago")]]]]]

      ;; invalid inputs - these don't make HTTP calls, filtered before request
      ["wow"] :nil
      ["   "] :nil
      []      :nil
      nil     :nil)))

(deftest geocode-ip-addresses-metrics-test
  (testing "increments :metabase-geocoding/requests on successful geocoding"
    (mt/with-prometheus-system! [_ system]
      (with-redefs [http/get mock-geojs-http-get]
        (req.util/geocode-ip-addresses ["8.8.8.8"])
        (is (= 1.0 (mt/metric-value system :metabase-geocoding/requests))))))
  (testing "increments :metabase-geocoding/errors on failed geocoding"
    (mt/with-prometheus-system! [_ system]
      (mt/with-dynamic-fn-redefs [http/get (fn [_ _] (throw (Exception. "Network error")))]
        (req.util/geocode-ip-addresses ["8.8.8.8"])
        (is (= 1.0 (mt/metric-value system :metabase-geocoding/errors)))))))
