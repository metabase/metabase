(ns metabase.analytics.api.proxy-test
  "Integration tests for the public Snowplow telemetry proxy (`POST /api/analytics-proxy`).

  Mirrors `metabase.geojson.api-test`: a public endpoint that forwards an outbound HTTP call, exercised with
  `clj-http.fake/with-fake-routes` to mock the collector and `metabase.test.http-client/client` for anonymous
  requests."
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]))

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
