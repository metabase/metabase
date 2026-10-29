(ns dev.module-history
  "Module-boundary metrics at any commit, read from git without a checkout.

  Every commit is measured with the code in this tree: its sources and module config come from git, and today's
  [[dev.deps-graph]] resolves and measures them, so every data point follows the same rules.

  Results are cached outside the repo, under `$MB_MODULE_HISTORY_CACHE` or `~/.cache/metabase/module-history`,
  so worktrees and runs share them.
  Parsed files are keyed by git blob and a hash of [[dev.module-source]]; per-commit metrics are keyed by
  commit and a hash of every namespace that computes them.
  Changing that code starts a fresh cache layer instead of serving stale results.

    (backfill! {:since \"2025-10-01\", :monthly-since \"2023-12-01\", :out \"history.csv\"})"
  (:require
   [clojure.data.csv :as csv]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [dev.deps-graph :as deps-graph]
   [dev.module-graph :as module-graph]
   [dev.module-source :as module-source]
   [hooks.common.modules :as modules])
  (:import
   (java.io BufferedInputStream ByteArrayOutputStream File OutputStream)
   (java.nio.charset StandardCharsets)
   (java.nio.file CopyOption Files StandardCopyOption)
   (java.security MessageDigest)
   (java.time LocalDate ZoneOffset)
   (java.util BitSet)))

(set! *warn-on-reflection* true)

;;;; Git

(defn- git!
  "Run git with `args` in the repo and return its output, throwing when it fails."
  [args]
  (let [{:keys [exit out err]} (apply sh/sh "git" args)]
    (when-not (zero? exit)
      (throw (ex-info (format "git %s failed: %s" (str/join " " args) err) {:args args})))
    out))

(defn- open-object-reader
  "A running `git cat-file --batch` for reading object contents with [[read-object]].
  Close it with [[close-object-reader]]."
  []
  (let [process (.start (ProcessBuilder. ^"[Ljava.lang.String;" (into-array String ["git" "cat-file" "--batch"])))]
    {:process process
     :in      (BufferedInputStream. (.getInputStream process))
     :out     (.getOutputStream process)}))

(defn- close-object-reader [{:keys [^Process process ^OutputStream out]}]
  (.close out)
  (.waitFor process))

(defn- read-line-bytes
  "One `\\n`-terminated line from `in`, without the newline."
  [^BufferedInputStream in]
  (let [buffer (ByteArrayOutputStream.)]
    (loop []
      (let [b (.read in)]
        (if (or (= b -1) (= b (int \newline)))
          (String. (.toByteArray buffer) StandardCharsets/UTF_8)
          (do (.write buffer b) (recur)))))))

(defn- read-object
  "Contents of the object `spec` names, a blob sha or `commit:path`, as a string; `nil` when it does not exist."
  [{:keys [^BufferedInputStream in ^OutputStream out]} spec]
  (.write out (.getBytes (str spec "\n") StandardCharsets/UTF_8))
  (.flush out)
  (let [header (read-line-bytes in)]
    (when-not (str/ends-with? header " missing")
      (let [size  (parse-long (last (str/split header #" ")))
            bytes (.readNBytes in (int size))]
        ;; Each object is followed by a newline.
        (.read in)
        (String. bytes StandardCharsets/UTF_8)))))

(def ^:private source-path
  "Paths [[dev.deps-graph/dependencies]] scans: OSS and EE sources, every driver, and the plugin modules."
  #"^(?:src|enterprise/backend/src|modules/drivers/[^/]+/src|modules/embedder/src)/.+\.cljc?$")

(defn- source-blobs
  "The `{:path, :blob}` of each backend source file in `commit`."
  [commit]
  (into []
        (keep (fn [entry]
                ;; Each entry is `<mode> <type> <sha>\t<path>`.
                (let [[meta-part path] (str/split entry #"\t" 2)
                      [_mode kind blob] (str/split meta-part #" ")]
                  (when (and (= kind "blob") path (re-matches source-path path))
                    {:path path, :blob blob}))))
        (str/split (git! ["ls-tree" "-r" "-z" commit
                          "--" "src" "enterprise/backend/src" "modules/drivers" "modules/embedder"])
                   #"\u0000")))

;;;; Module config

(defn- legacy-module-name
  "Today's name for the module the old linter keyed by its root namespace: `metabase.lib` is `lib`, and
  `metabase-enterprise.sso` is `enterprise/sso`.
  Returns nil for a namespace outside both roots."
  [root-ns]
  (when-let [[_ enterprise module] (re-matches #"metabase(-enterprise)?\.(.+)" (str root-ns))]
    (if enterprise (symbol "enterprise" module) (symbol module))))

(defn- legacy-modules
  "The module map from the `:metabase/ns-module-checker` linter that predates `:metabase/modules`.
  That linter keyed `:api-namespaces` and `:allowed-modules` by a module's root namespace, such as `metabase.lib`.
  It had no friends or nesting, and its `:allowed-modules` becomes `:uses`."
  [config-source]
  ;; Before #53583 an unlisted module's API was its root namespace; today's default is `.api`, `.core` and `.init`,
  ;; so exposure measured against this config is approximate.
  (let [linter (get-in (binding [*read-eval* false] (read-string config-source))
                       [:linters :metabase/ns-module-checker])]
    (into {}
          (for [[root-ns api] (:api-namespaces linter)
                :let  [module (legacy-module-name root-ns)
                       uses   (get-in linter [:allowed-modules root-ns])]
                ;; Same exclusion as [[deps-graph/kondo-config]].
                :when (and module (not= 'connection-pool module))]
            [module (cond-> {}
                      (some? api)  (assoc :api (if (= :any api) :any (set api)))
                      (some? uses) (assoc :uses (if (= :any uses) :any (into #{} (keep legacy-module-name) uses))))]))))

(def ^:private whole-backend
  "The module map before #42250, when there were no modules: the whole backend is one."
  '{backend {}})

(def ^:private modules-config-path ".clj-kondo/config/modules/config.edn")

(def ^:private legacy-config-path
  "Where the module linter's config lived before #53583 gave it [[modules-config-path]]."
  ".clj-kondo/config.edn")

(defn- commit-modules
  "The `:metabase/modules` map of a commit, where `read-file` returns the contents of a path in it, or nil.
  Before #53583 it is translated from the older linter config.
  Before #42250 there is no module config, so it is [[whole-backend]]."
  [read-file]
  (if-let [config (read-file modules-config-path)]
    ;; Same exclusion as [[deps-graph/kondo-config]].
    (dissoc (:metabase/modules (edn/read-string config)) 'connection-pool)
    (or (not-empty (some-> (read-file legacy-config-path) legacy-modules))
        whole-backend)))

(defn- prefix->module
  "Namespace prefixes for `modules`. [[whole-backend]] owns every OSS and EE namespace, and `metabase-init`, the
  only namespace of the repository's first commit."
  [modules]
  (if (= modules whole-backend)
    {"metabase" 'backend, "metabase-enterprise" 'backend, "metabase-init" 'backend}
    (modules/build-prefix->module modules)))

;;;; Cache

(defn cache-dir
  "Root of the on-disk cache: `$MB_MODULE_HISTORY_CACHE`, else `~/.cache/metabase/module-history`."
  ^File []
  (io/file (or (System/getenv "MB_MODULE_HISTORY_CACHE")
               (str (System/getProperty "user.home") "/.cache/metabase/module-history"))))

(defn- code-hash
  "A short hash over the source of classpath `resources`, naming a cache layer computed by that code."
  [resources]
  (let [digest (MessageDigest/getInstance "SHA-1")]
    (doseq [resource resources]
      (.update digest (.getBytes (slurp (or (io/resource resource)
                                            (throw (ex-info (str "Not on the classpath: " resource) {}))))
                                 StandardCharsets/UTF_8)))
    (subs (format "%040x" (BigInteger. 1 (.digest digest))) 0 12)))

(def ^:private parse-version
  (delay (code-hash ["dev/module_source.clj"])))

(def ^:private metrics-version
  (delay (code-hash ["dev/deps_graph.clj"
                     "dev/module_graph.clj"
                     "dev/module_history.clj"
                     "dev/module_source.clj"
                     "hooks/common/modules.clj"])))

(defn- read-cached [^File file]
  (when (.exists file)
    (edn/read-string (slurp file))))

(defn- write-cached!
  "Write `value` to `file` through a temporary file, so concurrent runs never read half a file."
  [^File file value]
  (io/make-parents file)
  (let [tmp (File/createTempFile "entry" ".tmp" (.getParentFile file))]
    (spit tmp (pr-str value))
    (Files/move (.toPath tmp) (.toPath file) (into-array CopyOption [StandardCopyOption/ATOMIC_MOVE]))
    value))

(defn- parse-file ^File [blob]
  (io/file (cache-dir) "parse" @parse-version (subs blob 0 2) (str blob ".edn")))

(defn- metrics-file ^File [commit]
  (io/file (cache-dir) "metrics" @metrics-version (str commit ".edn")))

(defn- parse-source
  "The [[module-source/source-requires]] map for `source`, or `{:error message}` when it does not parse."
  [source]
  (try
    (module-source/source-requires source)
    (catch Exception e
      {:error (ex-message e)})))

(defn- blob-requires
  "Requires for each of `blobs`, from the cache where possible.
  Missing blobs are read in turn and parsed in parallel."
  [reader blobs]
  (let [cached  (into {} (keep (fn [blob] (some->> (read-cached (parse-file blob)) (vector blob)))) blobs)
        missing (remove cached blobs)
        sources (mapv (fn [blob] [blob (read-object reader blob)]) missing)
        parsed  (into {} (pmap (fn [[blob source]]
                                 [blob (write-cached! (parse-file blob) (parse-source source))])
                               sources))]
    (merge cached parsed)))

;;;; Metrics

(defn commit-dependencies
  "Dependency rows, as [[deps-graph/dependencies]] returns them, for the sources at `commit` under `modules`."
  [reader commit modules]
  (let [prefix->module (prefix->module modules)
        files          (source-blobs commit)
        requires       (blob-requires reader (distinct (map :blob files)))]
    (into []
          (keep (fn [{:keys [path blob]}]
                  (let [{ns-symb :namespace, :as parsed} (requires blob)]
                    ;; Unparseable files and namespaces outside every module are skipped, as a checkout scan cannot
                    ;; place them either.
                    (when (and ns-symb
                               (not (:error parsed))
                               (modules/resolve-module prefix->module ns-symb))
                      (deps-graph/resolve-requires prefix->module path parsed)))))
          files)))

(defn- largest-cycle
  "The `[modules namespaces]` sizes of the cycle with the most namespaces, or `[0 0]` without cycles."
  [module-sizes namespace-sizes]
  (or (last (sort-by second (map vector module-sizes namespace-sizes)))
      [0 0]))

(defn- on-big-stack
  "Call `f` on a thread with a 512 MB stack and return its result."
  [f]
  ;; The namespace graph has about 2,000 nodes, and the recursive cycle search goes one level deeper per node on
  ;; its path, which can outgrow the default 2 MB stack.
  (let [result (promise)
        thread (Thread. nil
                        #(deliver result (try {:ok (f)} (catch Throwable e {:error e})))
                        "module-history-scc"
                        (* 512 1024 1024))]
    (.start thread)
    (let [{:keys [ok error]} @result]
      (when error
        (throw error))
      ok)))

(defn- structure-metrics
  "The measures stats dashboard 9805 tracks, defined as when it was built: cycle sizes in
  [[module-graph/cyclic-components]] order, the largest namespace-level cycle, module pairs that require each other,
  and cross-module requires past a module's `:api`, including those a `:friends` grant allows.
  The `graph` and `ns-graph` map each module and each namespace to the ones it requires."
  [deps modules stats graph ns-graph]
  (let [api-of      (memoize (fn [module]
                               ;; The declared API: nil for `:api :any`, else the declared set, else the default
                               ;; namespaces that exist.
                               (let [api (get-in modules [module :api])]
                                 (cond
                                   (= :any api) nil
                                   (set? api)   api
                                   :else        (let [prefix (modules/module-ns-prefix modules module)]
                                                  (into #{}
                                                        (filter #(contains? ns-graph %))
                                                        [(symbol (str prefix ".api"))
                                                         (symbol (str prefix ".core"))
                                                         (symbol (str prefix ".init"))]))))))
        non-api     (for [{:keys [module namespace], :as row} deps
                          {to-ns :namespace, to :module} (:deps row)
                          :when (not= module to)
                          :let  [api (api-of to)]
                          :when (and (some? api) (not (contains? api to-ns)))]
                      {:from-ns namespace, :from module, :to-ns to-ns, :to to})
        via-friends (filter (fn [{:keys [from to]}] (contains? (set (get-in modules [to :friends])) from)) non-api)
        mutual      (for [[a bs] graph
                          b      bs
                          :when  (and (neg? (compare (str a) (str b)))
                                      (contains? (get graph b) a)
                                      (not (modules/descendant-of? modules a b))
                                      (not (modules/descendant-of? modules b a)))]
                      [a b])
        size-at     (fn [sizes i] (get sizes i 0))]
    {:distinct-namespaces           (count ns-graph)
     :configured-top-level-modules  (count (remove #(modules/parent-module modules %) (keys modules)))
     :scc1-modules                  (size-at (:scc-module-sizes stats) 0)
     :scc1-namespaces               (size-at (:scc-namespace-sizes stats) 0)
     :scc2-modules                  (size-at (:scc-module-sizes stats) 1)
     :scc2-namespaces               (size-at (:scc-namespace-sizes stats) 1)
     :scc3-modules                  (size-at (:scc-module-sizes stats) 2)
     :scc3-namespaces               (size-at (:scc-namespace-sizes stats) 2)
     :largest-ns-level-scc          (count (first (on-big-stack #(module-graph/cyclic-components ns-graph))))
     :mutual-dependency-pairs       (count mutual)
     :friend-internal-namespaces    (count (into #{} (map :to-ns) via-friends))
     :friend-internal-requires      (count (into #{} (map (juxt :from-ns :to-ns)) via-friends))
     :non-api-cross-module-requires (count (into #{} (map (juxt :from-ns :to-ns)) non-api))
     :total-api-namespaces          (transduce (map #(count (or (api-of %) #{}))) + 0 (keys modules))
     :ns-prefixes                   (count (keep :ns-prefix (vals modules)))
     :model-imports-bypass          (count (filter #(= :bypass (:model-imports %)) (vals modules)))
     :legacy-rest-modules           (count (filter #(re-find #"-rest$" (str %)) (keys modules)))}))

;;;; Retest share

(defn- dependents
  "The nodes a change to each node could break: every node that reaches it through requires, itself included.
  The `graph` maps a node to the nodes it requires.
  Returns `{:nodes [node ...], :sets [BitSet ...]}`, one set per node, whose bits index into `:nodes`."
  [graph]
  (let [nodes (vec (into (set (keys graph)) cat (vals graph)))
        index (zipmap nodes (range))
        sets  (mapv (fn [i] (doto (BitSet. (count nodes)) (.set (int i)))) (range (count nodes)))
        edges (vec (for [[user requires] graph
                         required        requires]
                     [(sets (index user)) (sets (index required))]))]
    ;; Whatever reaches a user also reaches what it requires. Repeat until a pass adds nothing, which takes about
    ;; as many passes as the longest chain of requires.
    (loop []
      (when (reduce (fn [changed? [^BitSet user ^BitSet required]]
                      (let [before (.cardinality required)]
                        (.or required user)
                        (or changed? (not= before (.cardinality required)))))
                    false
                    edges)
        (recur)))
    {:nodes nodes, :sets sets}))

(defn- set-bits
  "The indices of the set bits of `bits`, in ascending order."
  [^BitSet bits]
  (take-while nat-int? (iterate #(.nextSetBit bits (inc (long %))) (.nextSetBit bits 0))))

(defn- percent
  "The share `part` is of `whole`, as a percentage with one decimal."
  [part whole]
  (if (zero? whole) 0.0 (/ (Math/round (* 1000.0 (/ part whole))) 10.0)))

(defn- share-summary
  "The mean and median of `shares`, percentages with one entry per namespace, and how many fall in each tenth.
  The median of an even number of shares is the upper of the two middle values."
  [shares]
  (let [sorted (vec (sort shares))
        total  (count sorted)]
    {:mean      (if (zero? total) 0.0 (/ (Math/round (* 10.0 (/ (reduce + sorted) total))) 10.0))
     :median    (if (zero? total) 0.0 (sorted (quot total 2)))
     :histogram (let [tenths (frequencies (map #(min 9 (int (/ % 10))) sorted))]
                  (mapv #(get tenths % 0) (range 10)))}))

(defn- retest-metrics
  "How much of the backend a change would retest, taking every namespace in turn as the one that changed.
  A test run selected by module reruns every namespace of every module that reaches the changed namespace's module;
  one selected by namespace reruns only the namespaces that reach it.
  Shares are percentages of all namespaces.

  A leaf is a module or namespace nothing else requires, so a change to it retests only itself.

  The `graph` and `ns-graph` map each module and each namespace to the ones it requires.
  The `total` is the number of rows in `deps`."
  [deps graph ns-graph total]
  (let [mod->count    (frequencies (map :module deps))
        by-namespace  (dependents ns-graph)
        {:keys [nodes sets]} (dependents graph)
        module-share  (zipmap nodes
                              ;; A module that is required but has no source in `deps` has no namespaces to count.
                              (map #(percent (transduce (map (fn [i] (mod->count (nodes i) 0))) + 0 (set-bits %)) total)
                                   sets))
        ;; Something requires every module without a source in `deps`, so each leaf has namespaces.
        leaf-modules  (keep (fn [[module ^BitSet reaching]] (when (= 1 (.cardinality reaching)) module))
                            (map vector nodes sets))
        per-module    (share-summary (map (comp module-share :module) deps))
        per-namespace (share-summary (map (fn [^BitSet reaching] (percent (.cardinality reaching) total))
                                          (:sets by-namespace)))]
    {:retest-module-mean      (:mean per-module)
     :retest-module-median    (:median per-module)
     :retest-namespace-mean   (:mean per-namespace)
     :retest-namespace-median (:median per-namespace)
     :retest-histogram        {:module (:histogram per-module), :namespace (:histogram per-namespace)}
     :leaf-modules            (count leaf-modules)
     :leaf-module-namespaces  (transduce (map mod->count) + 0 leaf-modules)
     :leaf-namespaces         (count (filter (fn [^BitSet reaching] (= 1 (.cardinality reaching)))
                                             (:sets by-namespace)))}))

(defn commit-metrics
  "Metrics for one commit's dependency rows and module map: [[deps-graph/module-boundary-stats]] plus the sizes,
  cycle, exposure and `:friends` measures the history report tracks, and the [[structure-metrics]].
  All are numbers except `:cycles`, one map per module cycle with its `:modules`, `:namespaces`, `:edges`,
  `:density`, `:cycle-rank` and `:strong-bridges` count, largest first, and `:retest-histogram`, the namespaces in
  each tenth of retest share; see [[retest-metrics]]."
  [deps modules]
  (let [graph         (deps-graph/module-dependencies deps)
        cycles        (module-graph/cycles graph)
        stats         (deps-graph/module-boundary-stats deps modules cycles)
        existing      (into #{} (map :namespace) deps)
        ns-graph      (into {}
                            (map (fn [{:keys [namespace deps]}]
                                   [namespace (into #{} (comp (map :namespace) (filter existing)) deps)]))
                            deps)
        mod->nses     (update-vals (group-by :module deps) #(into #{} (map :namespace) %))
        ns-count      #(count (get mod->nses % #{}))
        with-nses     (set (keys mod->nses))
        root-of       (memoize (fn [m] (last (take-while some? (iterate #(modules/parent-module modules %) m)))))
        api-nses      (fn [m]
                        (let [nses (get mod->nses m #{})]
                          (if (= :any (get-in modules [m :api]))
                            nses
                            (into #{} (filter (set (modules/module-api-namespaces modules m))) nses))))
        ;; A module outside every subtree may name exactly the modules visible across top-level modules.
        exported?     #(nil? (modules/namability-error modules 'module-history/outsider %))
        non-api       #(- (ns-count %) (count (api-nses %)))
        cross-friends (fn [m] (remove #(= (root-of %) (root-of m)) (get-in modules [m :friends])))
        [largest-m largest-n] (largest-cycle (:scc-module-sizes stats) (:scc-namespace-sizes stats))
        static-graph  (deps-graph/module-dependencies (map (fn [row] (update row :deps #(remove :dynamic %))) deps))
        static-n      (transduce (map (fn [component] (reduce + (map ns-count component)))) max 0
                                 (module-graph/cyclic-components static-graph))
        top-edges     (into #{}
                            (for [[from tos] graph
                                  to         tos
                                  :when      (not= (root-of from) (root-of to))]
                              [(root-of from) (root-of to)]))
        ns->mod       (into {} (map (juxt :namespace :module)) deps)
        namespaces    (count deps)]
    (merge
     (structure-metrics deps modules stats graph ns-graph)
     (retest-metrics deps graph ns-graph namespaces)
     ;; Each cycle's members, so a report can follow a cycle as it splits or merges.
     {:cycles (mapv (fn [{members :modules, :keys [edges cycle-rank strong-bridges]} ns-size density]
                      {:modules        members
                       :namespaces     ns-size
                       :edges          edges
                       :density        density
                       :cycle-rank     cycle-rank
                       :strong-bridges (count strong-bridges)})
                    cycles
                    (:scc-namespace-sizes stats)
                    (:scc-densities stats))}
     (select-keys stats [:api-any-namespaces
                         :upward-requires
                         :upward-module-edges
                         :upward-internal-requires
                         :upward-cycle-requires])
     {:namespaces                          namespaces
      :modules                             (count with-nses)
      :configured-modules                  (count modules)
      :top-level-modules                   (count (into #{} (map root-of) with-nses))
      :nested-modules                      (count (remove #(= % (root-of %)) with-nses))
      :module-edges                        (reduce + (map count (vals graph)))
      :top-level-edges                     (count top-edges)
      :scc-largest-modules                 largest-m
      :scc-largest-namespaces              largest-n
      :scc-largest-pct                     (percent largest-n namespaces)
      :scc-cyclic-modules                  (reduce + (:scc-module-sizes stats))
      :scc-cyclic-namespaces               (reduce + (:scc-namespace-sizes stats))
      :scc-components                      (count (:scc-module-sizes stats))
      :scc-static-largest-namespaces       static-n
      :scc-dynamic-only-namespaces         (- largest-n static-n)
      :api-any-modules                     (count (filter #(= :any (get-in modules [% :api])) with-nses))
      :uses-any-modules                    (count (filter #(= :any (:uses %)) (vals modules)))
      ;; Namespaces another top-level module may require: the API of every module visible outside its subtree.
      :exposed-namespaces                  (reduce + (map #(count (api-nses %)) (filter exported? with-nses)))
      :hidden-modules                      (count (remove exported? with-nses))
      :hidden-namespaces                   (reduce + (map ns-count (remove exported? with-nses)))
      :cross-top-level-required-namespaces (count (into #{}
                                                        (for [{:keys [module], :as row} deps
                                                              {required :namespace} (:deps row)
                                                              :let  [to (ns->mod required)]
                                                              :when (and to (not= (root-of module) (root-of to)))]
                                                          required)))
      :friend-grants                       (reduce + (map #(count (:friends %)) (vals modules)))
      :cross-top-level-friend-grants       (reduce + (map #(count (cross-friends %)) (keys modules)))
      ;; Non-API namespaces opened to another top-level module through `:friends`.
      :friend-exposed-namespaces           (reduce + (map non-api (filter #(seq (cross-friends %)) with-nses)))
      :friend-access-paths                 (reduce + (map #(* (count (cross-friends %)) (non-api %)) with-nses))})))

;;;; Commits

(defn- commit-info
  "The `:sha`, `:committed-at` and `:subject` of `commit`."
  [commit]
  (let [line (str/trim-newline (git! ["show" "-s" "--format=%H%x00%cI%x00%s" commit]))
        [sha committed-at subject] (str/split line #"\u0000" 3)]
    {:sha sha, :committed-at committed-at, :subject subject}))

(defn- resolve-commit
  "The full sha of `commit`, throwing when it names no commit."
  [commit]
  (str/trim (git! ["rev-parse" (str commit "^{commit}")])))

(defn- commit-snapshot
  "The dependency rows and module map at the commit `sha`, as `{:deps rows, :modules map}`."
  [reader sha]
  (let [modules (commit-modules #(read-object reader (str sha ":" %)))]
    {:deps    (commit-dependencies reader sha modules)
     :modules modules}))

(defn measure
  "Metrics for `commit`, from the cache when this code has measured it before.
  The `:module-system?` key is false before #42250, when the whole backend counts as one module."
  ([commit]
   (let [reader (open-object-reader)]
     (try
       (measure reader commit)
       (finally
         (close-object-reader reader)))))
  ([reader commit]
   (let [sha  (resolve-commit commit)
         file (metrics-file sha)]
     (or (read-cached file)
         (let [{:keys [deps modules]} (commit-snapshot reader sha)]
           (write-cached! file (merge (commit-info sha)
                                      {:module-system? (not= modules whole-backend)}
                                      (commit-metrics deps modules))))))))

(defn snapshot
  "The dependency rows and module map at `commit`, as `{:deps rows, :modules map}`.
  For analyses of one commit that [[measure]] does not record."
  [commit]
  (let [reader (open-object-reader)]
    (try
      (commit-snapshot reader (resolve-commit commit))
      (finally
        (close-object-reader reader)))))

(def ^:private source-pathspecs
  "Pathspecs for the backend sources [[source-path]] matches."
  ;; A `*` in a plain pathspec does not stop at `/`, so `modules/drivers/*/src` matches no file under a driver's
  ;; `src` directory. The glob form does.
  ["src" "enterprise/backend/src" ":(glob)modules/drivers/*/src/**" "modules/embedder/src"])

(defn- midnight-utc
  "The instant `date` starts in UTC, in the form git reads."
  [date]
  ;; Git reads a bare date as that day at the current local time, so a sample would differ from run to run.
  (str date "T00:00:00Z"))

(defn- commits-since
  "First-parent commits of `ref` since `date` that touch any of `pathspecs`, newest first."
  [ref date pathspecs]
  (let [args ["log" "--first-parent" "--format=%H" (str "--since=" (midnight-utc date)) ref "--"]]
    (remove str/blank? (str/split-lines (git! (into args pathspecs))))))

(defn- config-commits
  "Commits of `ref` since `date` that changed the module config.
  Before [[modules-config-path]] existed that is a change to [[legacy-config-path]], which is followed only
  up to the commit that moved the config out of it, or to `ref` when `ref` predates that commit."
  [ref date]
  (let [introduced (last (str/split-lines (git! ["log" "--first-parent" "--diff-filter=A" "--format=%H" ref
                                                 "--" modules-config-path])))]
    (concat (commits-since ref date [modules-config-path])
            (commits-since (if (str/blank? introduced) ref (str introduced "^")) date [legacy-config-path]))))

(defn- last-commit-before
  "The last first-parent commit of `ref` before each of `dates`."
  [ref dates]
  (keep #(not-empty (str/trim (git! ["rev-list" "-1" "--first-parent" (str "--before=" (midnight-utc %)) ref])))
        dates))

(defn- dates-from
  "Every date from `start` up to today in UTC, `step` apart."
  [^LocalDate start step]
  (let [today (LocalDate/now ZoneOffset/UTC)]
    (take-while #(not (.isAfter ^LocalDate % today)) (iterate step start))))

(defn sample-commits
  "Commits to measure on the first-parent history of `ref` (default `origin/master`), oldest first:

  - every one since `since` that changed the module config, which changes on every boundary shift
  - every one since `backend-since` that changed a backend source or the module config
  - the last commit before each week from `weekly-since`, and before the first of each month from `monthly-since`
  - each of `extra`, and the tip of `ref`

  Dates are days in UTC."
  [{:keys [ref since backend-since weekly-since monthly-since extra], :or {ref "origin/master"}}]
  (let [changed  (concat (when since (config-commits ref since))
                         (when backend-since (concat (commits-since ref backend-since source-pathspecs)
                                                     (config-commits ref backend-since))))
        weeks    (when weekly-since
                   (dates-from (LocalDate/parse weekly-since) #(.plusWeeks ^LocalDate % 1)))
        months   (when monthly-since
                   (dates-from (.withDayOfMonth (LocalDate/parse monthly-since) 1) #(.plusMonths ^LocalDate % 1)))
        anchors  (last-commit-before ref (concat weeks months))
        resolved (map resolve-commit (concat changed anchors extra [ref]))
        order    (into {}
                       (map-indexed (fn [i sha] [sha i]))
                       (str/split-lines (git! ["rev-list" "--first-parent" "--reverse" ref])))]
    (->> (distinct resolved)
         (sort-by #(order % Long/MAX_VALUE))
         vec)))

;;;; Backfill

(def ^:private columns
  "Output columns, in order."
  [:sha :committed-at :subject :module-system?
   :namespaces :modules :configured-modules :top-level-modules :nested-modules :module-edges :top-level-edges
   :scc-largest-modules :scc-largest-namespaces :scc-largest-pct :scc-cyclic-modules :scc-cyclic-namespaces
   :scc-components :scc-static-largest-namespaces :scc-dynamic-only-namespaces
   :upward-requires :upward-module-edges :upward-internal-requires :upward-cycle-requires
   :exposed-namespaces :hidden-modules :hidden-namespaces :cross-top-level-required-namespaces
   :api-any-modules :api-any-namespaces :uses-any-modules
   :friend-grants :cross-top-level-friend-grants :friend-exposed-namespaces :friend-access-paths
   :distinct-namespaces :configured-top-level-modules
   :scc1-modules :scc1-namespaces :scc2-modules :scc2-namespaces :scc3-modules :scc3-namespaces
   :largest-ns-level-scc :mutual-dependency-pairs :friend-internal-namespaces :friend-internal-requires
   :non-api-cross-module-requires :total-api-namespaces :ns-prefixes :model-imports-bypass :legacy-rest-modules
   :retest-module-mean :retest-module-median :retest-namespace-mean :retest-namespace-median
   :leaf-modules :leaf-module-namespaces :leaf-namespaces])

(defn- commits-to-measure
  "The shas [[backfill!]] measures for `opts`: each of `commits` and, when a `-since` option is given or `commits`
  is empty, the [[sample-commits]], without repeats."
  [{:keys [commits], :as opts}]
  (if (seq commits)
    ;; Resolve first, so `HEAD` and the sampled tip it names are measured once.
    (vec (distinct (concat (map resolve-commit commits)
                           (when (some opts [:since :backend-since :weekly-since :monthly-since])
                             (sample-commits opts)))))
    (sample-commits opts)))

(defn backfill!
  "Measure the commits [[sample-commits]] picks for `opts` and return the rows.
  With `:commits`, measure those, adding the sample only when a `-since` option is given.
  With `:out`, also write them there as CSV, or as one EDN map per line when the name ends in `.edn`.

    clojure -X:dev dev.module-history/backfill! \\
      :since '\"2025-10-01\"' :monthly-since '\"2023-12-01\"' :out '\"history.csv\"'"
  [{:keys [out], :as opts}]
  (let [shas   (commits-to-measure opts)
        reader (open-object-reader)
        rows   (try
                 (into []
                       (map-indexed (fn [i sha]
                                      (let [row (measure reader sha)]
                                        ;; An explicit commit can be any revision, such as `HEAD`: print what it
                                        ;; resolved to.
                                        (println (format "%d/%d %s %s largest cycle %d" (inc i) (count shas)
                                                         (subs (:sha row) 0 11) (:committed-at row)
                                                         (:scc-largest-namespaces row)))
                                        row)))
                       shas)
                 (finally
                   (close-object-reader reader)))]
    (when out
      (if (str/ends-with? (str out) ".edn")
        (spit out (str/join (map #(str (pr-str %) "\n") rows)))
        (with-open [writer (io/writer out)]
          (csv/write-csv writer (cons (map name columns)
                                      (map (fn [row] (map #(get row % "") columns)) rows)))))
      (println "Wrote" (count rows) "rows to" out))
    rows))

(comment
  (measure "origin/master")
  (sample-commits {:since "2026-09-01"})
  (backfill! {:since "2025-10-01", :monthly-since "2023-12-01", :out "/tmp/module-history.csv"}))
