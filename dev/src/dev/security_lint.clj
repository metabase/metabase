(ns dev.security-lint
  "Entry point for the security linter.

  Local use:

      (require '[dev.security-lint :as sec])
      (sec/scan)                                   ; everything, text output
      (sec/scan {:paths [\"src/metabase/util\"]})    ; one subtree
      (sec/scan {:sarif-out \"/tmp/security.sarif\"}) ; also write SARIF

  The three layers underneath are deliberately separate: rules decide what is a finding, the engine finds candidate
  call sites, and the reporters render them. This namespace only wires them together."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.rule :as rule]
   [dev.security-lint.rules :as rules]
   [dev.security-lint.sarif :as sarif]))

(set! *warn-on-reflection* true)

(defn default-paths
  "Production source: core, enterprise, and every driver module's source. Test code deliberately does insecure
  things, and the engine skips it.

  The driver modules are easy to forget and not safe to: druid-jdbc calls clj-http directly. A function rather
  than a constant so the list is read from disk when a scan runs, not when this namespace loads."
  []
  (into ["src" "enterprise/backend/src"]
        (for [driver (sort (or (.list (io/file "modules/drivers")) []))
              :let   [src (str "modules/drivers/" driver "/src")]
              :when  (.isDirectory (io/file src))]
          src)))

(defn failing?
  "True if any finding is severe enough to fail a run."
  [findings]
  (boolean (some #(= :error (:severity %)) findings)))

(defn summarize
  "Finding counts by severity."
  [findings]
  (into {} (map (fn [[k v]] [k (count v)])) (group-by :severity findings)))

(defn restrict-to-files
  "Only the findings whose file is one of `files` (repo-relative). The analysis behind them still covers the
  whole tree; this narrows what is *reported*, which is what a changed-files or pull-request scan wants."
  [root files findings]
  (let [root  (str (str/replace (or root "") #"/+$" "") "/")
        rel   (fn [^String f] (str/replace (if (str/starts-with? f root) (subs f (count root)) f)
                                           #"^(\./)+" ""))
        wanted (set (map rel files))]
    (filter #(contains? wanted (rel (:file %))) findings)))

(defn scan
  "Run every registered rule over `paths` and report.

  Options:
    :paths     - defaults to `default-paths`
    :rules     - defaults to every registered rule
    :sarif-out - if set, also write a SARIF report there
    :root      - repo root, used to relativize paths (defaults to the working directory)
    :quiet?    - suppress the text report
    :taint-sources - :call-graph (default) or :any-local; which bindings count as attacker-influenced
    :only-files - report only findings in these repo-relative files; the whole tree is still analyzed, because
                  taint and reachability are whole-program and a changed helper can flip an unchanged endpoint.
                  The text report, the summary and the exit status are narrowed; the SARIF report is not, so
                  that code scanning can compare a pull request's analysis with its base's and show only what
                  the pull request introduced.

  Returns {:findings ... :summary ... :failing? ...}."
  [& [{:keys [paths sarif-out root quiet? taint-sources only-files] :as opts}]]
  (rules/all)
  (let [started  (java.time.Instant/now)
        root     (or root (System/getProperty "user.dir"))
        paths    (or paths (default-paths))
        rules*   (or (:rules opts) (rule/all))
        findings (engine/analyze {:paths         paths
                                  :rules         rules*
                                  :config-dir    ".clj-kondo"
                                  :taint-sources taint-sources
                                  :root          root})
        unparsed (:unparsed (meta findings))
        all      (vec (sort-by (juxt :file :row :col) findings))
        ;; a narrowing to no files reports nothing: a branch that changed no Clojure has no findings to show
        findings (cond->> all
                   (some? only-files) (restrict-to-files root only-files))]
    (when (seq unparsed)
      (println (format "Could not parse %d file(s); they were not scanned:" (count unparsed)))
      (doseq [f unparsed] (println "  " f)))
    (when-not quiet?
      (println (sarif/text findings {:root root})))
    (when sarif-out
      (sarif/write! (sarif/report all {:rules rules* :root root :started started :ended (java.time.Instant/now)}) sarif-out)
      (println "Wrote SARIF to" sarif-out))
    {:findings findings
     :summary  (summarize findings)
     :failing? (failing? findings)
     :unparsed unparsed}))

(defn reload-order
  "Every `dev.security-lint*` namespace, dependencies first, this one last.

  Read from the ns forms on disk rather than from what the REPL has loaded, so a namespace added since the REPL
  started is included and a dependency between two of them is never missed."
  []
  (let [decls (->> (ns.find/find-ns-decls-in-dir (io/file "dev/src/dev"))
                   (filter #(re-find #"^dev\.security-lint" (str (ns.parse/name-from-ns-decl %)))))
        graph (reduce (fn [g decl]
                        (let [n (ns.parse/name-from-ns-decl decl)]
                          (reduce #(ns.deps/depend %1 n %2) (ns.deps/depend g n ::root) (ns.parse/deps-from-ns-decl decl))))
                      (ns.deps/graph)
                      decls)
        ours  (set (map ns.parse/name-from-ns-decl decls))]
    (filterv ours (ns.deps/topo-sort graph))))

(defn reload!
  "Reload the whole linter from source, dependencies first.

  `(require 'dev.security-lint :reload)` reloads only this namespace: an edited rule, the engine or the SARIF
  reporter keep running as whatever the REPL loaded last. Call this before `scan` when iterating on the linter in
  the REPL. The mage task does not use the REPL; it runs a fresh JVM."
  []
  ;; Reloading a rule namespace replaces its rules by id, so a rule renamed or deleted on disk -- or every rule,
  ;; when the id prefix changes -- would otherwise stay registered under its old id beside the new one.
  (reset! rule/*registry* {})
  (doseq [n (reload-order)]
    (require n :reload))
  (rule/all))

(defn scan-summary
  "Run a scan, print the report, and return just the counts.

  The mage task evaluates this over nREPL and reads the returned map, so it deliberately leaves `:findings` out --
  the full set would be printed back as the nREPL value."
  [& [opts]]
  (let [{:keys [summary failing?]} (scan opts)]
    {:summary summary :failing? failing?}))

(defn cli!
  "Entry point for `clojure -X:dev dev.security-lint/cli!`, used by `./bin/mage security-lint` when no dev REPL is
  running. Exits non-zero when an `:error` finding is present unless `:warn-only` is set."
  [{:keys [warn-only] :as opts}]
  (let [{:keys [failing?]} (scan (dissoc opts :warn-only))]
    (System/exit (if (and failing? (not warn-only)) 1 0))))
