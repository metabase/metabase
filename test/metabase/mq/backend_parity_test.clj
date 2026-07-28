(ns metabase.mq.backend-parity-test
  "Contract-level parity between the queue backends.

  Each scenario is written once and run against every backend kind so that
  semantic drift between backend implementations is caught at the source
  rather than discovered later in production.

  Every scenario is ALSO run with `:duplicate-delivery? true` so that
  listeners in the parity suite are forced to tolerate the MQ's at-least-
  once contract. Assertions use multiset / containment checks rather than
  exact-sequence equality so that a single logical message can legitimately
  be delivered more than once.

  Scenarios use `mq.tu/eventually!` rather than `mq.tu/flush!` for their
  assertions, because `wait-for-idle!` cannot see pending rows inside a
  durable backend's storage — it only checks the publish buffer, the
  worker-pool busy set, and memory channels."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]))

(set! *warn-on-reflection* true)

(def ^:private backend-kinds
  "Backend kinds exercised by the parity scenarios. `:memory` covers the
  fast async in-process backend.

  Quartz is not here, and can't easily be: it fires jobs on its own worker
  threads, which don't inherit the dynamic bindings `with-test-mq` relies on
  for isolation (see `metabase.mq.queue.quartz-test`, which drives that
  backend directly instead). So a scenario passing here proves parity across
  the *poll* backends, and pins the contract for the next one added — it does
  not by itself prove Quartz agrees."
  [:memory])

(def ^:private delivery-modes
  "Delivery modes exercised by the parity scenarios. `:normal` is the
  production path; `:duplicate` wraps both backends with a decorator that
  publishes every message twice, forcing listeners to tolerate at-least-
  once delivery."
  [:normal :duplicate])

(def ^:private scenario-timeout-ms
  "Budget for waiting on eventual delivery in parity scenarios. A poll-based
  backend runs through the publish buffer → storage → 5s-default poll loop, but
  the fixture's `wait-for-idle!` calls `notify-all!` each tick so the effective
  poll latency is much lower."
  10000)

(defn- unique-channel [transport-ns suffix]
  (keyword transport-ns (str suffix "-" (random-uuid))))

(defn- run-parity!
  "Runs `scenario-fn` once per (kind × delivery-mode) combination. Each
  invocation gets a freshly-minted unique channel keyword so scenarios do
  not interfere with each other."
  ([channel-prefix scenario-fn]
   (run-parity! backend-kinds delivery-modes channel-prefix scenario-fn))
  ([kinds modes channel-prefix scenario-fn]
   (doseq [kind  kinds
           mode  modes]
     (testing (str kind " backend / " mode " delivery")
       (let [channel (unique-channel (namespace channel-prefix) (name channel-prefix))]
         (mq.tu/with-test-mq [ctx {:backend                kind
                                   :duplicate-delivery? (= mode :duplicate)}]
           (scenario-fn ctx channel)))))))

(deftest queue-delivers-published-messages-test
  (run-parity!
   :queue/parity-delivery
   (fn [ctx queue-name]
     (let [received (atom [])]
       (mq.tu/listen! queue-name #(swap! received conj %))
       (mq/with-queue queue-name [q]
         (mq/put q "a")
         (mq/put q "b")
         (mq/put q "c"))
       (mq.tu/eventually! ctx
                          #(= #{"a" "b" "c"} (set @received))
                          scenario-timeout-ms)
       (is (= #{"a" "b" "c"} (set @received))
           "Every unique message was delivered at least once")
       (is (every? pos? (vals (frequencies @received)))
           "No spurious messages appeared in @received")
       (mq/unlisten! queue-name)))))

(deftest queue-retries-failed-batch-test
  (run-parity!
   :queue/parity-retry
   (fn [ctx queue-name]
     (let [calls-by-msg (atom {})]
       (mq.tu/listen! queue-name
                      (fn [msg]
                        (let [n (get (swap! calls-by-msg update msg (fnil inc 0)) msg)]
                          (when (= 1 n)
                            (throw (ex-info "first attempt" {:msg msg}))))))
       (mq/with-queue queue-name [q]
         (mq/put q "retry-me"))
       (mq.tu/eventually! ctx
                          #(>= (get @calls-by-msg "retry-me" 0) 2)
                          scenario-timeout-ms)
       (is (>= (get @calls-by-msg "retry-me" 0) 2)
           "Message delivered at least twice (retry-after-failure or chaos duplication)")
       (mq/unlisten! queue-name)))))

(deftest exclusive-queue-runs-one-batch-at-a-time-test
  (testing "an :exclusive queue never has two batches in its listener at once, on any backend.

            This is the parity scenario most worth having, because `:exclusive` is the one guarantee
            each backend must implement *itself* — Quartz with @DisallowConcurrentExecution on the job
            class, the memory backend by not fetching a second batch while one is in flight. The shared
            poll driver implements it not at all, by design. So a backend that simply forgets the flag
            keeps working, delivers everything, and quietly offers no mutual exclusion whatsoever —
            which is exactly what the memory backend did until this was noticed. Nothing but a
            behavioral test catches that."
    (run-parity!
     :queue/parity-exclusive
     (fn [ctx queue-name]
       (let [in-flight (atom 0)
             peak      (atom 0)
             received  (atom [])]
         ;; one message per batch, so "batches at once" is what the listener actually observes
         (q.registry/register-queue! queue-name {:transactional      :try
                                                 :exclusive          true
                                                 :max-batch-messages 1})
         (mq.tu/listen! queue-name
                        (fn [msg]
                          (swap! peak max (swap! in-flight inc))
                          ;; hold the batch long enough that an overlapping delivery would be seen
                          (Thread/sleep 50)
                          (swap! received conj msg)
                          (swap! in-flight dec)))
         (mq/with-queue queue-name [q]
           (mq/put q "a")
           (mq/put q "b")
           (mq/put q "c"))
         (mq.tu/eventually! ctx
                            #(= #{"a" "b" "c"} (set @received))
                            scenario-timeout-ms)
         (is (= 1 @peak)
             "never two batches of an exclusive queue in the listener at the same time")
         ;; set, not sequence: exclusivity buys mutual exclusion, not ordering — and under
         ;; :duplicate delivery each message legitimately arrives more than once.
         (is (= #{"a" "b" "c"} (set @received))
             "and every message is still delivered — exclusivity serializes, it doesn't drop")
         (mq/unlisten! queue-name))))))

(deftest queue-normalizes-message-shape-test
  (testing "Every backend delivers messages in the same canonical JSON-normalized shape:
            keyword keys preserved, keyword/symbol values and other non-JSON-native
            values collapsed to their JSON form."
    (run-parity!
     :queue/parity-shape
     (fn [ctx queue-name]
       (let [received (atom [])]
         (mq.tu/listen! queue-name #(swap! received conj %))
         (mq/with-queue queue-name [q]
           (mq/put q {:id 1 :status :active :nested {:flag true}}))
         (mq.tu/eventually! ctx #(seq @received) scenario-timeout-ms)
         (is (= #{{:id 1 :status "active" :nested {:flag true}}}
                (set @received))
             "Message delivered in canonical shape regardless of backend")
         (mq/unlisten! queue-name))))))
