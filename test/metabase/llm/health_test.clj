(ns metabase.llm.health-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.llm.health :as llm.health]))

(set! *warn-on-reflection* true)

;;; The record is instance-wide, and nothing here rewrites `llm-providers` — which is what clears it for the tests
;;; that configure connections. Each test therefore uses connection keys of its own, so what it records cannot reach
;;; another one.

(defn- recorded
  [conn-key]
  (some-> (llm.health/failure conn-key) (select-keys [:message :fatal? :status])))

(deftest nothing-recorded-reads-as-healthy-test
  (is (nil? (llm.health/failure "healthy-conn")))
  (is (true? (llm.health/healthy? "healthy-conn"))))

(deftest record-failure-test
  (testing "a recorded failure carries the message the provider gave, for the admin provider list"
    (llm.health/record-failure! "recorded-conn" "invalid x-api-key" true)
    (is (= {:message "invalid x-api-key" :fatal? true} (recorded "recorded-conn")))
    (is (false? (llm.health/healthy? "recorded-conn"))))
  (testing "only the named connection is affected"
    (is (true? (llm.health/healthy? "recorded-other-conn")))))

(deftest record-exception-classifies-by-status-test
  (testing "a 4xx the provider will keep rejecting is fatal"
    (llm.health/record-exception! "classified-rejected" (ex-info "invalid x-api-key" {:status 401}))
    (is (= {:message "invalid x-api-key" :fatal? true :status 401} (recorded "classified-rejected"))))
  (testing "a rate limit or an outage is transient — retrying it can work"
    (llm.health/record-exception! "classified-throttled" (ex-info "rate limited" {:status 429}))
    (is (false? (:fatal? (llm.health/failure "classified-throttled"))))
    (llm.health/record-exception! "classified-down" (ex-info "bad gateway" {:status 502}))
    (is (false? (:fatal? (llm.health/failure "classified-down")))))
  (testing "an error that never reached the provider has no status and is transient"
    (llm.health/record-exception! "classified-timeout" (ex-info "Read timed out" {}))
    (is (= {:message "Read timed out" :fatal? false :status nil} (recorded "classified-timeout"))))
  (testing "adapters that report the status as :status-code are read the same way"
    (llm.health/record-exception! "classified-status-code" (ex-info "no credit" {:status-code 402}))
    (is (= {:message "no credit" :fatal? true :status 402} (recorded "classified-status-code")))))

(deftest transient-failures-expire-test
  (let [an-hour-from-now (+ (System/currentTimeMillis) (* 60 60 1000))]
    (testing "a transient failure stops counting once it is old enough, so recovery needs no intervention"
      (llm.health/record-exception! "expiring-conn" (ex-info "bad gateway" {:status 502}))
      (is (some? (llm.health/failure "expiring-conn")))
      (with-redefs [llm.health/now-ms (constantly an-hour-from-now)]
        (is (nil? (llm.health/failure "expiring-conn")))
        (is (true? (llm.health/healthy? "expiring-conn")))))
    (testing "a fatal failure does not, because nothing about waiting fixes a rejected key"
      (llm.health/record-exception! "permanent-conn" (ex-info "invalid x-api-key" {:status 401}))
      (with-redefs [llm.health/now-ms (constantly an-hour-from-now)]
        (is (some? (llm.health/failure "permanent-conn")))))))

(deftest record-success-clears-test
  (testing "a request that works clears whatever was held against the connection"
    (llm.health/record-exception! "recovering-conn" (ex-info "invalid x-api-key" {:status 401}))
    (llm.health/record-success! "recovering-conn")
    (is (nil? (llm.health/failure "recovering-conn")))))

(deftest forget-test
  (testing "a connection that was just edited starts from nothing rather than from what the old key did"
    (llm.health/record-failure! "forgotten-conn" "invalid x-api-key" true)
    (llm.health/forget! "forgotten-conn")
    (is (nil? (llm.health/failure "forgotten-conn")))))

(deftest forget-all-test
  (testing "the whole record can be dropped at once, which is what rewriting the connection list does"
    (llm.health/record-failure! "dropped-conn" "invalid x-api-key" true)
    (llm.health/forget-all!)
    (is (nil? (llm.health/failure "dropped-conn")))))

(deftest nil-connection-key-is-ignored-test
  (testing "a call with no connection behind it records nothing rather than a failure against nil"
    (llm.health/record-failure! nil "boom" true)
    (llm.health/record-exception! nil (ex-info "boom" {}))
    (is (nil? (llm.health/failure nil)))))
