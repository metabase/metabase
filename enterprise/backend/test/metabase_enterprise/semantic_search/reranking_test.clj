(ns metabase-enterprise.semantic-search.reranking-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.reranking :as reranking]
   [metabase.search.api :as search.api]
   [metabase.search.config :as search.config]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.retry :as retry]))

(set! *warn-on-reflection* true)

(deftest rerank-parses-data-and-usage-test
  (testing "rerank maps the Voyage response into {:order :scores :tokens}, best-first"
    (mt/with-temporary-setting-values [ee-reranking-api-key "voyage-mock-key"]
      (let [;; Voyage returns data ordered best-first; index is the position in the input `documents`.
            response {:data  [{:index 2 :relevance_score 0.9}
                              {:index 0 :relevance_score 0.4}
                              {:index 1 :relevance_score 0.1}]
                      :usage {:total_tokens 123}}
            captured (atom nil)]
        (with-redefs [http/post (fn [url opts]
                                  (reset! captured {:url url :body (json/decode+kw (:body opts))})
                                  {:body (json/encode response)})]
          (let [result (reranking/rerank "revenue dashboard" ["doc-a" "doc-b" "doc-c"] {:model "rerank-2.5"})]
            (is (= [2 0 1] (:order result)) "order is the document indices best-first")
            (is (= {2 0.9 0 0.4 1 0.1} (:scores result)) "scores map each index to its relevance score")
            (is (= 123 (:tokens result)) "tokens is the reported usage.total_tokens")
            (testing "request body carries query/documents/model and truncation"
              (is (= "revenue dashboard" (get-in @captured [:body :query])))
              (is (= ["doc-a" "doc-b" "doc-c"] (get-in @captured [:body :documents])))
              (is (= "rerank-2.5" (get-in @captured [:body :model])))
              (is (true? (get-in @captured [:body :truncation]))))))))))

(deftest rerank-requires-api-key-test
  (testing "rerank throws when the Voyage key is unset"
    (mt/with-temporary-setting-values [ee-reranking-api-key nil]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"ee-reranking-api-key not set"
                            (reranking/rerank "q" ["d"] {}))))))

(def ^:private fast-backoff-hook
  "Collapses the retry backoff to ~1ms so retry tests don't sleep the real exponential schedule.
  (Diehard requires the initial delay be strictly < the max delay.)"
  #(assoc % :initial-interval-millis 1 :max-interval-millis 2 :jitter-factor 0.0))

(deftest rerank-retries-transient-error-test
  (testing "rerank retries a 429 / 5xx and succeeds once the provider recovers"
    (mt/with-temporary-setting-values [ee-reranking-api-key "voyage-mock-key"]
      (binding [retry/*test-time-config-hook* fast-backoff-hook]
        (let [response {:data [{:index 0 :relevance_score 0.5}] :usage {:total_tokens 7}}
              calls    (atom 0)]
          ;; First attempt 429 (rate limit), second 503 (provider 5xx), third succeeds.
          (with-redefs [http/post (fn [_url _opts]
                                    (let [n (swap! calls inc)]
                                      (case n
                                        1 (throw (ex-info "clj-http: status 429" {:status 429}))
                                        2 (throw (ex-info "clj-http: status 503" {:status 503}))
                                        {:body (json/encode response)})))]
            (let [result (reranking/rerank "q" ["doc-a"] {:model "rerank-2.5"})]
              (is (= 3 @calls) "retried the 429 then the 503 before the third attempt succeeded")
              (is (= [0] (:order result)))
              (is (= 7 (:tokens result))))))))))

(deftest rerank-does-not-retry-client-error-test
  (testing "rerank surfaces a non-transient 4xx immediately without retrying"
    (mt/with-temporary-setting-values [ee-reranking-api-key "voyage-mock-key"]
      (binding [retry/*test-time-config-hook* fast-backoff-hook]
        (let [calls (atom 0)]
          (with-redefs [http/post (fn [_url _opts]
                                    (swap! calls inc)
                                    (throw (ex-info "clj-http: status 400" {:status 400})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"status 400"
                                  (reranking/rerank "q" ["doc-a"] {})))
            (is (= 1 @calls) "a 400 is not retried")))))))

(def ^:private sample-row
  "A boost-scored result row as it reaches the rerank step: `:score` is the SQL `total_score` (RRF-dominated),
  `:all-scores` carries each scorer's `:contribution` (= weight*score)."
  {:score      999.0
   :all-scores [{:name :rrf               :contribution 500.0}
                {:name :semantic-distance :contribution 5.0}
                {:name :pinned            :contribution 2.0}
                {:name :verified          :contribution 3.0}]})

(deftest reblend-per-mode-test
  (let [reblend #'semantic.index/reblend
        w       500.0
        rr      0.8]
    (testing ":rerank_only ignores the boosts entirely"
      (is (= rr (:score (reblend :rerank_only w sample-row rr)))))
    (testing ":rerank_then_boost = weight*rerank + Σ boosts, dropping :rrf and :semantic-distance"
      ;; 500*0.8 + (2.0 + 3.0) = 405.0
      (is (= 405.0 (:score (reblend :rerank_then_boost w sample-row rr)))))
    (testing ":rerank_fusion blends the same as :rerank_then_boost (differs only in pool selection)"
      (is (= 405.0 (:score (reblend :rerank_fusion w sample-row rr)))))
    (testing ":rerank_as_scorer keeps the full weighted sum (incl. :rrf) and adds the rerank term"
      ;; 999.0 + 500*0.8 = 1399.0
      (is (= 1399.0 (:score (reblend :rerank_as_scorer w sample-row rr)))))
    (testing "every mode attaches :rerank_score for attribution"
      (doseq [mode [:rerank_only :rerank_then_boost :rerank_as_scorer :rerank_fusion]]
        (is (= rr (:rerank_score (reblend mode w sample-row rr))))))))

(deftest reblend-rrf-test
  (testing ":rerank_rrf fuses the weighted rank and the cross-encoder rank in rank space"
    (let [reblend-rrf #'semantic.index/reblend-rrf
          ;; pool-rows in weighted (:total_score) order -> position i = weighted rank i+1.
          pool-rows   [{:id "a"} {:id "b"} {:id "c"}]
          ;; cross-encoder best-first: pool-idx 2 is rerank rank 1, pool-idx 0 rank 2, pool-idx 1 rank 3.
          order       [2 0 1]
          scores      {0 0.4 1 0.1 2 0.9}
          fused       (reblend-rrf 1.0 2.0 60 pool-rows order scores)
          by-id       (into {} (map (juxt :id identity)) fused)]
      (testing ":score = wa/(k+weighted_rank) + wb/(k+rerank_rank)"
        (is (= (+ (/ 1.0 61) (/ 2.0 62)) (:score (by-id "a")))) ; wrank 1, rrank 2
        (is (= (+ (/ 1.0 62) (/ 2.0 63)) (:score (by-id "b")))) ; wrank 2, rrank 3
        (is (= (+ (/ 1.0 63) (/ 2.0 61)) (:score (by-id "c"))))) ; wrank 3, rrank 1
      (testing "the raw cross-encoder score is kept on :rerank_score for attribution"
        (is (= 0.4 (:rerank_score (by-id "a"))))
        (is (= 0.1 (:rerank_score (by-id "b"))))
        (is (= 0.9 (:rerank_score (by-id "c"))))))))

(deftest rerank-results-rrf-order-test
  (testing ":rerank_rrf re-sorts the pool by the fused score and keeps the un-reranked tail below"
    (mt/with-temporary-setting-values [ee-reranking-api-key "voyage-mock-key"]
      (let [rerank-results #'semantic.index/rerank-results
            search-context {:search-string "q"
                            :reranker-config {:blend :rerank_rrf :pool 3
                                              :rrf-weighted 1.0 :rrf-rerank 2.0 :rrf-k 60}}
            ;; 4 rows; pool = 3 so "d" is the untouched tail (kept below regardless of its high :score).
            results        [{:id "a" :model "card" :content "doc-a" :score 100.0}
                            {:id "b" :model "card" :content "doc-b" :score 99.0}
                            {:id "c" :model "card" :content "doc-c" :score 98.0}
                            {:id "d" :model "card" :content "doc-d" :score 97.0}]]
        (mt/with-dynamic-fn-redefs [reranking/rerank (fn [_q _docs _opts]
                                                       {:order [2 0 1] :scores {0 0.4 1 0.1 2 0.9} :tokens 5})]
          (let [{:keys [results pool]} (rerank-results search-context false results)]
            ;; fused: c (~0.04866) > a (~0.04865) > b (~0.04788); tail d stays last.
            (is (= ["c" "a" "b" "d"] (mapv :id results)))
            (is (= 3 pool) "only the top-`pool` rows were reranked")
            (is (every? #(not (contains? % :content)) results) "carried :content is stripped before return")))))))

(deftest reranker-gate-fires-test
  (let [gate-fires? #'semantic.index/reranker-gate-fires?
        exact-head  {:all-scores [{:name :exact :score 1.0} {:name :rrf :score 0.5}]
                     :semantic_distance 0.30}
        plain-head  {:all-scores [{:name :exact :score 0.0} {:name :rrf :score 0.5}]
                     :semantic_distance 0.30}]
    (testing "no :gate configured => never fires"
      (is (false? (gate-fires? {:reranker-config {}} [exact-head]))))
    (testing "empty results => never fires"
      (is (false? (gate-fires? {:reranker-config {:gate {:exact true}}} []))))
    (testing ":exact fires only when the weighted head is an exact name match"
      (is (true?  (gate-fires? {:reranker-config {:gate {:exact true}}} [exact-head])))
      (is (false? (gate-fires? {:reranker-config {:gate {:exact true}}} [plain-head]))))
    (testing ":semantic-margin fires only when the rank-1 cosine distance is within the threshold"
      (is (true?  (gate-fires? {:reranker-config {:gate {:semantic-margin 0.35}}} [plain-head])))
      (is (false? (gate-fires? {:reranker-config {:gate {:semantic-margin 0.25}}} [plain-head]))))))

(deftest reranker-config-schema-test
  (testing "RerankerConfig accepts the rerank_rrf fusion knobs and the gate sub-map"
    (is (mr/validate search.config/RerankerConfig
                     {:blend :rerank_rrf :pool 100 :rrf-weighted 1.0 :rrf-rerank 2.0 :rrf-k 60
                      :gate {:exact true :semantic-margin 0.2}}))
    (is (contains? (set search.config/rerank-blend-modes) :rerank_rrf))
    (testing "the gate map is closed -- unknown keys are rejected"
      (is (not (mr/validate search.config/RerankerConfig {:gate {:bogus true}}))))))

(deftest process-reranker-config-test
  (let [process #'search.api/process-reranker-config]
    (testing "rrf_* and gate keys are parsed and underscore-normalized to kebab"
      (is (= {:blend :rerank_rrf :pool 100 :rrf-weighted 1.0 :rrf-rerank 2.0 :rrf-k 60
              :gate {:exact true :semantic-margin 0.2}}
             (process (json/encode {:blend "rerank_rrf" :pool 100
                                    :rrf_weighted 1.0 :rrf_rerank 2.0 :rrf_k 60
                                    :gate {:exact true :semantic_margin 0.2}})))))
    (testing "a config without the new keys is unchanged (backward compatible)"
      (is (= {:blend :rerank_then_boost :pool 50}
             (process (json/encode {:blend "rerank_then_boost" :pool 50})))))))
