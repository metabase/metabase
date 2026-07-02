(ns metabase-enterprise.embedder.core-test
  "These tests are only on the classpath under the `:embedder` alias, and the ones that need real
  inference additionally self-skip unless a model source is available (`MB_EMBEDDER_MODEL_PATH`, a
  bundled resource, or `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true`)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.embedder.core :as embedder]
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- model-available? []
  (try
    (#'embedder.model/model-source)
    true
    (catch Exception _ false)))

(defn- cosine
  ;; Outputs are L2-normalized, so the dot product is the cosine similarity.
  [^floats a ^floats b]
  (let [n (alength a)]
    (loop [i 0, dot 0.0]
      (if (< i n)
        (recur (inc i) (+ dot (* (aget a i) (aget b i))))
        dot))))

(deftest embed-texts-test
  (if-not (model-available?)
    (testing "no model source available; skipping inference tests"
      (is true))
    (let [texts      ["dog" "puppy" "invoice"]
          embeddings (embedder/embed-texts texts)]
      (testing "one embedding per input text, at the descriptor's dimensionality"
        (is (= (count texts) (count embeddings)))
        (is (every? #(= (:model-dimensions embedder/model-descriptor) (alength ^floats %)) embeddings)))
      (testing "outputs are L2-normalized"
        (doseq [^floats embedding embeddings]
          (is (< (abs (- 1.0 (cosine embedding embedding))) 1e-3))))
      (testing "output order matches input order and is deterministic"
        (let [[dog'] (embedder/embed-texts ["dog"])]
          (is (< (abs (- 1.0 (cosine (first embeddings) dog'))) 1e-3))))
      (testing "related terms are closer than unrelated ones"
        (let [[dog puppy invoice] embeddings]
          (is (> (cosine dog puppy) (cosine dog invoice)))))
      (testing "warm-up! runs and reports a duration"
        (is (nat-int? (embedder/warm-up!)))))))

(deftest failed-load-is-not-cached-test
  (testing "a failed model load is retried on the next call rather than cached forever"
    (embedder.model/reset-model!)
    (try
      (mt/with-dynamic-fn-redefs [embedder.model/build-model (fn [] (throw (ex-info "transient boom" {})))]
        (is (thrown-with-msg? Exception #"transient boom" (embedder/embed-texts ["x"])))
        (testing "the failure was not cached"
          (is (nil? @(var-get #'embedder.model/model*)))))
      (finally
        (embedder.model/reset-model!)))))
