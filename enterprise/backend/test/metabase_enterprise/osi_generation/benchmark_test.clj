(ns metabase-enterprise.osi-generation.benchmark-test
  "Tests for the OSI-generation benchmark harness.

  Everything except the two smoke tests is pure (or appdb-only) and runs in CI with no pgvector, no
  embedding service and no LLM: metric maths on hand-built rankings, validation of the shipped
  corpus/queries/baseline files, the generated-snapshot coverage guard and membership isolation. The quality
  *comparison* is deliberately not a test — it is provider- and model-dependent and would be a flaky
  assertion — it is a REPL run (see [[metabase-enterprise.osi-generation.benchmark.runner/run-comparison!]])
  whose output is pasted into the PR description."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.osi-generation.benchmark.arms :as arms]
   [metabase-enterprise.osi-generation.benchmark.corpus :as corpus]
   [metabase-enterprise.osi-generation.benchmark.metrics :as metrics]
   [metabase-enterprise.osi-generation.benchmark.runner :as runner]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.osi-generation.settings :as osi-generation.settings]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.osi.ai-context.api :as osi-api]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private endpoint-identity-opts
  {:endpoint-identity-key "benchmark-test-endpoint-identity-key-0001"})

(def ^:private live-generation-env-var
  "MB_OSI_GENERATION_BENCHMARK_LIVE")

(def ^:private endpoint-identity-key-env-var
  "MB_OSI_GENERATION_BENCHMARK_ENDPOINT_IDENTITY_KEY")

(defn- live-generation-opts
  [getenv]
  (when (= "true" (getenv live-generation-env-var))
    (let [endpoint-identity-key (u/trimmed-string (getenv endpoint-identity-key-env-var))]
      (when-not endpoint-identity-key
        (throw (ex-info (str endpoint-identity-key-env-var
                             " must be set when " live-generation-env-var "=true")
                        {:reason  :missing-endpoint-identity-key
                         :env-var endpoint-identity-key-env-var})))
      {:out-dir              (str (System/getProperty "java.io.tmpdir")
                                  "/osi-generation-benchmark")
       :endpoint-identity-key endpoint-identity-key})))

(defn- test-generation-connection
  [model-ref]
  {:connection-key (llm.provider/model-ref->connection-key model-ref)
   :type           "anthropic"
   :model          (llm.provider/model-ref->model model-ref)
   :ai-proxy?      false
   :routing        {:base-url (arms/endpoint-identity "https://api.anthropic.com"
                                                      endpoint-identity-opts)}})

;;; -------------------------------------------------- Metrics ----------------------------------------------------

(deftest ^:parallel metrics-on-known-rankings-test
  (let [judged {["table" 1] 2, ["card" 7] 1}]
    (testing "hit@k"
      (is (= 1 (metrics/hit-at-k judged [["table" 1] ["table" 9]] 1)))
      (is (= 0 (metrics/hit-at-k judged [["table" 9] ["table" 1]] 1)) "relevant at rank 2, k=1")
      (is (= 1 (metrics/hit-at-k judged [["table" 9] ["table" 1]] 2)))
      (is (= 0 (metrics/hit-at-k judged [] 5)) "empty result")
      (is (= 0 (metrics/hit-at-k {} [["table" 1]] 5)) "empty judged"))
    (testing "recall@k"
      (is (= 1.0 (metrics/recall-at-k judged [["table" 1] ["card" 7]] 10)))
      (is (= 0.5 (metrics/recall-at-k judged [["table" 1] ["table" 9]] 10)))
      (is (= 0.5 (metrics/recall-at-k judged [["table" 9] ["table" 1] ["card" 7]] 2))
          "the grade-1 entity sits just past the cut")
      (is (= 0.0 (metrics/recall-at-k judged [] 10)) "empty result")
      (is (= 0.0 (metrics/recall-at-k {} [["table" 1]] 10)) "no relevant entities, no denominator"))
    (testing "MRR"
      (is (= 1.0  (metrics/reciprocal-rank judged [["table" 1]])))
      (is (= 0.5  (metrics/reciprocal-rank judged [["x" 0] ["card" 7]])))
      (is (= 0.25 (metrics/reciprocal-rank judged [["x" 0] ["y" 0] ["z" 0] ["table" 1]])))
      (is (= 0.0  (metrics/reciprocal-rank judged [["x" 0]])))
      (is (= 0.0  (metrics/reciprocal-rank {} [["x" 0]]))))))

(deftest ^:parallel ndcg-grades-test
  (let [judged {:a 2, :b 1}]
    (testing "the ideal ordering scores 1.0"
      (is (= 1.0 (metrics/ndcg-at-k judged [:a :b] 10))))
    (testing "grade-2 above grade-1 strictly beats the swapped ordering"
      (is (> (metrics/ndcg-at-k judged [:a :b] 10)
             (metrics/ndcg-at-k judged [:b :a] 10))))
    (testing "positions past k contribute nothing"
      (is (= (metrics/ndcg-at-k judged [:a :x :b] 2)
             (metrics/ndcg-at-k judged [:a :x :y] 2))))
    (testing "all-wrong rankings and empty judgments score 0.0"
      (is (= 0.0 (metrics/ndcg-at-k judged [:x :y] 10)))
      (is (= 0.0 (metrics/ndcg-at-k {} [:x] 10))))))

(deftest ^:parallel bootstrap-delta-test
  (let [per-q (fn [values] (vec (map-indexed (fn [i v] {:id (keyword (str "q" i)), :ndcg-at-10 v}) values)))
        a     (per-q [0.2 0.3 0.4 0.25 0.35 0.3 0.2 0.45])
        b     (per-q [0.7 0.8 0.9 0.75 0.85 0.8 0.7 0.95])]
    (testing "a large constant offset yields a CI excluding zero"
      (let [{:keys [delta ci-95 n]} (metrics/bootstrap-delta a b :ndcg-at-10)]
        (is (= 8 n))
        (is (< (abs (- delta 0.5)) 1e-9))
        (is (pos? (first ci-95)))))
    (testing "identical vectors yield a zero delta and a CI containing zero"
      (let [{:keys [delta ci-95]} (metrics/bootstrap-delta a a :ndcg-at-10)]
        (is (zero? delta))
        (is (<= (first ci-95) 0.0 (second ci-95)))))
    (testing "seeded: two runs over the same vectors report the same interval"
      (is (= (metrics/bootstrap-delta a b :ndcg-at-10)
             (metrics/bootstrap-delta a b :ndcg-at-10))))
    (testing "queries without the metric on either side (out-of-domain) are excluded from the pairing"
      (is (= 8 (:n (metrics/bootstrap-delta (conj a {:id :ood, :weak? true})
                                            (conj b {:id :ood, :weak? false})
                                            :ndcg-at-10)))))
    (testing "nil when no pair carries the metric"
      (is (nil? (metrics/bootstrap-delta [{:id :q}] [{:id :q}] :ndcg-at-10))))))

(deftest ^:parallel normalize-text-test
  (is (= "monthly recurring revenue" (metrics/normalize-text "  Monthly---Recurring   REVENUE!!")))
  (is (= "what s our nrr" (metrics/normalize-text "What's our NRR?")))
  (is (nil? (metrics/normalize-text nil))))

;;; ------------------------------------------- Per-query scoring -------------------------------------------------

(deftest ^:parallel score-query-in-domain-only-test
  (let [result {:data       [{:type "table", :id 1, :similarity 0.8}
                             {:type "metric", :id 2, :similarity 0.5}]
                :weak_match false}]
    (testing "an in-domain query gets the rank metrics"
      (is (=? {:id             :q1
               :holdout        false
               :judged-any?    true
               :weak?          false
               :top-similarity 0.8
               :hit-at-1       1
               :recall-at-10   1.0
               :mrr            1.0
               :ndcg-at-10     1.0}
              (metrics/score-query {:id :q1, :holdout false, :judged {["table" 1] 2}} result))))
    (testing "a model-flavor judgment matches a metric-typed result — both collapse to the card class"
      (is (=? {:hit-at-1 0, :mrr 0.5}
              (metrics/score-query {:id      :q2
                                    :holdout false
                                    :judged  {(entity-retrieval/entity-class "model" 2) 2}}
                                   result))))
    (testing "an out-of-domain query gets no rank metrics, only the weak flag"
      (let [scored (metrics/score-query {:id :q3, :holdout false, :judged {}}
                                        (assoc result :weak_match true))]
        (is (=? {:judged-any? false, :weak? true} scored))
        (is (not (contains? scored :ndcg-at-10)))))))

(deftest ^:parallel summarize-splits-columns-and-tallies-weak-flags-test
  (let [scored  [{:id :v1, :holdout false, :judged-any? true,  :weak? false
                  :hit-at-1 1, :recall-at-10 1.0, :mrr 1.0, :ndcg-at-10 1.0}
                 {:id :v2, :holdout false, :judged-any? true,  :weak? true
                  :hit-at-1 0, :recall-at-10 0.5, :mrr 0.5, :ndcg-at-10 0.5}
                 {:id :o1, :holdout false, :judged-any? false, :weak? true}
                 {:id :o2, :holdout false, :judged-any? false, :weak? false}
                 {:id :h1, :holdout true,  :judged-any? true,  :weak? false
                  :hit-at-1 1, :recall-at-10 1.0, :mrr 1.0, :ndcg-at-10 0.8}]
        summary (metrics/summarize scored)]
    (is (=? {:queries                  5
             :visible                  {:n 2, :hit-at-1 0.5, :recall-at-10 0.75, :mrr 0.75, :ndcg-at-10 0.75}
             :holdout                  {:n 1, :ndcg-at-10 0.8}
             :weak-flag/true-positive  1
             :weak-flag/false-positive 1
             :weak-flag/out-of-domain  2
             :weak-flag/in-domain      3}
            summary))))

;;; --------------------------------------------------- Corpus ----------------------------------------------------

(deftest ^:parallel corpus-validates-test
  (testing "the shipped corpus/queries/baseline parse, satisfy CorpusSchema, and are cross-file consistent"
    (let [c (corpus/load-corpus)]
      (is (=? {:meta     {:schema-version 1}
               :entities seq
               :queries  seq
               :baseline map?}
              c))))
  (testing "cross-file inconsistencies are caught"
    (let [c (corpus/load-corpus)]
      (is (=? {:judged-key-unknown [[:q-mrr-trend :nope]]}
              (#'corpus/structural-problems (assoc-in c [:queries 0 :judged :nope] 2))))
      (is (=? {:baseline-key-unknown [:ghost]}
              (#'corpus/structural-problems (assoc-in c [:baseline :ghost] {}))))
      (is (=? {:duplicate-corpus-keys [:customers]}
              (#'corpus/structural-problems (update c :entities conj (first (:entities c))))))
      (is (=? {:duplicate-query-ids [(:id (first (:queries c)))]}
              (#'corpus/structural-problems (update c :queries conj (first (:queries c))))))
      (is (=? {:parent-not-a-table [:orphan-measure]}
              (#'corpus/structural-problems (update c :entities conj
                                                    {:corpus-key :orphan-measure
                                                     :model      :model/Measure
                                                     :table      :missing-table
                                                     :entity     {}})))))))

(deftest ^:parallel every-entity-has-a-baseline-test
  (testing "the baseline covers every corpus entity — the baseline arm is not silently half a no-metadata arm"
    (let [c (corpus/load-corpus)]
      (is (= (set (map :corpus-key (:entities c)))
             (set (keys (:baseline c))))))))

(deftest ^:parallel baseline-does-not-quote-the-queries-test
  (testing "no baseline synonym or example, normalized, equals any benchmark query string"
    (let [c              (corpus/load-corpus)
          baseline-texts (into #{}
                               (comp (mapcat (fn [ai-context]
                                               (concat (:synonyms ai-context) (:examples ai-context))))
                                     (map metrics/normalize-text))
                               (vals (:baseline c)))
          query-texts    (into #{} (map (comp metrics/normalize-text :prompt)) (:queries c))]
      (is (empty? (set/intersection baseline-texts query-texts))))))

(deftest ^:parallel baseline-fits-the-write-api-test
  (testing "every baseline entry validates against the ai_context schema the CRUD API enforces"
    (doseq [[corpus-key ai-context] (:baseline (corpus/load-corpus))]
      (is (nil? (mr/explain osi-api/AiContext ai-context)) (str corpus-key)))))

(deftest ^:parallel queries-cover-the-corpus-test
  (let [{:keys [entities queries]} (corpus/load-corpus)
        grade-2-keys (into #{}
                           (mapcat (fn [{:keys [judged]}]
                                     (keep (fn [[k grade]] (when (= 2 grade) k)) judged)))
                           queries)]
    (testing "every corpus entity is the grade-2 answer to at least one query"
      (is (empty? (remove grade-2-keys (map :corpus-key entities)))))
    (testing "at least three queries are out-of-domain (the weak-flag denominator)"
      (is (<= 3 (count (filter (comp empty? :judged) queries)))))
    (testing "holdout queries are present, with in-domain ones among them (the sealed rank column)"
      (is (seq (filter :holdout queries)))
      (is (seq (filter #(and (:holdout %) (seq (:judged %))) queries))))))

;;; ---------------------------------------------------- Arms -----------------------------------------------------

(deftest ^:parallel arm-context-shapes-test
  (let [c (corpus/load-corpus)]
    (testing ":none yields nil for every entity"
      (is (nil? (arms/arm-context :none c nil :customers))))
    (testing ":baseline yields the baseline entry, and throws on a hole rather than thinning to :none"
      (is (= (get-in c [:baseline :customers])
             (arms/arm-context :baseline c nil :customers)))
      (is (thrown-with-msg? Exception #"No baseline ai_context"
                            (arms/arm-context :baseline (update c :baseline dissoc :customers) nil :customers))))
    (testing ":generated throws when no snapshot is configured — no silent degrade to :none"
      (is (thrown-with-msg? Exception #"No generated snapshot"
                            (arms/arm-context :generated c nil :customers))))
    (testing ":generated reads the configured snapshot; a gap key is nil (an accounted-for coverage gap)"
      (let [c (assoc c :generated-snapshot {:customers {:synonyms ["client accounts"]}})]
        (is (= {:synonyms ["client accounts"]} (arms/arm-context :generated c nil :customers)))
        (is (nil? (arms/arm-context :generated c nil :coupons)))))))

(deftest ^:parallel generated-coverage-test
  (let [c    (corpus/load-corpus)
        full (into {} (map (fn [{:keys [corpus-key]}] [corpus-key {:synonyms ["s"]}])) (:entities c))]
    (testing "a full snapshot is complete"
      (is (=? {:complete? true, :missing empty?, :fraction 1.0}
              (arms/generated-coverage c full))))
    (testing "a partial snapshot names what is missing"
      (is (=? {:complete? false, :missing #{:customers}}
              (arms/generated-coverage c (dissoc full :customers)))))
    (testing "a nil snapshot is zero coverage, not an error"
      (is (=? {:complete? false, :fraction 0.0}
              (arms/generated-coverage c nil))))
    (testing "a malformed false context cannot count as covered while the writer skips it"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid generated context"
                            (arms/generated-coverage c (assoc full :customers false)))))))

(deftest ^:parallel generated-snapshot-source-is-unambiguous-test
  (testing "inline data and a file path cannot both claim to be the scored artifact"
    (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"either :snapshot-data or :snapshot"
                                  (arms/generated-snapshot-artifact
                                   {:snapshot-data {} :snapshot "generated.edn"})))]
      (is (= :ambiguous-snapshot-source (:reason (ex-data e)))))))

(deftest run-arm-refuses-partial-generated-snapshot-test
  (testing "a partial snapshot is never scored as the :generated arm"
    (let [c (corpus/load-corpus)]
      (is (thrown-with-msg? Exception #"No generated snapshot"
                            (runner/run-arm! c :generated {})))
      (is (thrown-with-msg? Exception #"Partial generated snapshot"
                            (runner/run-arm! (assoc c :generated-snapshot {:customers {:synonyms ["s"]}})
                                             :generated
                                             {}))))))

(deftest run-arm-refuses-a-corpus-the-manifest-would-misreport-test
  (testing "only the corpus the files hold is scored — the manifest reports their SHAs"
    (let [c      (corpus/load-corpus)
          opts   {:model semantic.tu/mock-embedding-model}
          scored (atom 0)]
      (mt/with-dynamic-fn-redefs [runner/score-arm! (fn [_corpus arm _opts]
                                                      (swap! scored inc)
                                                      {:arm arm})]
        (doseq [[what doctored] {"a subset of the entities" (update c :entities (comp vec next))
                                 "an edited entity"         (assoc-in c [:entities 0 :entity :description] "e")
                                 "a dropped query"          (update c :queries (comp vec next))
                                 "an edited baseline"       (assoc-in c [:baseline :customers] {:synonyms ["x"]})}]
          (testing what
            (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"differs from the corpus files"
                                          (runner/run-arm! doctored :none opts)))]
              (is (= :corpus-not-from-resources (:reason (ex-data e)))))))
        (is (zero? @scored) "the refusal lands before any scoring, not in the report")
        (testing "the loaded corpus, snapshot keys and all, is still scored"
          (is (=? {:arm :none} (runner/run-arm! (assoc c :generated-snapshot {}) :none opts)))
          (is (= 1 @scored)))))))

(deftest ^:parallel regression-gate-test
  (let [column  (fn [ndcg recall] {:summary {:holdout {:n 3, :ndcg-at-10 ndcg, :recall-at-10 recall}}})
        results {:none      (column 0.50 0.60)
                 :baseline  (column 0.80 0.85)
                 :generated (column 0.78 0.84)}
        deltas  {[:baseline :generated]
                 {:holdout {:ndcg-at-10   {:ci-95 [-0.03 0.01]}
                            :recall-at-10 {:ci-95 [-0.02 0.02]}}}
                 [:none :generated]
                 {:holdout {:ndcg-at-10   {:ci-95 [0.10 0.40]}
                            :recall-at-10 {:ci-95 [0.08 0.35]}}}}]
    (testing "bootstrap ranges within the margin of baseline and above :none pass the provisional signal"
      (is (=? {:pass? true} (runner/regression-gate results deltas))))
    (testing "a good point estimate still fails when the bootstrap range permits excess regression"
      (is (=? {:pass?  false
               :checks (partial some #(and (= :non-inferior-to-baseline (:check %))
                                           (false? (:pass? %))))}
              (runner/regression-gate results
                                      (assoc-in deltas [[:baseline :generated] :holdout :ndcg-at-10 :ci-95]
                                                [-0.10 0.01])))))
    (testing "improvement over :none needs its range lower bound above zero, not a higher point estimate"
      (is (=? {:pass?  false
               :checks (partial some #(and (= :above-none (:check %))
                                           (false? (:pass? %))))}
              (runner/regression-gate results
                                      (assoc-in deltas [[:none :generated] :holdout :recall-at-10 :ci-95]
                                                [-0.01 0.30])))))
    (testing "a missing generated arm fails, never passes vacuously"
      (is (=? {:pass? false} (runner/regression-gate (dissoc results :generated)))))))

(deftest benchmark-index-coverage-guard-test
  (testing "a missing reconciled document refuses scoring and names the coverage-mismatch reason"
    (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"1 missing, 0 unexpected"
                                  (#'runner/assert-index-coverage! #{"a" "b"} #{"a"})))]
      (is (= :index-coverage-mismatch (:reason (ex-data e))))))
  (testing "an unexpected reconciled document also refuses scoring"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"0 missing, 1 unexpected"
                          (#'runner/assert-index-coverage! #{"a" "b"} #{"a" "b" "extra"}))))
  (is (true? (#'runner/assert-index-coverage! #{"a" "b"} #{"a" "b"}))))

(deftest ^:parallel tool-limit-normalization-test
  (is (= 20 (:tool-limit (#'runner/normalize-opts {}))))
  (is (= 20 (:tool-limit (#'runner/normalize-opts {:tool-limit nil}))))
  (is (= 10 (:tool-limit (#'runner/normalize-opts {:tool-limit 10}))))
  (doseq [bad [9 21 10.5 "10"]]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"between 10 and 20"
                          (#'runner/normalize-opts {:tool-limit bad})))))

(def ^:private declared-ollama-model
  {:provider "ollama" :model-name "mutable-tag"
   :model-digest "1b226e2802dbb772b5fc32a58f103ca1804ef7501331012de126ab22f67475ef" :runtime-version "0.11.0"})

(defn- with-ollama-serving
  "Run `f` with the artifact probe answering `identity-map`, or throwing `identity-map` when it is an
  exception."
  [identity-map f]
  (mt/with-dynamic-fn-redefs [runner/ollama-artifact-identity
                              (fn [_] (if (instance? Throwable identity-map)
                                        (throw identity-map)
                                        identity-map))]
    (f)))

(deftest ollama-model-needs-artifact-identity-test
  (testing "the provenance fields are required, since embedding-space-id cannot tell two digests apart"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"require :model-digest and :runtime-version"
                          (#'runner/assert-model-artifact-identity!
                           {:provider "ollama" :model-name "mutable-tag"}))))
  (testing "a declaration matching what Ollama serves passes through unchanged"
    (with-ollama-serving {:model-digest "1b226e2802dbb772b5fc32a58f103ca1804ef7501331012de126ab22f67475ef" :runtime-version "0.11.0"}
      #(is (= declared-ollama-model
              (#'runner/assert-model-artifact-identity! declared-ollama-model)))))
  (testing "a stale hand-copied digest is refused rather than trusted"
    (with-ollama-serving {:model-digest "359d7dd4bcdab3d86b87d73a3b0a0e0d1c9f9b6a5e4d3c2b1a09f8e7d6c5b4a3" :runtime-version "0.11.0"}
      #(let [e (try (#'runner/assert-model-artifact-identity! declared-ollama-model)
                    (catch clojure.lang.ExceptionInfo e e))]
         (is (= :model-artifact-drift (:reason (ex-data e))))
         (is (= {:declared "1b226e2802dbb772b5fc32a58f103ca1804ef7501331012de126ab22f67475ef" :actual "359d7dd4bcdab3d86b87d73a3b0a0e0d1c9f9b6a5e4d3c2b1a09f8e7d6c5b4a3"}
                (get-in (ex-data e) [:drift :model-digest]))))))
  (testing "an upgraded runtime is drift too — the same weights can embed differently"
    (with-ollama-serving {:model-digest "1b226e2802dbb772b5fc32a58f103ca1804ef7501331012de126ab22f67475ef" :runtime-version "0.12.0"}
      #(is (thrown-with-msg? clojure.lang.ExceptionInfo #"different artifact than the benchmark declared"
                             (#'runner/assert-model-artifact-identity! declared-ollama-model)))))
  (testing "an unverifiable run fails rather than scoring as a verified one"
    (with-ollama-serving (ex-info "boom" {:reason :ollama-unreachable})
      #(is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                             (#'runner/assert-model-artifact-identity! declared-ollama-model)))))
  (testing "non-Ollama providers are not probed at all"
    (with-ollama-serving (ex-info "must not be called" {})
      #(is (= {:provider "mock" :model-name "m"}
              (#'runner/assert-model-artifact-identity! {:provider "mock" :model-name "m"}))))))

(deftest run-arm-verifies-the-served-model-test
  (testing "an arm verifies the served artifact itself, on both sides of the scoring"
    ;; The comparison used to be the only caller that verified, so a standalone run scored whatever the
    ;; mutable tag pointed at while its manifest reported the declared digest.
    (let [declared "1b226e2802dbb772b5fc32a58f103ca1804ef7501331012de126ab22f67475ef"
          other    "359d7dd4bcdab3d86b87d73a3b0a0e0d1c9f9b6a5e4d3c2b1a09f8e7d6c5b4a3"
          served   (fn [digest] {:model-digest digest :runtime-version "0.11.0"})
          c        (corpus/load-corpus)
          opts     {:model (assoc declared-ollama-model :vector-dimensions 1024)}
          scored   (atom 0)]
      (mt/with-dynamic-fn-redefs [runner/score-arm! (fn [_corpus arm _opts]
                                                      (swap! scored inc)
                                                      {:arm arm})]
        (testing "a tag repointed before the arm is caught before any scoring"
          (with-ollama-serving (served other)
            #(let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                           #"different artifact than the benchmark declared"
                                           (runner/run-arm! c :none opts)))]
               (is (= :model-artifact-drift (:reason (ex-data e))))))
          (is (zero? @scored)))
        (testing "a tag repointed while the arm ran fails the run instead of manifesting the declared digest"
          (let [probes (atom 0)]
            (mt/with-dynamic-fn-redefs [runner/ollama-artifact-identity
                                        (fn [_] (served (if (= 1 (swap! probes inc)) declared other)))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                    #"different artifact than the benchmark declared"
                                    (runner/run-arm! c :none opts)))
              (is (= 1 @scored) "the arm did run — the post-arm probe is what caught the drift")
              (is (= 2 @probes) "the artifact is probed on both sides of the arm"))))
        (testing "an artifact that never moved is scored"
          (with-ollama-serving (served declared)
            #(is (=? {:arm :none} (runner/run-arm! c :none opts))))
          (is (= 2 @scored)))))))

(deftest benchmark-query-refuses-unavailable-or-empty-retrieval-test
  (testing "availability is checked before calling the tool"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval/entity-retrieval-available? (constantly false)
       tools.entity-retrieval/retrieve-library-entities-tool
       (fn [& _] (throw (AssertionError. "tool called while unavailable")))]
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"became unavailable"
                                    (#'runner/run-query {:id :q :prompt "query"} {})))]
        (is (= :retrieval-unavailable (:reason (ex-data e)))))))
  (testing "structured empty results from a populated benchmark index fail instead of scoring zero"
    (mt/with-dynamic-fn-redefs
      [entity-retrieval/entity-retrieval-available? (constantly true)
       tools.entity-retrieval/retrieve-library-entities-tool
       (constantly {:structured-output {:data [] :total_count 0}})]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"populated benchmark index"
                            (#'runner/run-query {:id :q :prompt "query"} {}))))))

(deftest snapshot-corpus-hash-guard-test
  (let [c          (corpus/load-corpus)
        snapshot   (into {}
                         (map (fn [{:keys [corpus-key]}] [corpus-key {:synonyms ["s"]}]))
                         (:entities c))
        pam        "prov/model"
        metadata   {:corpus-hash          (corpus/corpus-hash c)
                    :model-ref            pam
                    :generator-version    (generate/generator-version pam)
                    :generation-code-hash (arms/generation-code-hash)
                    :connection           (test-generation-connection pam)}
        with-meta  (fn [overrides]
                     (assoc c
                            :generated-snapshot snapshot
                            :generated-snapshot-metadata (merge metadata overrides)))]
    (testing "a snapshot with complete, current metadata is accepted"
      (is (nil? (#'runner/assert-snapshot-matches-corpus! (with-meta {})))))
    (testing "missing or incomplete metadata is rejected instead of silently scoring an unverifiable fixture"
      (doseq [invalid [(assoc c :generated-snapshot snapshot)
                       (assoc (with-meta {}) :generated-snapshot-metadata (dissoc metadata :generator-version))
                       (assoc (with-meta {}) :generated-snapshot-metadata (dissoc metadata :connection))
                       (assoc-in (with-meta {}) [:generated-snapshot-metadata :connection :routing] {})
                       (assoc-in (with-meta {})
                                 [:generated-snapshot-metadata :connection]
                                 {:connection-key "prov"
                                  :type           "google"
                                  :model          "model"
                                  :ai-proxy?      false
                                  :routing        {:base-url (arms/endpoint-identity
                                                              "https://aiplatform.googleapis.com"
                                                              endpoint-identity-opts)
                                                   :location "global"}})]]
        (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"metadata must include"
                                      (#'runner/assert-snapshot-matches-corpus! invalid)))]
          (is (= :invalid-snapshot-metadata (:reason (ex-data e)))))))
    (testing "plaintext-bearing extra fields are rejected and never copied to a manifest or error"
      (doseq [injected [(assoc metadata :credentials "snapshot-secret")
                        (assoc-in metadata [:connection :credentials] {:api-key "connection-secret"})
                        (assoc-in metadata [:connection :routing :endpoint] "https://routing-secret.example")
                        (assoc-in metadata [:connection :routing :base-url :credentials] "endpoint-secret")]]
        (let [invalid (assoc c
                             :generated-snapshot snapshot
                             :generated-snapshot-metadata injected)
              e       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"metadata must include"
                                            (#'runner/assert-snapshot-matches-corpus! invalid)))]
          (is (= {:reason :invalid-snapshot-metadata} (ex-data e)))
          (is (not (str/includes? (pr-str (ex-data e)) "secret"))))))
    (testing "a snapshot captured from a different corpus is rejected by run-arm! before any index work"
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"different corpus"
                                    (runner/run-arm! (with-meta {:corpus-hash "0000beef"}) :generated {})))]
        (is (= :stale-snapshot (:reason (ex-data e))))))
    (testing "a snapshot from an older prompt or generator is rejected"
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"older generator"
                                    (#'runner/assert-snapshot-matches-corpus!
                                     (with-meta {:generator-version "v-old"}))))]
        (is (= :stale-generator (:reason (ex-data e))))))
    (testing "a snapshot from older generation or projection code is rejected"
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"older generation code"
                                    (#'runner/assert-snapshot-matches-corpus!
                                     (with-meta {:generation-code-hash "old-code"}))))]
        (is (= :stale-generator (:reason (ex-data e))))))
    (testing "an entity edit (a changed description) changes the corpus hash"
      (is (not= (corpus/corpus-hash c)
                (corpus/corpus-hash (assoc-in c [:entities 0 :entity :description] "edited")))))))

(deftest ^:parallel generated-manifest-hashes-content-and-records-generation-test
  (let [model    {:provider "ollama" :model-name "mxbai-embed-large" :vector-dimensions 1024}
        metadata {:model-ref "anthropic/model" :generator-version "v-test"}
        base     (assoc (corpus/load-corpus)
                        :generated-snapshot-metadata metadata)
        a        (runner/manifest model :generated {:snapshot-data {}}
                                  (assoc base :generated-snapshot
                                         (array-map :customers {:synonyms ["clients"]}
                                                    :coupons {:synonyms ["discounts"]})))
        reordered (runner/manifest model :generated {:snapshot-data {}}
                                   (assoc base :generated-snapshot
                                          (array-map :coupons {:synonyms ["discounts"]}
                                                     :customers {:synonyms ["clients"]})))
        changed  (runner/manifest model :generated {:snapshot-data {}}
                                  (assoc base :generated-snapshot
                                         {:customers {:synonyms ["accounts"]}}))]
    (is (= metadata (get-in a [:snapshot :generation])))
    (is (string? (get-in a [:snapshot :sha256])))
    (is (= (get-in a [:snapshot :sha256]) (get-in reordered [:snapshot :sha256]))
        "map iteration order does not change the content identity")
    (is (not= (get-in a [:snapshot :sha256]) (get-in changed [:snapshot :sha256])))))

(deftest ^:parallel generation-code-hash-covers-the-provider-call-path-test
  (testing "every provider adapter is in the capture's provenance, so changing one invalidates snapshots"
    ;; Derived from the source tree rather than hard-coded: a new adapter has to be classified here
    ;; deliberately, instead of silently falling outside the hash the way `provider_util` once did.
    (let [sources     (set (var-get #'arms/generation-source-resources))
          ;; Not part of the request path — a change to either cannot alter a captured context.
          non-adapters #{"metabase/metabot/self/debug.clj"
                         "metabase/metabot/self/features.clj"}
          ;; Anchored on a known source file: resolving the bare directory can land in the test tree,
          ;; whichever copy the classpath offers first.
          root        (.getParentFile (io/file (io/resource "metabase/metabot/self/core.clj")))
          adapters    (into #{}
                            (comp (filter #(.isFile ^java.io.File %))
                                  (map #(.getPath ^java.io.File %))
                                  (filter #(str/ends-with? % ".clj"))
                                  (remove #(str/ends-with? % "_test.clj"))
                                  (map #(subs % (.lastIndexOf ^String % "metabase/metabot/self")))
                                  (remove non-adapters))
                            (file-seq root))]
      (is (seq adapters) "the adapter directory must actually be readable from the classpath")
      (is (set/subset? adapters sources)
          "a provider adapter is missing from generation-source-resources")
      (is (set/subset? #{"metabase/llm/provider.clj"
                         "metabase/metabot/self.clj"
                         "metabase_enterprise/osi_generation/prompts/context_system.selmer"
                         "metabase_enterprise/osi_generation/prompts/context_user.selmer"
                         "metabase_enterprise/osi_generation/benchmark/corpus.clj"}
                       sources)
          "the non-adapter parts of the call path must be covered too"))))

(deftest ^:parallel artifact-identities-ignore-ambient-print-bounds-test
  (let [c        (corpus/load-corpus)
        contexts {:customers {:synonyms ["clients" "accounts"]}
                  :coupons   {:synonyms ["discounts" "promotions"]}}
        snapshot-corpus (assoc c
                               :generated-snapshot contexts
                               :generated-snapshot-metadata {:model-ref "provider/model"})
        identities (fn []
                     {:code     (arms/generation-code-hash)
                      :corpus   (corpus/corpus-hash c)
                      :snapshot (get-in (runner/manifest {:provider "mock"}
                                                         :generated
                                                         {:snapshot-data contexts}
                                                         snapshot-corpus)
                                        [:snapshot :sha256])})]
    (is (= (identities)
           (binding [*print-length* 1, *print-level* 1]
             (identities))))))

(deftest manifest-records-dirty-checkout-evidence-test
  (mt/with-dynamic-fn-redefs [runner/git-state (constantly {:sha "abc123"
                                                            :dirty? true
                                                            :tracked-diff-sha "diff456"})]
    (is (=? {:git-sha "abc123" :git-dirty? true :git-diff-sha "diff456"}
            (runner/manifest {:provider "mock"} :none {} (corpus/load-corpus))))))

(deftest git-provenance-fails-closed-test
  (testing "a nonzero Git command cannot produce a manifest with missing or clean-looking provenance"
    (mt/with-dynamic-fn-redefs [shell/sh (constantly {:exit 128 :out "" :err "not a repository"})]
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Git provenance command failed"
                                    (runner/manifest {:provider "mock"} :none {} (corpus/load-corpus))))]
        (is (= :git-provenance-failed (:reason (ex-data e)))))))
  (testing "a wrapped Git interruption restores the flag and aborts"
    (let [thrown (mt/with-dynamic-fn-redefs
                   [shell/sh (fn [& _]
                               (throw (ex-info "git wrapper" {}
                                               (InterruptedException. "cancelled"))))]
                   (try
                     (runner/manifest {:provider "mock"} :none {} (corpus/load-corpus))
                     nil
                     (catch Exception e e)))
          interrupted? (.isInterrupted (Thread/currentThread))]
      (Thread/interrupted)
      (is (instance? clojure.lang.ExceptionInfo thrown))
      (is interrupted?))))

(deftest ^:synchronized comparison-pins-one-embedding-model-test
  (let [configured-calls (atom 0)
        seen-models      (atom [])
        seen-provenance  (atom [])
        model            {:provider "mock" :model-name "pinned" :vector-dimensions 4}]
    (mt/with-dynamic-fn-redefs
      [semantic.db.datasource/pgvector-configured? (constantly true)
       semantic.embedding/get-configured-model (fn [] (swap! configured-calls inc) model)
       runner/run-arm! (fn [_corpus _arm opts]
                         (swap! seen-models conj (:model opts))
                         (swap! seen-provenance conj (:benchmark-provenance opts))
                         {:summary {:holdout {:n 0}}})]
      (runner/run-comparison! {})
      (is (= 1 @configured-calls) "the comparison resolves the configured model once")
      (is (= 1 (count (set @seen-models))) "every arm receives the same pinned model")
      (is (= "pinned" (:model-name (first @seen-models))))
      (is (some? (:embedding-space-id (first @seen-models)))
          "the pinned model is resolved, so the index metadata row's NOT NULL embedding_space_id is satisfied")
      (is (= 1 (count (set @seen-provenance))) "every arm receives the same pre-run provenance"))))

(deftest ^:synchronized comparison-pins-one-embedding-endpoint-test
  (let [base-url-reads (atom 0)
        seen-routing   (atom [])
        provenance    {:corpus-sha {}, :git-state {:sha "abc", :dirty? false}}]
    (mt/with-dynamic-fn-redefs
      [semantic.db.datasource/pgvector-configured? (constantly true)
       semantic-settings/openai-api-key             (constantly "secret-key")
       semantic-settings/openai-api-base-url        (fn []
                                                      (if (= 1 (swap! base-url-reads inc))
                                                        "https://first.openai.example"
                                                        "https://second.openai.example"))
       runner/benchmark-provenance                   (constantly provenance)
       runner/run-arm!                              (fn [_corpus _arm opts]
                                                      (swap! seen-routing conj (:embedding-routing opts))
                                                      {:summary {:holdout {:n 0}}})]
      (runner/run-comparison! {:model {:provider          "openai"
                                       :model-name        "text-embedding-3-small"
                                       :vector-dimensions 1536}
                               :endpoint-identity-key (:endpoint-identity-key endpoint-identity-opts)})
      (is (= 1 @base-url-reads))
      (is (= 1 (count (set @seen-routing))))
      (is (= "https://first.openai.example/v1/embeddings"
             (:endpoint (first @seen-routing)))))))

(deftest ^:synchronized remote-embedding-endpoint-must-have-a-valid-identity-test
  (testing "invalid routes and missing identity keys fail before scoring or embedding"
    (let [corpus          (corpus/load-corpus)
          scored          (atom 0)
          embedding-calls (atom 0)
          provenance      {:corpus-sha {}, :git-state {:sha "abc", :dirty? false}}
          model           {:provider          "openai"
                           :model-name        "text-embedding-3-small"
                           :vector-dimensions 1536}
          attempt         (fn [base-url opts]
                            (mt/with-dynamic-fn-redefs
                              [semantic-settings/openai-api-key      (constantly "secret-key")
                               semantic-settings/openai-api-base-url (constantly base-url)
                               semantic.embedding/get-embeddings-batch
                               (fn [& _]
                                 (swap! embedding-calls inc)
                                 (throw (AssertionError. "must not embed")))
                               runner/benchmark-provenance           (constantly provenance)
                               runner/score-arm!                     (fn [& _]
                                                                       (swap! scored inc)
                                                                       (throw (AssertionError. "must not score")))]
                              (try
                                (runner/run-arm! corpus :none (merge {:model model} opts))
                                nil
                                (catch Exception e e))))]
      (testing "an arbitrary URI scheme cannot collapse to <unparseable> and continue"
        (let [error (attempt "sk-secret://embedding.internal" endpoint-identity-opts)]
          (is (instance? clojure.lang.ExceptionInfo error))
          (is (= :invalid-embedding-endpoint-identity (:reason (ex-data error))))
          (is (= "<unparseable>" (:embedding-endpoint (ex-data error))))
          (is (not (str/includes? (pr-str (ex-data error)) "sk-secret")))))
      (testing "a missing or weak HMAC key cannot fall back to an unkeyed identity"
        (let [error (attempt "https://embedding.internal" {:endpoint-identity-key "too-short"})]
          (is (instance? clojure.lang.ExceptionInfo error))
          (is (= :missing-endpoint-identity-key (:reason (ex-data error))))))
      (is (zero? @scored))
      (is (zero? @embedding-calls)))))

(deftest ^:synchronized comparison-refuses-mid-run-provenance-drift-test
  (let [checks (atom 0)]
    (mt/with-dynamic-fn-redefs
      [semantic.db.datasource/pgvector-configured? (constantly true)
       runner/benchmark-provenance (fn [_opts]
                                     (if (= 1 (swap! checks inc))
                                       {:corpus-sha {:corpus.edn "before"} :git-state {:sha "before"}}
                                       {:corpus-sha {:corpus.edn "after"} :git-state {:sha "after"}}))
       runner/run-arm! (fn [_corpus _arm _opts] {:summary {:holdout {:n 0}}})]
      (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"changed during the benchmark"
                                    (runner/run-comparison! {:model semantic.tu/mock-embedding-model})))]
        (is (= :benchmark-provenance-changed (:reason (ex-data e))))))))

(deftest ^:synchronized comparison-uses-canonical-pgvector-availability-test
  (mt/with-dynamic-fn-redefs [semantic.db.datasource/pgvector-configured? (constantly false)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"pgvector-capable"
                          (runner/run-comparison! {:model semantic.tu/mock-embedding-model})))))

;;; ------------------------------------------- Membership isolation ----------------------------------------------

(deftest ^:synchronized corpus-library-preserves-paid-usage-test
  (let [source (str "osi-benchmark-test-" (random-uuid))]
    (try
      (corpus/with-corpus-library [_ids (corpus/load-corpus)]
        (t2/insert! :model/AiUsageLog
                    {:source            source
                     :model             "test/model"
                     :prompt_tokens     3
                     :completion_tokens 2
                     :total_tokens      5
                     :user_id           (mt/user->id :crowberto)}))
      (is (= 1 (t2/count :model/AiUsageLog :source source))
          "corpus cleanup commits rather than rolling back independently written usage")
      (finally
        (t2/delete! :model/AiUsageLog :source source)))))

(deftest ^:synchronized corpus-library-membership-isolated-test
  (testing "with-corpus-library resolves membership to the benchmark tree even when a real library exists"
    (mt/with-premium-features #{:library :library-retrieval}
      (collections.tu/with-library [{data :data}]
        (mt/with-temp [:model/Database {db-id :id}    {}
                       :model/Table    {other-id :id} {:db_id         db-id
                                                       :collection_id (:id data)
                                                       :is_published  true
                                                       :active        true
                                                       :name          "real_library_table"
                                                       :display_name  "Real Library Table"}]
          (corpus/with-corpus-library [ids (corpus/load-corpus)]
            (let [members (into #{}
                                (map (juxt :entity_type :entity_local_id))
                                (spec/member-entities :library-index))]
              (testing "membership is exactly the corpus entities"
                (is (= (into #{}
                             (map (fn [{:keys [entity_type entity_local_id]}]
                                    [entity_type entity_local_id]))
                             (vals ids))
                       members)))
              (testing "the real library's table is not a member — its metadata can never reach the embedder"
                (is (not (contains? members ["table" other-id])))))))))))

(defn- on-plain-thread
  "Run `f` on a raw Thread and return its result (rethrowing a throw). A raw Thread gets no binding
  conveyance, so `mt/with-dynamic-fn-redefs` overrides do not apply — exactly how a Quartz/scheduler
  thread sees vars. It also gets a fresh app-db connection."
  [f]
  (let [result (promise)]
    (doto (Thread. ^Runnable (fn [] (deliver result (try (f) (catch Throwable t t)))))
      .start)
    (let [v @result]
      (if (instance? Throwable v) (throw v) v))))

(deftest ^:synchronized corpus-library-invisible-without-override-test
  (testing "the benchmark tree carries no library collection type, so the type-driven root lookup a thread
           without the override runs (a scheduler's full reconcile) can only ever resolve the real library"
    (mt/with-premium-features #{:library :library-retrieval}
      ;; If no real library exists, with-library uses with-temp. Start it outside a rollback-only
      ;; transaction so the raw scheduler-like thread must actually observe that tree.
      (binding [tu.thread-local/*thread-local* false]
        (collections.tu/with-library [{lib :library}]
          (corpus/with-corpus-library [ids (corpus/load-corpus)]
            ;; inside the override this thread sees the benchmark root…
            (let [bench-root (collections/library-collection)]
              (is (not= (:id lib) (:id bench-root)) "sanity: the override is live on this thread")
              (testing "…but the real library remains the ONLY library-typed collection"
                (is (= #{(:id lib)}
                       (t2/select-fn-set :id :model/Collection :type collections/library-collection-type))
                    "a second library-typed root would make the scheduler's select-one indeterminate")
                (is (not-any? #{collections/library-collection-type
                                collections/library-data-collection-type
                                collections/library-metrics-collection-type}
                              (t2/select-fn-vec :type :model/Collection
                                                :location [:like (str "/" (:id bench-root) "/%")]))
                    "the benchmark sub-collections are untyped too"))
              (testing "a thread without the override resolves the real root and no corpus entity"
                (is (= (:id lib) (:id (on-plain-thread collections/library-collection))))
                (let [members     (on-plain-thread
                                   #(into #{}
                                          (map (juxt :entity_type :entity_local_id))
                                          (spec/member-entities :library-index)))
                      corpus-keys (into #{}
                                        (map (juxt :entity_type :entity_local_id))
                                        (vals ids))]
                  (is (empty? (set/intersection members corpus-keys))
                      "a scheduled reconcile can never derive a benchmark doc for the real index"))))))))))

;;; ------------------------------------------------ Arm writes ---------------------------------------------------

(deftest ^:synchronized apply-arm-and-candidate-test
  (mt/with-premium-features #{:library :library-retrieval}
    (let [c (corpus/load-corpus)]
      (corpus/with-corpus-library [ids c]
        (testing ":none writes nothing"
          (is (zero? (arms/apply-arm! :none c ids))))
        (testing ":baseline writes one :human row per corpus entity"
          (is (= (count (:entities c)) (arms/apply-arm! :baseline c ids)))
          (let [{:keys [entity_type entity_local_id]} (ids :mrr-ledger)]
            (is (=? {:data_source :human
                     :ai_context  {:synonyms ["monthly recurring revenue" "mrr movements" "revenue retention ledger"]}}
                    (t2/select-one :model/OsiAiContext
                                   :entity_type entity_type
                                   :entity_local_id entity_local_id)))))
        (testing "card rows are stored under the canonical card type"
          (is (t2/exists? :model/OsiAiContext
                          :entity_type "card"
                          :entity_local_id (:entity_local_id (ids :net-revenue-retention)))))
        (testing "candidate-for assembles the production-shaped candidate over the isolated membership"
          (is (=? {:entity           {:entity_type "table"}
                   :llm-input        {:entity-type "table", :name "customers", :field-names vector?}
                   :basis            {:name "customers"}
                   :diff             nil
                   :existing-context nil
                   :tier             1}
                  (arms/candidate-for c ids :customers))))))))

;;; ------------------------------------------------- Capture -----------------------------------------------------

(deftest ^:synchronized capture-pins-generator-identity-test
  (mt/with-premium-features #{:library :library-retrieval}
    (let [c          (update (corpus/load-corpus) :entities (comp vec (partial take 2)))
          out-dir    (str (System/getProperty "java.io.tmpdir")
                          "/osi-generation-benchmark-test-" (System/nanoTime))
          capture-opts (assoc endpoint-identity-opts :out-dir out-dir)
          connection  (fn [model-ref]
                        {:connection-key "prov"
                         :type           "anthropic"
                         :model          (llm.provider/model-ref->model model-ref)
                         :credentials    {:api-key "test-key", :base-url "https://api.anthropic.com"}
                         :ai-proxy?      false})]
      (corpus/with-corpus-library [ids c]
        (testing "the LLM config is resolved once and pinned: a mid-capture settings change cannot mix models"
          (let [seen          (atom [])
                ;; every resolve returns a different model, as a mid-capture settings change would
                drifting-opts (let [n (atom 0)]
                                (fn [] {:model-ref (str "prov/model-" (swap! n inc))
                                        :source             :metabot}))]
            (mt/with-dynamic-fn-redefs
              [llm.provider/resolve-model-ref         connection
               osi-generation.settings/llm-call-opts drifting-opts
               generate/generate-context (fn [_candidate]
                                           (let [pam (:model-ref (osi-generation.settings/llm-call-opts))]
                                             (swap! seen conj pam)
                                             {:ai_context        {:synonyms ["s"]}
                                              :generator-version (generate/generator-version pam)
                                              :usage             {:input-tokens 1, :output-tokens 1}}))]
              (let [{:keys [metadata coverage]} (arms/capture-generated! c ids capture-opts)]
                (is (= ["prov/model-1" "prov/model-1"] @seen)
                    "both generate calls saw the FIRST resolved config, not a re-resolved one")
                (is (=? {:model-ref            "prov/model-1"
                         :generator-version    (generate/generator-version "prov/model-1")
                         :generation-code-hash (arms/generation-code-hash)
                         :corpus-hash          (corpus/corpus-hash c)}
                        metadata)
                    "the artifact metadata is the pinned identity plus the corpus's content hash")
                (is (:complete? coverage))))))
        (testing "same-day captures use distinct paths and preserve both artifacts"
          (mt/with-dynamic-fn-redefs
            [llm.provider/resolve-model-ref connection
             osi-generation.settings/llm-call-opts (constantly {:model-ref "prov/model-stable"
                                                                :source    :metabot})
             generate/generate-context (constantly {:ai_context        {:synonyms ["s"]}
                                                    :generator-version (generate/generator-version
                                                                        "prov/model-stable")
                                                    :usage             {:input-tokens 0, :output-tokens 0}})]
            (let [first-capture  (arms/capture-generated! c ids capture-opts)
                  second-capture (arms/capture-generated! c ids capture-opts)]
              (is (not= (:path first-capture) (:path second-capture)))
              (is (.exists (io/file (:path first-capture))))
              (is (.exists (io/file (:path second-capture)))))))
        (testing "a bounded REPL printer cannot truncate the snapshot"
          (mt/with-dynamic-fn-redefs
            [llm.provider/resolve-model-ref connection
             osi-generation.settings/llm-call-opts
             (constantly {:model-ref "prov/model-print-bounds" :source :metabot})
             generate/generate-context
             (constantly {:ai_context        {:synonyms ["first" "second"]}
                          :generator-version (generate/generator-version "prov/model-print-bounds")
                          :usage             {:input-tokens 0, :output-tokens 0}})]
            (let [capture  (binding [*print-length* 1, *print-level* 1]
                             (arms/capture-generated! c ids capture-opts))
                  artifact (edn/read-string (slurp (:path capture)))]
              (is (= (count (:entities c)) (count (:contexts artifact))))
              (is (= {:synonyms ["first" "second"]}
                     (get-in artifact [:contexts (-> c :entities first :corpus-key)]))))))
        (testing "a generator-version drifting mid-capture fails the capture instead of writing a mixed artifact"
          (mt/with-dynamic-fn-redefs
            [llm.provider/resolve-model-ref connection
             osi-generation.settings/llm-call-opts (constantly {:model-ref "prov/model-x"
                                                                :source    :metabot})
             generate/generate-context (constantly {:ai_context        {:synonyms ["s"]}
                                                    :generator-version "v-drifted"
                                                    :usage             {:input-tokens 0, :output-tokens 0}})]
            (is (thrown-with-msg? Exception #"mid-capture"
                                  (arms/capture-generated! c ids capture-opts)))))
        (testing "a wrapped interruption aborts immediately and restores the thread flag"
          (let [calls (atom 0)
                thrown (mt/with-dynamic-fn-redefs
                         [llm.provider/resolve-model-ref connection
                          osi-generation.settings/llm-call-opts
                          (constantly {:model-ref "prov/model-interrupted" :source :metabot})
                          generate/generate-context
                          (fn [_]
                            (swap! calls inc)
                            (throw (ex-info "wrapped interruption" {}
                                            (InterruptedException. "cancelled"))))]
                         (try
                           (arms/capture-generated! c ids capture-opts)
                           nil
                           (catch Exception e e)))
                interrupted? (.isInterrupted (Thread/currentThread))]
            ;; Clear the flag before making assertions or running more fixture cleanup on this test thread.
            (Thread/interrupted)
            (is (instance? clojure.lang.ExceptionInfo thrown))
            (is (= 1 @calls) "the second paid request is never issued")
            (is interrupted? "the caller can still observe the cancellation")))
        (testing "a wrapped fatal JVM error aborts before another paid request"
          (let [calls (atom 0)]
            (mt/with-dynamic-fn-redefs
              [llm.provider/resolve-model-ref connection
               osi-generation.settings/llm-call-opts
               (constantly {:model-ref "prov/model-fatal" :source :metabot})
               generate/generate-context
               (fn [_]
                 (swap! calls inc)
                 (throw (ex-info "response validation wrapper" {}
                                 (LinkageError. "fatal"))))]
              (is (thrown-with-msg? LinkageError #"fatal"
                                    (arms/capture-generated! c ids capture-opts)))
              (is (= 1 @calls)))))
        (testing "generation provenance is pinned before paid work and rechecked before writing"
          (let [hash-calls (atom 0)]
            (mt/with-dynamic-fn-redefs
              [llm.provider/resolve-model-ref connection
               arms/generation-code-hash
               (fn [] (if (= 1 (swap! hash-calls inc)) "before" "after"))
               osi-generation.settings/llm-call-opts
               (constantly {:model-ref "prov/model-stable" :source :metabot})
               generate/generate-context
               (constantly {:ai_context        {:synonyms ["s"]}
                            :generator-version (generate/generator-version "prov/model-stable")
                            :usage             {:input-tokens 0, :output-tokens 0}})]
              (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo #"changed during capture"
                                            (arms/capture-generated! c ids capture-opts)))]
                (is (= :capture-provenance-changed (:reason (ex-data e))))))))))))

;;; ---------------------------------------------- End-to-end smoke -----------------------------------------------

(deftest ^:synchronized harness-smoke-test
  (testing "the :none, :baseline and fixture-snapshot :generated arms run end to end on an isolated mock index"
    ;; Skips when no pgvector store is configured. run-arm! self-isolates (fresh tables, fresh
    ;; membership, pinned mock model), so nothing here binds tables or stubs nudges. Asserts nothing
    ;; about ranking — four toy mock dimensions cannot support a quality claim.
    (when (semantic.db.datasource/pgvector-configured?)
      (let [c         (corpus/load-corpus)
            opts      {:model semantic.tu/mock-embedding-model}
            n-queries (count (:queries c))
            snapshot  (into {}
                            (map (fn [{:keys [corpus-key]}]
                                   [corpus-key {:synonyms [(str "generated synonym " (name corpus-key))]}]))
                            (:entities c))
            none      (runner/run-arm! c :none opts)
            baseline  (runner/run-arm! c :baseline opts)
            ;; a matching corpus-hash in the metadata exercises the stale-snapshot guard's accept path
            pam       "prov/model"
            generated (runner/run-arm! (assoc c
                                              :generated-snapshot snapshot
                                              :generated-snapshot-metadata
                                              {:corpus-hash          (corpus/corpus-hash c)
                                               :model-ref            pam
                                               :generator-version    (generate/generator-version pam)
                                               :generation-code-hash (arms/generation-code-hash)
                                               :connection           (test-generation-connection pam)})
                                       :generated opts)]
        (testing "each arm scores every query and reports its isolated index size"
          (is (=? {:summary {:queries n-queries}, :index {:documents pos?, :entities pos?}} none))
          (is (=? {:summary {:queries n-queries}} baseline))
          (is (=? {:summary {:queries n-queries}} generated)))
        (testing "the baseline arm's index holds strictly more documents (synonyms/examples add docs)"
          (is (> (get-in baseline [:index :documents])
                 (get-in none [:index :documents]))))
        (testing "the generated fixture arm also adds documents over :none"
          (is (> (get-in generated [:index :documents])
                 (get-in none [:index :documents]))))
        (testing "the manifest records the model, format version and corpus SHAs"
          (is (=? {:manifest {:embedding-model {:provider "mock"}
                              :schema-version  int?
                              :corpus-sha      {"corpus.edn" string?}}}
                  none)))))))

(deftest ^:synchronized live-generation-smoke-test
  (testing "capture-generated! runs the production generator end to end over one corpus entity"
    ;; Real LLM calls, so MB_OSI_GENERATION_BENCHMARK_LIVE=true must opt in explicitly. Once opted in,
    ;; fail clearly unless both the provider and the secret endpoint-identity key are configured. A plain
    ;; local test run never spends tokens silently, and CI never sets the opt-in.
    (when-let [capture-opts (live-generation-opts #(System/getenv %))]
      (is (osi-generation.settings/osi-generation-llm-configured?)
          (str live-generation-env-var "=true requires a configured OSI-generation provider"))
      (when (osi-generation.settings/osi-generation-llm-configured?)
        (mt/with-premium-features #{:library :library-retrieval}
          (let [c (update (corpus/load-corpus) :entities (comp vec (partial take 1)))]
            (corpus/with-corpus-library [ids c]
              (let [{:keys [path coverage errors]}
                    (arms/capture-generated! c ids capture-opts)]
                (is (empty? errors))
                (is (:complete? coverage))
                (is (.exists (io/file path)))))))))))

(deftest ^:parallel live-generation-gate-test
  (testing "ordinary test runs skip the paid live capture"
    (is (nil? (live-generation-opts {}))))
  (testing "explicit live opt-in requires the operator's endpoint identity key"
    (let [error (try
                  (live-generation-opts {live-generation-env-var "true"})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
      (is (= {:reason  :missing-endpoint-identity-key
              :env-var endpoint-identity-key-env-var}
             (ex-data error)))
      (is (str/includes? (ex-message error) endpoint-identity-key-env-var))))
  (testing "the live artifact uses the trimmed operator-supplied secret, never a fixture key"
    (let [secret "operator-controlled-endpoint-identity-key"
          opts   (live-generation-opts {live-generation-env-var         "true"
                                        endpoint-identity-key-env-var "  operator-controlled-endpoint-identity-key  "})]
      (is (= secret (:endpoint-identity-key opts)))
      (is (str/ends-with? (:out-dir opts) "/osi-generation-benchmark")))))

(deftest ^:synchronized comparison-pins-the-query-prefix-test
  (let [seen  (atom [])
        model {:provider "mock" :model-name "pinned" :vector-dimensions 4}]
    (mt/with-dynamic-fn-redefs
      [semantic.db.datasource/pgvector-configured? (constantly true)
       semantic.embedding/get-configured-model     (constantly model)
       runner/run-arm!                             (fn [_corpus _arm opts]
                                                     (swap! seen conj (:query-prefix opts))
                                                     {:summary {:holdout {:n 0}}})]
      (testing "the configured model's own override is honoured and reported once for every arm"
        (reset! seen [])
        (mt/with-temporary-setting-values [ee-embedding-query-prefix "query: "]
          (runner/run-comparison! {})
          (is (= ["query: "] (distinct @seen)))))
      (testing "the site-wide setting is left exactly as it was — a run must not reach into other requests"
        (mt/with-temporary-setting-values [ee-embedding-query-prefix "query: "]
          (runner/run-comparison! {})
          (is (= "query: " (semantic-settings/ee-embedding-query-prefix)))))
      (testing "an instance-wide override does not describe a model the benchmark pinned, so it is ignored"
        ;; Otherwise a run silently embeds its queries under a prefix chosen for a different model.
        (reset! seen [])
        (mt/with-temporary-setting-values [ee-embedding-query-prefix "query: "]
          (runner/run-comparison! {:model {:provider "mock" :model-name "other" :vector-dimensions 4}})
          (is (= [""] (distinct @seen))))))))

(deftest ^:synchronized explicit-query-prefix-still-prepares-model-and-routing-test
  (testing "an explicit prefix does not bypass model resolution or endpoint pinning"
    (mt/with-dynamic-fn-redefs
      [semantic-settings/openai-api-key      (constantly "secret-key")
       semantic-settings/openai-api-base-url (constantly "https://tenant-secret.openai.example/v2")]
      (let [opts     (#'runner/prepared-opts {:model                 {:provider          "openai"
                                                                      :model-name        "text-embedding-3-small"
                                                                      :vector-dimensions 1536}
                                              :query-prefix          "custom: "
                                              :endpoint-identity-key (:endpoint-identity-key endpoint-identity-opts)})
            opts     (assoc opts :benchmark-provenance {:corpus-sha {}
                                                        :git-state  {:sha "abc", :dirty? false}})
            manifest (runner/manifest (:model opts) :none opts (corpus/load-corpus))]
        (is (= "custom: " (:query-prefix opts)))
        (is (some? (get-in opts [:model :embedding-space-id])))
        (is (= "https://tenant-secret.openai.example/v2/v1/embeddings"
               (get-in opts [:embedding-routing :endpoint])))
        (is (= (arms/endpoint-identity "https://tenant-secret.openai.example/v2/v1/embeddings"
                                       endpoint-identity-opts)
               (:embedding-endpoint opts)))
        (is (= (:embedding-endpoint opts) (:embedding-endpoint manifest)))
        (is (not (str/includes? (pr-str manifest) "tenant-secret")))
        (is (not (str/includes? (pr-str manifest) "secret-key")))
        (is (not (str/includes? (pr-str manifest) (:endpoint-identity-key endpoint-identity-opts)))
            "the HMAC key is operational input, never provenance output")))))

(deftest ^:synchronized run-arm-pins-the-query-prefix-test
  (testing "a standalone arm embeds its queries under the prefix its manifest reports"
    ;; Only the comparison used to install the binding, so a direct run read the site-wide setting afresh for
    ;; every query while recording nil.
    (let [model {:provider "mock" :model-name "pinned" :vector-dimensions 4}
          seen  (atom nil)]
      (mt/with-dynamic-fn-redefs
        [runner/score-arm! (fn [_corpus arm opts]
                             (reset! seen {:prefixed   (semantic.embedding/prefix-search-query model "revenue")
                                           :manifested (:query-prefix opts)})
                             {:arm arm})]
        (mt/with-temporary-setting-values [ee-embedding-query-prefix "site-wide: "]
          (runner/run-arm! (corpus/load-corpus) :none {:model model})
          (is (= {:prefixed "revenue" :manifested ""} @seen)
              "an instance-wide override describes a model this run did not pin, so it is ignored — and the
               manifest says so"))))))

(deftest ^:synchronized manifest-records-the-embedding-space-test
  (testing "two models alike in provider, name and dimensions are still told apart by embedding space"
    (let [resolved (semantic.embedding/resolve-model {:provider          "mock"
                                                      :model-name        "m"
                                                      :vector-dimensions 4})
          entry    (:embedding-model (runner/manifest resolved :none {} (corpus/load-corpus)))]
      (is (some? (:embedding-space-id entry))
          "the immutable space id is what makes two runs comparable")
      (is (= "m" (:model-name entry))))))

(deftest capture-pins-the-resolved-connection-test
  (testing "resolution happens once, so repointing the connection mid-capture cannot move the provider"
    ;; Every request would otherwise re-resolve the same key, silently changing provider or endpoint while
    ;; each row kept one generator version.
    (let [calls (atom 0)
          conn  {:connection-key "prov" :type "anthropic" :model "model-1" :credentials {:api-key "k"}
                 :ai-proxy? false}]
      (mt/with-dynamic-fn-redefs [llm.provider/resolve-model-ref (fn [_] (swap! calls inc) conn)]
        (is (= conn (#'arms/with-pinned-connection conn (fn [] (llm.provider/resolve-model-ref "prov/other"))))
            "a pinned scope answers with the one resolution")
        (is (zero? @calls)
            "nothing re-resolves inside the pin — the underlying resolver is never reached"))
      (testing "the helper remains a no-op when there is no connection to pin"
        (is (nil? (#'arms/with-pinned-connection nil (fn [] nil))))))))

(deftest ^:synchronized capture-refuses-an-unresolved-model-reference-test
  (testing "capture fails before generation or artifact creation when its selected connection does not exist"
    (let [out-dir          (str (System/getProperty "java.io.tmpdir")
                                "/osi-generation-benchmark-unresolved-" (System/nanoTime))
          resolution-calls (atom 0)
          generation-calls (atom 0)
          model-ref        "missing/model"
          error            (mt/with-dynamic-fn-redefs
                             [osi-generation.settings/llm-call-opts
                              (constantly {:model-ref model-ref, :source :metabot})
                              llm.provider/resolve-model-ref (fn [_]
                                                               (when (< 1 (swap! resolution-calls inc))
                                                                 {:connection-key "missing"
                                                                  :type           "anthropic"
                                                                  :model          "model"
                                                                  :credentials    {:api-key "appeared-later"}
                                                                  :ai-proxy?      false}))
                              generate/generate-context      (fn [_]
                                                               (swap! generation-calls inc)
                                                               (throw (ex-info "must not generate" {})))]
                             (try
                               (arms/capture-generated! (corpus/load-corpus) {} {:out-dir out-dir})
                               nil
                               (catch Exception e e)))]
      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= "Cannot capture generated contexts: model reference does not resolve" (ex-message error)))
      (is (= {:reason :unresolved-model-ref, :model-ref model-ref} (ex-data error)))
      (is (= 1 @resolution-calls))
      (is (zero? @generation-calls))
      (is (not (.exists (io/file out-dir)))))))

(deftest ^:synchronized capture-refuses-an-unkeyed-endpoint-before-generation-test
  (testing "a capture cannot create an offline verifier for secrets carried in its endpoint URL"
    (let [out-dir          (str (System/getProperty "java.io.tmpdir")
                                "/osi-generation-benchmark-unkeyed-" (System/nanoTime))
          generation-calls (atom 0)
          error            (mt/with-dynamic-fn-redefs
                             [osi-generation.settings/llm-call-opts
                              (constantly {:model-ref "vllm/model", :source :metabot})
                              llm.provider/resolve-model-ref
                              (constantly {:connection-key "vllm"
                                           :type           "vllm"
                                           :model          "model"
                                           :ai-proxy?      false
                                           :credentials    {:base-url "https://secret.internal/v1"}})
                              generate/generate-context
                              (fn [_]
                                (swap! generation-calls inc)
                                (throw (AssertionError. "must not generate")))]
                             (try
                               (arms/capture-generated! (corpus/load-corpus) {}
                                                        {:out-dir                 out-dir
                                                         :endpoint-identity-key "too-short"})
                               nil
                               (catch Exception e e)))]
      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= :missing-endpoint-identity-key (:reason (ex-data error))))
      (is (zero? @generation-calls))
      (is (not (.exists (io/file out-dir)))))))

(deftest ^:synchronized capture-refuses-an-invalid-endpoint-before-generation-test
  (testing "an unparseable routing identity cannot produce a snapshot that scoring would later reject"
    (let [out-dir          (str (System/getProperty "java.io.tmpdir")
                                "/osi-generation-benchmark-invalid-endpoint-" (System/nanoTime))
          generation-calls (atom 0)
          error            (mt/with-dynamic-fn-redefs
                             [osi-generation.settings/llm-call-opts
                              (constantly {:model-ref "vllm/model", :source :metabot})
                              llm.provider/resolve-model-ref
                              (constantly {:connection-key "vllm"
                                           :type           "vllm"
                                           :model          "model"
                                           :ai-proxy?      false
                                           :credentials    {:base-url "sk-secret://host/v1"}})
                              generate/generate-context
                              (fn [_]
                                (swap! generation-calls inc)
                                (throw (AssertionError. "must not generate")))]
                             (try
                               (arms/capture-generated! (corpus/load-corpus) {}
                                                        (assoc endpoint-identity-opts :out-dir out-dir))
                               nil
                               (catch Exception e e)))]
      (is (instance? clojure.lang.ExceptionInfo error))
      (is (= :invalid-connection-identity (:reason (ex-data error))))
      (is (not (str/includes? (pr-str (ex-data error)) "secret")))
      (is (zero? @generation-calls))
      (is (not (.exists (io/file out-dir)))))))

(deftest ^:synchronized capture-records-where-the-requests-went-test
  (testing "a connection key repointed at another endpoint yields a distinguishable artifact"
    ;; Type and model are the same on both captures, so without the routing fields the two artifacts claim
    ;; the same generator identity for contexts two different endpoints produced.
    (mt/with-premium-features #{:library :library-retrieval}
      (let [c        (update (corpus/load-corpus) :entities (comp vec (partial take 1)))
            out-dir  (str (System/getProperty "java.io.tmpdir")
                          "/osi-generation-benchmark-routing-" (System/nanoTime))
            capture! (fn [base-url]
                       (mt/with-dynamic-fn-redefs
                         [llm.provider/resolve-model-ref
                          (constantly {:connection-key "prov"
                                       :type           "google"
                                       :model          "gemini-3-pro"
                                       :ai-proxy?      false
                                       :credentials    {:api-key             "super-secret-key"
                                                        :service-account-key "super-secret-json"
                                                        :project-id          "benchmark-project"
                                                        :location            "us-central1"
                                                        :base-url            base-url}})
                          osi-generation.settings/llm-call-opts
                          (constantly {:model-ref "prov/gemini-3-pro" :source :metabot})
                          generate/generate-context
                          (constantly {:ai_context        {:synonyms ["s"]}
                                       :generator-version (generate/generator-version "prov/gemini-3-pro")
                                       :usage             {:input-tokens 0, :output-tokens 0}})]
                         (corpus/with-corpus-library [ids c]
                           (arms/capture-generated! c ids (assoc endpoint-identity-opts :out-dir out-dir)))))
            us       (capture! "https://us-central1-aiplatform.googleapis.com")
            eu       (capture! "https://europe-west4-aiplatform.googleapis.com")]
        (is (= {:connection-key "prov"
                :type           "google"
                :model          "gemini-3-pro"
                :ai-proxy?      false
                :routing        {:base-url   (arms/endpoint-identity
                                              "https://us-central1-aiplatform.googleapis.com"
                                              endpoint-identity-opts)
                                 :location   "us-central1"
                                 :project-id "benchmark-project"}}
               (get-in us [:metadata :connection])))
        (is (not= (get-in us [:metadata :connection])
                  (get-in eu [:metadata :connection]))
            "the endpoint that served the capture is part of the recorded identity")
        (testing "no credential reaches the committed artifact"
          (is (not (str/includes? (slurp (:path us)) "super-secret"))))))))

(deftest ^:parallel capture-connection-identity-holds-no-credential-test
  (testing "whichever provider type serves a capture, no field the registry calls a secret is recorded"
    (let [config   (into {}
                         (map (fn [{:keys [key]}] [key (str "value-" (name key))]))
                         (mapcat :fields (llm.provider/provider-types)))
          secrets  (into #{}
                         (mapcat #(llm.provider/secret-field-keys (:type %)))
                         (llm.provider/provider-types))
          recorded (:routing (#'arms/connection-identity {:connection-key "prov"
                                                          :type           "google"
                                                          :model          "m"
                                                          :ai-proxy?      false
                                                          :credentials    config}
                                                         nil
                                                         endpoint-identity-opts))]
      (is (seq secrets) "sanity: the provider registry does declare secret fields")
      (is (seq recorded) "sanity: routing fields are recorded at all")
      (is (empty? (set/intersection secrets (set (keys recorded))))))))

(deftest corpus-does-not-reach-the-real-search-index-test
  (testing "materializing the corpus ingests nothing into the instance's own search index"
    ;; The corpus commits real Tables, Cards, Measures and Segments; their search hooks would otherwise
    ;; index synthetic rows, calling the configured embedder, and teardown only removes the appdb rows.
    (mt/with-premium-features #{:library :library-retrieval}
      (let [ingested (atom [])]
        (mt/with-dynamic-fn-redefs [search/update! (fn [& args] (swap! ingested conj (vec args)) nil)]
          (corpus/with-corpus-library [ids (corpus/load-corpus)]
            (is (seq ids) "the corpus really did materialize entities")))
        (is (= [] @ingested))))))

(deftest capture-does-not-commit-credentials-carried-in-a-base-url
  (testing "a base URL is reduced to its endpoint, so a secret anywhere in it cannot be committed"
    ;; The routing whitelist protects field names; nothing stops an operator putting the secret in the
    ;; base URL's own value, and a snapshot is written into the repo.
    (let [identity-of #(#'arms/connection-identity
                        {:connection-key "prov" :type "vllm" :model "m" :ai-proxy? false
                         :credentials    {:base-url %}}
                        nil
                        endpoint-identity-opts)]
      (doseq [url ["https://user:sw0rdf1sh@vllm.internal:8000/v1"
                   "https://vllm.internal/v1?api-key=sw0rdf1sh"
                   "https://vllm.internal/v1#sw0rdf1sh"
                   "https://vllm.internal/sw0rdf1sh/v1"
                   "https://sw0rdf1sh.vllm.internal/v1"]]
        (testing url
          (let [recorded (get-in (identity-of url) [:routing :base-url])]
            (is (=? {:scheme "https", :host-hmac-sha256 string?} recorded)
                "the endpoint retains a deterministic, non-plaintext identity")
            (is (not (str/includes? (pr-str recorded) "sw0rdf1sh"))
                "no part of the secret survives into the artifact"))))
      (testing "an unparseable URL is reported, not passed through"
        (is (= "<unparseable>" (get-in (identity-of "not a url at all") [:routing :base-url]))))
      (testing "an arbitrary scheme cannot carry a secret into the artifact"
        (let [recorded (get-in (identity-of "sk-sw0rdf1sh://vllm.internal/v1") [:routing :base-url])]
          (is (= "<unparseable>" recorded))
          (is (not (str/includes? (pr-str recorded) "sw0rdf1sh")))))
      (testing "two paths on one host stay distinguishable"
        (is (not= (get-in (identity-of "https://h/a") [:routing :base-url])
                  (get-in (identity-of "https://h/b") [:routing :base-url]))))
      (testing "raw user-info is secret-safe, distinguishable, and validated"
        (let [tenant-a (get-in (identity-of "https://tenant-a:secret@h/v1") [:routing :base-url])
              tenant-b (get-in (identity-of "https://tenant-b:secret@h/v1") [:routing :base-url])]
          (is (not= tenant-a tenant-b))
          (is (re-matches #"[0-9a-f]{64}" (:user-info-hmac-sha256 tenant-a)))
          (is (not (str/includes? (pr-str tenant-a) "tenant-a")))
          (is (not (str/includes? (pr-str tenant-a) "secret")))
          (is (arms/valid-endpoint-identity? tenant-a))
          (is (not (arms/valid-endpoint-identity?
                    (assoc tenant-a :user-info-hmac-sha256 "not-a-full-hmac"))))
          (is (not (arms/valid-endpoint-identity? (assoc tenant-a :credentials "plaintext"))))))
      (testing "the raw request path is identified, without decoding percent escapes"
        (is (not= (get-in (identity-of "https://h/a%2Fb") [:routing :base-url])
                  (get-in (identity-of "https://h/a/b") [:routing :base-url]))))
      (testing "the HMAC is stable only for callers retaining the same non-persisted key"
        (let [url       "https://h/low-entropy-secret"
              same-key  (arms/endpoint-identity url endpoint-identity-opts)
              other-key (arms/endpoint-identity
                         url {:endpoint-identity-key "benchmark-test-endpoint-identity-key-0002"})]
          (is (= same-key (arms/endpoint-identity url endpoint-identity-opts)))
          (is (not= same-key other-key))
          (is (re-matches #"[0-9a-f]{64}" (:path-hmac-sha256 same-key)))))
      (testing "a weak or missing key is refused instead of falling back to an offline-verifiable digest"
        (let [e (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                      #"must be a secret of at least 32 characters"
                                      (arms/endpoint-identity
                                       "https://h/secret" {:endpoint-identity-key "too-short"})))]
          (is (= :missing-endpoint-identity-key (:reason (ex-data e)))))))))

(deftest ^:parallel capture-records-service-account-project-test
  (testing "Google routing records the project derived from service-account credentials"
    (let [service-account-key "{\"type\":\"service_account\",\"project_id\":\"derived-project\",\"private_key\":\"secret\"}"
          identity            (#'arms/connection-identity
                               {:connection-key "google"
                                :type           "google"
                                :model          "google/gemini-3.5-flash"
                                :ai-proxy?      false
                                :credentials    {:service-account-key service-account-key}}
                               nil
                               endpoint-identity-opts)]
      (is (= "derived-project" (get-in identity [:routing :project-id])))
      (is (not (str/includes? (pr-str identity) "private_key")))
      (is (not (str/includes? (pr-str identity) "secret"))))))

(deftest ^:parallel provider-routing-identities-include-effective-defaults-test
  (testing "the routing validator accepts the effective defaults supplied by normal model resolution"
    (let [identity (fn [type model config]
                     (#'arms/connection-identity
                      {:connection-key type
                       :type           type
                       :model          model
                       :ai-proxy?      false
                       :credentials    (llm.provider/with-field-defaults type config)}
                      nil
                      endpoint-identity-opts))
          anthropic (identity "anthropic" "model" {:api-key "key"})
          azure     (identity "azure" "anthropic/legacy-deployment"
                              {:api-key "key", :base-url "https://azure.example/openai"})
          bedrock   (identity "bedrock" "model" {:access-key-id "id", :secret-access-key "key"})
          google    (identity "google" "google/gemini"
                              {:service-account-key
                               "{\"project_id\":\"derived-project\",\"private_key\":\"secret\"}"})]
      (is (arms/valid-connection-identity? "anthropic/model" anthropic))
      (is (= {:deployment-name "legacy-deployment", :model-family "anthropic"}
             (select-keys (:routing azure) [:deployment-name :model-family])))
      (is (arms/valid-connection-identity? "azure/anthropic/legacy-deployment" azure))
      (is (= "us-east-1" (get-in bedrock [:routing :region])))
      (is (arms/valid-connection-identity? "bedrock/model" bedrock))
      (is (= {:location "global", :project-id "derived-project"}
             (select-keys (:routing google) [:location :project-id])))
      (is (arms/valid-connection-identity? "google/google/gemini" google)))))

(deftest ^:parallel google-connection-identity-uses-effective-endpoint-test
  (testing "provenance hashes the same derived or explicit endpoint that the Google adapter requests"
    (let [identity    (fn [location base-url]
                        (#'arms/connection-identity
                         {:connection-key "google"
                          :type           "google"
                          :model          "google/gemini"
                          :ai-proxy?      false
                          :credentials    {:project-id "benchmark-project"
                                           :location   location
                                           :base-url   base-url}}
                         nil
                         endpoint-identity-opts))
          regional   "https://us-central1-aiplatform.googleapis.com"
          rep-host   "https://aiplatform.eu.rep.googleapis.com"
          derived    (identity "us-central1" llm.settings/google-global-api-base-url)
          explicit   (identity "us-central1" regional)
          multi      (identity "eu" llm.settings/google-global-api-base-url)]
      (is (= (arms/endpoint-identity regional endpoint-identity-opts)
             (get-in derived [:routing :base-url])))
      (is (= (:routing derived) (:routing explicit))
          "default-derived and explicitly configured forms identify the same request endpoint")
      (is (= (arms/endpoint-identity rep-host endpoint-identity-opts)
             (get-in multi [:routing :base-url])))
      (is (every? #(arms/valid-connection-identity? "google/google/gemini" %)
                  [derived explicit multi])))))

(deftest ^:synchronized capture-pins-and-records-managed-proxy-test
  (testing "every managed generation call uses the proxy endpoint captured before the first call"
    (mt/with-premium-features #{:library :library-retrieval :metabase-ai-managed}
      (let [c          (update (corpus/load-corpus) :entities (comp vec (partial take 2)))
            out-dir    (str (System/getProperty "java.io.tmpdir")
                            "/osi-generation-benchmark-managed-" (System/nanoTime))
            proxy-reads (atom 0)
            seen       (atom [])
            first-url    "  https://tenant-secret.proxy.example/first///  "
            normalized   "https://tenant-secret.proxy.example/first"
            provider-url (str normalized "/anthropic")]
        (mt/with-dynamic-fn-redefs
          [llm.provider/resolve-model-ref
           (constantly {:connection-key "metabase"
                        :type           "anthropic"
                        :model          "claude-sonnet"
                        :credentials    {:base-url   "https://ignored-secret.provider.example"
                                         :project-id "ignored-project-secret"}
                        :ai-proxy?      true})
           llm.settings/llm-proxy-base-url
           (fn []
             (if (= 1 (swap! proxy-reads inc))
               first-url
               "https://different.proxy.example/second"))
           osi-generation.settings/llm-call-opts
           (constantly {:model-ref "metabase/anthropic/claude-sonnet", :source :metabot})
           generate/generate-context
           (fn [_]
             (swap! seen conj (llm.settings/llm-proxy-base-url))
             {:ai_context        {:synonyms ["s"]}
              :generator-version (generate/generator-version "metabase/anthropic/claude-sonnet")
              :usage             {:input-tokens 0, :output-tokens 0}})]
          (corpus/with-corpus-library [ids c]
            (let [{:keys [metadata]} (arms/capture-generated!
                                      c ids (assoc endpoint-identity-opts :out-dir out-dir))]
              (is (= [normalized normalized] @seen)
                  "capture binds the same normalized proxy base that request routing consumes")
              (is (= 1 @proxy-reads) "the mutable setting is read only before capture")
              (is (= (arms/endpoint-identity provider-url endpoint-identity-opts)
                     (get-in metadata [:connection :routing :llm-proxy-provider-url])))
              (is (= #{:llm-proxy-provider-url}
                     (set (keys (get-in metadata [:connection :routing]))))
                  "managed provenance excludes ignored provider credential routing")
              (is (not (str/includes? (pr-str metadata) "tenant-secret")))
              (is (not (str/includes? (pr-str metadata) "ignored-secret"))))))))))
