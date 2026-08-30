(ns metabase-enterprise.osi-generation.benchmark.arms
  "The three benchmark arms and the writer that applies them to the appdb.

  An arm decides what `ai_context` a corpus entity carries before the index is reconciled:
  - `:none`      — no `ai_context` at all (the floor: name/description only).
  - `:baseline`  — the hand-written `ai_context` from `baseline.edn`, written `data_source :human`.
  - `:generated` — LLM-generated `ai_context` from a [[capture-generated!]] snapshot, written
    `data_source :metabot`. Scoring an arm never calls an LLM: the snapshot is captured once, committed,
    and passed by path or inline, so a scored comparison is always against a reproducible artifact.

  [[apply-arm!]] is a plain `t2/insert!` — `osi_ai_context` has no write hooks, so a
  per-arm batch write queues no targeted reconciles; the runner reconciles its isolated index itself."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.pprint :as pprint]
   [clojure.set :as set]
   [java-time.api :as t]
   [metabase-enterprise.osi-generation.benchmark.corpus :as corpus]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.llm.provider :as llm.provider]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (java.net URI)
   (java.nio.charset StandardCharsets)
   (java.nio.file FileAlreadyExistsException Files OpenOption StandardOpenOption)))

(set! *warn-on-reflection* true)

(def arms
  "The arms in report order. `:generated` needs a captured snapshot."
  [:none :baseline :generated])

(def ^:private generation-source-resources
  "Source files whose behavior can change a captured context without changing the prompt/model identity."
  ["metabase_enterprise/osi_generation/generate.clj"
   "metabase_enterprise/osi_generation/prompt.clj"
   "metabase_enterprise/osi_generation/prompts/context_system.selmer"
   "metabase_enterprise/osi_generation/prompts/context_user.selmer"
   "metabase/llm/provider.clj"
   "metabase/metabot/self.clj"
   "metabase/metabot/self/core.clj"
   "metabase/metabot/self/schema.clj"
   "metabase/metabot/self/azure.clj"
   "metabase/metabot/self/bedrock.clj"
   "metabase/metabot/self/claude.clj"
   "metabase/metabot/self/deepseek.clj"
   "metabase/metabot/self/google.clj"
   "metabase/metabot/self/google/raw_predict.clj"
   "metabase/metabot/self/google/stream_generate_content.clj"
   "metabase/metabot/self/mistral.clj"
   "metabase/metabot/self/moonshot.clj"
   "metabase/metabot/self/openai.clj"
   "metabase/metabot/self/openai/chat_completions.clj"
   "metabase/metabot/self/openrouter.clj"
   "metabase/metabot/self/vllm.clj"
   "metabase/metabot/self/zai.clj"
   "metabase/entity_retrieval/spec.clj"
   "metabase/queries/models/card.clj"
   "metabase/warehouse_schema/models/table.clj"
   "metabase/measures/models/measure.clj"
   "metabase/segments/models/segment.clj"
   "metabase_enterprise/osi_generation/benchmark/corpus.clj"
   "metabase_enterprise/osi_generation/benchmark/arms.clj"])

(defn generation-code-hash
  "Content hash of the generation call path, provider adapters, normalization, and candidate projection
  used by a capture. Together with `generator-version` and `model-ref`, this invalidates
  snapshots after any local output-affecting code change."
  []
  (->> generation-source-resources
       (map (fn [path]
              (let [resource (or (io/resource path)
                                 (throw (ex-info (str "Generation provenance source not found: " path)
                                                 {:path path})))]
                [path (slurp resource)])))
       (into (sorted-map))
       corpus/canonical-pr-str
       buddy-hash/sha256
       codecs/bytes->hex))

;;; --------------------------------------------- Candidate assembly ----------------------------------------------

(defn candidate-for
  "The candidate map for one corpus entity, shaped like the production candidate generator's output so
  the benchmark invokes the generator through its real seam.
  `:entity` is the hydrated source entity, `:llm-input` is the `:osi-context` projection, `:basis` the
  fresh basis, `:diff` nil and `:existing-context` nil (every corpus entity is first-generation),
  `:tier` 1. Must run inside [[metabase-enterprise.osi-generation.benchmark.corpus/with-corpus-library]]
  (the entities and the isolated membership only exist there); throws when the entity is not a member."
  [_corpus ids corpus-key]
  (let [{:keys [entity_type entity_local_id]}
        (or (get ids corpus-key)
            (throw (ex-info (str "Unknown corpus key " corpus-key) {:corpus-key corpus-key})))
        member (or (spec/member-entity :osi-context entity_type entity_local_id)
                   (throw (ex-info (str "Corpus entity is not a library member: " corpus-key)
                                   {:corpus-key      corpus-key
                                    :entity-type     entity_type
                                    :entity-local-id entity_local_id})))
        ;; one-entity hydrate per candidate is the N+1 the spec ns warns about; at corpus size the
        ;; LLM call this feeds dwarfs it, and keeping the assembly per-key keeps it shareable.
        entity (first (spec/hydrate :osi-context [member]))]
    {:entity           entity
     :llm-input        (spec/project :osi-context entity)
     :basis            (spec/entity-basis :osi-context entity)
     :diff             nil
     :existing-context nil
     :tier             1}))

;;; ---------------------------------------------- Generated snapshot ---------------------------------------------

(defn generated-snapshot-artifact
  "The configured generated snapshot as `{:metadata map|nil :contexts {corpus-key -> ai_context}}`.
  New captures use this self-describing format. Plain context maps remain readable for old fixtures and
  callers, with optional `:snapshot-metadata` supplied alongside inline data."
  [opts]
  (when (and (contains? opts :snapshot-data) (contains? opts :snapshot))
    (throw (ex-info "Pass either :snapshot-data or :snapshot, not both"
                    {:reason :ambiguous-snapshot-source})))
  (when-let [snapshot (or (:snapshot-data opts)
                          (when-let [path (:snapshot opts)]
                            (edn/read-string (slurp path))))]
    (if (and (map? snapshot) (contains? snapshot :contexts))
      snapshot
      {:metadata (:snapshot-metadata opts)
       :contexts snapshot})))

(defn generated-snapshot
  "The generated context map from [[generated-snapshot-artifact]], or nil when none is configured."
  [opts]
  (:contexts (generated-snapshot-artifact opts)))

(defn- validate-snapshot-contexts!
  [snapshot]
  (when-not (map? snapshot)
    (throw (ex-info "Generated snapshot contexts must be a map" {:snapshot snapshot})))
  (doseq [[corpus-key context] snapshot
          :when                (some? context)]
    (try
      (mu/validate-throw entity-retrieval/AiContext context)
      (catch Exception e
        (throw (ex-info (str "Invalid generated context for " corpus-key)
                        {:corpus-key corpus-key :context context}
                        e)))))
  snapshot)

(defn generated-coverage
  "Coverage of a generated `snapshot` over `corpus`'s entities — which corpus entities have a generated
  `ai_context` and which do not. Returns `{:covered #{} :missing #{} :fraction n :complete? bool}`.

  This is the input to the mixed-arm guard: an entity absent from the snapshot carries
  no `ai_context` and therefore behaves exactly as the `:none` arm, so a partial snapshot silently mixes
  `:none` entities into a single `:generated` score unless the gap is measured and handled. A nil
  snapshot is zero coverage, not an error (the run decides to skip)."
  [corpus snapshot]
  (when (some? snapshot)
    (validate-snapshot-contexts! snapshot))
  (let [entity-keys (set (map :corpus-key (:entities corpus)))
        covered     (set (filter #(some? (get snapshot %)) entity-keys))
        missing     (set/difference entity-keys covered)]
    {:covered   covered
     :missing   missing
     :fraction  (if (empty? entity-keys) 0.0 (/ (double (count covered)) (count entity-keys)))
     :complete? (empty? missing)}))

;;; ------------------------------------------------- Arm context -------------------------------------------------

(defmulti arm-context
  "The `ai_context` map (or nil) a corpus entity carries under `arm`.
  Dispatches on `arm`; `:none` -> nil, `:baseline` -> the baseline.edn entry, `:generated` -> the
  captured snapshot value (see [[capture-generated!]])."
  {:arglists '([arm corpus ids corpus-key])}
  (fn [arm & _] arm))

(defmethod arm-context :none [_arm _corpus _ids _corpus-key] nil)

(defmethod arm-context :baseline [_arm corpus _ids corpus-key]
  ;; nil is a bug for the baseline arm: every entity is covered (every-entity-has-a-baseline-test), so
  ;; a hole here means the corpus and baseline files drifted apart — refuse rather than silently thin
  ;; the arm to :none for that entity.
  (or (get-in corpus [:baseline corpus-key])
      (throw (ex-info (str "No baseline ai_context for corpus entity " corpus-key)
                      {:corpus-key corpus-key}))))

(defmethod arm-context :generated [_arm corpus _ids corpus-key]
  ;; The runner assocs the configured snapshot onto the corpus as `:generated-snapshot` (see
  ;; runner/run-comparison!). A *missing snapshot entirely* is a misconfiguration — throw, never silently
  ;; degrade the whole arm to :none (arm-context-shapes-test pins this). A key *absent from a present
  ;; snapshot* is a coverage gap the runner has already accounted for via [[generated-coverage]];
  ;; returning nil degrades that one entity to the :none floor explicitly and reported, not silently.
  (let [snapshot (:generated-snapshot corpus)]
    (when-not snapshot
      (throw (ex-info (str "No generated snapshot configured for the :generated arm — "
                           "run capture-generated! and pass :snapshot")
                      {:corpus-key corpus-key})))
    (get snapshot corpus-key)))

;;; --------------------------------------------------- Writer ----------------------------------------------------

(defn- data-source-for [arm]
  ;; :baseline is a human curator's work; :generated is the bot's. :none writes no row at all.
  (case arm
    :baseline  :human
    :generated :metabot
    nil))

(defn apply-arm!
  "Write one `osi_ai_context` row per corpus entity that [[arm-context]] gives a non-nil context for,
  under `arm`; returns the count written. Plain `t2/insert!` — no per-row nudge.
  `:none` writes nothing and returns 0."
  [arm corpus ids]
  (let [rows (vec (for [{:keys [corpus-key]} (:entities corpus)
                        :let  [ai-context (arm-context arm corpus ids corpus-key)]
                        :when ai-context
                        :let  [{:keys [entity_type entity_local_id]} (get ids corpus-key)]]
                    {:entity_type     (entity-retrieval/normalize-entity-type entity_type)
                     :entity_local_id entity_local_id
                     :ai_context      ai-context
                     :data_source     (data-source-for arm)}))]
    (when (seq rows)
      (t2/insert! :model/OsiAiContext rows))
    (count rows)))

;;; ---------------------------------------------- Generated capture ----------------------------------------------

(def ^:private default-snapshot-dir
  "Where [[capture-generated!]] writes snapshots; committed ones live here so a scored comparison is
  reviewable."
  "test_resources/osi_generation/benchmark/generated")

(defn- with-pinned-connection
  "Run `f` with every model-reference resolution answering `connection`, or plainly when it is nil.

  A capture makes generation calls only, so pinning all of them to one connection is the intent: one
  connection serves the whole artifact, and editing it mid-capture cannot move the provider underneath."
  [connection f]
  (if connection
    (mt/with-dynamic-fn-redefs [llm.provider/resolve-model-ref (constantly connection)]
      (f))
    (f)))

(def ^:private routing-config-keys
  "The connection config keys a capture records: the ones that decide which endpoint served the requests.

  A whitelist, not `llm.provider/secret-field-keys` inverted, so a credential field added to the provider
  registry later can never start appearing in a committed snapshot."
  [:base-url :project-id :location :region :model-family :deployment-name])

(defn- sanitized-endpoint
  "`url` reduced to what identifies an endpoint without carrying its secrets: scheme, host and port
  verbatim, and the path as a short digest.

  The whitelist above protects field *names*; a base URL can carry the secret in its *value*, and the
  provider registry forbids none of the places it can hide — user-info, a query parameter, a fragment, or a
  path segment (`https://proxy.internal/<token>/v1`). A snapshot is committed, so only scheme/host/port
  survive as text. The path still distinguishes two endpoints on one host, so it is kept as a digest rather
  than dropped. An unparseable URL is reported as such rather than passed through."
  [url]
  (try
    (let [uri  (URI. url)
          path (u/trimmed-string (.getPath uri))]
      (if (nil? (u/trimmed-string (.getHost uri)))
        "<unparseable>"
        (str (.getScheme uri) "://" (.getHost uri)
             (when (pos? (.getPort uri)) (str ":" (.getPort uri)))
             (when path
               (str "/#" (subs (codecs/bytes->hex (buddy-hash/sha256 path)) 0 12))))))
    (catch Exception _ "<unparseable>")))

(defn- connection-identity
  "The non-secret identity of the connection a capture ran against, or nil when the reference resolved to
  nothing.

  Type and model alone cannot tell two captures apart when the same connection key was repointed at another
  endpoint between them, so the routing fields ([[routing-config-keys]]) are recorded alongside. API keys and
  every other credential are excluded — a snapshot is committed."
  [connection]
  (when connection
    (let [routing (into (sorted-map)
                        (keep (fn [k]
                                (when-let [value (u/trimmed-string (get (:credentials connection) k))]
                                  [k (cond-> value (= k :base-url) sanitized-endpoint)])))
                        routing-config-keys)]
      (cond-> (select-keys connection [:connection-key :type :model :ai-proxy?])
        (seq routing) (assoc :routing routing)))))

(defn- snapshot-path [out-dir model-ref]
  (str out-dir "/" (t/local-date) "-" (u/slugify model-ref) "-" (random-uuid) ".edn"))

(defn- interrupted-exception?
  "Whether `e` or one of its causes is an interruption. Provider adapters can wrap the original
  `InterruptedException`, so checking only the exception caught by the capture loop is insufficient."
  [e]
  (boolean
   (some #(instance? InterruptedException %)
         (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e))))))

(defn- fatal-error
  "The first JVM `Error` in `e`'s cause chain, if any. Response validation can wrap one in an
  `ExceptionInfo`; it must still terminate capture rather than becoming an ordinary entity error."
  [e]
  (some #(when (instance? Error %) %)
        (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e)))))

(defn- assert-capture-provenance-unchanged!
  [pinned-code-hash pinned-corpus-hash corpus]
  (let [current-code-hash   (generation-code-hash)
        current-corpus-hash (corpus/corpus-hash corpus)]
    (when-not (= pinned-code-hash current-code-hash)
      (throw (ex-info "Generation code changed during capture; refusing to write a mixed snapshot"
                      {:reason               :capture-provenance-changed
                       :provenance           :generation-code
                       :pinned-code-hash      pinned-code-hash
                       :current-code-hash     current-code-hash})))
    (when-not (= pinned-corpus-hash current-corpus-hash)
      (throw (ex-info "Corpus changed during capture; refusing to write a mixed snapshot"
                      {:reason               :capture-provenance-changed
                       :provenance           :corpus
                       :pinned-corpus-hash    pinned-corpus-hash
                       :current-corpus-hash   current-corpus-hash})))))

(defn- snapshot-content
  [artifact]
  (binding [*print-length*         nil
            *print-level*          nil
            *print-meta*           false
            *print-readably*       true
            *print-namespace-maps* false]
    (str (pprint/write (corpus/canonical-edn artifact) :stream nil) "\n")))

(defn capture-generated!
  "Run the production `generate-context` seam over every corpus entity's [[candidate-for]] candidate and write the
  `{corpus-key -> ai_context}` snapshot EDN, returning `{:path _ :metadata _ :coverage _
  :errors {corpus-key msg} :usage {:input-tokens n :output-tokens n}}`. The only function in the
  harness that calls an LLM (provider/model from `osi-generation` settings, recorded in the snapshot
  filename).

  The generator identity is resolved ONCE, before the loop, and pinned for every call: each generate
  call otherwise re-resolves the LLM settings itself, so a mid-capture provider/model change would
  yield a snapshot of mixed models labelled as one. Every returned `generator-version` is verified
  against the pinned identity before the artifact is written — a mismatch fails the capture. The
  metadata also records the generation-code and corpus hashes pinned before the first paid call. Both
  identities are checked again before the artifact is written, so a mid-capture edit aborts rather
  than labelling earlier outputs with the final source state.

  Must run inside `with-corpus-library`. A per-entity failure is recorded under `:errors` and left out
  of the snapshot — a coverage gap for the runner, not a run failure. An empty `ai_context` is
  the generator's answer, so it is kept (that entity scores at the `:none` floor on its own merits).
  Opts: `:out-dir` (default [[default-snapshot-dir]])."
  [{:keys [entities] :as corpus} ids opts]
  (let [{:keys [model-ref] :as call-opts} (settings/llm-call-opts)
        ;; Resolve the connection once. Every request would otherwise re-resolve the same key against
        ;; `llm-providers`, so editing that connection mid-capture would move provider, endpoint or model
        ;; under the capture while every row kept one generator version. An unresolvable reference is left
        ;; unpinned: the generation call reports it far better than a second check here could.
        pinned-connection  (llm.provider/resolve-model-ref model-ref)
        pinned-version     (generate/generator-version model-ref)
        pinned-code-hash   (generation-code-hash)
        pinned-corpus-hash (corpus/corpus-hash corpus)
        results  (with-pinned-connection pinned-connection
                   #(mt/with-dynamic-fn-redefs [settings/llm-call-opts (constantly call-opts)]
                      (mapv (fn [{:keys [corpus-key]}]
                              (try
                                (let [{:keys [ai_context usage] :as result}
                                      (generate/generate-context (candidate-for corpus ids corpus-key))]
                                  {:corpus-key        corpus-key
                                   :ai-context        ai_context
                                   :generator-version (:generator-version result)
                                   :usage             usage})
                                (catch Exception e
                                  (cond
                                    (interrupted-exception? e)
                                    (do
                                      (.interrupt (Thread/currentThread))
                                      (throw e))

                                    (fatal-error e)
                                    (throw (fatal-error e))

                                    :else
                                    {:corpus-key corpus-key
                                     :error      (ex-message e)
                                     :usage      (:usage (ex-data e))}))))
                            entities)))
        drifted  (into {}
                       (keep (fn [{:keys [corpus-key generator-version]}]
                               (when (and generator-version (not= generator-version pinned-version))
                                 [corpus-key generator-version])))
                       results)
        _        (when (seq drifted)
                   (throw (ex-info "Generator identity changed mid-capture; refusing to write a mixed snapshot"
                                   {:pinned-generator-version pinned-version
                                    :drifted                  drifted})))
        _        (assert-capture-provenance-unchanged! pinned-code-hash pinned-corpus-hash corpus)
        snapshot (into (sorted-map)
                       (keep (fn [{:keys [corpus-key ai-context]}]
                               (when ai-context [corpus-key ai-context])))
                       results)
        metadata (cond-> {:model-ref            model-ref
                          :generator-version    pinned-version
                          :generation-code-hash pinned-code-hash
                          :corpus-hash          pinned-corpus-hash}
                   ;; Absent when the reference resolved to nothing, rather than recorded as an empty map.
                   pinned-connection
                   (assoc :connection (connection-identity pinned-connection)))
        artifact {:metadata metadata :contexts snapshot}
        path     (snapshot-path (or (:out-dir opts) default-snapshot-dir) model-ref)
        content  (snapshot-content artifact)]
    (io/make-parents path)
    ;; CREATE_NEW makes accidental overwrite impossible even if a path collision is forced. The UUID
    ;; normally gives every capture its own reviewable artifact.
    (try
      (let [^"[Ljava.nio.file.OpenOption;" options
            (into-array OpenOption [StandardOpenOption/CREATE_NEW StandardOpenOption/WRITE])]
        (Files/write (.toPath (io/file path))
                     (.getBytes ^String content StandardCharsets/UTF_8)
                     options))
      (catch FileAlreadyExistsException e
        (throw (ex-info "Generated snapshot path already exists; refusing to overwrite it"
                        {:reason :snapshot-exists, :path path}
                        e))))
    {:path     path
     :metadata metadata
     :coverage (generated-coverage corpus snapshot)
     :errors   (into {}
                     (keep (fn [{:keys [corpus-key error]}] (when error [corpus-key error])))
                     results)
     :usage    (transduce (keep :usage)
                          (fn
                            ([acc] acc)
                            ([acc usage] (merge-with + acc usage)))
                          {:input-tokens 0 :output-tokens 0}
                          results)}))
