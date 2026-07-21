(ns metabase.embeddings.provider
  "Runtime registry and stable contract for embedding-provider plugins.

  Plugin loading is capability-neutral and lives in `metabase.plugins`. This namespace owns only the embedding
  contract: resolving a requested model to an immutable embedding space, reporting readiness, and producing vectors."
  (:require
   [clojure.string :as str]
   [metabase.util.malli :as mu])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.util HexFormat)))

(set! *warn-on-reflection* true)

(def ^:const embedding-spi-version
  "Current version of the embedding-provider registration contract. Provider plugins must embed this value at
  build time rather than reading the host Var during initialization."
  1)

(def ^:private implementation-schema
  [:map
   [:embedding-spi-version [:= embedding-spi-version]]
   [:resolve-model fn?]
   [:readiness fn?]
   [:embed-texts fn?]
   [:prepare! {:optional true} fn?]])

(def ^:private resolved-model-schema
  [:map {:closed true}
   [:provider [:and :string [:fn (complement str/blank?)]]]
   [:model-name [:and :string [:fn (complement str/blank?)]]]
   [:vector-dimensions [:fn pos-int?]]
   [:model-revision {:optional true} [:and :string [:fn (complement str/blank?)]]]
   [:embedding-space-id [:and :string [:fn (complement str/blank?)]]]
   [:embedding-spi-version [:= embedding-spi-version]]])

(def ^:private readiness-schema
  [:map {:closed true}
   [:ready? :boolean]
   [:reason {:optional true} :keyword]
   [:message {:optional true} :string]])

;; Re-registration is intentional: plugin namespaces can be reloaded during development without leaving a stale
;; implementation in the registry.
(defonce ^:private providers (atom {}))

(defn register-provider!
  "Register `implementation` under `provider-name`.

  Implementations must declare the literal SPI version they were built against and provide three functions:

  * `:resolve-model` turns a requested model map into a resolved descriptor with an immutable
    `:embedding-space-id`.
  * `:readiness` returns at least `{:ready? boolean}` and may include a keyword `:reason` and safe `:message`.
  * `:embed-texts` accepts the resolved descriptor, a vector of texts, and an options map.

  `:prepare!` is optional and accepts a resolved descriptor. Registration data must never contain credentials."
  [provider-name implementation]
  (when-not (and (string? provider-name) (not (str/blank? provider-name)))
    (throw (ex-info "Embedding provider name must be a non-blank string."
                    {:provider provider-name})))
  (when-not (= embedding-spi-version (:embedding-spi-version implementation))
    (throw (ex-info (format "Embedding provider %s uses unsupported SPI version %s; this server supports %s."
                            (pr-str provider-name)
                            (pr-str (:embedding-spi-version implementation))
                            embedding-spi-version)
                    {:provider              provider-name
                     :declared-spi-version  (:embedding-spi-version implementation)
                     :supported-spi-version embedding-spi-version})))
  (mu/validate-throw implementation-schema implementation)
  (swap! providers assoc provider-name implementation)
  provider-name)

(defn registered?
  "Whether `provider-name` has registered an embedding implementation."
  [provider-name]
  (contains? @providers provider-name))

(defn registered-providers
  "Names of all registered embedding providers."
  []
  (set (keys @providers)))

(defn- provider-request
  [{:keys [provider] :as requested-model}]
  (when-let [requested-version (:embedding-spi-version requested-model)]
    (when-not (= embedding-spi-version requested-version)
      (throw (ex-info (format "Embedding model descriptor uses unsupported SPI version %s; this server supports %s."
                              (pr-str requested-version) embedding-spi-version)
                      {:provider              provider
                       :declared-spi-version  requested-version
                       :supported-spi-version embedding-spi-version}))))
  ;; Space identity and SPI version are host-owned metadata on resolved descriptors, not provider request fields.
  (dissoc requested-model :embedding-space-id :embedding-spi-version))

(defn readiness
  "Return structured readiness for `requested-model` without performing model resolution.

  An absent plugin is represented as data rather than optimistic success, allowing callers to hide or disable
  features until the provider is actually installed."
  [{:keys [provider] :as requested-model}]
  (if-let [implementation (get @providers provider)]
    (let [result        ((:readiness implementation) (provider-request requested-model))
          public-result (select-keys result [:ready? :reason :message])]
      (assoc (mu/validate-throw readiness-schema public-result) :provider provider))
    {:provider provider
     :ready?   false
     :reason   :provider-not-registered}))

(defn ready?
  "Whether the provider for `requested-model` is installed and ready to embed."
  [requested-model]
  (true? (:ready? (readiness requested-model))))

(defn- implementation!
  [provider]
  (or (get @providers provider)
      (throw (ex-info (format "Embedding provider %s is not registered." (pr-str provider))
                      {:provider provider
                       :reason   :provider-not-registered}))))

(defn- resolve-model-with
  [implementation {:keys [provider] :as requested-model}]
  (let [resolved ((:resolve-model implementation) (provider-request requested-model))]
    (when-not (= provider (:provider resolved))
      (throw (ex-info "An embedding provider resolved a model for a different provider."
                      {:provider          provider
                       :resolved-provider (:provider resolved)})))
    (let [resolved (-> resolved
                       (select-keys [:provider :model-name :vector-dimensions :model-revision :embedding-space-id])
                       (assoc :embedding-spi-version embedding-spi-version))]
      (mu/validate-throw resolved-model-schema resolved)
      (when (and (:embedding-space-id requested-model)
                 (not= (:embedding-space-id requested-model) (:embedding-space-id resolved)))
        (throw (ex-info "The requested embedding space no longer matches the provider's resolved model."
                        {:type                        ::embedding-space-changed
                         :provider                    provider
                         :model-name                  (:model-name resolved)
                         :requested-embedding-space-id (:embedding-space-id requested-model)
                         :resolved-embedding-space-id  (:embedding-space-id resolved)})))
      resolved)))

(defn resolve-model
  "Resolve a requested model to the public descriptor that identifies its exact embedding space.

  The returned map is deliberately closed and contains no source locations, access tokens, or other provider-private
  configuration. Consumers should persist `:embedding-space-id` anywhere vector compatibility matters."
  [{:keys [provider] :as requested-model}]
  (resolve-model-with (implementation! provider) requested-model))

(defn- sha256
  [^String value]
  (let [^MessageDigest digest (MessageDigest/getInstance "SHA-256")
        ^bytes bytes          (.digest digest (.getBytes value StandardCharsets/UTF_8))]
    (.formatHex (HexFormat/of) bytes)))

(defn- stable-pr-str
  [value]
  ;; Embedding identity must not depend on request-thread printer bindings.
  (binding [*print-dup* false
            *print-length* nil
            *print-level*  nil
            *print-readably* true]
    (pr-str value)))

(defn legacy-resolved-model
  "Resolve a provider/model/dimensions tuple whose remote implementation has no stronger revision identity.

  The ID deliberately covers only the vector-space contract and excludes endpoints, credentials, and other transport
  configuration. Providers that can identify an exact model/tokenizer/export revision should supply their own ID."
  [{:keys [provider model-name vector-dimensions model-revision] :as requested-model}]
  (let [public-model (select-keys requested-model [:provider :model-name :vector-dimensions :model-revision])]
    (assoc public-model
           :embedding-space-id
           (str "emb:v1:sha256:"
                (sha256 (stable-pr-str [provider model-name vector-dimensions
                                        (or model-revision :unspecified)]))))))

(defn- ordered-values?
  [value]
  (or (sequential? value)
      (instance? java.util.List value)
      (and (some? value) (.isArray ^Class (class value)))))

(defn embed-texts
  "Embed `texts` with the provider selected by `requested-model`.

  Model resolution happens before every call so the implementation always receives the canonical public descriptor.
  The result must contain one vector per input, in the same order, and every vector must match the resolved dimensions."
  ([requested-model texts]
   (embed-texts requested-model texts {}))
  ([{:keys [provider] :as requested-model} texts opts]
   (let [implementation (implementation! provider)
         resolved       (resolve-model-with implementation requested-model)
         texts          (vec texts)
         raw-embeddings ((:embed-texts implementation) resolved texts opts)]
     (when-not (ordered-values? raw-embeddings)
       (throw (ex-info "Embedding provider must return an ordered sequence or array of vectors."
                       {:provider    provider
                        :actual-type (some-> raw-embeddings class .getName)})))
     (let [embeddings (vec raw-embeddings)]
       (when-not (= (count texts) (count embeddings))
         (throw (ex-info "Embedding provider returned a different number of vectors than input texts."
                         {:provider       provider
                          :expected-count (count texts)
                          :actual-count   (count embeddings)})))
       (doseq [[index embedding] (map-indexed vector embeddings)]
         (when-not (ordered-values? embedding)
           (throw (ex-info "Embedding vectors must be ordered sequences or arrays."
                           {:provider           provider
                            :model-name         (:model-name resolved)
                            :embedding-space-id (:embedding-space-id resolved)
                            :vector-index       index
                            :actual-type        (some-> embedding class .getName)})))
         (when-not (= (:vector-dimensions resolved) (count embedding))
           (throw (ex-info "Embedding vector dimensions do not match the resolved model."
                           {:provider              provider
                            :model-name            (:model-name resolved)
                            :embedding-space-id    (:embedding-space-id resolved)
                            :vector-index          index
                            :expected-dimensions   (:vector-dimensions resolved)
                            :actual-dimensions     (count embedding)})))
         (when-let [[component-index invalid-value]
                    (first (keep-indexed (fn [component-index value]
                                           (when-not (and (number? value)
                                                          (Double/isFinite (double value)))
                                             [component-index value]))
                                         embedding))]
           (throw (ex-info "Embedding vectors must contain only finite numeric components."
                           {:provider           provider
                            :model-name         (:model-name resolved)
                            :embedding-space-id (:embedding-space-id resolved)
                            :vector-index       index
                            :component-index    component-index
                            :invalid-value      invalid-value}))))
       embeddings))))

(defn embed-text
  "Embed one text and return its vector."
  ([requested-model text]
   (embed-text requested-model text {}))
  ([requested-model text opts]
   (first (embed-texts requested-model [text] opts))))

(defn prepare!
  "Allow a provider to eagerly prepare the resolved model, for example by warming a lazy native runtime."
  [requested-model]
  (let [implementation (implementation! (:provider requested-model))]
    (when-let [prepare! (:prepare! implementation)]
      (prepare! (resolve-model-with implementation requested-model)))))
