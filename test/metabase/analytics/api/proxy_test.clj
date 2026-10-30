(ns metabase.analytics.api.proxy-test
  "Integration tests for the public Snowplow telemetry proxy (`POST /api/analytics-proxy`).

  Mirrors `metabase.geojson.api-test`: a public endpoint that forwards an outbound HTTP call, exercised with
  `clj-http.fake/with-fake-routes` to mock the collector and `metabase.test.http-client/client` for anonymous
  requests."
  (:require
   [clj-http.fake :as fake]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [diehard.bulkhead :as dh.bh]
   [metabase.analytics.api.proxy :as analytics.api.proxy]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [throttle.core :as throttle]))

(set! *warn-on-reflection* true)

(def ^:private fake-collector-host "http://fake-collector.test")

(defn- collector-url []
  (str fake-collector-host "/com.snowplowanalytics.snowplow/tp2"))

(def ^:private sample-payload
  "A minimal Snowplow `tp2` envelope shape — schema + an events array."
  {:schema "iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4"
   :data   [{:e "ue" :p "web" :tv "js-3.24.6"}]})

(defmacro ^:private with-collector
  "Run `body` with `snowplow-url` pinned to the fake collector host and a fake route that returns `response`.
  When `request-atom` is provided, records the inbound request into it for inspection."
  [& args]
  (if (symbol? (first args))
    (let [[request-atom response & body] args]
      `(mt/with-temporary-setting-values [~'snowplow-url fake-collector-host]
         (fake/with-fake-routes
           {(collector-url) (fn [request#]
                              (reset! ~request-atom request#)
                              ~response)}
           ~@body)))
    (let [[response & body] args]
      `(mt/with-temporary-setting-values [~'snowplow-url fake-collector-host]
         (fake/with-fake-routes
           {(collector-url) (constantly ~response)}
           ~@body)))))

(def ^:private throttled-response
  {:status  429
   :headers {"Retry-After" string?}
   :body    {:error #(str/starts-with? % "Too many attempts!")}})

(defn- request-options
  "Request options that make `ip` the server-derived source address for the request."
  [ip]
  {:request-options {:headers {"x-forwarded-for" ip}}})

(defmacro ^:private with-one-request-budget
  "Pin the proxy throttler to a single request per source address, so one request exhausts a caller's budget."
  [& body]
  `(with-redefs [analytics.api.proxy/throttler
                 (throttle/make-throttler :analytics-proxy :attempts-threshold 1)]
     ~@body))

(defmacro ^:private with-forward-capacity
  "Pin the relay's bulkhead to `n` concurrent forwards. `0` leaves no permit, so every request is shed."
  [n & body]
  `(with-redefs [analytics.api.proxy/forward-bulkhead (dh.bh/bulkhead {:concurrency ~n})]
     ~@body))

(deftest anonymous-public-route-test
  (testing "an anonymous POST reaches the handler (no auth required) and gets a 2xx back"
    (with-collector {:status 200 :headers {} :body "{}"}
      ;; client/client with no user = anonymous. A 401 here would mean the route isn't public.
      (is (= {} (client/client :post 200 "analytics-proxy" sample-payload))))))

(deftest forwards-payload-to-collector-test
  (testing "the handler forwards the body to the collector's tp2 endpoint as JSON, semantically unchanged"
    (let [captured (atom nil)]
      (with-collector captured {:status 200 :headers {} :body "{}"}
        (client/client :post 200 "analytics-proxy" sample-payload))
      (testing "outbound URL is sp.metabase.com + tp2 path"
        (is (= (collector-url) (str (name (:scheme @captured)) "://" (:server-name @captured) (:uri @captured)))))
      (testing "outbound body round-trips to the same JSON the SDK sent (re-encode is semantically lossless)"
        (is (= (json/decode (json/encode sample-payload))
               (json/decode (slurp (:body @captured))))))
      (testing "outbound content-type is JSON"
        (is (re-find #"(?i)application/json"
                     (get-in @captured [:headers "content-type"] "")))))))

(deftest relays-collector-status-verbatim-test
  (testing "non-2xx status and body are relayed unchanged so the tracker can retry"
    (with-collector {:status 400 :headers {} :body "{\"error\":\"bad payload\"}"}
      (is (= {:error "bad payload"}
             (client/client :post 400 "analytics-proxy" sample-payload))))))

(deftest unreachable-collector-returns-502-test
  (testing "when the collector is unreachable the proxy returns 502 (retryable) rather than throwing"
    (mt/with-temporary-setting-values [snowplow-url fake-collector-host]
      (fake/with-fake-routes
        {(collector-url) (fn [_request]
                           (throw (java.net.ConnectException. "connection refused")))}
        (client/client :post 502 "analytics-proxy" sample-payload)))))

(deftest no-client-ip-forwarded-test
  (testing "the proxy does not add X-Forwarded-For (preserves the tracker's server-anonymisation intent)"
    (let [captured (atom nil)]
      (with-collector captured {:status 200 :headers {} :body "{}"}
        (client/client :post 200 "analytics-proxy" sample-payload))
      (is (nil? (get-in @captured [:headers "x-forwarded-for"]))))))

(deftest throttles-anonymous-caller-test
  (testing "an anonymous caller is let through under the per-IP rate and rejected with a 429 above it"
    (with-one-request-budget
      (with-collector {:status 200 :headers {} :body "{}"}
        (let [opts (request-options "10.1.2.3")]
          (testing "permitted path"
            (is (= {} (client/client :post 200 "analytics-proxy" opts sample-payload))))
          (testing "throttled path"
            (is (=? throttled-response
                    (client/client-full-response :post 429 "analytics-proxy" opts sample-payload)))))))))

(deftest throttle-is-keyed-per-source-address-test
  (testing "one caller exhausting its budget does not throttle a different source address"
    (with-one-request-budget
      (with-collector {:status 200 :headers {} :body "{}"}
        (is (= {} (client/client :post 200 "analytics-proxy" (request-options "10.1.2.3") sample-payload)))
        (is (=? throttled-response
                (client/client-full-response :post 429 "analytics-proxy" (request-options "10.1.2.3")
                                             sample-payload)))
        (is (= {} (client/client :post 200 "analytics-proxy" (request-options "10.9.9.9") sample-payload)))))))

(deftest throttled-request-never-reaches-the-collector-test
  (testing "a throttled request is rejected before the handler forwards anything, so it holds no outbound connection"
    (let [captured (atom nil)]
      (with-collector captured {:status 200 :headers {} :body "{}"}
        (with-one-request-budget
          (let [opts (request-options "10.1.2.3")]
            (client/client :post 200 "analytics-proxy" opts sample-payload)
            (reset! captured nil)
            (client/client-full-response :post 429 "analytics-proxy" opts sample-payload)
            (is (nil? @captured))))))))

(deftest throttle-runs-before-body-validation-test
  (testing "a rejected payload still spends the caller's budget, so malformed floods cannot evade the throttle"
    (with-one-request-budget
      (with-collector {:status 200 :headers {} :body "{}"}
        (let [opts (request-options "10.1.2.3")]
          (client/client :post 400 "analytics-proxy" opts {:schema "" :data []})
          (is (=? throttled-response
                  (client/client-full-response :post 429 "analytics-proxy" opts sample-payload))))))))
(deftest sheds-forward-without-bulkhead-permit-test
  (testing "a request that cannot take a bulkhead permit is shed with a 503 and never reaches the collector"
    (let [captured (atom nil)]
      (with-forward-capacity 0
        (with-collector captured {:status 200 :headers {} :body "{}"}
          (is (=? {:status 503}
                  (client/client-full-response :post 503 "analytics-proxy" sample-payload)))))
      (is (nil? @captured) "shedding must happen before the outbound call, not after it"))))

(deftest releases-bulkhead-permit-after-forward-test
  (testing "each forward hands its permit back, so a single-permit bulkhead still serves serial requests"
    (with-forward-capacity 1
      (with-collector {:status 200 :headers {} :body "{}"}
        (dotimes [_ 3]
          (is (= {} (client/client :post 200 "analytics-proxy" sample-payload))))))))
