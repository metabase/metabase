(ns metabase.driver.quack.pool-test
  "Tier A — unit tests for the connection pool. No live server, no Metabase:
  the pool is constructed with mock :connect! / :disconnect! fns that record
  calls, so we can assert on borrow/return/discard/idle-expiry behavior
  deterministically.

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.quack.pool :as pool]))

(set! *warn-on-reflection* true)

(def ^:private spec-a {:host "a" :port 9494 :ssl false :token "t"})
(def ^:private spec-b {:host "b" :port 9494 :ssl false :token "t"})

(defn- mock-pool
  "Build a pool whose connect! returns monotonic ids like 'c0, 'c1, ...
  and whose disconnect! records into the supplied atom."
  [disc-atom & {:as opts}]
  (pool/make-pool
   (merge {:connect!    (let [n (atom -1)]
                          (fn [_spec] (keyword (str "c" (swap! n inc)))))
           :disconnect! (fn [_spec id] (swap! disc-atom conj id))}
          opts)))

(deftest p1-borrow-creates-then-reuses-test
  (testing "borrow! creates a fresh conn only when the pool is empty; a returned
           conn is handed back out on the next borrow (no new connect! call)."
    (let [disc (atom [])
          p    (mock-pool disc)]
      (is (= :c0 (pool/borrow! p spec-a)) "first borrow connects")
      (is (= :c1 (pool/borrow! p spec-a)) "second borrow connects again (empty)")
      (pool/return! p spec-a :c0)
      (is (= :c0 (pool/borrow! p spec-a)) "third borrow reuses the returned :c0")
      (is (= :c2 (pool/borrow! p spec-a)) "fourth borrow connects (pool now empty)"))))

(deftest p2-endpoints-pooled-separately-test
  (testing "different endpoints (host/port/ssl/token) maintain separate pools —
           returning to one does not surface in the other."
    (let [disc (atom [])
          p    (mock-pool disc)]
      (is (= :c0 (pool/borrow! p spec-a)))
      (is (= :c1 (pool/borrow! p spec-b)) "spec-b gets its own connection")
      (pool/return! p spec-a :c0)
      (is (= :c0 (pool/borrow! p spec-a)) "spec-a reuses :c0")
      (is (= :c2 (pool/borrow! p spec-b)) "spec-b does NOT see :c0, connects :c2"))))

(deftest p3-return-over-cap-disconnects-test
  (testing "returning beyond :max-idle disconnects the overflow rather than growing
           the pool unbounded."
    (let [disc (atom [])
          p    (mock-pool disc :max-idle 2)
          ;; Borrow 3 distinct conns, return all 3. Only 2 stay pooled; 1 disconnected.
          c0   (pool/borrow! p spec-a)
          c1   (pool/borrow! p spec-a)
          c2   (pool/borrow! p spec-a)]
      (pool/return! p spec-a c0)
      (pool/return! p spec-a c1)
      (pool/return! p spec-a c2)              ; this one overflows → disconnect
      (is (= [c2] @disc) "the overflow conn was disconnected, the rest pooled")
      (is (= 2 (-> (pool/stats p) (get (dissoc spec-a :trust-store :trust-store-password :insecure-tls)) :idle))
          "exactly max-idle conns idle"))))

(deftest p4-discard-never-pools-test
  (testing "discard! (after an error) tears the conn down — it never resurfaces
           from a later borrow."
    (let [disc (atom [])
          p    (mock-pool disc)
          c0   (pool/borrow! p spec-a)]
      (pool/discard! p spec-a c0)
      (is (= [c0] @disc) "discard! disconnected it")
      (is (= :c1 (pool/borrow! p spec-a)) "next borrow does NOT hand back :c0"))))

(deftest p5-idle-expiry-drops-stale-test
  (testing "a conn idle longer than :max-idle-ms is dropped on borrow (no network
           probe — just the age check) so a dead server-side conn is never handed out."
    (let [disc (atom [])
          p    (mock-pool disc :max-idle-ms -1000) ; negative → every idle entry is stale
          ;; Obtain a REAL conn from connect! (:c0), return it, then immediately
          ;; borrow — the stale entry is dropped and connect! issues :c1.
          c0   (pool/borrow! p spec-a)]
      (pool/return! p spec-a c0)
      (is (= :c1 (pool/borrow! p spec-a)) "stale :c0 is dropped, fresh :c1 connected")
      (is (= [c0] @disc) "the stale entry was disconnected on the way out"))))

(deftest p6-close-all-disconnects-everything-test
  (testing "close-all! disconnects every idle conn in every endpoint' pool and
           clears the pools."
    (let [disc (atom [])
          p    (mock-pool disc)]
      (pool/return! p spec-a :c0)
      (pool/return! p spec-b :c1)
      (pool/close-all! p)
      (is (= #{:c0 :c1} (set @disc)) "both idle conns disconnected")
      (is (empty? (pool/stats p)) "pools cleared"))))

(deftest p7-concurrent-borrow-is-safe-test
  (testing "borrow! from many threads does not throw and never hands out the same
           conn-id twice (connect! called once per distinct conn)."
    (let [p   (pool/make-pool {:connect!    (let [n (atom -1)]
                                              (fn [_] (swap! n inc)))
                               :disconnect! (fn [_ _])})
          ids (->> (range 50)
                   (map (fn [_] (future (pool/borrow! p spec-a))))
                   doall
                   (map deref)
                   set)]
      (is (= 50 (count ids)) "50 distinct ids — no double-issue under contention"))))

(deftest p8-pool-requires-connect-and-disconnect-test
  (testing "make-pool throws a clear ex-info when :connect! or :disconnect! is missing"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #":connect! and :disconnect!"
                          (pool/make-pool {:connect! (fn [_] :x)})))))
