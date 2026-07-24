(ns metabase.embeddings.embedder-plugin-artifact-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.embeddings.provider :as embeddings.provider]
   [metabase.plugins.impl :as plugins])
  (:import
   (java.net Proxy ProxySelector)))

(set! *warn-on-reflection* true)

(def ^:private requested-model
  {:provider   "in-process"
   :model-name "Snowflake/snowflake-arctic-embed-l-v2.0"})

(defn- cosine
  [^floats a ^floats b]
  (loop [index 0, dot 0.0]
    (if (< index (alength a))
      (recur (inc index) (+ dot (* (aget a index) (aget b index))))
      dot)))

(defn- isolated-thread-call
  [f]
  (let [result (promise)
        thread (Thread.
                ^Runnable
                (fn []
                  (try
                    (deliver result {:value (f)})
                    (catch Throwable e
                      (deliver result {:error e})))))]
    ;; Simulate a worker created before plugin initialization, whose inherited loader cannot see the plugin JAR.
    (.setContextClassLoader thread (ClassLoader/getPlatformClassLoader))
    {:result result, :thread thread}))

(defn- await-thread!
  [{:keys [result thread]}]
  (.start ^Thread thread)
  (.join ^Thread thread 300000)
  (when (.isAlive ^Thread thread)
    (.interrupt ^Thread thread)
    (throw (ex-info "Timed out waiting for isolated plugin test thread." {})))
  (let [{:keys [value error]} @result]
    (if error
      (throw error)
      value)))

(defn- recording-proxy-selector
  [attempts]
  (proxy [ProxySelector] []
    (select [uri]
      (swap! attempts conj uri)
      (java.util.Collections/singletonList Proxy/NO_PROXY))
    (connectFailed [_uri _socket-address _exception])))

(deftest ^:sequential plugin-artifact-smoke-test
  (if-not (= "true" (System/getenv "MB_EMBEDDER_ARTIFACT_TEST"))
    (testing "artifact smoke is enabled only in its dedicated CI process"
      (is true))
    (let [pre-plugin-thread
          (isolated-thread-call
           #(hash-map :readiness (embeddings.provider/readiness requested-model)
                      :resolved  (embeddings.provider/resolve-model requested-model)))]
      (plugins/load-plugins!)
      (testing "the implementation was discovered through its jar manifest"
        (is (embeddings.provider/registered? "in-process"))
        (is (= "true" (System/getProperty "ai.djl.offline")))
        (is (= "true" (System/getProperty "OPT_OUT_TRACKING")))
        (is (str/starts-with? (str (io/resource "metabase_enterprise/embedder/plugin.clj")) "jar:file:"))
        (is (nil? (find-ns 'metabase-enterprise.embedder.model))
            "manifest registration must not initialize the DJL model namespace")
        (let [{:keys [readiness resolved]} (await-thread! pre-plugin-thread)]
          (is (true? (:ready? readiness)))
          (is (re-matches #"emb:v1:sha256:[0-9a-f]{64}" (:embedding-space-id resolved)))
          (is (nil? (find-ns 'metabase-enterprise.embedder.model))
              "catalog access from an old worker thread remains lazy")))
      (testing "the built artifact contains a ready, immutable model space"
        (is (true? (:ready? (embeddings.provider/readiness requested-model))))
        (is (= {:provider "in-process" :ready? false :reason :vector-dimensions-mismatch}
               (embeddings.provider/readiness
                (assoc requested-model :vector-dimensions 768))))
        (is (re-matches #"emb:v1:sha256:[0-9a-f]{64}"
                        (:embedding-space-id (embeddings.provider/resolve-model requested-model))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has 1024 dimensions"
                              (embeddings.provider/resolve-model
                               (assoc requested-model :vector-dimensions 768))))
        (let [architecture-var (ns-resolve 'metabase-enterprise.embedder.catalog 'architecture)
              os-var           (ns-resolve 'metabase-enterprise.embedder.catalog 'operating-system)
              libc-var         (ns-resolve 'metabase-enterprise.embedder.catalog 'linux-libc)
              glibc-version-var (ns-resolve 'metabase-enterprise.embedder.catalog 'glibc-version)
              resolve-for      (fn [arch]
                                 (with-redefs-fn {architecture-var (constantly arch)
                                                  os-var           (constantly "linux")
                                                  libc-var         (constantly :glibc)
                                                  glibc-version-var (constantly "2.34")}
                                   #(embeddings.provider/resolve-model requested-model)))
              normal  (mapv (comp :embedding-space-id resolve-for) ["arm64" "avx2"])
              bounded (binding [*print-length* 1
                                *print-level* 1
                                *print-readably* false
                                *print-dup* true]
                        (mapv (comp :embedding-space-id resolve-for) ["arm64" "avx2"]))]
          (is (= normal bounded) "model identity ignores ambient printer bindings")
          (is (apply not= normal)
              "architecture-specific exports intentionally have distinct embedding spaces"))
        (let [model-spec-var (ns-resolve 'metabase-enterprise.embedder.catalog 'model-spec)
              model-spec-fn  (var-get model-spec-var)
              spec           (model-spec-fn (:model-name requested-model))
              normal         (embeddings.provider/resolve-model requested-model)
              reordered      (update spec :runtime #(into (array-map) (reverse %)))
              equivalent     (with-redefs-fn {model-spec-var (constantly reordered)}
                               #(embeddings.provider/resolve-model requested-model))]
          (is (= (:embedding-space-id normal) (:embedding-space-id equivalent))
              "equivalent catalog map order does not change model identity"))
        (let [libc-var        (ns-resolve 'metabase-enterprise.embedder.catalog 'linux-libc)
              os-var          (ns-resolve 'metabase-enterprise.embedder.catalog 'operating-system)
              detect-libc-var (ns-resolve 'metabase-enterprise.embedder.catalog 'detect-linux-libc)
              detect-libc     (var-get detect-libc-var)
              glibc-version-var (ns-resolve 'metabase-enterprise.embedder.catalog 'glibc-version)
              supported-version-var (ns-resolve 'metabase-enterprise.embedder.catalog 'supported-glibc-version?)
              supported-version? (var-get supported-version-var)]
          (is (= :unknown (detect-libc false nil)) "unreadable process maps fail closed")
          (is (= :musl (detect-libc true nil)))
          (is (= :musl (detect-libc false "/lib/ld-musl-x86_64.so.1")))
          (is (= :glibc (detect-libc false "/usr/lib64/ld-2.28.so")))
          (is (= :glibc (detect-libc false "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"))
              "the Ubuntu 24.04 loader layout is recognized")
          (is (= :glibc (detect-libc false "/usr/lib/x86_64-linux-gnu/libc.so.6")))
          (is (false? (supported-version? "2.33")))
          (is (true? (supported-version? "2.34")))
          (is (true? (supported-version? "2.39")))
          (is (false? (supported-version? nil)))
          (with-redefs-fn {libc-var (constantly :glibc)
                           os-var   (constantly "linux")
                           glibc-version-var (constantly "2.34")}
            #(is (true? (:ready? (embeddings.provider/readiness requested-model)))))
          (with-redefs-fn {libc-var (constantly :unknown)
                           os-var   (constantly "linux")
                           glibc-version-var (constantly "2.39")}
            #(is (true? (:ready? (embeddings.provider/readiness requested-model)))
                 "the authoritative glibc API probe survives an inconclusive process map"))
          (with-redefs-fn {libc-var (constantly :glibc)
                           os-var   (constantly "linux")
                           glibc-version-var (constantly "2.33")}
            #(do
               (is (= {:provider "in-process" :ready? false :reason :unsupported-libc-version}
                      (embeddings.provider/readiness requested-model)))
               (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unsupported-libc-version"
                                     (embeddings.provider/resolve-model requested-model)))))
          (doseq [[unsupported-libc probed-glibc-version] [[:musl "2.39"]
                                                           [:unknown nil]]]
            (with-redefs-fn {libc-var (constantly unsupported-libc)
                             os-var   (constantly "linux")
                             glibc-version-var (constantly probed-glibc-version)}
              #(do
                 (is (= {:provider "in-process" :ready? false :reason :unsupported-libc}
                        (embeddings.provider/readiness requested-model)))
                 (is (thrown-with-msg? clojure.lang.ExceptionInfo #"unsupported-libc"
                                       (embeddings.provider/resolve-model requested-model)))))))
        (let [os-var   (ns-resolve 'metabase-enterprise.embedder.catalog 'operating-system)
              arch-var (ns-resolve 'metabase-enterprise.embedder.catalog 'architecture)]
          (with-redefs-fn {os-var   (constantly "mac os x")
                           arch-var (constantly "avx2")}
            #(is (= {:provider "in-process" :ready? false :reason :unsupported-platform}
                    (embeddings.provider/readiness requested-model))
                 "the tokenizer artifact has no Intel macOS native library"))))
      (testing "the artifact bounds local inference batches before loading the runtime"
        (let [model-fn-var (ns-resolve 'metabase-enterprise.embedder.plugin 'model-fn)
              batch-sizes  (atom [])]
          (with-redefs-fn
            {model-fn-var (constantly
                           (fn [_model-name texts]
                             (swap! batch-sizes conj (count texts))
                             (mapv (fn [_] (float-array 1024)) texts)))}
            #(embeddings.provider/embed-texts requested-model (repeat 65 "text")))
          (is (= [32 32 1] @batch-sizes))
          (is (nil? (find-ns 'metabase-enterprise.embedder.model)))))
      (testing "real inference runs through the plugin jar"
        (let [network-attempts (atom [])
              original-proxy   (ProxySelector/getDefault)]
          (try
            (ProxySelector/setDefault (recording-proxy-selector network-attempts))
            (let [[dog puppy invoice]
                  (await-thread!
                   (isolated-thread-call
                    #(embeddings.provider/embed-texts requested-model ["dog" "puppy" "invoice"])))]
              (is (some? (find-ns 'metabase-enterprise.embedder.model)))
              (is (= [1024 1024 1024] (mapv alength [dog puppy invoice])))
              (is (> (cosine dog puppy) (cosine dog invoice))))
            (finally
              (ProxySelector/setDefault original-proxy)))
          (is (empty? @network-attempts) "bundled inference performs no outbound requests"))))))
