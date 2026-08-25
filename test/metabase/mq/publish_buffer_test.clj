(ns metabase.mq.publish-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.payload :as payload]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.queue.outbox :as q.outbox]
   [metabase.mq.transport :as transport]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :refer [with-dynamic-fn-redefs]]))

(set! *warn-on-reflection* true)

(defn- due-entry [messages]
  {:queue/test {:messages messages :deadline-ms 1 :created-ms 1}})

(deftest successful-flush-publishes-to-backend-test
  (testing "a due accumulation entry is published to the backend and cleared"
    (let [published (atom [])]
      (binding [publish-buffer/*publish-buffer*        (atom (due-entry ["m1" "m2"]))
                publish-buffer/*publish-buffer-ms*     0
                publish-buffer/*publish-buffer-max-ms* 0]
        (with-dynamic-fn-redefs [transport/publish! (fn [ch msgs] (swap! published conj {:channel ch :messages msgs}))]
          (publish-buffer/flush-publish-buffer!)
          (is (= [{:channel :queue/test :messages ["m1" "m2"]}] @published))
          (is (empty? @publish-buffer/*publish-buffer*)))))))

(deftest flush-failure-hands-batch-to-outbox-test
  (testing "when the backend is unreachable, the flushed batch is handed to the durable outbox — not retried or dropped in memory"
    (let [outboxed (atom [])]
      (binding [publish-buffer/*publish-buffer*        (atom (due-entry ["m1" "m2"]))
                publish-buffer/*publish-buffer-ms*     0
                publish-buffer/*publish-buffer-max-ms* 0]
        (with-dynamic-fn-redefs [transport/publish!    (fn [_ _] (throw (ex-info "backend down" {})))
                                 q.outbox/insert-batch! (fn [ch payload] (swap! outboxed conj {:channel ch :messages (payload/decode payload)}))]
          (publish-buffer/flush-publish-buffer!)
          (is (= [{:channel :queue/test :messages ["m1" "m2"]}] @outboxed)
              "the batch (encoded) is written to the outbox for durable recovery")
          (is (empty? @publish-buffer/*publish-buffer*)
              "and cleared from the in-memory buffer — the buffer keeps no retry state"))))))

(deftest flush-handoff-emits-metric-test
  (testing "a successful outbox handoff surfaces as batches-retried{reason=publish-outbox-handoff}"
    (mt/with-prometheus-system! [_ system]
      (binding [publish-buffer/*publish-buffer*        (atom (due-entry ["m1"]))
                publish-buffer/*publish-buffer-ms*     0
                publish-buffer/*publish-buffer-max-ms* 0]
        (with-dynamic-fn-redefs [transport/publish!    (fn [_ _] (throw (ex-info "backend down" {})))
                                 q.outbox/insert-batch! (fn [_ _] nil)]
          (publish-buffer/flush-publish-buffer!)
          (is (pos? (mt/metric-value system :metabase-mq/batches-retried
                                     {:channel "test" :reason "publish-outbox-handoff"}))))))))

(deftest flush-failure-and-outbox-failure-drops-and-meters-test
  (testing "if the backend AND the outbox are both unreachable (total outage), the batch is dropped and metered"
    (mt/with-prometheus-system! [_ system]
      (binding [publish-buffer/*publish-buffer*        (atom (due-entry ["m1"]))
                publish-buffer/*publish-buffer-ms*     0
                publish-buffer/*publish-buffer-max-ms* 0]
        (with-dynamic-fn-redefs [transport/publish!    (fn [_ _] (throw (ex-info "backend down" {})))
                                 q.outbox/insert-batch! (fn [_ _] (throw (ex-info "db down" {})))]
          (publish-buffer/flush-publish-buffer!)
          (is (empty? @publish-buffer/*publish-buffer*))
          (is (pos? (mt/metric-value system :metabase-mq/batches-dropped
                                     {:channel "test" :reason "outbox-handoff-failed"}))
              "the drop is surfaced as batches-dropped{reason=outbox-handoff-failed}"))))))

(deftest max-ms-cap-forces-flush-test
  (testing "an accumulation entry force-flushes once it has sat for *publish-buffer-max-ms*, even if its sliding window hasn't elapsed"
    (let [published (atom [])]
      (binding [publish-buffer/*publish-buffer*        (atom {:queue/test {:messages    ["fresh"]
                                                                           :deadline-ms (+ (System/currentTimeMillis) 100000)
                                                                           :created-ms  0}})
                publish-buffer/*publish-buffer-ms*     100000   ; sliding window never fires on its own
                publish-buffer/*publish-buffer-max-ms* 50]
        (with-dynamic-fn-redefs [transport/publish! (fn [_ msgs] (swap! published into msgs))]
          (publish-buffer/flush-publish-buffer!)
          (is (= ["fresh"] @published) "the entry hit its max-ms cap and flushed")
          (is (empty? @publish-buffer/*publish-buffer*)))))))
