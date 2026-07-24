(ns metabase-enterprise.osi-generation.benchmark.runner
  "End-to-end runner for the OSI-generation benchmark: materialize the corpus, apply an arm, reconcile an
  isolated pgvector index, run every query through the production retrieval tool, and score.

  What it scores is the production retrieval surface — `retrieve-library-entities-tool`'s rank-ordered
  `:structured-output :data` — so the dedupe, the over-fetch factor and the weak-confidence flag are all
  inside the measurement, because those are the things `ai_context` moves.

  Isolation is an invariant of the entry points, not a caller precondition: every
  [[run-arm!]] creates, binds and tears down its own vector+meta tables ([[with-isolated-index]]) and its
  own library membership (`corpus/with-corpus-library`), and pins the embedding model for the whole run —
  a documented reviewer run can never read or corrupt the real `library_entity_index`, and never sends
  non-corpus metadata to an external embedder.

  [[run-comparison!]] is the entry point a reviewer runs (via `dev.osi-generation.benchmark/compare!`,
  which prints the table); the quality number is provider- and model-dependent, so it is a REPL run
  pasted into the PR description, never a CI assertion (four toy mock dimensions cannot support a
  quality claim)."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.entity-retrieval.index-table :as index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase-enterprise.osi-generation.benchmark.arms :as arms]
   [metabase-enterprise.osi-generation.benchmark.corpus :as corpus]
   [metabase-enterprise.osi-generation.benchmark.metrics :as metrics]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (clojure.lang ExceptionInfo)
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Isolation ---------------------------------------------------

(defn- assert-index-tables-absent!
  [ds]
  (doseq [table [(index-table/vectors-table) (index-table/meta-table)]]
    (when (:relation (jdbc/execute-one! ds ["SELECT to_regclass(?) AS relation" table]
                                        {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
      (throw (ex-info (str "Refusing to reuse existing benchmark index table " table)
                      {:reason :benchmark-table-exists, :table table}))))
  true)

(defmacro ^:private with-isolated-index
  "Bind freshly-named, per-invocation pgvector vector+meta tables for `body`, dropping them on exit and
  yielding the datasource to `ds-sym`; no-op returning nil when no pgvector store is configured.

  This is the benchmark's isolation invariant: every arm creates and tears down its
  *own* index, so a reviewer run can never read, touch, or corrupt the real library index, and two arms
  in one comparison never share tables. Isolation lives here, at the entry points, precisely so it is not
  a caller precondition a reviewer can forget."
  [[ds-sym] & body]
  `(when (semantic.db.datasource/pgvector-configured?)
     (let [suffix# (str/replace (str (UUID/randomUUID)) "-" "")
           ~ds-sym (semantic.db.datasource/ensure-initialized-data-source!)]
       (binding [index-table/*tables* {:schema  index-table/index-schema
                                       :vectors (str index-table/index-schema ".library_entity_index_bench_" suffix#)
                                       :meta    (str index-table/index-schema ".library_entity_index_meta_bench_" suffix#)}]
         (try
           (assert-index-tables-absent! ~ds-sym)
           ~@body
           (finally
             (jdbc/execute! ~ds-sym [(str "DROP TABLE IF EXISTS "
                                          (index-table/vectors-table-sql) ", "
                                          (index-table/meta-table-sql))])))))))

(def ^:private default-tool-limit
  "Distinct entities pulled per query when scoring — the tool's own max, so recall@k has headroom."
  20)

(defn- normalize-opts
  [opts]
  (let [tool-limit (or (:tool-limit opts) default-tool-limit)]
    (when-not (and (int? tool-limit)
                   (<= metrics/rank-k tool-limit default-tool-limit))
      (throw (ex-info (format "Benchmark tool limit must be an integer between %d and %d"
                              metrics/rank-k default-tool-limit)
                      {:reason :invalid-tool-limit
                       :value  (:tool-limit opts)})))
    (assoc opts :tool-limit tool-limit)))

(def ^:private ollama-base-url
  "Where [[ollama-artifact-identity]] probes. Matches the host the embedding provider hard-codes."
  "http://localhost:11434")

(defn- ollama-get-json
  [path]
  (-> (http/get (str ollama-base-url path)
                {:socket-timeout 5000 :connection-timeout 5000 :accept :json})
      :body
      (json/decode true)))

(defn- ollama-artifact-identity
  "The digest and runtime version Ollama is actually serving `model-name` from, as
  `{:model-digest _ :runtime-version _}`.

  A seam: tests redefine this rather than standing up a server. Throws when Ollama cannot be reached or
  does not serve the model, because an unverifiable run must not be scored as a verified one."
  [model-name]
  (let [{:keys [models]} (try
                           (ollama-get-json "/api/tags")
                           (catch Exception e
                             (throw (ex-info "Could not reach Ollama to verify benchmark model provenance"
                                             {:reason   :ollama-unreachable
                                              :base-url ollama-base-url}
                                             e))))
        ;; A bare name is served by its `:latest` tag, which is how `/api/tags` reports it.
        wanted  #{model-name (str model-name ":latest")}
        served  (first (filter (comp wanted :name) models))]
    (when-not served
      (throw (ex-info "Ollama does not serve the benchmark model"
                      {:reason     :model-not-served
                       :model-name model-name
                       :served     (mapv :name models)})))
    {:model-digest    (:digest served)
     :runtime-version (:version (ollama-get-json "/api/version"))}))

(defn- assert-model-artifact-identity!
  "Pin what an Ollama benchmark actually ran against.

  `embedding-space-id` hashes only provider/model-name/dimensions/model-revision, so two runs against the
  same Ollama tag backed by different digests carry the *same* space id and read as comparable. The digest
  and runtime version are the only things that tell them apart, so they are required — and verified
  against the server rather than trusted, since a stale hand-copied digest would defeat the point."
  [model]
  (if-not (= "ollama" (:provider model))
    model
    (let [missing (remove #(not (str/blank? (get model %))) [:model-digest :runtime-version])]
      (when (seq missing)
        (throw (ex-info "Ollama benchmark models require :model-digest and :runtime-version provenance"
                        {:reason  :missing-model-artifact-identity
                         :missing (vec missing)
                         :model   model})))
      (let [actual (ollama-artifact-identity (:model-name model))
            drift  (into {}
                         (keep (fn [k]
                                 (when (not= (get model k) (get actual k))
                                   [k {:declared (get model k) :actual (get actual k)}])))
                         [:model-digest :runtime-version])]
        (when (seq drift)
          (throw (ex-info "Ollama is serving a different artifact than the benchmark declared"
                          {:reason :model-artifact-drift
                           :model-name (:model-name model)
                           :drift  drift})))
        model))))

(defn- resolved-benchmark-model
  "The immutable vector-space descriptor to pin for a run.

  The index metadata row stores `embedding_space_id` NOT NULL and a configured model carries no such id,
  so a raw model has to be resolved first. The SPI's descriptor is closed, so Ollama's artifact
  provenance — which [[assert-model-artifact-identity!]] demands and the manifest reports — is carried
  across by hand."
  [requested]
  (merge (semantic.embedding/resolve-model requested)
         (select-keys requested [:model-digest :runtime-version])))

(defn- effective-query-prefix
  "The prefix the tool prepends to every benchmark query, resolved once for the whole comparison.

  `ee-embedding-query-prefix` is an instance-wide override describing the instance's own configured
  model, so it is ignored when the benchmark pins a different one — otherwise a run silently embeds its
  queries under a prefix chosen for a model nobody selected. Recorded in the manifest either way, since
  it changes what the numbers mean."
  [model pinned-model?]
  (if pinned-model?
    ;; Read the model family's own default rather than blanking the setting to discover it — the setting is
    ;; site-wide, and a benchmark must not mutate what concurrent requests are reading.
    (or (#'semantic.embedding/default-query-prefix (:model-name model)) "")
    (semantic.embedding/prefix-search-query model "")))

;;; -------------------------------------------------- Manifest ---------------------------------------------------

(defn- git-output
  [& args]
  (try
    (let [{:keys [exit out err]} (apply shell/sh "git" args)]
      (when-not (zero? exit)
        (throw (ex-info "Git provenance command failed"
                        {:reason :git-provenance-failed
                         :args   args
                         :exit   exit
                         :error  (str/trim err)})))
      (str/trim out))
    (catch Exception e
      (when (some #(instance? InterruptedException %)
                  (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e))))
        (.interrupt (Thread/currentThread)))
      (throw e))))

(defn- git-state
  "Committed identity plus visible checkout state. The status includes untracked files; the diff hash
  covers deterministic staged and unstaged changes to tracked files."
  []
  (let [sha    (git-output "rev-parse" "HEAD")
        status (git-output "status" "--porcelain=v1")
        diff   (git-output "diff" "--binary" "--no-ext-diff" "HEAD" "--")]
    {:sha              sha
     :dirty?           (boolean (seq status))
     :tracked-diff-sha (when (seq diff)
                         (-> diff buddy-hash/sha256 codecs/bytes->hex))}))

(defn- corpus-file-sha [dir basename]
  (some-> (io/resource (str dir "/" basename))
          slurp
          buddy-hash/sha256
          codecs/bytes->hex))

(defn- snapshot-sha
  [artifact]
  (some-> artifact corpus/canonical-pr-str buddy-hash/sha256 codecs/bytes->hex))

(defn- benchmark-provenance
  "Corpus-resource and checkout identities for one complete benchmark run. Compute this before any
  scoring, reuse it in every arm manifest, and compare it with a fresh value after each arm and the
  full comparison so a mid-run edit cannot be misreported as the state that produced every score."
  [opts]
  (let [dir (or (:dir opts) corpus/default-dir)]
    {:corpus-sha (into {}
                       (map (fn [basename] [basename (corpus-file-sha dir basename)]))
                       ["corpus.edn" "queries.edn" "baseline.edn"])
     :git-state  (git-state)}))

(defn- assert-benchmark-provenance-unchanged!
  [pinned opts]
  (let [current (benchmark-provenance opts)]
    (when-not (= pinned current)
      (throw (ex-info "Corpus or checkout changed during the benchmark; refusing a mixed-provenance report"
                      {:reason  :benchmark-provenance-changed
                       :pinned  pinned
                       :current current}))))
  true)

(defn manifest
  "The reproducibility record stamped onto every run: embedding provider/model,
  `index-table/schema-version`, the three corpus-file SHAs, generated-snapshot path/content hash/generation
  identity (nil for snapshot-less arms), the tool limit, and the git SHA plus dirty-checkout evidence.
  A quoted benchmark figure is meaningless without it — the number is only comparable within one
  provider/model/embedding-space/schema-version tuple. All
  values are data, so it round-trips into the EDN report a reviewer reads."
  [model arm opts corpus]
  (let [{:keys [corpus-sha git-state]} (or (:benchmark-provenance opts)
                                           (benchmark-provenance opts))]
    ;; The provider SPI's resolved descriptor is closed, so these are exactly its identity fields.
    ;; `embedding-space-id` is the one that matters: two spaces can share a provider, model name and
    ;; dimension count and still produce incomparable vectors, which would make two runs look alike.
    {:embedding-model (select-keys model [:provider :model-name :vector-dimensions
                                          :model-revision :embedding-space-id :embedding-spi-version
                                          :model-digest :runtime-version])
     :query-prefix    (:query-prefix opts)
     :schema-version  index-table/schema-version
     :corpus-sha      corpus-sha
     :snapshot        (when (= :generated arm)
                        (let [artifact {:metadata (:generated-snapshot-metadata corpus)
                                        :contexts (:generated-snapshot corpus)}]
                          {:path       (:snapshot opts)
                           :sha256     (snapshot-sha artifact)
                           :generation (:metadata artifact)}))
     :tool-limit      (:tool-limit opts)
     :git-sha         (:sha git-state)
     :git-dirty?      (:dirty? git-state)
     :git-diff-sha    (:tracked-diff-sha git-state)}))

;;; -------------------------------------------------- Scoring ----------------------------------------------------

(defn- run-query
  "Run one benchmark query through the production tool and return its `:structured-output`.
  Throws when the tool reports the search unavailable (no structured output) — an outage must fail the
  run, never score as an empty library."
  [query opts]
  (when-not (entity-retrieval/entity-retrieval-available?)
    (throw (ex-info "Library retrieval became unavailable during the benchmark"
                    {:reason :retrieval-unavailable, :query (:id query)})))
  (let [result     (tools.entity-retrieval/retrieve-library-entities-tool
                    {:user_search_prompt (:prompt query)
                     :limit              (:tool-limit opts)})
        structured (or (:structured-output result)
                       (throw (ex-info "Retrieval tool returned no structured output — search unavailable mid-run"
                                       {:reason :retrieval-unavailable
                                        :query  (:id query)
                                        :output (:output result)})))]
    (when-not (entity-retrieval/entity-retrieval-available?)
      (throw (ex-info "Library retrieval became unavailable during the benchmark"
                      {:reason :retrieval-unavailable, :query (:id query)})))
    ;; A reconciled benchmark index is non-empty and vector search always returns nearest neighbours,
    ;; including for out-of-domain prompts. Empty structured data is therefore an availability failure,
    ;; not a valid zero-quality result.
    (when (empty? (:data structured))
      (throw (ex-info "Retrieval returned no results from a populated benchmark index"
                      {:reason :retrieval-unavailable, :query (:id query)})))
    structured))

(defn- judged-entity-keys
  "Translate a query's corpus-key judgments to the entity-key -> grade map [[metrics/score-query]]
  compares rankings against."
  [query ids]
  (into {}
        (map (fn [[corpus-key grade]]
               (let [{:keys [entity_type entity_local_id]} (get ids corpus-key)]
                 [(entity-retrieval/entity-class entity_type entity_local_id) grade])))
        (:judged query)))

(defn- assert-generated-coverage!
  "Refuse to score the `:generated` arm from a missing or partial snapshot.
  An entity absent from the snapshot would carry no `ai_context` and behave exactly as `:none`, silently
  averaging the floor into the `:generated` score — so scoring requires complete coverage, and the gap is
  reported (in `ex-data` and by [[run-comparison!]]) instead of blended."
  [corpus]
  (let [snapshot (:generated-snapshot corpus)]
    (when-not snapshot
      (throw (ex-info "No generated snapshot configured — capture one and pass :snapshot / :snapshot-data"
                      {:reason :no-snapshot})))
    (let [coverage (arms/generated-coverage corpus snapshot)]
      (when-not (:complete? coverage)
        (throw (ex-info (str "Partial generated snapshot ("
                             (count (:missing coverage)) " of "
                             (+ (count (:covered coverage)) (count (:missing coverage)))
                             " entities missing): refusing to score it as the :generated arm")
                        {:reason   :incomplete-coverage
                         :coverage coverage}))))))

(defn- assert-snapshot-matches-corpus!
  "Refuse to score a snapshot without complete, current capture metadata. A valid snapshot names the
  corpus content, provider/model, and generator version. This catches snapshots captured before a corpus,
  prompt, or generator change even when their entity keys still provide full coverage."
  [corpus]
  (let [{:keys [corpus-hash model-ref generator-version generation-code-hash] :as metadata}
        (:generated-snapshot-metadata corpus)]
    (when-not (and (map? metadata)
                   (string? corpus-hash)
                   (not (str/blank? corpus-hash))
                   (string? model-ref)
                   (not (str/blank? model-ref))
                   (string? generator-version)
                   (not (str/blank? generator-version))
                   (string? generation-code-hash)
                   (not (str/blank? generation-code-hash)))
      (throw (ex-info (str "Generated snapshot metadata must include nonblank :corpus-hash, "
                           ":model-ref, :generator-version, and :generation-code-hash values")
                      {:reason   :invalid-snapshot-metadata
                       :metadata metadata})))
    (let [actual-corpus-hash (corpus/corpus-hash corpus)
          current-version    (generate/generator-version model-ref)
          current-code-hash  (arms/generation-code-hash)]
      (when (not= corpus-hash actual-corpus-hash)
        (throw (ex-info "Generated snapshot was captured from a different corpus — re-run capture-generated!"
                        {:reason               :stale-snapshot
                         :recorded-corpus-hash corpus-hash
                         :actual-corpus-hash   actual-corpus-hash})))
      (when (not= generator-version current-version)
        (throw (ex-info "Generated snapshot uses an older generator or prompt — re-run capture-generated!"
                        {:reason                     :stale-generator
                         :model-ref         model-ref
                         :recorded-generator-version generator-version
                         :current-generator-version  current-version})))
      (when (not= generation-code-hash current-code-hash)
        (throw (ex-info "Generated snapshot uses older generation code — re-run capture-generated!"
                        {:reason                        :stale-generator
                         :recorded-generation-code-hash generation-code-hash
                         :current-generation-code-hash  current-code-hash}))))))

(defn- expected-index-doc-ids
  []
  (into #{}
        (map :doc_id)
        (mapcat #(spec/project :library-index %)
                (spec/hydrate :library-index (spec/member-entities :library-index)))))

(defn- actual-index-doc-ids
  [ds]
  (into #{}
        (map :doc_id)
        (jdbc/execute! ds [(format "SELECT doc_id FROM %s" (index-table/vectors-table-sql))]
                       {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- assert-index-coverage!
  [expected actual]
  (let [missing    (set/difference expected actual)
        unexpected (set/difference actual expected)]
    (when (or (seq missing) (seq unexpected))
      (throw (ex-info (str "Reconciled benchmark index does not exactly match the expected documents; "
                           (count missing) " missing, " (count unexpected) " unexpected")
                      {:reason         :index-coverage-mismatch
                       :expected-count (count expected)
                       :actual-count   (count actual)
                       :missing        missing
                       :unexpected     unexpected}))))
  true)

(defn- score-arm!
  [corpus arm opts]
  (with-isolated-index [ds]
    (mt/with-premium-features #{:library :library-retrieval}
      ;; `with-corpus-library` already suppresses the nudge its own writes and deletes fire. This is the
      ;; outer belt: a stray targeted sync from anywhere else in the run would reconcile the REAL index
      ;; with the REAL model on a background thread where none of this run's bindings apply.
      (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [& _] nil)]
        (corpus/with-corpus-library [ids corpus]
          ;; Resolved here as well as in `run-comparison!`: `run-arm!` is callable on its own, and a raw
          ;; model map would reach the index metadata row without the `embedding_space_id` it requires.
          ;; Re-resolving an already-resolved descriptor is idempotent, and throws if its space drifted.
          (let [model (resolved-benchmark-model
                       (or (:model opts) (semantic.embedding/get-configured-model)))]
            ;; The tool's query path resolves the model itself; pin it to this run's model so query
            ;; embeddings always match the index the arm just built.
            (mt/with-dynamic-fn-redefs [semantic.embedding/get-configured-model (constantly model)]
              (arms/apply-arm! arm corpus ids)
              (let [expected (expected-index-doc-ids)
                    diff     (reconcile/reconcile! ds (constantly model))
                    _        (assert-index-coverage! expected (actual-index-doc-ids ds))
                    scored (mt/with-test-user :crowberto
                             (mapv (fn [query]
                                     (metrics/score-query
                                      (assoc query :judged (judged-entity-keys query ids))
                                      (run-query query opts)))
                                   (:queries corpus)))]
                {:arm       arm
                 :summary   (metrics/summarize scored)
                 :per-query scored
                 :index     (select-keys diff [:documents :entities])
                 :manifest  (manifest model arm opts corpus)}))))))))

(defn run-arm!
  "Materialize `corpus`, apply `arm`, reconcile an isolated index, run every query through the
  production tool, and score. Returns
  `{:arm _ :summary _ :per-query [...] :index {:documents n :entities n} :manifest {...}}`; nil when no
  pgvector store is configured.
  Self-isolating (see the namespace docstring): fresh index tables, fresh library membership, and the
  embedding model — `(:model opts)`, defaulting to the configured one — pinned for reconcile and query
  alike. For `:generated`, requires complete snapshot coverage ([[assert-generated-coverage!]]) and a
  snapshot whose required corpus and generator metadata matches the loaded code and corpus
  ([[assert-snapshot-matches-corpus!]])."
  [corpus arm opts]
  (let [opts              (normalize-opts opts)
        pinned-provenance (or (:benchmark-provenance opts) (benchmark-provenance opts))
        opts              (assoc opts :benchmark-provenance pinned-provenance)
        _                 (assert-benchmark-provenance-unchanged! pinned-provenance opts)]
    (when (= :generated arm)
      (assert-generated-coverage! corpus)
      (assert-snapshot-matches-corpus! corpus))
    (let [result (score-arm! corpus arm opts)]
      (assert-benchmark-provenance-unchanged! pinned-provenance opts)
      result)))

;;; ------------------------------------------------- Comparison --------------------------------------------------

(def regression-criteria
  "The provisional regression criteria for generated metadata, as data:
  on the holdout column, the `:generated` arm must be non-inferior to `:baseline` within `:margin` on
  each of `:metrics`, and strictly above `:none`. Complete snapshot coverage is enforced structurally
  by [[run-arm!]]. The current holdout has only three in-domain queries, so this is a review signal,
  not a statistically strong release decision."
  {:margin  0.05
   :metrics [:ndcg-at-10 :recall-at-10]})

(declare comparison-deltas)

(defn regression-gate
  "Evaluate [[regression-criteria]] over [[run-comparison!]]'s `:arms` map on the sealed holdout column.
  The heuristic uses the lower bound of the paired-bootstrap ranges: baseline→generated must be at
  least `-margin`, and none→generated must be above zero. At the current sample size those ranges are
  descriptive, not reliable confidence bounds. A missing arm, metric, or range fails rather than
  passing vacuously."
  ([arm-results]
   (regression-gate arm-results (comparison-deltas arm-results)))
  ([arm-results deltas]
   (let [{:keys [margin metrics]} regression-criteria
         column (fn [arm] (get-in arm-results [arm :summary :holdout]))
         checks (vec
                 (mapcat (fn [metric]
                           (let [generated   (get (column :generated) metric)
                                 baseline    (get (column :baseline) metric)
                                 floor       (get (column :none) metric)
                                 baseline-ci (get-in deltas [[:baseline :generated] :holdout metric :ci-95])
                                 floor-ci    (get-in deltas [[:none :generated] :holdout metric :ci-95])]
                             [{:check     :non-inferior-to-baseline
                               :metric    metric
                               :generated generated
                               :baseline  baseline
                               :margin    margin
                               :ci-95     baseline-ci
                               :pass?     (boolean (and (seq baseline-ci)
                                                        (>= (first baseline-ci) (- margin))))}
                              {:check     :above-none
                               :metric    metric
                               :generated generated
                               :none      floor
                               :ci-95     floor-ci
                               :pass?     (boolean (and (seq floor-ci) (pos? (first floor-ci))))}]))
                         metrics))]
     {:pass?  (every? :pass? checks)
      :checks checks})))

(def ^:private delta-pairs
  "Arm pairs [[run-comparison!]] reports paired-bootstrap deltas for (delta = second minus first)."
  [[:none :baseline] [:none :generated] [:baseline :generated]])

(defn- split-column [per-query holdout?]
  (filter #(= holdout? (:holdout %)) per-query))

(defn- deltas-between
  "Per-column paired-bootstrap deltas between two [[run-arm!]] results, nil unless both ran."
  [a b]
  (when (and (:per-query a) (:per-query b))
    (into {}
          (map (fn [column]
                 (let [holdout? (= :holdout column)]
                   [column (into {}
                                 (map (fn [metric]
                                        [metric (metrics/bootstrap-delta
                                                 (split-column (:per-query a) holdout?)
                                                 (split-column (:per-query b) holdout?)
                                                 metric)]))
                                 (:metrics regression-criteria))])))
          [:visible :holdout])))

(defn comparison-deltas
  "Paired-bootstrap deltas for every report arm pair. Public so [[regression-gate]] and tests use exactly the
  same intervals that [[run-comparison!]] reports."
  [arm-results]
  (into {}
        (keep (fn [[a b]]
                (when-let [deltas (deltas-between (arm-results a) (arm-results b))]
                  [[a b] deltas])))
        delta-pairs))

(defn run-comparison!
  "Run every arm over one corpus and return
  `{:arms {arm -> run-arm! result | {:skipped? true :reason _ ...}} :deltas {...} :regression-gate {...}}`.
  The reviewer-facing entry point; `dev.osi-generation.benchmark/compare!` wraps it and prints the
  human-readable table. Requires a configured pgvector store (throws otherwise, rather than silently
  scoring nothing).
  `:generated` is skipped with a reason when no snapshot is configured, and when the snapshot is partial
  its coverage gap is reported on the skip — never blended into a score. The
  paired-bootstrap deltas ([[metrics/bootstrap-delta]]) are reported per column so a small nDCG gap
  reads as noise, and [[regression-gate]] is evaluated once the `:generated` arm ran.
  Opts: `:dir` (corpus dir), `:model` (embedding model map), `:tool-limit`, `:snapshot` /
  `:snapshot-data` (the generated arm's captured snapshot)."
  [opts]
  (when-not (semantic.db.datasource/pgvector-configured?)
    (throw (ex-info (str "No pgvector-capable database is available — configure MB_PGVECTOR_DB_URL "
                         "or use a Postgres application database with the vector extension")
                    {})))
  (let [opts        (normalize-opts opts)
        pinned-provenance (benchmark-provenance opts)
        opts        (assoc opts :benchmark-provenance pinned-provenance)
        pinned-model? (some? (:model opts))
        model       (resolved-benchmark-model
                     (assert-model-artifact-identity!
                      (or (:model opts) (semantic.embedding/get-configured-model))))
        query-prefix (effective-query-prefix model pinned-model?)
        opts        (assoc opts :model model :query-prefix query-prefix)
        corpus      (corpus/load-corpus (or (:dir opts) corpus/default-dir))
        artifact    (arms/generated-snapshot-artifact opts)
        snapshot    (:contexts artifact)
        corpus      (cond-> corpus
                      snapshot (assoc :generated-snapshot snapshot
                                      :generated-snapshot-metadata (:metadata artifact)))
        ;; Pin the resolved prefix for every arm, so editing the setting mid-run cannot make two arms
        ;; incomparable — the manifest reports one prefix and every query used it. Redefined per thread
        ;; rather than written to the setting: that is site-wide, so a run would otherwise reach into
        ;; concurrent retrieval requests and race anything else changing it.
        arm-results (mt/with-dynamic-fn-redefs
                      [semantic.embedding/prefix-search-query (fn [_model s] (str query-prefix s))]
                      (into {}
                          (map (fn [arm]
                                 [arm (try
                                        (run-arm! corpus arm opts)
                                        (catch ExceptionInfo e
                                          ;; only the coverage guard's refusals downgrade to a reported
                                          ;; skip; anything else is a real failure
                                          (if-let [reason (#{:no-snapshot :incomplete-coverage}
                                                           (:reason (ex-data e)))]
                                            (merge {:skipped? true :reason reason}
                                                   (select-keys (ex-data e) [:coverage]))
                                            (throw e))))]))
                          arms/arms))
        deltas      (comparison-deltas arm-results)
        result      {:arms            arm-results
                     :deltas          deltas
                     :regression-gate (when (:summary (arm-results :generated))
                                        (regression-gate arm-results deltas))}]
    (assert-benchmark-provenance-unchanged! pinned-provenance opts)
    result))
