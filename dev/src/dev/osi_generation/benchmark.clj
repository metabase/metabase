(ns dev.osi-generation.benchmark
  "REPL entry point for the OSI-generation benchmark, matching the `dev.semantic-search.recall`
  entry-point style: keyword-arg aliases over the test-tree runner, plus the printed report.

  The scoring code lives in the test tree (not here) because the test runner excludes `dev/` and only
  discovers `^metabase.*` namespaces — a `dev.*` deftest never runs in CI. The test tree is on the
  classpath in a dev REPL, so this dev-tree alias can require it.

  The local reference provider is Ollama. A run must also record the installed model digest and Ollama
  runtime version: the human-friendly model tag is mutable and is not an artifact identity by itself.
  Re-run once against ai-service before quoting a number in a PR, and quote it with its manifest."
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.osi-generation.benchmark.arms :as bench.arms]
   [metabase-enterprise.osi-generation.benchmark.corpus :as bench.corpus]
   [metabase-enterprise.osi-generation.benchmark.runner :as runner]))

(def reference-embedding-model
  "The local reference embedder. [[compare!]] adds the caller-supplied model digest and runtime identity."
  {:provider          "ollama"
   :model-name        "mxbai-embed-large"
   :vector-dimensions 1024})

(defn- fmt3 [x]
  (when x (format "%.3f" (double x))))

(defn- comparison-rows [arm-results]
  (for [arm  bench.arms/arms
        :let [{:keys [skipped? reason summary index]} (arm-results arm)]]
    (if skipped?
      {:arm arm, :status (name reason)}
      (let [{:keys [visible holdout]} summary]
        {:arm              arm
         :status           "ran"
         :docs             (:documents index)
         :vis-n            (:n visible)
         :vis-hit-at-1     (fmt3 (:hit-at-1 visible))
         :vis-mrr          (fmt3 (:mrr visible))
         :vis-recall-at-10 (fmt3 (:recall-at-10 visible))
         :vis-ndcg-at-10   (fmt3 (:ndcg-at-10 visible))
         :hold-n           (:n holdout)
         :hold-ndcg-at-10  (fmt3 (:ndcg-at-10 holdout))
         :weak-tp          (:weak-flag/true-positive summary)
         :weak-fp          (:weak-flag/false-positive summary)}))))

(defn print-comparison!
  "Print a [[runner/run-comparison!]] result as the table, deltas, and provisional regression signal."
  [{arm-results :arms, deltas :deltas, gate :regression-gate}]
  (pprint/print-table [:arm :status :docs :vis-n :vis-hit-at-1 :vis-mrr :vis-recall-at-10 :vis-ndcg-at-10
                       :hold-n :hold-ndcg-at-10 :weak-tp :weak-fp]
                      (comparison-rows arm-results))
  (println "\nPaired-bootstrap deltas (positive = second arm higher):")
  (pprint/pprint deltas)
  (when gate
    (println "\nProvisional regression signal (holdout column):")
    (pprint/pprint gate))
  (when-let [manifest (or (get-in arm-results [:generated :manifest])
                          (some :manifest (vals arm-results)))]
    (println "\nManifest:")
    (pprint/pprint manifest)))

(defn compare!
  "Run every arm over the corpus via
  [[metabase-enterprise.osi-generation.benchmark.runner/run-comparison!]], print the table, and return
  `{:arms _ :deltas _ :regression-gate _}`.
  Opts: `:dir` (corpus dir), `:model` (embedding model map), `:model-digest` and `:runtime-version`
  (required with the default [[reference-embedding-model]]; obtain them from `ollama list` and
  `ollama --version`), `:tool-limit`, `:snapshot` / `:snapshot-data` (the generated arm's captured snapshot).
  Needs a configured pgvector store and a running ollama (or an explicit `:model`) — a mock model cannot
  support a quality claim."
  [& {:as opts}]
  (let [model (or (:model opts)
                  (merge reference-embedding-model
                         (select-keys opts [:model-digest :runtime-version])))]
    (doto (runner/run-comparison! (assoc opts :model model))
      (print-comparison!))))

(defn capture!
  "Capture the `:generated` arm's snapshot: materialize the corpus, run the production generator over every
  entity with the instance's configured OSI-generation LLM, and write the snapshot EDN. Returns
  `{:path _ :coverage _ :errors _ :usage _}` — pass `:snapshot` = `:path` to [[compare!]].
  The only entry point that calls an LLM; needs the `osi-generation` provider credentials configured.
  Opts: `:dir` (corpus dir), `:out-dir` (snapshot dir)."
  [& {:as opts}]
  (let [corpus (bench.corpus/load-corpus (or (:dir opts) bench.corpus/default-dir))]
    (bench.corpus/with-corpus-library [ids corpus]
      (bench.arms/capture-generated! corpus ids opts))))
