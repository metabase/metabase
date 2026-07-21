(ns metabase.embeddings.provider-test
  (:require
   [clojure.test :refer :all]
   [metabase.embeddings.provider :as embedding.provider]))

(set! *warn-on-reflection* true)

(defn- provider-name
  []
  (str "test-provider-" (random-uuid)))

(defn- implementation
  [calls & {:keys [readiness resolve-model embed-texts prepare!]
            :or   {readiness    (constantly {:ready? true})
                   resolve-model embedding.provider/legacy-resolved-model
                   embed-texts  (fn [model texts opts]
                                  (swap! calls conj [:embed model texts opts])
                                  (mapv (fn [_] (float-array (:vector-dimensions model))) texts))}}]
  (cond-> {:embedding-spi-version embedding.provider/embedding-spi-version
           :readiness             readiness
           :resolve-model         resolve-model
           :embed-texts           embed-texts}
    prepare! (assoc :prepare! prepare!)))

(deftest registration-version-gate-test
  (let [name (provider-name)]
    (is (:const (meta #'embedding.provider/embedding-spi-version))
        "AOT plugins must inline the SPI version they were compiled against")
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"unsupported SPI version"
                          (embedding.provider/register-provider!
                           name
                           {:embedding-spi-version (inc embedding.provider/embedding-spi-version)})))
    (is (false? (embedding.provider/registered? name)))))

(deftest missing-provider-readiness-test
  (let [model {:provider (provider-name)}]
    (is (= {:provider (:provider model)
            :ready?   false
            :reason   :provider-not-registered}
           (embedding.provider/readiness model)))
    (is (false? (embedding.provider/ready? model)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"is not registered"
                          (embedding.provider/resolve-model model)))))

(deftest resolve-and-embed-test
  (let [calls (atom [])
        name  (provider-name)
        model {:provider          name
               :model-name        "example/model"
               :vector-dimensions 3}]
    (embedding.provider/register-provider! name (implementation calls))
    (is (embedding.provider/registered? name))
    (is (contains? (embedding.provider/registered-providers) name))
    (is (= {:provider              name
            :model-name            "example/model"
            :vector-dimensions     3
            :embedding-space-id    (:embedding-space-id (embedding.provider/legacy-resolved-model model))
            :embedding-spi-version embedding.provider/embedding-spi-version}
           (embedding.provider/resolve-model model)))
    (let [embeddings (embedding.provider/embed-texts model ["one" "two"] {:purpose :document})]
      (is (= [3 3] (mapv alength embeddings)))
      (is (= [:embed
              (embedding.provider/resolve-model model)
              ["one" "two"]
              {:purpose :document}]
             (first @calls))))))

(deftest resolved-model-is-public-and-stable-test
  (let [name      (provider-name)
        calls     (atom [])
        requested {:provider          name
                   :model-name        "example/model"
                   :vector-dimensions 4
                   :api-key           "do-not-leak"}]
    (embedding.provider/register-provider! name (implementation calls))
    (let [resolved (embedding.provider/resolve-model requested)]
      (is (= #{:provider :model-name :vector-dimensions :embedding-space-id :embedding-spi-version}
             (set (keys resolved))))
      (is (not (re-find #"do-not-leak" (pr-str resolved))))
      (is (= (:embedding-space-id resolved)
             (:embedding-space-id (embedding.provider/resolve-model (dissoc requested :api-key)))))
      (is (not= (:embedding-space-id resolved)
                (:embedding-space-id
                 (embedding.provider/resolve-model (assoc requested :model-name "example/other")))))
      (is (not= (:embedding-space-id resolved)
                (:embedding-space-id
                 (embedding.provider/resolve-model (assoc requested :model-revision "revision-2"))))))
    (testing "a persisted identity is checked against the provider's current resolution"
      (let [resolved (embedding.provider/resolve-model requested)]
        (is (= resolved (embedding.provider/resolve-model resolved)))
        (try
          (embedding.provider/resolve-model (assoc resolved :embedding-space-id "stale-space"))
          (is false "expected a changed embedding space to be rejected")
          (catch clojure.lang.ExceptionInfo e
            (is (= :metabase.embeddings.provider/embedding-space-changed (:type (ex-data e))))))))
    (testing "revisioned legacy descriptors round-trip without changing identity"
      (let [revisioned (embedding.provider/resolve-model (assoc requested :model-revision "revision-1"))]
        (is (= "revision-1" (:model-revision revisioned)))
        (is (= revisioned (embedding.provider/resolve-model revisioned)))))
    (testing "legacy identity is independent of ambient printer bindings"
      (let [other-request (assoc requested :model-name "example/other")
            normal        (mapv (comp :embedding-space-id embedding.provider/resolve-model)
                                [requested other-request])
            bounded       (binding [*print-length* 1
                                    *print-level*  1
                                    *print-readably* false
                                    *print-dup* true]
                            (mapv (comp :embedding-space-id embedding.provider/resolve-model)
                                  [requested other-request]))]
        (is (= normal bounded))
        (is (apply not= bounded))))
    (testing "legacy identity is pinned for JDBC integer dimensions"
      (let [model    {:provider "example" :model-name "example/model" :vector-dimensions (Integer/valueOf 4)}
            expected "emb:v1:sha256:7f945085ff74c92a2daf851c4242084d0e955d7e0466e9b5a33e75aa188f68ee"]
        (is (= expected (:embedding-space-id (embedding.provider/legacy-resolved-model model))))
        (is (= expected
               (binding [*print-dup* true]
                 (:embedding-space-id (embedding.provider/legacy-resolved-model model)))))))))

(deftest resolved-descriptor-round-trip-strips-host-metadata-test
  (let [name   (provider-name)
        model  {:provider name :model-name "model" :vector-dimensions 2}
        inputs (atom [])]
    (embedding.provider/register-provider!
     name
     (implementation
      (atom [])
      :resolve-model (fn [requested]
                       (swap! inputs conj requested)
                       (when (some #(contains? requested %) [:embedding-space-id :embedding-spi-version])
                         (throw (ex-info "closed provider request schema" {:request requested})))
                       (embedding.provider/legacy-resolved-model requested))))
    (let [resolved (embedding.provider/resolve-model model)]
      (is (= resolved (embedding.provider/resolve-model resolved)))
      (is (= [model model] @inputs))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"unsupported SPI version"
                            (embedding.provider/resolve-model
                             (assoc resolved :embedding-spi-version
                                    (inc embedding.provider/embedding-spi-version))))))))

(deftest readiness-and-prepare-test
  (let [name     (provider-name)
        prepared (atom nil)
        model    {:provider name :model-name "model" :vector-dimensions 2}]
    (embedding.provider/register-provider!
     name
     (implementation (atom [])
                     :readiness (constantly {:ready? false :reason :runtime-unavailable :message "not ready"})
                     :prepare!  #(reset! prepared %)))
    (is (= {:provider name :ready? false :reason :runtime-unavailable :message "not ready"}
           (embedding.provider/readiness model)))
    (is (false? (embedding.provider/ready? model)))
    (embedding.provider/prepare! model)
    (is (= (embedding.provider/resolve-model model) @prepared))))

(deftest readiness-validates-and-strips-host-metadata-test
  (let [name   (provider-name)
        model  {:provider name :model-name "model" :vector-dimensions 2}
        inputs (atom [])]
    (embedding.provider/register-provider!
     name
     (implementation
      (atom [])
      :readiness (fn [requested]
                   (swap! inputs conj requested)
                   (when (some #(contains? requested %) [:embedding-space-id :embedding-spi-version])
                     (throw (ex-info "closed provider request schema" {:request requested})))
                   {:ready?          true
                    :provider        "provider-controlled"
                    :private-details {:api-key "do-not-leak"}})))
    (let [resolved  (embedding.provider/resolve-model model)
          readiness (embedding.provider/readiness resolved)]
      (is (= {:provider name :ready? true}
             readiness)
          "readiness exposes only the public result shape and the host-owned provider")
      (is (not (re-find #"do-not-leak" (pr-str readiness))))
      (is (= [model] @inputs))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"unsupported SPI version"
                            (embedding.provider/readiness
                             (assoc resolved :embedding-spi-version
                                    (inc embedding.provider/embedding-spi-version)))))
      (is (= [model] @inputs)
          "the host rejects an unsupported descriptor before invoking the provider"))))

(deftest provider-operation-uses-one-registry-snapshot-test
  (let [name              (provider-name)
        model             {:provider name :model-name "model" :vector-dimensions 2}
        implementation!   (var-get #'embedding.provider/implementation!)
        registry-lookups  (atom 0)]
    (embedding.provider/register-provider!
     name
     (implementation (atom []) :prepare! (constantly nil)))
    (with-redefs-fn {#'embedding.provider/implementation!
                     (fn [provider]
                       (swap! registry-lookups inc)
                       (implementation! provider))}
      (fn []
        (embedding.provider/embed-text model "one")
        (is (= 1 @registry-lookups) "resolve and embed use one captured provider implementation")
        (reset! registry-lookups 0)
        (embedding.provider/prepare! model)
        (is (= 1 @registry-lookups) "resolve and prepare use one captured provider implementation")))))

(deftest invalid-provider-output-test
  (testing "resolved model must describe the provider that registered it"
    (let [name (provider-name)]
      (embedding.provider/register-provider!
       name
       (implementation (atom []) :resolve-model #(assoc % :provider "somebody-else"
                                                        :embedding-space-id "space")))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"different provider"
                            (embedding.provider/resolve-model
                             {:provider name :model-name "model" :vector-dimensions 2})))))
  (testing "one vector is required per input"
    (let [name  (provider-name)
          model {:provider name :model-name "model" :vector-dimensions 2}]
      (embedding.provider/register-provider!
       name
       (implementation (atom []) :embed-texts (fn [_ _ _] [(float-array 2)])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"different number of vectors"
                            (embedding.provider/embed-texts model ["one" "two"])))))
  (testing "every vector must match the resolved dimensions"
    (let [name  (provider-name)
          model {:provider name :model-name "model" :vector-dimensions 2}]
      (embedding.provider/register-provider!
       name
       (implementation (atom []) :embed-texts (fn [_ _ _] [(float-array 3)])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"dimensions do not match"
                            (embedding.provider/embed-text model "one")))))
  (testing "every vector component must be finite and numeric"
    (doseq [bad ["not-a-number" Double/NaN Double/POSITIVE_INFINITY Double/NEGATIVE_INFINITY]]
      (let [name  (provider-name)
            model {:provider name :model-name "model" :vector-dimensions 2}]
        (embedding.provider/register-provider!
         name
         (implementation (atom []) :embed-texts (fn [_ _ _] [[0.0 bad]])))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"finite numeric components"
                              (embedding.provider/embed-text model "one"))
            (pr-str bad))))))

(deftest ordered-provider-output-test
  (doseq [[description result]
          [["vectors" [[0.0 1.0] [2.0 3.0]]]
           ["lists" (list (list 0.0 1.0) (list 2.0 3.0))]
           ["lazy sequences" (map #(map identity %) [[0.0 1.0] [2.0 3.0]])]
           ["Java lists" (java.util.ArrayList. [[0.0 1.0] [2.0 3.0]])]
           ["JVM arrays" (object-array [(float-array [0.0 1.0])
                                        (object-array [2.0 3.0])])]]]
    (testing description
      (let [name  (provider-name)
            model {:provider name :model-name "model" :vector-dimensions 2}]
        (embedding.provider/register-provider!
         name
         (implementation (atom []) :embed-texts (fn [_ _ _] result)))
        (is (= [[0.0 1.0] [2.0 3.0]]
               (mapv vec (embedding.provider/embed-texts model ["one" "two"]))))))))

(deftest unordered-provider-output-test
  (doseq [bad-result [#{[0.0 1.0] [2.0 3.0]}
                      {0.0 1.0, 2.0 3.0}
                      nil]]
    (let [name  (provider-name)
          model {:provider name :model-name "model" :vector-dimensions 2}]
      (embedding.provider/register-provider!
       name
       (implementation (atom []) :embed-texts (fn [_ _ _] bad-result)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"ordered sequence or array of vectors"
                            (embedding.provider/embed-texts model ["one" "two"]))
          (pr-str bad-result))))
  (doseq [bad-vector [#{0.0 1.0}
                      {0.0 1.0, 2.0 3.0}]]
    (let [name  (provider-name)
          model {:provider name :model-name "model" :vector-dimensions 2}]
      (embedding.provider/register-provider!
       name
       (implementation (atom []) :embed-texts (fn [_ _ _] [bad-vector])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"vectors must be ordered sequences or arrays"
                            (embedding.provider/embed-text model "one"))
          (pr-str bad-vector)))))
