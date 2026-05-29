(ns metabase.analytics.proxy-api-test
  "Integration tests for the public Snowplow telemetry proxy (`POST /api/analytics-proxy`, EMB-1758).

  Mirrors `metabase.geojson.api-test`: a public endpoint that forwards an outbound HTTP call, exercised with
  `clj-http.fake/with-fake-routes` to mock the collector and `metabase.test.http-client/client` for anonymous
  requests."
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.analytics.settings :as analytics.settings]
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
  "Run `body` with `snowplow-url` pinned to the fake collector host and a fake route that records the inbound request
  into `request-atom` then returns `response`."
  [request-atom response & body]
  `(mt/with-temporary-setting-values [~'snowplow-url fake-collector-host]
     (fake/with-fake-routes
       {(collector-url) (fn [request#]
                          (reset! ~request-atom request#)
                          ~response)}
       ~@body)))

(deftest anonymous-public-route-test
  (testing "an anonymous POST reaches the handler (no auth required) and gets a 2xx back"
    (let [captured (atom nil)]
      (with-collector captured {:status 200 :headers {} :body "{}"}
        ;; client/client with no user = anonymous. A 401 here would mean the route isn't public.
        (is (= {} (client/client :post 200 "analytics-proxy" sample-payload)))))))

(deftest forwards-payload-to-collector-test
  (testing "the handler forwards the body to the collector's tp2 endpoint as JSON, semantically unchanged"
    (let [captured (atom nil)]
      (with-collector captured {:status 200 :headers {} :body "{}"}
        (client/client :post 200 "analytics-proxy" sample-payload))
      (testing "outbound URL is the configured collector + tp2 path"
        (is (= (collector-url) (str (name (:scheme @captured)) "://" (:server-name @captured) (:uri @captured)))))
      (testing "outbound body round-trips to the same JSON the SDK sent (re-encode is semantically lossless)"
        (is (= (json/decode (json/encode sample-payload))
               (json/decode (slurp (:body @captured))))))
      (testing "outbound content-type is JSON"
        (is (re-find #"(?i)application/json"
                     (or (get-in @captured [:headers "content-type"])
                         (get-in @captured [:headers "Content-Type"])
                         "")))))))

(deftest relays-collector-status-verbatim-test
  (testing "a non-2xx collector response is relayed unchanged (not masked as a 2xx) so the tracker can retry"
    (let [captured (atom nil)]
      (with-collector captured {:status 400 :headers {} :body "bad payload"}
        ;; client/client asserts the expected status — passing 400 proves the proxy relayed 400, not 200/500.
        (client/client :post 400 "analytics-proxy" sample-payload)))))

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
      (is (nil? (get-in @captured [:headers "X-Forwarded-For"])))
      (is (nil? (get-in @captured [:headers "x-forwarded-for"]))))))
