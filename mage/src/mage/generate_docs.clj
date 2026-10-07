(ns mage.generate-docs
  "Regenerates the docs that are built from source: environment variables, the config template, the API, AI providers,
  MCP tools, CLI commands, the usage analytics reference, and the embedding SDK and EAJS references.
  The backend suite runs at the same time as the other suites, so their output lines mix."
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;; .github/scripts/check-preresolve-aliases.sh reads the `clojure` alias out of this file.
(def ^:private suites
  "Each suite and its command, in the order the bare `generate-docs` command starts them."
  [;; One JVM runs every Clojure generator, so Metabase's namespaces load once rather than once per document.
   ["backend"         ["clojure" "-M:ee:doc" "all-documentation"]]
   ;; `./bin/mage` installs `./bin/bb` at the version bb.edn requires.
   ["usage-analytics" ["./bin/bb" "bin/generate-usage-analytics-docs.bb"]]
   ["embedding-sdk"   ["bun" "run" "embedding-sdk:docs:generate"]]
   ["embedding-eajs"  ["bun" "run" "embedding-eajs:docs:generate"]]])

(def ^:private suite->command (into {} suites))

(def suite-names
  "Every suite name, in the order the bare `generate-docs` command starts them."
  (mapv first suites))

;; The backend suite uses only the JVM, and the other suites use Babashka and Bun, so they can run at the same time.
(def ^:private parallel-suites #{"backend"})

(defn- say
  "Print `args` as one line.
  [[mage.shell/sh*]] prints each output line while it holds the `*out*` lock, so this holds it too, and lines from
  suites that run at the same time do not break into parts."
  [& args]
  (locking *out*
    (apply println args)))

(defn- run-suite!
  "Run one suite and return its exit code.
  A command that cannot be started, or that `sh` times out, counts as a failure rather than aborting the run."
  [sh suite]
  (say "Generating" suite "docs")
  (let [exit (try
               (:exit (apply sh (suite->command suite)))
               (catch Exception e
                 (say "Could not generate" suite "docs --" (ex-message e))
                 1))]
    (when (zero? exit)
      (say "Generated" suite "docs"))
    exit))

(defn run-suites!
  "Run every suite in `names` with `sh`, a [[mage.shell/sh*]]-compatible function, and return the names of the
  suites that failed, in the order of `names`.
  Each suite in `parallel-suites` runs at the same time as the other suites, which run one after another.
  A failing suite does not stop the others."
  [sh names]
  (let [lanes  (remove empty? (cons (remove parallel-suites names)
                                    (map vector (filter parallel-suites names))))
        exits  (->> lanes
                    (mapv (fn [lane]
                            (future
                              (into {} (map (juxt identity #(run-suite! sh %))) lane))))
                    (map deref)
                    (apply merge))
        failed (into [] (remove (comp zero? exits)) names)]
    (when (seq failed)
      (say "Failed:" (str/join ", " failed)))
    failed))

(defn run!
  "Generate the docs for every suite, or just `suite`.
  Exits nonzero when any suite fails."
  ([]
   (run! nil))
  ([suite]
   (when (seq (run-suites! shell/sh* (if suite [suite] suite-names)))
     (u/exit 1))))
