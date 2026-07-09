(ns metabase-enterprise.entity-retrieval.health-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.core :as entity-retrieval.core]
   [metabase-enterprise.entity-retrieval.health :as entity-retrieval.health]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.health :as semantic.health]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private ready-status
  {:pgvector? true :licensed? true :index-compatible? true :populated? true})

(defn- check [status & {:keys [circuit-open? reachable]
                        :or   {circuit-open? false reachable {:reachable? true :error nil}}}]
  (mt/with-dynamic-fn-redefs
    [entity-retrieval.core/retrieval-status       (constantly status)
     semantic.embedding/embedder-circuit-open?    (constantly circuit-open?)
     semantic.health/embedding-service-reachable? (constantly reachable)]
    (entity-retrieval.health/nlq-retrieval-health-check)))

(deftest not-enabled-is-omitted-test
  (testing "unlicensed or unconfigured -> nil (omitted, not a misleading 100)"
    (is (nil? (check {:pgvector? false :licensed? true :index-compatible? false :populated? false})))
    (is (nil? (check {:pgvector? true :licensed? false :index-compatible? false :populated? false})))))

(deftest incompatible-index-is-degraded-test
  (testing "enabled but the index isn't built for the current model -> degraded, names the rebuild"
    (is (=? {:health 0 :message #".*not built for the current embedding model.*fallback\."}
            (check (assoc ready-status :index-compatible? false))))))

(deftest pgvector-unreachable-is-degraded-test
  (testing "a thrown probe (pgvector down) -> degraded naming connectivity, not a misleading rebuild"
    ;; a store outage sets :probe-error and leaves compatible?/populated? false; the probe-error branch must
    ;; win so the operator isn't told to rebuild a model when the real fault is pgvector connectivity.
    (is (=? {:health 0 :message #"pgvector store unreachable: connection refused.*unavailable\."}
            (check (assoc ready-status :index-compatible? false :populated? false
                          :probe-error "connection refused"))))))

(deftest empty-index-is-degraded-test
  (testing "compatible but empty -> degraded, names the pending first reconcile"
    (is (=? {:health 0 :message #".*index empty.*fallback\."}
            (check (assoc ready-status :populated? false))))))

(deftest open-circuit-is-degraded-test
  (testing "an open circuit degrades but still probes (so a recovered-but-idle embedder is detectable)"
    (let [probed? (atom false)]
      (mt/with-dynamic-fn-redefs
        [entity-retrieval.core/retrieval-status       (constantly ready-status)
         semantic.embedding/embedder-circuit-open?    (constantly true)
         semantic.health/embedding-service-reachable? (fn [] (reset! probed? true) {:reachable? true})]
        (is (=? {:health 0 :message #".*circuit open \(probe reachable.*"}
                (entity-retrieval.health/nlq-retrieval-health-check)))
        (is (true? @probed?) "an open circuit still probes so recovery is detectable"))))
  (testing "an open circuit with an unreachable probe reads the same as unreachable with a closed one --
           state-independent wording, so a flapping breaker's re-persisted rows dedup instead of flooding"
    (is (=? {:health 0 :message #"Embedding service unreachable: boom.*"}
            (check ready-status :circuit-open? true :reachable {:reachable? false :error "boom"})))))

(deftest unreachable-embedder-is-degraded-test
  (testing "ready index but unreachable embedder -> degraded, names the error"
    (is (=? {:health 0 :message #".*Embedding service unreachable: boom.*"}
            (check ready-status :reachable {:reachable? false :error "boom"})))))

(deftest healthy-test
  (testing "ready index + reachable embedder -> healthy 100"
    (is (=? {:health 100 :message #"NLQ curated retrieval available and serving\."}
            (check ready-status)))))

(deftest nlq-metrics-omitted-when-unavailable-test
  (testing "coverage/garbage/staleness skip (nil, so omitted) when unlicensed or the index is incompatible"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval.core/retrieval-status (constantly {:pgvector? true :licensed? false
                                                           :index-compatible? false :populated? false})]
      (is (nil? (#'entity-retrieval.health/nlq-coverage)))
      (is (nil? (#'entity-retrieval.health/nlq-garbage)))
      (is (nil? (#'entity-retrieval.health/nlq-staleness))))))
