(ns metabase.mq.queue.concurrency-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.concurrency :as q.concurrency]
   [metabase.mq.queue.registry :as q.registry])
  (:import
   (java.util.concurrent CountDownLatch ExecutorService Executors TimeUnit)))

(set! *warn-on-reflection* true)

(defn- with-fresh-state [f]
  (binding [q.registry/*queues*       (atom {})
            q.concurrency/*in-flight* (atom {})
            listener/*listeners*      (atom {})]
    (f)))

(use-fixtures :each with-fresh-state)

(defn- declare-queue! [queue-name cap]
  (q.registry/register-queue! queue-name (cond-> {:transactional :try}
                                           cap (assoc :max-concurrent-batches cap))))

(defn- wait-for! [pred]
  (let [deadline (+ (System/currentTimeMillis) 5000)]
    (loop []
      (or (pred)
          (when (< (System/currentTimeMillis) deadline)
            (Thread/sleep 5)
            (recur))))))

;;; ------------------------------------------- with-slot -------------------------------------------

(deftest slots-are-counted-and-released-test
  (declare-queue! :queue/capped 2)
  (q.concurrency/with-slot :queue/capped
    (is (= 1 (q.concurrency/in-flight :queue/capped)))
    (q.concurrency/with-slot :queue/capped
      (is (= 2 (q.concurrency/in-flight :queue/capped)))))
  (is (zero? (q.concurrency/in-flight :queue/capped))
      "every slot is released as its with-slot exits"))

(deftest over-the-cap-the-body-still-runs-test
  (testing "the cap is a throttle on what we take, not a veto on work already in hand: a delivery that
            arrives while we're at the cap is still delivered, and simply counts us over it"
    ;; Bouncing it instead would mean a re-queue path with its own backoff, its own metric, and a
    ;; hot-loop to avoid — all to shave an overshoot that is small, bounded and self-correcting.
    (declare-queue! :queue/capped 1)
    (q.concurrency/with-slot :queue/capped
      (is (true? (q.concurrency/at-capacity? :queue/capped)))
      (is (= ::ran (q.concurrency/with-slot :queue/capped ::ran))
          "the body ran even though the node was already at its cap")
      (is (= 1 (q.concurrency/in-flight :queue/capped))
          "and the over-cap slot was released again on the way out"))
    (is (zero? (q.concurrency/in-flight :queue/capped)))))

(deftest at-capacity?-keeps-saying-yes-while-over-the-cap-test
  (testing "a node that raced its way over the cap must keep refusing new work until it drains back
            under — hence >= rather than ="
    (declare-queue! :queue/capped 1)
    (q.concurrency/with-slot :queue/capped
      (q.concurrency/with-slot :queue/capped
        (is (= 2 (q.concurrency/in-flight :queue/capped)) "over the cap of 1")
        (is (true? (q.concurrency/at-capacity? :queue/capped)))
        (is (= 0 (q.concurrency/free-slots :queue/capped))
            "free-slots floors at zero — it never reports negative headroom")))))

(deftest with-slot-returns-the-body-value-test
  (declare-queue! :queue/capped 1)
  (is (= ::delivered (q.concurrency/with-slot :queue/capped ::delivered)))
  (is (nil? (q.concurrency/with-slot :queue/capped nil))))

(deftest with-slot-releases-when-the-body-throws-test
  (testing "a body that throws still releases its slot — a leak here would silently shrink the queue's
            capacity for the life of the process, with no error anywhere to explain why it stopped
            delivering"
    (declare-queue! :queue/capped 1)
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"boom"
         (q.concurrency/with-slot :queue/capped
           (throw (ex-info "boom" {})))))
    (is (zero? (q.concurrency/in-flight :queue/capped)))
    (is (false? (q.concurrency/at-capacity? :queue/capped))
        "and the queue can still deliver")))

(deftest at-capacity?-and-working?-track-slots-test
  (declare-queue! :queue/capped 1)
  (is (false? (q.concurrency/at-capacity? :queue/capped)))
  (is (false? (q.concurrency/working? :queue/capped)))
  (q.concurrency/with-slot :queue/capped
    (is (true? (q.concurrency/at-capacity? :queue/capped)))
    (is (true? (q.concurrency/working? :queue/capped))))
  (is (false? (q.concurrency/at-capacity? :queue/capped)))
  (is (false? (q.concurrency/working? :queue/capped))))

(deftest free-slots-counts-down-test
  (declare-queue! :queue/capped 3)
  (is (= 3 (q.concurrency/free-slots :queue/capped)))
  (q.concurrency/with-slot :queue/capped
    (is (= 2 (q.concurrency/free-slots :queue/capped)))
    (q.concurrency/with-slot :queue/capped
      (q.concurrency/with-slot :queue/capped
        (is (= 0 (q.concurrency/free-slots :queue/capped)))))))

(deftest uncapped-queue-is-unbounded-test
  ;; There is exactly one meaning of "declared no cap", and it is the same on every backend:
  ;; unbounded. No caller supplies its own default — that is how the backends used to disagree
  ;; (Quartz unbounded, the poll driver one-at-a-time) about what the same config meant.
  (declare-queue! :queue/uncapped nil)
  (testing "an uncapped queue always grants a slot and is never at capacity"
    (letfn [(nest [depth]
              (if (zero? depth)
                (do (is (= 25 (q.concurrency/in-flight :queue/uncapped)))
                    (is (false? (q.concurrency/at-capacity? :queue/uncapped)))
                    (is (true? (q.concurrency/working? :queue/uncapped))))
                (q.concurrency/with-slot :queue/uncapped
                  (nest (dec depth)))))]
      (nest 25)))
  (testing "and reports no fetch limit — nil means 'take as many as you have', not 'take one'"
    (is (nil? (q.concurrency/free-slots :queue/uncapped)))))

(deftest exclusive-is-not-this-layers-concern-test
  (testing "an :exclusive queue is unbounded as far as this ns is concerned — mutual exclusion is the
            *backend's* job (Quartz's @DisallowConcurrentExecution; the memory backend's fetch),
            because the backend is what owns delivery. Modelling it here as a cap of one would look
            tidy and quietly downgrade a cluster-wide guarantee to a per-node one."
    (q.registry/register-queue! :queue/excl {:transactional :try :exclusive true})
    (is (nil? (q.concurrency/free-slots :queue/excl)))
    (q.concurrency/with-slot :queue/excl
      (is (false? (q.concurrency/at-capacity? :queue/excl))))))

(deftest slots-are-per-channel-test
  (declare-queue! :queue/a 1)
  (declare-queue! :queue/b 1)
  (q.concurrency/with-slot :queue/a
    (is (true? (q.concurrency/at-capacity? :queue/a)))
    (is (false? (q.concurrency/at-capacity? :queue/b))
        "queue/b has its own budget")
    (is (zero? (q.concurrency/in-flight :queue/b)))))

(deftest cap-fn-is-resolved-on-every-check-test
  (let [cap (atom 1)]
    (declare-queue! :queue/dynamic (fn [] @cap))
    (q.concurrency/with-slot :queue/dynamic
      (is (true? (q.concurrency/at-capacity? :queue/dynamic))
          "at capacity while the setting says 1")
      (reset! cap 2)
      (is (false? (q.concurrency/at-capacity? :queue/dynamic))
          "raising the setting immediately opens headroom — the cap is read per check, not frozen at
           registration")
      (is (= 1 (q.concurrency/free-slots :queue/dynamic))))))

(deftest concurrent-slots-are-accounted-exactly-test
  (testing "the in-flight count is exact under contention — it is what the throttle reads, so a lost
            update would let a queue quietly run over its cap forever"
    (declare-queue! :queue/capped 5)
    ;; `future` conveys the dynamic bindings from the fixture, so every thread races on the same
    ;; in-flight atom. All 20 start together on the latch to make the swap actually contend.
    (let [start   (CountDownLatch. 1)
          release (CountDownLatch. 1)
          entered (atom 0)
          futures (doall
                   (for [_ (range 20)]
                     (future
                       (.await start)
                       (q.concurrency/with-slot :queue/capped
                         (swap! entered inc)
                         (.await release)   ; hold the slot so all 20 are counted at once
                         ::ran))))]
      (.countDown start)
      (is (true? (wait-for! #(= 20 @entered)))
          "every batch runs — the cap throttles fetching, it does not refuse work in hand")
      (is (= 20 (q.concurrency/in-flight :queue/capped))
          "and all 20 are counted, with no lost updates")
      (is (true? (q.concurrency/at-capacity? :queue/capped))
          "so the node correctly reports it should take no more")
      (.countDown release)
      (run! deref futures)
      (is (zero? (q.concurrency/in-flight :queue/capped))
          "every slot is released once its body finishes — no leak, no negative count"))))

;;; ---------------------------------------- submit-with-slot! ----------------------------------------

(deftest submit-with-slot-counts-from-hand-off-and-releases-on-the-worker-thread-test
  (declare-queue! :queue/capped 1)
  (let [pool    (Executors/newCachedThreadPool)
        release (CountDownLatch. 1)
        entered (CountDownLatch. 1)
        woken   (atom 0)]
    (try
      (q.concurrency/submit-with-slot!
       :queue/capped pool
       (fn [] (.countDown entered) (.await release))
       #(swap! woken inc))
      (is (= 1 (q.concurrency/in-flight :queue/capped))
          "the batch counts against the node the moment it is handed off — not when the worker thread
           gets around to it, which would let the driver fetch more work in the gap")
      (is (.await entered 5000 TimeUnit/MILLISECONDS))
      (is (true? (q.concurrency/at-capacity? :queue/capped))
          "the slot is held for as long as the task runs, over on the other thread")
      (.countDown release)
      (is (true? (wait-for! #(zero? (q.concurrency/in-flight :queue/capped))))
          "the slot is released when the task finishes")
      (is (true? (wait-for! #(= 1 @woken)))
          "and after-release runs — that's the 'a slot just freed up, go look for work' signal")
      (finally
        (.shutdownNow ^ExecutorService pool)))))

(deftest submit-with-slot-releases-when-the-task-throws-test
  (declare-queue! :queue/capped 1)
  (let [pool (Executors/newCachedThreadPool)]
    (try
      (q.concurrency/submit-with-slot!
       :queue/capped pool
       (fn [] (throw (ex-info "boom" {})))
       (fn []))
      (is (true? (wait-for! #(zero? (q.concurrency/in-flight :queue/capped))))
          "a task that throws still releases its slot")
      (finally
        (.shutdownNow ^ExecutorService pool)))))

(deftest submit-with-slot-releases-when-the-submit-itself-fails-test
  (testing "if the pool is gone the task will never run, and so will never release — the slot must be
            given back here or the queue sits at capacity forever and silently stops delivering"
    (declare-queue! :queue/capped 1)
    (let [pool (doto (Executors/newCachedThreadPool) (.shutdownNow))]
      (is (thrown? Exception
                   (q.concurrency/submit-with-slot! :queue/capped pool (fn []) (fn []))))
      (is (zero? (q.concurrency/in-flight :queue/capped)))
      (is (false? (q.concurrency/at-capacity? :queue/capped))))))

;;; ---------------------------------------- takeable-queues ----------------------------------------

(deftest takeable-queues-is-the-shared-definition-test
  (testing "the queues this node will take work for: has a listener, not at capacity.

            Both backends derive their own shape from this one fn — Quartz the capability set it
            splices into its acquire query, the poll driver the free-slot map it hands fetch! — so that
            they cannot drift apart on the answer."
    (declare-queue! :queue/capped 1)
    (declare-queue! :queue/uncapped nil)
    (declare-queue! :queue/no-listener 1)
    (listener/batch-listen! :queue/capped (fn [_]))
    (listener/batch-listen! :queue/uncapped (fn [_]))
    (testing "a declared queue with no listener on this node is never takeable"
      (is (= #{:queue/capped :queue/uncapped} (set (q.concurrency/takeable-queues)))
          ":queue/no-listener is declared, but nothing here handles it"))
    (testing "a queue at its cap drops out, and comes back when the slot frees"
      (q.concurrency/with-slot :queue/capped
        (is (= #{:queue/uncapped} (set (q.concurrency/takeable-queues)))))
      (is (= #{:queue/capped :queue/uncapped} (set (q.concurrency/takeable-queues)))))
    (testing "an uncapped queue stays takeable however many batches are in flight"
      (q.concurrency/with-slot :queue/uncapped
        (q.concurrency/with-slot :queue/uncapped
          (is (contains? (set (q.concurrency/takeable-queues)) :queue/uncapped)))))))
