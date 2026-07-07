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

(defn- check [status & {:keys [circuit reachable]
                        :or   {circuit :closed reachable {:reachable? true :error nil}}}]
  (mt/with-dynamic-fn-redefs
    [entity-retrieval.core/retrieval-status       (constantly status)
     semantic.embedding/embedder-circuit-state    (constantly circuit)
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

(deftest empty-index-is-degraded-test
  (testing "compatible but empty -> degraded, names the pending first reconcile"
    (is (=? {:health 0 :message #".*index empty.*fallback\."}
            (check (assoc ready-status :populated? false))))))

(deftest open-circuit-is-degraded-test
  (testing "an open embedder circuit degrades and skips the service probe"
    (let [probed? (atom false)]
      (mt/with-dynamic-fn-redefs
        [entity-retrieval.core/retrieval-status       (constantly ready-status)
         semantic.embedding/embedder-circuit-state    (constantly :open)
         semantic.health/embedding-service-reachable? (fn [] (reset! probed? true) {:reachable? true})]
        (is (=? {:health 0 :message #".*circuit open.*"}
                (entity-retrieval.health/nlq-retrieval-health-check)))
        (is (false? @probed?))))))

(deftest unreachable-embedder-is-degraded-test
  (testing "ready index but unreachable embedder -> degraded, names the error"
    (is (=? {:health 0 :message #".*Embedding service unreachable: boom.*"}
            (check ready-status :reachable {:reachable? false :error "boom"})))))

(deftest healthy-test
  (testing "ready index + reachable embedder -> healthy 100"
    (is (=? {:health 100 :message #"NLQ curated retrieval available and serving\."}
            (check ready-status)))))
