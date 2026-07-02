(ns metabase-enterprise.embedder.core-test
  "These tests are only on the classpath under the `:embedder` alias, and the ones that need real
  inference additionally self-skip unless a model source is available (`MB_EMBEDDER_MODEL_PATH`, a
  bundled resource, or `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true`)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.cli :as dcs.cli]
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
      (testing "identical calls are deterministic"
        (is (= (mapv vec embeddings) (mapv vec (embedder/embed-texts texts)))))
      (testing "output order matches input order"
        ;; Compared by cosine, not equality: the INT8 model's activation quantization is sensitive to
        ;; batch padding, so the same text embedded solo vs. in a batch drifts by ~0.015 cosine. Harmless
        ;; for retrieval (MiniLM's related/unrelated gaps are >0.5) but exact-match assertions would flake.
        (doseq [[batch-embedding text] (map vector embeddings texts)
                :let [[solo] (embedder/embed-texts [text])]]
          (testing text
            (is (> (cosine batch-embedding solo) 0.95)))))
      (testing "related terms are closer than unrelated ones"
        (let [[dog puppy invoice] embeddings]
          (is (> (cosine dog puppy) (cosine dog invoice)))))
      (testing "warm-up! runs and reports a duration"
        (is (nat-int? (embedder/warm-up!)))))))

(deftest model-source-test
  (let [source-with (fn [env resource?]
                      (mt/with-dynamic-fn-redefs [embedder.model/getenv                 #(get env %)
                                                  embedder.model/bundled-model-resource (constantly (when resource?
                                                                                                      (java.net.URL. "file:///stub")))]
                        (#'embedder.model/model-source)))]
    (testing "MB_EMBEDDER_MODEL_PATH wins over everything"
      (is (= {:type :path :path "/models/custom" :include-token-types? true}
             (source-with {"MB_EMBEDDER_MODEL_PATH" "/models/custom"} true))))
    (testing "MB_EMBEDDER_MODEL_URL beats the bundled resource"
      (is (= {:type :url :url "s3://models/custom.zip" :include-token-types? true}
             (source-with {"MB_EMBEDDER_MODEL_URL" "s3://models/custom.zip"} true))))
    (testing "MB_EMBEDDER_INCLUDE_TOKEN_TYPES=false flips the flag for overrides"
      (is (false? (:include-token-types? (source-with {"MB_EMBEDDER_MODEL_URL"           "s3://m.zip"
                                                       "MB_EMBEDDER_INCLUDE_TOKEN_TYPES" "false"}
                                                      true)))))
    (testing "the bundled resource is the default, always with token types"
      (is (=? {:type :url :url #"jar:///metabase-embedder/.*\.zip" :include-token-types? true}
              (source-with {} true))))
    (testing "the zoo download needs explicit opt-in and never sends token types"
      (is (=? {:type :url :url #"djl://.*all-MiniLM-L6-v2" :include-token-types? false}
              (source-with {"MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD" "true"} false))))
    (testing "no source at all throws setup guidance"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No embedder model available"
                            (source-with {} false))))))

(deftest model-file-name-test
  (mt/with-dynamic-fn-redefs [embedder.model/getenv (constantly nil)]
    (is (= "model" (#'embedder.model/model-file-name))))
  (mt/with-dynamic-fn-redefs [embedder.model/getenv {"MB_EMBEDDER_MODEL_NAME" "distilbert"}]
    (is (= "distilbert" (#'embedder.model/model-file-name)))))

(deftest descriptor-stays-in-sync-test
  (testing "the CLI's literal copy of the descriptor matches this module's source of truth"
    (is (= embedder/model-descriptor @#'dcs.cli/in-process-descriptor))))

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
