(ns metabase.server.middleware.premium-features-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.server.middleware.premium-features-cache :as mw.pf-cache]
   [metabase.test :as mt])
  (:import
   (java.time Duration Instant)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(def ^:private cookie-name (var-get #'mw.pf-cache/cookie-name))

(defn- request-with-cookie [value]
  {:cookies {cookie-name {:value value}}})

(defn- run-middleware
  "Run the middleware over `request` with a handler that responds with `response`. Returns the response the middleware
  passed to `respond`."
  [request response]
  (let [result  (promise)
        handler (mw.pf-cache/wrap-premium-features-cache-check
                 (fn [_request respond _raise] (respond response)))]
    (handler request result (fn [e] (throw e)))
    @result))

(defn- do-with-clear-counter!
  "Call `(f calls)` with `clear-local-cache!` replaced by a counter and a fresh last-known invalidation. `calls` is the
  counter atom."
  [f]
  (let [calls (atom 0)]
    (with-redefs [mw.pf-cache/last-known-invalidation (atom nil)]
      (mt/with-dynamic-fn-redefs [premium-features/clear-local-cache! (fn [] (swap! calls inc))]
        (f calls)))))

(deftest valid-cookie-clears-local-cache-once-test
  (do-with-clear-counter!
   (fn [calls]
     (let [request (request-with-cookie (str (Instant/now)))]
       (testing "a valid cookie clears the local cache"
         (run-middleware request {:status 200})
         (is (= 1 @calls)))
       (testing "the same cookie value does not clear the cache again"
         (run-middleware request {:status 200})
         (is (= 1 @calls)))))))

(deftest newer-and-older-cookies-test
  (do-with-clear-counter!
   (fn [calls]
     (let [now (Instant/now)]
       (run-middleware (request-with-cookie (str now)) {:status 200})
       (is (= 1 @calls))
       (testing "an older cookie is ignored"
         (run-middleware (request-with-cookie (str (.minusSeconds now 10))) {:status 200})
         (is (= 1 @calls)))
       (testing "a newer cookie clears the cache again"
         (run-middleware (request-with-cookie (str (.plusSeconds now 1))) {:status 200})
         (is (= 2 @calls)))))))

(deftest invalid-cookies-are-ignored-test
  (doseq [[description value] {"no cookie"         nil
                               "empty string"      ""
                               "malformed value"   "not-a-timestamp"
                               "non-ISO timestamp" "2026-01-01 00:00:00.0+00"
                               "far-future value"  (str (.plus (Instant/now) (Duration/ofDays 1)))
                               "over-long value"   (str (Instant/now) (apply str (repeat 40 "0")))}]
    (testing description
      (do-with-clear-counter!
       (fn [calls]
         (let [request  (if (some? value) (request-with-cookie value) {})
               response (run-middleware request {:status 200})]
           (is (zero? @calls) "the local cache is not cleared")
           (is (= {:status 200} response) "the request still goes through")))))))

(deftest small-clock-skew-is-allowed-test
  (do-with-clear-counter!
   (fn [calls]
     (run-middleware (request-with-cookie (str (.plusSeconds (Instant/now) 30))) {:status 200})
     (is (= 1 @calls) "a cookie a little in the future (within the allowed clock skew) is honored"))))

(deftest sets-cookie-on-refresh-test
  (do-with-clear-counter!
   (fn [calls]
     (testing "a response without the refresh marker is passed through unchanged"
       (is (= {:status 200} (run-middleware {} {:status 200}))))
     (testing "a response with the refresh marker gets the cookie, and the marker is removed"
       (let [response (run-middleware {} {:status     200
                                          :mb/cookies {:cookie/premium-features-cache-timestamp true}})
             cookie   (get-in response [:cookies cookie-name])]
         (is (some? cookie))
         (is (instance? Instant (Instant/parse (:value cookie))))
         (is (=? {:path "/" :max-age 300 :same-site :lax} cookie))
         (is (not (contains? (:mb/cookies response) :cookie/premium-features-cache-timestamp)))
         (testing "the instance that set the cookie does not clear its own cache when it sees the cookie"
           (run-middleware (request-with-cookie (:value cookie)) {:status 200})
           (is (zero? @calls))))))))

(deftest concurrent-requests-clear-once-test
  (testing "many concurrent requests with the same new cookie clear the local cache only once"
    (dotimes [_ 20]
      (do-with-clear-counter!
       (fn [calls]
         (let [start   (CountDownLatch. 1)
               request (request-with-cookie (str (Instant/now)))
               futures (doall (for [_ (range 32)]
                                (future
                                  (.await start)
                                  (#'mw.pf-cache/check-and-invalidate-features-cache request))))]
           (.countDown start)
           (run! deref futures)
           (is (= 1 @calls))))))))
