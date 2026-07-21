(ns metabase-enterprise.entity-retrieval.health-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
   [metabase-enterprise.entity-retrieval.health :as entity-retrieval.health]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.embedding-health :as embedding-health]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(def ^:private ready-status
  {:dependencies {:store true, :embedder true, :licenses true}
   :index        {:status :populated}})

(defn- check [status & {:keys [circuit-untrusted? reachable]
                        :or   {circuit-untrusted? false, reachable {:reachable? true, :error nil}}}]
  (mt/with-dynamic-fn-redefs
    [entity-retrieval.core/retrieval-status         (constantly status)
     semantic.embedding/embedder-circuit-untrusted? (constantly circuit-untrusted?)
     embedding-health/embedding-service-reachable?   (constantly reachable)]
    (entity-retrieval.health/nlq-retrieval-health-check)))

(defn- with-index-status [status]
  (assoc ready-status :index {:status status}))

(deftest not-enabled-is-omitted-test
  (testing "any unmet dependency (store, embedder, or licenses) -> nil (omitted, not a misleading 100)"
    (is (nil? (check {:dependencies {:store false, :embedder true, :licenses true}})))
    (is (nil? (check {:dependencies {:store true, :embedder false, :licenses true}})))
    (is (nil? (check {:dependencies {:store true, :embedder true, :licenses false}})))))

(deftest missing-index-is-degraded-test
  (testing "no index built yet -> degraded"
    (is (=? {:health 0, :message #"Index not found"}
            (check (with-index-status :missing))))))

(deftest incompatible-index-is-degraded-test
  (testing "the index isn't built for the current model -> degraded"
    (is (=? {:health 0, :message #"Index not compatible"}
            (check (with-index-status :incompatible))))))

(deftest unreachable-index-is-degraded-test
  (testing "a thrown probe (store down) -> degraded, reported as its own state (not a misleading rebuild)"
    (is (=? {:health 0, :message #"Index unreachable"}
            (check (assoc ready-status :index {:status :unreachable, :error "connection refused"}))))))

(deftest empty-index-is-partially-healthy-test
  (testing "compatible but empty -> partial health (50): built, but serving nothing"
    (is (=? {:health 50, :message #"Index empty"}
            (check (with-index-status :empty))))))

(deftest untrusted-circuit-is-degraded-test
  (testing "a non-closed breaker (open or half-open) degrades but still probes (so a recovered-but-idle
           embedder is detectable), and reads the same in both states so open<->half-open can't flap it"
    (let [probed? (atom false)]
      (mt/with-dynamic-fn-redefs
        [entity-retrieval.core/retrieval-status         (constantly ready-status)
         semantic.embedding/embedder-circuit-untrusted? (constantly true)
         embedding-health/embedding-service-reachable?   (fn [] (reset! probed? true) {:reachable? true})]
        (is (=? {:health 0, :message #".*circuit open \(probe reachable.*"}
                (entity-retrieval.health/nlq-retrieval-health-check)))
        (is (true? @probed?) "a non-closed breaker still probes so recovery is detectable"))))
  (testing "an untrusted breaker with an unreachable probe reads the same as unreachable with a closed one --
           state-independent wording, so a flapping breaker's re-persisted rows dedup instead of flooding"
    (is (=? {:health 0, :message #"Embedding service unreachable: boom.*"}
            (check ready-status :circuit-untrusted? true :reachable {:reachable? false, :error "boom"})))))

(deftest unreachable-embedder-is-degraded-test
  (testing "ready index but unreachable embedder -> degraded, names the error"
    (is (=? {:health 0, :message #".*Embedding service unreachable: boom.*"}
            (check ready-status :reachable {:reachable? false, :error "boom"})))))

(deftest healthy-test
  (testing "ready index + reachable embedder -> healthy 100"
    (is (=? {:health 100 :message #"Healthy"}
            (check ready-status)))))

(deftest nlq-metrics-omitted-when-unavailable-test
  (testing "coverage/garbage/staleness skip (nil, so omitted) when a dependency is unmet"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval.core/retrieval-status
       (constantly {:dependencies {:store true, :embedder true, :licenses false}})]
      (is (nil? (#'entity-retrieval.health/nlq-coverage)))
      (is (nil? (#'entity-retrieval.health/nlq-garbage)))
      (is (nil? (#'entity-retrieval.health/nlq-staleness))))))

(deftest nlq-staleness-tolerates-missing-reconciled-at-test
  (testing "reconciled_at is added lazily by the first reconcile, so an index built before the column existed
           lacks it and the staleness query throws undefined_column (42703) -- that reads as N/A (skipped),
           not a spurious errored/degraded row"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval.health/library-datasource (constantly ::ds)
       jdbc/execute-one! (fn [& _] (throw (java.sql.SQLException. "column \"reconciled_at\" does not exist" "42703")))]
      (is (nil? (#'entity-retrieval.health/nlq-staleness)))))
  (testing "any other SQL error (connectivity, permissions) propagates rather than hiding as N/A"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval.health/library-datasource (constantly ::ds)
       jdbc/execute-one! (fn [& _] (throw (java.sql.SQLException. "connection refused" "08006")))]
      (is (thrown? java.sql.SQLException (#'entity-retrieval.health/nlq-staleness))))))
