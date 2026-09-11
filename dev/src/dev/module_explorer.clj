(ns dev.module-explorer
  "Interactive HTML explorer for the module tree and dependency graph.

  `./bin/mage modules-tree --html` builds it from the module config under Babashka.
  [[open!]] builds it in a dev REPL and adds namespace-level edges from `dev.deps-graph`, so the graph can show
  which API namespaces each consumer uses.
  Babashka loads this namespace too, which is why it resolves `dev.deps-graph` only inside [[open!]]."
  (:require
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.browse :as browse]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [hooks.common.modules :as modules]))

(set! *warn-on-reflection* true)

(defn module->tree-path
  "The path segments used to display `module` in the tree.

  An enterprise module appears under its OSS counterpart when one exists.
  Otherwise its full `enterprise/` name appears at the root."
  [modules-config module]
  (let [segments (str/split (name module) #"\.")]
    (if (= (namespace module) "enterprise")
      (if (contains? modules-config (symbol (first segments)))
        ;; Keep an enterprise subtree together under its OSS module.
        (into [(first segments) "enterprise"] (rest segments))
        (into [(str "enterprise/" (first segments))] (rest segments)))
      segments)))

(defn explicit-ns-prefix
  "Return a module's custom `:ns-prefix`, or `nil` when it uses the default."
  [modules-config module]
  (let [prefix (get-in modules-config [module :ns-prefix])]
    (when (and prefix (not= prefix (modules/default-ns-prefix module)))
      prefix)))

(defn- ns-prefix->source-dir
  "Repo-relative source directory for a namespace prefix: `metabase.lib-be` -> `src/metabase/lib_be`."
  [ns-prefix]
  (str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")
       "src/"
       (-> ns-prefix (str/replace "." "/") (str/replace "-" "_"))))

(defn- set-field->strings
  "Sort and stringify a set-valued config field, spelling out the `:any` and `:bypass` sentinels."
  [x]
  (cond
    (= x :any)    ["∗any"]
    (= x :bypass) ["∗bypass"]
    (set? x)      (vec (sort (map str x)))
    :else         []))

(defn- used-by-index
  "Reverse of every module's `:uses`: `module-string -> #{modules that :use it}`.
  A `:uses :any` module counts as using every other module."
  [modules-config]
  (let [all-modules (keys modules-config)]
    (reduce-kv (fn [acc m {:keys [uses]}]
                 (let [targets (cond
                                 (= uses :any) (remove #(= % m) all-modules)
                                 (set? uses)   uses
                                 :else         nil)]
                   (reduce (fn [a used] (update a (str used) (fnil conj #{}) (str m))) acc targets)))
               {} modules-config)))

(defn- module-node
  "One module's config as the plain data the page consumes."
  [modules-config used-by module]
  (let [{:keys [api uses friends] :as entry} (get modules-config module)
        effective-uses (if (= uses :any)
                         (disj (set (keys modules-config)) module)
                         uses)
        source-dir     (ns-prefix->source-dir (modules/module-ns-prefix modules-config module))]
    {:id                   (str module)
     :enterprise           (= (namespace module) "enterprise")
     :team                 (modules/module-team modules-config module)
     :path                 (module->tree-path modules-config module)
     :ns-prefix            (explicit-ns-prefix modules-config module)
     :source               (when (.isDirectory (io/file source-dir)) source-dir)
     :api-any              (= api :any)
     :api                  (set-field->strings api)
     :uses-any             (= uses :any)
     :uses                 (if (set? effective-uses) (vec (sort (map str effective-uses))) [])
     :used-by              (vec (sort (get used-by (str module))))
     :friends              (set-field->strings friends)
     :module-exports       (set-field->strings (:module-exports entry))
     :model-exports        (set-field->strings (:model-exports entry))
     :model-imports-bypass (= (:model-imports entry) :bypass)
     :model-imports        (set-field->strings (:model-imports entry))}))

;;; Per-module source metrics, from tracked files and git history.

(def ^:private source-dirs ["src" "enterprise/backend/src" "test" "enterprise/backend/test" "modules/drivers"])

(defn- tracked-source-files []
  (->> (:out (apply shell/sh "git" "ls-files" "--" source-dirs))
       str/split-lines
       (filter #(re-find #"\.clj[cs]?$" %))))

(def ^:private source-root #"^(?:enterprise/backend/)?(?:src|test)/|^modules/drivers/[^/]+/(?:src|test)/")

(defn- file->ns
  "The namespace a source or test file declares, going by its path."
  [filename]
  (when-let [root (re-find source-root filename)]
    (-> (subs filename (count root))
        (str/replace #"\.[^./]+$" "")
        (str/replace "/" ".")
        (str/replace "_" "-")
        symbol)))

(defn- file->module [prefix->module filename]
  (if (str/starts-with? filename "modules/drivers/")
    ;; driver plugins, including test-data helpers whose namespaces sit outside `metabase.driver`
    'driver
    (some->> (file->ns filename) (modules/declared-module prefix->module))))

(defn- test-file? [filename]
  (or (str/starts-with? filename "test/")
      (str/starts-with? filename "enterprise/backend/test/")
      (str/includes? filename "/test/")))

(defn- count-lines [filename]
  (with-open [r (io/reader filename)]
    (count (line-seq r))))

(defn- count-deftests [filename]
  (with-open [r (io/reader filename)]
    (count (filter #(re-find #"\(\s*deftest\b" %) (line-seq r)))))

(defn- module->commit-count
  "Distinct commits that touched each module's files, from one `git log` pass."
  [file->module*]
  (let [log (:out (apply shell/sh "git" "log" "--format=%H" "--name-only" "--" source-dirs))]
    (loop [[line & more :as lines] (str/split-lines log)
           commit                  nil
           acc                     {}]
      (cond
        (empty? lines)                    (update-vals acc count)
        (re-matches #"[0-9a-f]{40}" line) (recur more line acc)
        :else                             (recur more commit (if-let [m (file->module* line)]
                                                               (update acc m (fnil conj #{}) commit)
                                                               acc))))))

(defn- module-stats
  "`module -> {:namespaces :loc :test-files :tests :commits}`."
  [modules-config files]
  (let [prefix->module (modules/build-prefix->module modules-config)
        file->module*  (into {} (keep (fn [f] (some->> (file->module prefix->module f) (vector f)))) files)
        by-module      (reduce (fn [acc [f m]]
                                 (if (test-file? f)
                                   (-> acc
                                       (update-in [m :test-files] (fnil inc 0))
                                       (update-in [m :tests] (fnil + 0) (count-deftests f)))
                                   (-> acc
                                       (update-in [m :namespaces] (fnil inc 0))
                                       (update-in [m :loc] (fnil + 0) (count-lines f)))))
                               {}
                               file->module*)
        commits        (module->commit-count file->module*)]
    (into {}
          (for [m (keys modules-config)]
            [m (merge {:namespaces 0, :loc 0, :test-files 0, :tests 0}
                      (get by-module m)
                      {:commits (get commits m 0)})]))))

(defn explorer-data
  "The data embedded in the page.

  `:stats?` adds per-module source metrics, which take a few seconds.
  `:ns-edges` is a seq of `[consumer producer namespace]` string triples."
  [modules-config {:keys [stats? ns-edges]}]
  (let [used-by (used-by-index modules-config)
        files   (when (or stats? ns-edges) (tracked-source-files))
        stats   (when stats? (module-stats modules-config files))]
    {:modules  (mapv (fn [m]
                       (cond-> (module-node modules-config used-by m)
                         stats? (assoc :stats (get stats m))))
                     (sort (keys modules-config)))
     :ns-edges (some-> ns-edges vec)
     :ns-files (when ns-edges
                 (let [used (into #{} (map #(nth % 2)) ns-edges)]
                   (into {}
                         (keep (fn [f]
                                 (let [ns-str (str (file->ns f))]
                                   (when (and (used ns-str) (not (test-file? f)))
                                     [ns-str f]))))
                         files)))}))

(defn page
  "The explorer as one HTML document with `data` embedded."
  [data]
  (str/replace (slurp (or (io/resource "dev/module_explorer.html")
                          (io/file "dev/resources/dev/module_explorer.html")))
               "/*DATA*/null"
               ;; a `</` in the JSON would close the script element early
               (str/replace (json/generate-string data) "</" "<\\/")))

(defn- ns-edges
  "Distinct `[consumer producer namespace]` triples from the source scan."
  [modules-config]
  (let [dependencies    (requiring-resolve 'dev.deps-graph/dependencies)
        external-usages (requiring-resolve 'dev.deps-graph/external-usages)
        deps            (dependencies)]
    (into []
          (comp (mapcat #(external-usages deps %))
                (keep (fn [{:keys [module depends-on-module depends-on-namespace]}]
                        (when (and module depends-on-module (not= module depends-on-module))
                          [(str module) (str depends-on-module) (str depends-on-namespace)])))
                (distinct))
          (keys modules-config))))

(defn open!
  "Build the explorer with namespace-level edges, write it to a temp file, and open it in a browser.
  Needs a dev REPL. Returns the file path."
  []
  (let [modules-config (-> (slurp ".clj-kondo/config/modules/config.edn") edn/read-string :metabase/modules)
        file           (java.io.File/createTempFile "module-explorer" ".html")]
    (spit file (page (explorer-data modules-config {:stats? true, :ns-edges (ns-edges modules-config)})))
    (browse/browse-url (str (.toURI file)))
    (str file)))
