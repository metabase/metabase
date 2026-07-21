(ns metabase-enterprise.embedder.core-test
  "These tests are only on the classpath under the `:embedder` alias, and the ones that need real
  inference additionally self-skip unless a model source is available (an `MB_EMBEDDER_MODEL_SOURCES`
  entry, a bundled resource, or `MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD=true`)."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.embedder.core :as embedder]
   [metabase-enterprise.embedder.model :as embedder.model]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private default-model-name
  (:model-name embedder/default-model-descriptor))

(deftest default-model-descriptor-test
  (is (= {:provider         "in-process"
          :model-name       "Snowflake/snowflake-arctic-embed-l-v2.0"
          :model-dimensions 1024}
         embedder/default-model-descriptor)))

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
        ;; Compared by cosine, not equality: INT8 activation quantization is sensitive to batch padding,
        ;; so an exact-match assertion would be unnecessarily brittle.
        (doseq [[batch-embedding text] (map vector embeddings texts)
                :let [[solo] (embedder/embed-texts default-model-name [text])]]
          (testing text
            (is (> (cosine batch-embedding solo) 0.9)))))
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
        (is (= {:type                 :path
                :path                 "/models/custom"
                :include-token-types? true
                :origin               :override}
               (source-with {"MB_EMBEDDER_MODEL_SOURCES" sources} true))))
      (let [sources "{\"my-model\" {:url \"s3://models/custom.zip\" :include-token-types? false :model-file-name \"weights\"}}"]
        (is (= {:type                 :url
                :url                  "s3://models/custom.zip"
                :include-token-types? false
                :model-file-name      "weights"
                :origin               :override}
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
    (testing "a stray key in an entry can't clobber the internal source-map discriminator"
      (let [sources "{\"my-model\" {:path \"/models/custom\" :type :dir}}"]
        (is (= {:type                 :path
                :path                 "/models/custom"
                :include-token-types? true
                :origin               :override}
               (source-with {"MB_EMBEDDER_MODEL_SOURCES" sources} true)))))
    (testing "the bundled resource is the default, always with token types"
      (is (=? {:type :url :url #"jar:///metabase-embedder/my-model-.*\.zip" :include-token-types? true}
              (source-with {} true))))
    (testing "the pinned HF repo alias resolves to the bare bundle name"
      ;; `bundle-only` answers only for the bare bundle's resource path, so these assertions also prove
      ;; which path the qualified name was normalized to.
      (let [bare-bundle-path (str "metabase-embedder/all-MiniLM-L6-v2-" (#'embedder.model/bundled-model-arch) ".zip")
            bundle-only      (fn [path] (when (= path bare-bundle-path) (java.net.URL. "file:///stub")))]
        (mt/with-dynamic-fn-redefs [embedder.model/getenv                 (constantly nil)
                                    embedder.model/bundled-model-resource bundle-only]
          (is (=? {:type :url :url #"jar:///metabase-embedder/all-MiniLM-L6-v2-.*\.zip"}
                  (#'embedder.model/model-source "sentence-transformers/all-MiniLM-L6-v2"))))
        (testing "including for the zoo-download default-model gate"
          (mt/with-dynamic-fn-redefs [embedder.model/getenv                 {"MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD" "true"}
                                      embedder.model/bundled-model-resource (constantly nil)]
            (is (=? {:type :url :url #"djl://.*all-MiniLM-L6-v2"}
                    (#'embedder.model/model-source "sentence-transformers/all-MiniLM-L6-v2")))))
        (testing "and an override entry keyed with either spelling covers both"
          (doseq [key-spelling ["all-MiniLM-L6-v2" "sentence-transformers/all-MiniLM-L6-v2"]
                  lookup-name  ["all-MiniLM-L6-v2" "sentence-transformers/all-MiniLM-L6-v2"]]
            (testing (str key-spelling " -> " lookup-name)
              (mt/with-dynamic-fn-redefs [embedder.model/getenv                 {"MB_EMBEDDER_MODEL_SOURCES"
                                                                                 (format "{%s {:path \"/models/tuned\"}}"
                                                                                         (pr-str key-spelling))}
                                          embedder.model/bundled-model-resource bundle-only]
                (is (= {:type                 :path
                        :path                 "/models/tuned"
                        :include-token-types? true
                        :origin               :override}
                       (#'embedder.model/model-source lookup-name)))))))
        (testing "but entries for both spellings are a config error, not a silent last-one-wins"
          (mt/with-dynamic-fn-redefs [embedder.model/getenv {"MB_EMBEDDER_MODEL_SOURCES"
                                                             (str "{\"all-MiniLM-L6-v2\" {:path \"/a\"} "
                                                                  "\"sentence-transformers/all-MiniLM-L6-v2\" {:path \"/b\"}}")}]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"entries for two names of the same model"
                                  (#'embedder.model/model-source "all-MiniLM-L6-v2")))))
        (testing "but another org's same-named model doesn't collapse to our bundle (or the zoo download)"
          (mt/with-dynamic-fn-redefs [embedder.model/getenv                 {"MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD" "true"}
                                      embedder.model/bundled-model-resource bundle-only]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"No source for embedder model"
                                  (#'embedder.model/model-source "other-org/all-MiniLM-L6-v2")))))))
    (testing "the Arctic settings name resolves to its bare bundle with its inference contract"
      (let [bare-bundle-path (str "metabase-embedder/snowflake-arctic-embed-l-v2.0-"
                                  (#'embedder.model/bundled-model-arch)
                                  ".zip")
            bundle-only      (fn [path] (when (= path bare-bundle-path) (java.net.URL. "file:///stub")))]
        (mt/with-dynamic-fn-redefs [embedder.model/getenv                 (constantly nil)
                                    embedder.model/bundled-model-resource bundle-only]
          (is (=? {:type                 :url
                   :url                  #"jar:///metabase-embedder/snowflake-arctic-embed-l-v2.0-.*\.zip"
                   :pooling              "cls"
                   :include-token-types? false}
                  (#'embedder.model/model-source "Snowflake/snowflake-arctic-embed-l-v2.0"))))))
    (testing "the dev-only zoo download gates on opt-in and applies only to MiniLM"
      (mt/with-dynamic-fn-redefs [embedder.model/getenv                 {"MB_EMBEDDER_ALLOW_MODEL_DOWNLOAD" "true"}
                                  embedder.model/bundled-model-resource (constantly nil)]
        (is (=? {:type :url :url #"djl://.*all-MiniLM-L6-v2" :include-token-types? false}
                (#'embedder.model/model-source "all-MiniLM-L6-v2")))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"No source for embedder model"
                              (#'embedder.model/model-source default-model-name)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"No source for embedder model"
                              (#'embedder.model/model-source "my-model")))))
    (testing "no source at all throws setup guidance naming the model"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"No source for embedder model \"my-model\""
                            (source-with {} false))))))

(deftest source-log-summary-test
  (testing "credential-bearing URL components (userinfo, query, fragment) are dropped"
    (is (= {:type :url, :origin :override, :url "https://models.example.com:8443"}
           (#'embedder.model/source-log-summary
            {:type   :url
             :origin :override
             :url    "https://user:password@models.example.com:8443/private/model.onnx?token=secret#fragment"})))
    (is (= {:type :url, :origin :override, :url "s3://bucket"}
           (#'embedder.model/source-log-summary
            {:type :url, :origin :override, :url "s3://key:secret@bucket/model.zip"}))))
  (testing "the sources that identify which model loaded stay legible"
    ;; The bundled resource is the production default, and the arch suffix is the diagnostic — redacting
    ;; it would leave the load log unable to answer \"which bundle did this instance actually load?\".
    (is (= {:type   :url
            :origin :built-in
            :url    "jar:///metabase-embedder/all-MiniLM-L6-v2-arm64.zip"}
           (#'embedder.model/source-log-summary
            {:type   :url
             :origin :built-in
             :url    "jar:///metabase-embedder/all-MiniLM-L6-v2-arm64.zip"})))
    (is (= {:type   :url
            :origin :built-in
            :url    "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2"}
           (#'embedder.model/source-log-summary
            {:type   :url
             :origin :built-in
             :url    "djl://ai.djl.huggingface.onnxruntime/sentence-transformers/all-MiniLM-L6-v2"})))
    (is (= {:type :path, :origin :override, :path "/models/tuned"}
           (#'embedder.model/source-log-summary {:type :path, :origin :override, :path "/models/tuned"}))))
  (testing "an override cannot gain built-in trust by mimicking the bundled-resource prefix"
    (mt/with-dynamic-fn-redefs [embedder.model/getenv {"MB_EMBEDDER_MODEL_SOURCES"
                                                       "{\"my-model\" {:url \"jar:///metabase-embedder/path-secret/model.zip\"}}"}]
      (is (= {:type :url, :origin :override, :url "jar:<redacted>"}
             (#'embedder.model/source-log-summary
              (#'embedder.model/model-source "my-model"))))))
  (testing "an unparseable URL is redacted rather than logged raw"
    (is (= {:type :url, :origin :override, :url "<redacted>"}
           (#'embedder.model/source-log-summary {:type :url, :origin :override, :url "not a URL"})))))

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
            (embedder.model/reset-models!))))))
  (testing "both spellings of each pinned alias share one resident model"
    (let [builds (atom [])]
      (mt/with-dynamic-fn-redefs [embedder.model/build-model (fn [model-name]
                                                               (swap! builds conj model-name)
                                                               {:stub model-name})]
        (embedder.model/reset-models!)
        (try
          (is (identical? (#'embedder.model/model "all-MiniLM-L6-v2")
                          (#'embedder.model/model "sentence-transformers/all-MiniLM-L6-v2")))
          (is (identical? (#'embedder.model/model "snowflake-arctic-embed-l-v2.0")
                          (#'embedder.model/model "Snowflake/snowflake-arctic-embed-l-v2.0")))
          (is (= ["all-MiniLM-L6-v2" "snowflake-arctic-embed-l-v2.0"] @builds))
          (finally
            (embedder.model/reset-models!)))))))

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
