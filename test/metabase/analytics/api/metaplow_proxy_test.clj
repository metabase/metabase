(ns metabase.analytics.api.metaplow-proxy-test
  "Integration tests for the public Metabase Track telemetry relay (`POST /api/metaplow-proxy/send`).

  Mirrors `metabase.analytics.api.proxy-test`, which does the same for the Snowplow relay: `clj-http.fake` stands in
  for the collector and `metabase.test.http-client/client` issues anonymous requests."
  (:require
   [clj-http.fake :as fake]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.api.metaplow-proxy :as analytics.api.metaplow-proxy]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [throttle.core :as throttle]))

(set! *warn-on-reflection* true)

(def ^:private collector-url "http://fake-collector.test/api/send")

(def ^:private sample-payload
  "A minimal Metabase Track envelope: the `{:type :payload}` wrapper the tracker library always sends."
  {:type    "event"
   :payload {:website "23eefa30-4c4f-490e-aa4f-084cd23b1561"
             :name    "button_clicked"
             :url     "http://anonymous.metabase.com/dashboard/1"
             :data    {:nested {:arbitrary ["json" 1 true]}}}})

(defn- with-collector!
  "Pin `metaplow-url` to the fake collector, serve `response` from it, and call `f` with an atom holding the inbound
  request — still nil if nothing was forwarded."
  [response f]
  (let [captured (atom nil)]
    (mt/with-temporary-setting-values [metaplow-url collector-url]
      (fake/with-fake-routes
        {collector-url (fn [request]
                         (reset! captured request)
                         response)}
        (f captured)))))

(deftest anonymous-public-route-test
  (testing "an anonymous POST reaches the handler (no auth required) and gets the collector's 2xx back"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [_captured]
        ;; client/client with no user = anonymous. A 401 here would mean the route isn't public.
        (is (= {} (client/client :post 200 "metaplow-proxy/send" sample-payload)))))))

(deftest forwards-payload-to-collector-test
  (testing "the handler forwards the body to the configured collector as JSON, semantically unchanged"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        (client/client :post 200 "metaplow-proxy/send" sample-payload)
        (testing "outbound URL is the configured collector URL"
          (is (= collector-url
                 (str (name (:scheme @captured)) "://" (:server-name @captured) (:uri @captured)))))
        (testing "outbound body round-trips to the same JSON the SDK sent (re-encode is semantically lossless)"
          (is (= (json/decode (json/encode sample-payload))
                 (json/decode (slurp (:body @captured))))))
        (testing "outbound content-type is JSON"
          (is (re-find #"(?i)application/json"
                       (get-in @captured [:headers "content-type"] ""))))))))

(deftest relays-status-and-body-verbatim-test
  (testing "the tracker's disable/cache protocol needs the collector's own response, not a synthesized one"
    (testing "a 2xx body is relayed unchanged"
      (with-collector! {:status 200 :headers {} :body "{\"cache\":\"abc123\",\"disabled\":false}"}
        (fn [_captured]
          (is (= {:cache "abc123" :disabled false}
                 (client/client :post 200 "metaplow-proxy/send" sample-payload))))))
    (testing "a non-2xx status and body are relayed unchanged"
      (with-collector! {:status 400 :headers {} :body "{\"error\":\"bad payload\"}"}
        (fn [_captured]
          (is (= {:error "bad payload"}
                 (client/client :post 400 "metaplow-proxy/send" sample-payload))))))))

(deftest forwards-cache-token-test
  (testing "the tracker echoes the collector's cache token in `x-track-cache`; it is forwarded so the collector can
           skip a session lookup"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        (client/client :post 200 "metaplow-proxy/send"
                       {:request-options {:headers {"x-track-cache" "abc123"}}}
                       sample-payload)
        (is (= "abc123" (get-in @captured [:headers "x-track-cache"]))))))
  (testing "a cache token that is not a plain token string is dropped rather than forwarded"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        (client/client :post 200 "metaplow-proxy/send"
                       {:request-options {:headers {"x-track-cache" "not a token"}}}
                       sample-payload)
        (is (nil? (get-in @captured [:headers "x-track-cache"])))))))

(deftest rejects-invalid-envelope-test
  (testing "the envelope is validated even though the event data inside it is arbitrary JSON"
    (doseq [[what payload] {"a missing payload"           {:type "event"}
                            "a missing type"              {:payload {:website "abc"}}
                            "an unknown type"             {:type "pageview" :payload {:website "abc"}}
                            "an identify call"            {:type "identify" :payload {:website "abc"}}
                            "a blank website"             {:type "event" :payload {:website ""}}
                            "a payload that is not a map" {:type "event" :payload "nope"}}]
      (testing what
        (with-collector! {:status 200 :headers {} :body "{}"}
          (fn [captured]
            (client/client :post 400 "metaplow-proxy/send" payload)
            (is (nil? @captured) "nothing should reach the collector")))))))

(deftest body-size-cap-test
  (testing "an oversized body is rejected with 413 and never reaches the collector"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        ;; well past the 64KB cap
        (client/client :post 413 "metaplow-proxy/send"
                       (assoc-in sample-payload [:payload :data :blob] (str/join (repeat 100000 "x"))))
        (is (nil? @captured) "nothing should reach the collector"))))
  (testing "a payload comfortably under the cap is relayed"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [_captured]
        (is (= {} (client/client :post 200 "metaplow-proxy/send"
                                 (assoc-in sample-payload [:payload :data :blob] (str/join (repeat 1000 "x"))))))))))

(deftest gated-on-metaplow-tracking-test
  (testing "with no collector URL configured there is nothing to relay to"
    (mt/with-temporary-setting-values [metaplow-url nil]
      (client/client :post 503 "metaplow-proxy/send" sample-payload)))
  (testing "an instance that opted out of anonymous tracking does not relay a caller's events either"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        (mt/with-temporary-setting-values [anon-tracking-enabled false]
          (client/client :post 503 "metaplow-proxy/send" sample-payload))
        (is (nil? @captured) "nothing should reach the collector")))))

(deftest unreachable-collector-returns-502-test
  (testing "when the collector is unreachable the relay returns 502 rather than throwing"
    (mt/with-temporary-setting-values [metaplow-url collector-url]
      (fake/with-fake-routes
        {collector-url (fn [_request]
                         (throw (java.net.ConnectException. "connection refused")))}
        (client/client :post 502 "metaplow-proxy/send" sample-payload)))))

(deftest no-client-ip-forwarded-test
  (testing "the relay does not add X-Forwarded-For (the payload is already anonymized by the tracker)"
    (with-collector! {:status 200 :headers {} :body "{}"}
      (fn [captured]
        (client/client :post 200 "metaplow-proxy/send" sample-payload)
        (is (nil? (get-in @captured [:headers "x-forwarded-for"])))))))

(def ^:private throttled-response
  "A throttled response carries `Retry-After` and no body: the tracker assigns its cache token from any response body
  it can parse, so a body here would clear the collector's token on every throttled send."
  {:status  429
   :headers {"Retry-After" string?}
   :body    nil})

(defn- request-options
  "Request options that make `ip` the source address the server derives for the request. `ip-address` reads
  `X-Forwarded-For` by default, which is also why the throttle bucket is only as trustworthy as the deployment."
  [ip]
  {:request-options {:headers {"x-forwarded-for" ip}}})

(defmacro ^:private with-one-request-budget
  "Pin the relay throttler to a single request per source address, so one request exhausts a caller's budget."
  [& body]
  `(with-redefs [analytics.api.metaplow-proxy/throttler
                 (throttle/make-throttler :metaplow-proxy :attempts-threshold 1)]
     ~@body))

(deftest throttles-anonymous-caller-test
  (testing "an anonymous caller is let through under the per-IP rate and rejected with a 429 above it"
    (with-one-request-budget
      (with-collector! {:status 200 :headers {} :body "{}"}
        (fn [_captured]
          (let [opts (request-options "10.1.2.3")]
            (testing "permitted path"
              (is (= {} (client/client :post 200 "metaplow-proxy/send" opts sample-payload))))
            (testing "throttled path"
              (is (=? throttled-response
                      (client/client-full-response :post 429 "metaplow-proxy/send" opts sample-payload))))))))))

(deftest throttle-is-keyed-per-source-address-test
  (testing "one caller exhausting its budget does not throttle a different source address"
    (with-one-request-budget
      (with-collector! {:status 200 :headers {} :body "{}"}
        (fn [_captured]
          (is (= {} (client/client :post 200 "metaplow-proxy/send" (request-options "10.1.2.3") sample-payload)))
          (is (=? throttled-response
                  (client/client-full-response :post 429 "metaplow-proxy/send" (request-options "10.1.2.3")
                                               sample-payload)))
          (is (= {} (client/client :post 200 "metaplow-proxy/send" (request-options "10.9.9.9")
                                   sample-payload))))))))

(deftest throttled-request-never-reaches-the-collector-test
  (testing "a throttled request is rejected before the handler forwards anything, so it holds no outbound connection"
    (with-one-request-budget
      (with-collector! {:status 200 :headers {} :body "{}"}
        (fn [captured]
          (let [opts (request-options "10.1.2.3")]
            (client/client :post 200 "metaplow-proxy/send" opts sample-payload)
            (reset! captured nil)
            (client/client-full-response :post 429 "metaplow-proxy/send" opts sample-payload)
            (is (nil? @captured) "nothing should reach the collector")))))))

(deftest throttle-runs-before-body-validation-test
  (testing "a rejected payload still spends the caller's budget, so malformed floods cannot evade the throttle"
    (with-one-request-budget
      (with-collector! {:status 200 :headers {} :body "{}"}
        (fn [_captured]
          (let [opts (request-options "10.1.2.3")]
            (client/client :post 400 "metaplow-proxy/send" opts {:type "event"})
            (is (=? throttled-response
                    (client/client-full-response :post 429 "metaplow-proxy/send" opts sample-payload)))))))))
