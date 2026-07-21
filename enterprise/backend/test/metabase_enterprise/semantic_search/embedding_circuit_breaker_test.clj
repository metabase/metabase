(ns metabase-enterprise.semantic-search.embedding-circuit-breaker-test
  (:require
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   ;; loaded for side effects: the health namespaces register the breaker state-change hooks that
   ;; state-change-persists-affected-checks-test exercises
   [metabase-enterprise.entity-retrieval.health]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.health]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private call-through   #'semantic.embedding/call-through-embedder-breaker)
(def ^:private circuit-state  semantic.embedding/embedder-circuit-state)

(defn- boom [] (throw (ex-info "embedder down" {:kind :boom})))

(deftest ^:sequential every-failure-trips-the-breaker-test
  (testing "every failed embedding call counts toward opening the breaker, a 4xx included -- a 4xx must not be
           recorded as a success, which would reset the consecutive-failure count and keep a real outage from
           tripping the breaker"
    (with-redefs [semantic.embedding/embedder-circuit-breaker
                  (dh.cb/circuit-breaker {:failure-threshold 3 :success-threshold 1 :delay-ms 60000})]
      (dotimes [_ 3]
        (is (thrown? Exception (call-through #(throw (ex-info "bad request" {:status 400}))))))
      (is (= :open (circuit-state)) "consecutive 4xx trip the breaker rather than being recorded as successes"))))

(deftest ^:sequential opens-after-threshold-and-fast-fails-test
  (testing "consecutive failures trip the breaker; while open, calls fast-fail with the mapped 502 ex-info"
    ;; A fresh breaker (short threshold, stays open) so the test is isolated from the process-wide default.
    (with-redefs [semantic.embedding/embedder-circuit-breaker
                  (dh.cb/circuit-breaker {:failure-threshold 2 :success-threshold 1 :delay-ms 60000})]
      (dotimes [_ 2]
        (is (thrown? Exception (call-through boom))))
      (is (= :open (circuit-state)))
      (is (=? {:cause :embedder/circuit-open :status 502}
              (try (call-through (constantly :never)) nil
                   (catch clojure.lang.ExceptionInfo e (ex-data e))))))))

(deftest ^:sequential kill-switch-bypasses-breaker-test
  (testing "with the breaker disabled the thunk runs directly: raw exception propagates, breaker untouched"
    (with-redefs [semantic.embedding/embedder-circuit-breaker
                  (dh.cb/circuit-breaker {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})]
      (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled false]
        (is (=? {:kind :boom}
                (try (call-through boom) nil (catch clojure.lang.ExceptionInfo e (ex-data e)))))
        (is (= :closed (circuit-state)) "a bypassed breaker records no failures")))))

(deftest ^:sequential probe-bypass-flag-bypasses-breaker-test
  (testing "*bypass-circuit-breaker* runs the thunk directly, without consulting or tripping the breaker"
    (with-redefs [semantic.embedding/embedder-circuit-breaker
                  (dh.cb/circuit-breaker {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})]
      (binding [semantic.embedding/*bypass-circuit-breaker* true]
        (is (thrown? clojure.lang.ExceptionInfo (call-through boom)))
        (is (= :closed (circuit-state)))))))

(deftest ^:sequential circuit-open?-respects-kill-switch-test
  (testing "embedder-circuit-open? is authoritative only while the breaker is enabled"
    (with-redefs [semantic.embedding/embedder-circuit-breaker
                  (dh.cb/circuit-breaker {:failure-threshold 1 :success-threshold 1 :delay-ms 60000})]
      (is (thrown? Exception (call-through boom)))
      (is (= :open (circuit-state)))
      (testing "enabled + open -> open"
        (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled true]
          (is (true? (semantic.embedding/embedder-circuit-open?)))))
      (testing "disabled -> not open even though the raw state is still open (calls now bypass the breaker)"
        (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled false]
          (is (false? (semantic.embedding/embedder-circuit-open?)))
          (is (= :open (circuit-state))))))))

(deftest ^:sequential circuit-untrusted?-covers-half-open-test
  (testing "embedder-circuit-untrusted? is true whenever the enabled breaker isn't closed -- both :open and
           :half-open -- so the health verdict can't flap as the breaker cycles between them"
    (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled true]
      (doseq [state [:open :half-open]]
        (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly state)]
          (is (true? (semantic.embedding/embedder-circuit-untrusted?)) (str state " reads untrusted"))))
      (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly :closed)]
        (is (false? (semantic.embedding/embedder-circuit-untrusted?)) ":closed reads trusted"))))
  (testing "disabled -> trusted regardless of raw state (calls bypass the breaker)"
    (mt/with-temporary-setting-values [semantic-search-embedder-circuit-breaker-enabled false]
      (mt/with-dynamic-fn-redefs [semantic.embedding/embedder-circuit-state (constantly :half-open)]
        (is (false? (semantic.embedding/embedder-circuit-untrusted?)))))))

(deftest ^:sequential state-change-persists-affected-checks-test
  (testing "a breaker state transition runs the registered hooks, persisting both embedder-dependent health
           checks immediately"
    (let [persisted (atom [])]
      (mt/with-dynamic-fn-redefs
        [health-inspector/run-and-save-check! (fn [check-name] (swap! persisted conj check-name))]
        (#'semantic.embedding/on-embedder-circuit-state-change! :open)
        ;; the listener runs the hooks async on the serializing agent; give it a moment to drain
        (is (loop [tries 50]
              (cond
                (= #{:semantic-search-index :nlq-retrieval} (set @persisted)) true
                (pos? tries) (do (Thread/sleep 20) (recur (dec tries)))
                :else false))
            (str "expected both checks persisted, got " @persisted))))))

(deftest ^:sequential state-changes-run-serially-in-arrival-order-test
  (testing "transitions queue through one agent: a later transition's hooks can't overtake an earlier
           transition whose hook is still blocked (e.g. on a probe against a down service), so a slow
           pre-recovery check can't persist its stale result after the recovery one"
    (let [events (atom [])
          gate   (promise)
          hook   (fn [state]
                   (when (= :half-open state)
                     (deref gate 5000 :timed-out))
                   (swap! events conj state))]
      (mt/with-dynamic-fn-redefs
        [health-inspector/run-and-save-check! (constantly nil)]
        (try
          (swap! semantic.embedding/embedder-circuit-state-change-hooks conj hook)
          (#'semantic.embedding/on-embedder-circuit-state-change! :half-open)
          (#'semantic.embedding/on-embedder-circuit-state-change! :closed)
          (Thread/sleep 100)
          (is (= [] @events) ":closed stays queued behind the blocked :half-open run")
          (deliver gate :go)
          (is (loop [tries 50]
                (cond
                  (= [:half-open :closed] @events) true
                  (pos? tries) (do (Thread/sleep 20) (recur (dec tries)))
                  :else false))
              (str "expected transitions to run in arrival order once unblocked, got " @events))
          (finally
            (deliver gate :go)
            (swap! semantic.embedding/embedder-circuit-state-change-hooks disj hook)))))))
