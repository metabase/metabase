(ns metabase.request.util-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.reader.edn :as edn]
   [java-time.api :as t]
   [metabase.request.util :as req.util]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [ring.mock.request :as ring.mock]))

(deftest ^:parallel cacheable?-test
  (testing "JS/CSS with cache-busting hash are cacheable"
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/dist/main.abc123def.js"})))
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/dist/styles.abc123def.css"}))))
  (testing "Resources in /app/dist/ with hex hash prefix are cacheable"
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/dist/abc123def456.png"}))))
  (testing "Font files are cacheable"
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/fonts/Lato/lato-v16-latin-regular.woff2"})))
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/fonts/Lato/lato-v16-latin-regular.woff"})))
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/fonts/CustomFont/custom.ttf"})))
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/fonts/CustomFont/custom.otf"})))
    (is (some? (req.util/cacheable? {:request-method :get :uri "/app/fonts/CustomFont/custom.eot"}))))
  (testing "Non-GET requests are not cacheable"
    (is (not (req.util/cacheable? {:request-method :post :uri "/app/fonts/Lato/lato.woff2"}))))
  (testing "Other paths are not cacheable"
    (is (not (req.util/cacheable? {:request-method :get :uri "/api/dashboard/1"})))
    (is (not (req.util/cacheable? {:request-method :get :uri "/app/dist/main.js"})))))

(deftest ^:parallel https?-test
  (doseq [[headers expected] {{"x-forwarded-proto" "https"}    true
                              {"x-forwarded-proto" "http"}     false
                              {"x-forwarded-protocol" "https"} true
                              {"x-forwarded-protocol" "http"}  false
                              {"x-url-scheme" "https"}         true
                              {"x-url-scheme" "http"}          false
                              {"x-forwarded-ssl" "on"}         true
                              {"x-forwarded-ssl" "off"}        false
                              {"front-end-https" "on"}         true
                              {"front-end-https" "off"}        false
                              {"origin" "https://mysite.com"}  true
                              {"origin" "http://mysite.com"}   false}]
    (testing (pr-str (list 'https? {:headers headers}))
      (is (= expected
             (req.util/https? {:headers headers}))))))

(def ^:private mock-request
  (delay (edn/read-string (slurp "test/metabase/server/request/sample-request.edn"))))

(deftest ^:parallel device-info-test
  (testing "Regular, non-embedded request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           false
            :ip_address         "0:0:0:0:0:0:0:1"}
           (req.util/device-info @mock-request))))
  (testing "SDK request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           true
            :ip_address         "0:0:0:0:0:0:0:1"}
           (req.util/device-info (update @mock-request :headers assoc "x-metabase-client" "embedding-sdk-react")))))
  (testing "Modular embedding request"
    (is (= {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
            :embedded           true
            :ip_address         "0:0:0:0:0:0:0:1"}
           (req.util/device-info (update @mock-request :headers assoc "x-metabase-client" "embedding-simple"))))))

(deftest ^:parallel describe-user-agent-test
  (are [user-agent expected] (= expected (req.util/describe-user-agent user-agent))
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
             (req.util/ip-address request))))

    (testing "request with forwarding"
      (let [mock-request (-> (ring.mock/request :get "api/session")
                             (ring.mock/header "X-Forwarded-For" "5.6.7.8"))]
        (is (= "5.6.7.8"
               (req.util/ip-address mock-request))))
      (testing "multiple IP addresses"
        (let [mock-request (-> (ring.mock/request :get "api/session")
                               (ring.mock/header "X-Forwarded-For" "1.2.3.4, 5.6.7.8"))]
          (is (= "1.2.3.4"
                 (req.util/ip-address mock-request)))))
      (testing "different header than default X-Forwarded-For"
        (mt/with-temporary-setting-values [source-address-header "X-ProxyUser-Ip"]
          (let [mock-request (-> (ring.mock/request :get "api/session")
                                 (ring.mock/header "x-proxyuser-ip" "1.2.3.4"))]
            (is (= "1.2.3.4"
                   (req.util/ip-address mock-request)))))))

    (testing "forwarding explicitly disabled via MB_NOT_BEHIND_PROXY=true"
      (mt/with-temp-env-var-value! [mb-not-behind-proxy "true"]
        (let [mock-request (-> (ring.mock/request :get "api/session")
                               (ring.mock/header "X-Forwarded-For" "5.6.7.8"))]
          (is (= "127.0.0.1"
                 (req.util/ip-address mock-request))))))))

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
      (with-redefs [http/get (fn [_ _] (throw (Exception. "Network error")))]
        (req.util/geocode-ip-addresses ["8.8.8.8"])
        (is (= 1.0 (mt/metric-value system :metabase-geocoding/errors)))))))
