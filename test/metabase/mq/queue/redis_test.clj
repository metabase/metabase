(ns metabase.mq.queue.redis-test
  "Tests specific to the Redis backend that go beyond cross-backend parity: retry-count
  propagation via the entry's `retries` field, stream/group creation, and exclusive-queue
  delivery.

  Skipped automatically when no Redis server is reachable at the URI configured by the standard
  `mq-redis-uri` setting (`MB_MQ_REDIS_URI`)."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.redis :as redis]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.settings :as mq.settings]
   [metabase.mq.test-util :as mq.tu]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.log :as log])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private when-server [& body]
  `(if (redis/broker-available?)
     (do ~@body)
     (log/infof "Skipping redis test — no server reachable at %s" (mq.settings/mq-redis-uri))))

(defn- unique-channel [suffix]
  (keyword "queue" (str suffix "-" (random-uuid))))

(deftest namespace-loads-test
  (testing "The redis namespace compiles and key helpers exist"
    (is (some? (resolve 'metabase.mq.queue.redis/make-backend)))
    (is (some? (resolve 'metabase.mq.queue.redis/delete-stream!)))
    (is (some? (resolve 'metabase.mq.queue.redis/broker-available?)))))

(deftest broker-available-probe-test
  (testing "broker-available? returns true for a reachable server and false for a bogus port"
    (when-server
     (is (true? (redis/broker-available?))))
    (testing "unreachable host fast-fails"
      (is (false? (redis/broker-available? "redis://127.0.0.1:1" 200))))))

(deftest publish-and-deliver-test
  (when-server
   (testing "Messages published through the redis backend reach a registered listener"
     (let [q   (unique-channel "redis-deliver")
           got (atom [])]
       (try
         (mq.tu/with-test-mq [ctx {:backend :redis}]
           (mq.tu/listen! q #(swap! got conj %))
           (mq/with-queue q [out] (mq/put out "a") (mq/put out "b") (mq/put out "c"))
           (mq.tu/eventually! ctx #(= #{"a" "b" "c"} (set @got)) 10000)
           (is (= #{"a" "b" "c"} (set @got))))
         (finally
           (try (redis/delete-stream! q) (catch Throwable _))))))))

(deftest retry-increments-test
  (when-server
   (testing "On batch failure the message is re-delivered with an incremented retry count"
     (let [q        (unique-channel "redis-retry")
           attempts (atom 0)
           done     (promise)]
       (try
         (mq.tu/with-test-mq [_ {:backend :redis}]
           (mq.tu/listen! q
                          (fn [_msg]
                            (let [n (swap! attempts inc)]
                              (cond
                                (< n 3) (throw (ex-info "boom" {:n n}))
                                :else   (deliver done :ok)))))
           (mq/with-queue q [out] (mq/put out "retry-me"))
           (is (= :ok (deref done 15000 :timeout)))
           (is (= 3 @attempts)))
         (finally
           (try (redis/delete-stream! q) (catch Throwable _))))))))

(deftest exclusive-queue-delivers-test
  (when-server
   (testing "An exclusive queue still delivers every message (serialized, one batch in-flight)"
     (let [q   (unique-channel "redis-exclusive")
           got (atom [])]
       (try
         (mq.tu/with-test-mq [ctx {:backend :redis}]
           ;; Declare exclusivity before listening so the backend uses the atomic PEL-gated read.
           (q.registry/register-queue! q {:exclusive true})
           (mq.tu/listen! q #(swap! got conj %))
           (doseq [m ["x" "y" "z"]]
             (mq/with-queue q [out] (mq/put out m)))
           (mq.tu/eventually! ctx #(= #{"x" "y" "z"} (set @got)) 10000)
           (is (= #{"x" "y" "z"} (set @got))))
         (finally
           (try (redis/delete-stream! q) (catch Throwable _))))))))

(deftest heartbeat-refreshes-in-flight-test
  (when-server
   (testing "run-heartbeats! refreshes our in-flight entries (XPENDING/XCLAIM path) without losing or duplicating them"
     (let [q       (unique-channel "redis-heartbeat")
           release (CountDownLatch. 1)
           started (CountDownLatch. 1)
           got     (atom [])]
       (try
         (mq.tu/with-test-mq [ctx {:backend :redis}]
           (let [be (:queue-be ctx)]
             ;; Block the handler so the fetched entry stays in the consumer group's pending list.
             (mq.tu/listen! q (fn [msg] (.countDown started) (.await release) (swap! got conj msg)))
             (mq/with-queue q [out] (mq/put out "in-flight"))
             (is (.await started 10000 TimeUnit/MILLISECONDS) "message delivered to the (blocked) handler")
             ;; While the entry is in-flight, heartbeats must run cleanly over the pending list.
             (q.backend/run-heartbeats! be)
             (.countDown release)
             (mq.tu/eventually! ctx #(= ["in-flight"] @got) 10000)
             (is (= ["in-flight"] @got)
                 "delivered exactly once — heartbeat neither dropped nor duplicated the entry")))
         (finally
           (.countDown release)
           (try (redis/delete-stream! q) (catch Throwable _))))))))

(deftest delete-stream-helper-test
  (when-server
   (testing "delete-stream! removes the stream so a subsequent publish starts fresh"
     (let [q   (unique-channel "redis-delete-helper")
           got (atom [])]
       (try
         (mq.tu/with-test-mq [ctx {:backend :redis}]
           (mq.tu/listen! q #(swap! got conj %))
           (mq/with-queue q [out] (mq/put out "first"))
           (mq.tu/eventually! ctx #(= ["first"] @got) 10000)
           (is (= ["first"] @got)))
         (redis/delete-stream! q)
         (testing "stream is gone — a fresh fixture sees no backlog"
           (reset! got [])
           (mq.tu/with-test-mq [ctx {:backend :redis}]
             (mq.tu/listen! q #(swap! got conj %))
             (mq.tu/eventually! ctx #(seq @got) 1000)
             (is (= [] @got) "no leftover messages re-delivered after delete")))
         (finally
           (try (redis/delete-stream! q) (catch Throwable _))))))))
