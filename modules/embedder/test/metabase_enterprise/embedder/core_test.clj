(ns metabase-enterprise.embedder.core-test
  "These tests are only on the classpath under the `:embedder` alias, and the ones that need real
  inference additionally self-skip unless a model source is available (an `MB_EMBEDDER_MODEL_SOURCES`
  entry, a bundled resource, or `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true`)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.cli :as dcs.cli]
   [metabase-enterprise.embedder.core :as embedder]
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private default-model-name
  (:model-name embedder/default-model-descriptor))

(defn- model-available? []
  (try
    (#'embedder.model/model-source default-model-name)
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
          embeddings (embedder/embed-texts default-model-name texts)]
      (testing "one embedding per input text, at the descriptor's dimensionality"
        (is (= (count texts) (count embeddings)))
        (is (every? #(= (:model-dimensions embedder/default-model-descriptor) (alength ^floats %)) embeddings)))
      (testing "outputs are L2-normalized"
        (doseq [^floats embedding embeddings]
          (is (< (abs (- 1.0 (cosine embedding embedding))) 1e-3))))
      (testing "identical calls are deterministic"
        (is (= (mapv vec embeddings) (mapv vec (embedder/embed-texts default-model-name texts)))))
      (testing "output order matches input order"
        ;; Compared by cosine, not equality: the INT8 model's activation quantization is sensitive to
        ;; batch padding, so the same text embedded solo vs. in a batch drifts by ~0.015 cosine. Harmless
        ;; for retrieval (MiniLM's related/unrelated gaps are >0.5) but exact-match assertions would flake.
        (doseq [[batch-embedding text] (map vector embeddings texts)
                :let [[solo] (embedder/embed-texts default-model-name [text])]]
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
                        (#'embedder.model/model-source "my-model")))]
    (testing "an MB_EMBEDDER_MODEL_SOURCES entry wins over the bundled resource"
      (let [sources "{\"my-model\" {:path \"/models/custom\"}}"]
        (is (= {:type :path :path "/models/custom" :include-token-types? true}
               (source-with {"MB_EMBEDDER_MODEL_SOURCES" sources} true))))
      (let [sources "{\"my-model\" {:url \"s3://models/custom.zip\" :include-token-types? false :model-file-name \"weights\"}}"]
        (is (= {:type :url :url "s3://models/custom.zip" :include-token-types? false :model-file-name "weights"}
               (source-with {"MB_EMBEDDER_MODEL_SOURCES" sources} true)))))
    (testing "entries for other models don't apply"
      (is (=? {:type :url :url #"jar:///metabase-embedder/my-model-.*\.zip"}
              (source-with {"MB_EMBEDDER_MODEL_SOURCES" "{\"other-model\" {:path \"/x\"}}"} true))))
    (testing "invalid EDN in the sources env produces a clear error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"MB_EMBEDDER_MODEL_SOURCES is not valid EDN"
                            (source-with {"MB_EMBEDDER_MODEL_SOURCES" "{oops"} true))))
    (testing "a non-map sources env produces a clear error"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"must be an EDN map"
                            (source-with {"MB_EMBEDDER_MODEL_SOURCES" "[\"my-model\"]"} true))))
    (testing "an entry without :path or :url fails loudly instead of being silently ignored"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"must have a :path or :url key"
                            (source-with {"MB_EMBEDDER_MODEL_SOURCES" "{\"my-model\" {:paht \"/models/x\"}}"} true)))
      (testing "including a present-but-nil entry"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"must have a :path or :url key"
                              (source-with {"MB_EMBEDDER_MODEL_SOURCES" "{\"my-model\" nil}"} true)))))
    (testing "the bundled resource is the default, always with token types"
      (is (=? {:type :url :url #"jar:///metabase-embedder/my-model-.*\.zip" :include-token-types? true}
              (source-with {} true))))
    (testing "the zoo download gates on opt-in and applies to the default model only"
      (mt/with-dynamic-fn-redefs [embedder.model/getenv                 {"MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD" "true"}
                                  embedder.model/bundled-model-resource (constantly nil)]
        (is (=? {:type :url :url #"djl://.*all-MiniLM-L6-v2" :include-token-types? false}
                (#'embedder.model/model-source default-model-name)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"No source for embedder model"
                              (#'embedder.model/model-source "my-model")))))
    (testing "no source at all throws setup guidance naming the model"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No source for embedder model \"my-model\""
                            (source-with {} false))))))

(deftest model-registry-test
  (testing "models are cached per name and only built once each"
    (let [builds (atom [])]
      (mt/with-dynamic-fn-redefs [embedder.model/build-model (fn [model-name]
                                                               (swap! builds conj model-name)
                                                               {:stub model-name})]
        ;; sentinel maps stand in for ZooModels; reset-models! only closes real ZooModel instances.
        (embedder.model/reset-models!)
        (try
          (let [a  (#'embedder.model/model "model-a")
                a' (#'embedder.model/model "model-a")
                b  (#'embedder.model/model "model-b")]
            (is (identical? a a'))
            (is (not= a b))
            (is (= ["model-a" "model-b"] @builds)))
          (finally
            (embedder.model/reset-models!)))))))

(deftest descriptor-stays-in-sync-test
  (testing "the CLI's literal copy of the descriptor matches this module's source of truth"
    (is (= embedder/default-model-descriptor @#'dcs.cli/in-process-descriptor))))

(deftest failed-load-is-not-cached-test
  (testing "a failed model load is retried on the next call rather than cached forever"
    (embedder.model/reset-models!)
    (try
      (mt/with-dynamic-fn-redefs [embedder.model/build-model (fn [_] (throw (ex-info "transient boom" {})))]
        (is (thrown-with-msg? Exception #"transient boom" (embedder/embed-texts default-model-name ["x"])))
        (testing "the failure was not cached"
          (is (= {} @(var-get #'embedder.model/models*)))))
      (finally
        (embedder.model/reset-models!)))))
