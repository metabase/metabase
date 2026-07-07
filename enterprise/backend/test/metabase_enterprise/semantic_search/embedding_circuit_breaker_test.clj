(ns metabase-enterprise.semantic-search.embedding-circuit-breaker-test
  (:require
   [clojure.test :refer :all]
   [diehard.circuit-breaker :as dh.cb]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private call-through   #'semantic.embedding/call-through-embedder-breaker)
(def ^:private circuit-state  semantic.embedding/embedder-circuit-state)

(defn- boom [] (throw (ex-info "embedder down" {:kind :boom})))

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

(deftest ^:sequential state-change-persists-affected-checks-test
  (testing "a breaker state transition persists both embedder-dependent health checks immediately"
    (let [persisted (atom [])]
      (mt/with-dynamic-fn-redefs
        [health-inspector/run-and-save-check! (fn [check-name] (swap! persisted conj check-name))]
        (#'semantic.embedding/on-embedder-circuit-state-change! :open)
        ;; the listener persists on a fire-and-forget future; give it a moment to drain
        (is (loop [tries 50]
              (cond
                (= #{:semantic-search-index :nlq-retrieval} (set @persisted)) true
                (pos? tries) (do (Thread/sleep 20) (recur (dec tries)))
                :else false))
            (str "expected both checks persisted, got " @persisted))))))
