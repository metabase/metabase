(ns mage.generate-docs
  "Regenerates the docs that are built from source: environment variables, the config template, the API, AI providers,
  MCP tools, CLI commands, the usage analytics reference, and the embedding SDK and EAJS references."
  (:refer-clojure :exclude [run!])
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;; .github/scripts/check-preresolve-aliases.sh reads the `clojure` alias out of this file.
;; CI runs this list from master on each target branch, so every target branch needs each command.
(def ^:private suites
  "Each suite and its command, in the order the bare `generate-docs` command runs them."
  [;; One JVM runs every Clojure generator, so Metabase's namespaces load once rather than once per document.
   ["backend"         ["clojure" "-M:ee:doc" "all-documentation"]]
   ;; `./bin/mage` installs `bin/bb` in its own checkout only, not in the `--dir` checkout.
   ["usage-analytics" [(str (fs/path u/project-root-directory "bin" "bb")) "bin/generate-usage-analytics-docs.bb"]]
   ["embedding-sdk"   ["bun" "run" "embedding-sdk:docs:generate"]]
   ["embedding-eajs"  ["bun" "run" "embedding-eajs:docs:generate"]]])

(def ^:private suite->command (into {} suites))

(def suite-names
  "Every suite name, in the order the bare `generate-docs` command runs them."
  (mapv first suites))

(defn- run-suite!
  "Run one suite and return its exit code.
  A command that cannot be started, or that `sh` times out, counts as a failure rather than aborting the run."
  [sh suite]
  (println "Generating" suite "docs")
  (let [exit (try
               (:exit (apply sh (suite->command suite)))
               (catch Exception e
                 (println "Could not generate" suite "docs --" (ex-message e))
                 1))]
    (when (zero? exit)
      (println "Generated" suite "docs"))
    exit))

(defn run-suites!
  "Run every suite in `names`, in order, with `sh`, a [[mage.shell/sh*]]-compatible function, and return the names of
  the suites that failed. A failing suite does not stop the others."
  [sh names]
  (let [failed (into [] (remove #(zero? (run-suite! sh %))) names)]
    (when (seq failed)
      (println "Failed:" (str/join ", " failed)))
    failed))

(defn run!
  "Generate the docs for `suite`, or for every suite when `suite` is nil.
  The suites run in the checkout at `dir`, or in this checkout when `dir` is nil.
  Exits nonzero when any suite fails."
  [suite {:keys [dir]}]
  (let [sh (if dir
             (partial shell/sh* {:dir dir})
             shell/sh*)]
    (when (seq (run-suites! sh (if suite [suite] suite-names)))
      (u/exit 1))))
