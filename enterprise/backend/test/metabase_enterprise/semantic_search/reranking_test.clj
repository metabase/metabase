(ns metabase-enterprise.semantic-search.reranking-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.reranking :as reranking]
   [metabase.test :as mt]
   [metabase.util.json :as json]
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
