(ns dev.deps-graph
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [clojure.walk :as walk]
   [lambdaisland.deep-diff2 :as ddiff]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(def ^:private module-boundary-ratchets-path
  ".clj-kondo/config/modules/ratchets.edn")

(def ^:private module-boundary-stats-path
  ".clj-kondo/config/modules/module-stats.edn")

(def ^:private driver-test-overrides-path
  ".clj-kondo/config/modules/driver-test-overrides.edn")

(defn driver-test-overrides
  "Committed CI override config: `{:exempt-modules #{...}}`, the modules that do NOT trigger driver
  tests when changed even though the dependency graph says `driver`/`transforms` depend on them (see
  `mage.modules`, which consumes this file). Every entry is an unverified bet that the coupling is not
  real; the set should only shrink, and the modules-test staleness check fails entries the graph no
  longer even justifies."
  []
  (edn/read-string (slurp driver-test-overrides-path)))

(declare kondo-config module-parent module-ancestor-chain external-usages module-dependencies
         dependencies build-prefix->module default-ns-prefix)

(defn friend-reach-count
  "Number of actual privileged reaches: (friend namespace → internal namespace) require pairs that are
  only legal because of a `:friends` grant. Unlike the grant-surface product in
  `dev.module-metrics/repo-metrics` (friends × internal namespaces, which grows when the grantor adds
  any internal namespace), this only moves when a friend adds or removes a require into the grantor's
  internals — the act the ratchet exists to catch."
  [deps config]
  (reduce
   + 0
   (for [[grantor cfg] config
         :when (set? (:friends cfg))
         :let [api     (let [a (:api cfg)] (if (set? a) a #{}))
               friends (:friends cfg)]]
     (count (filter (fn [{:keys [module depends-on-namespace]}]
                      (and (contains? friends module)
                           (not (contains? api depends-on-namespace))))
                    (external-usages deps grantor))))))

(defn cross-subtree-cycle-pair-count
  "Number of mutually-dependent module pairs whose top-level ancestors differ. A cycle inside one
  top-level subtree (a parent and its nested child requiring each other) is internal organization and
  does not count; a mutual dependency between two different top-level subtrees does. Modules are NOT
  collapsed to their subtree roots first — collapsing unions every child's dependencies into the root
  and manufactures pairs no actual requires form, which would punish natural nesting."
  [deps config]
  (let [declared (set (keys config))
        root     (fn [m] (or (last (module-ancestor-chain declared m)) m))
        graph    (module-dependencies deps)]
    (count (for [[m ds] graph
                 d ds
                 :when (and (neg? (compare m d)) ; count each unordered pair once
                            (contains? (get graph d #{}) m)
                            (not= (root m) (root d)))]
             [m d]))))

;;; Tarjan SCC lives here rather than in `dev.module-scc` (which builds on it) so
;;; [[module-boundary-stats]] can size the components without a circular require.

(defn- graph-nodes [graph]
  (into (set (keys graph)) (mapcat val) graph))

(defn strongly-connected-components
  "Tarjan's algorithm over an adjacency map of `node -> coll of successor nodes`.
  Returns a vector of sets, one per SCC, including singletons.
  Recursive; fine for graphs a few thousand nodes deep."
  [graph]
  (let [index    (volatile! {})
        lowlink  (volatile! {})
        on-stack (volatile! #{})
        stack    (volatile! [])
        counter  (volatile! 0)
        sccs     (volatile! [])]
    (letfn [(strongconnect [v]
              (vswap! index assoc v @counter)
              (vswap! lowlink assoc v @counter)
              (vswap! counter inc)
              (vswap! stack conj v)
              (vswap! on-stack conj v)
              (doseq [w (get graph v)]
                (cond
                  (not (contains? @index w))
                  (do (strongconnect w)
                      (vswap! lowlink update v min (get @lowlink w)))

                  (contains? @on-stack w)
                  (vswap! lowlink update v min (get @index w))))
              (when (= (get @lowlink v) (get @index v))
                (loop [component #{}]
                  (let [w (peek @stack)]
                    (vswap! stack pop)
                    (vswap! on-stack disj w)
                    (let [component (conj component w)]
                      (if (= w v)
                        (vswap! sccs conj component)
                        (recur component)))))))]
      (doseq [v (sort (graph-nodes graph))]
        (when-not (contains? @index v)
          (strongconnect v))))
    @sccs))

(defn largest-scc
  "The largest SCC of `graph` (ties broken arbitrarily), or `#{}` when the graph has no nodes.
  With two args, picks from precomputed `sccs`."
  ([graph] (largest-scc graph (strongly-connected-components graph)))
  ([_graph sccs] (if (seq sccs) (apply max-key count sccs) #{})))

(defn- largest-cyclic-scc
  "The largest nontrivial SCC of `graph`, or `#{}` when the graph is acyclic."
  [graph]
  (let [component (largest-scc graph)]
    (if (> (count component) 1) component #{})))

(defn module-boundary-debt
  "Current module-boundary anti-pattern counts. One-way ratchets: each may only go down.
  Raising one is a deliberate act — edit `ratchets.edn` by hand and justify it in the commit."
  ([]
   (let [config (kondo-config)]
     (module-boundary-debt (dependencies (build-prefix->module config)) config)))
  ([deps config]
   (let [values   (vals config)
         declared (set (keys config))]
     {:api-any               (count (filter #(= :any (:api %)) values))
      :friend-edges          (transduce (map (comp count :friends)) + 0 values)
      :friend-reaches        (friend-reach-count deps config)
      :cross-subtree-cycle-pairs (cross-subtree-cycle-pair-count deps config)
      :driver-test-exempt-modules (count (:exempt-modules (driver-test-overrides)))
      :legacy-rest-modules   (count (filter #(str/ends-with? (str %) "-rest") (keys config)))
      :top-level-modules     (count (remove #(module-parent declared %) (keys config)))
      :uses-any              (count (filter #(= :any (:uses %)) values))})))

(defn module-boundary-stats
  "Public-surface size stats. Expected to move in both directions — carving a child module grows
  `:total-api` and `:module-exports` while shrinking `:largest-api`, and none of those directions is
  good or bad on its own. Committed to `module-stats.edn` so PR diffs surface the movement for review.

  `:api-any-namespaces` is the hidden surface of `:api :any` modules: every one of their namespaces is
  effectively public, so it is counted here namespace-weighted (the `:api-any` module count itself is a
  ratchet).

  `:ns-prefix-overrides` counts modules whose `:ns-prefix` differs from their name-derived default —
  each is a module name that lies about where its namespaces live, usually a config-only nesting whose
  source rename hasn't happened yet. An explicit prefix equal to the default is documentation, not a
  mismatch, and does not count. Expected to grow with config-only carves; a candidate ratchet once the
  source renames catch up.

  The SCC stats size the mutual-dependency blob at both granularities; they grow with ordinary feature
  work inside the blob, hence stats rather than ratchets.
  `:largest-scc-modules` and `:largest-scc-namespaces` measure the largest strongly connected component
  of the module graph.
  The namespace weighting is the honest number:
  splitting a blob module in config raises the module count without moving a namespace out of the cycle.
  `:largest-ns-scc` is the largest SCC of the namespace graph itself:
  static requires form a DAG, so the component is pure dynamic edges (`requiring-resolve` and friends)
  and is the floor no module re-partitioning can get under."
  ([]
   (let [config (kondo-config)]
     (module-boundary-stats (dependencies (build-prefix->module config)) config)))
  ([deps config]
   (let [values      (vals config)
         api-sizes   (keep (fn [{:keys [api]}]
                             (when (set? api)
                               (count api)))
                           values)
         any-modules (into #{} (keep (fn [[m cfg]] (when (= :any (:api cfg)) m))) config)
         module-scc  (largest-cyclic-scc (module-dependencies deps))
         ns-scc      (largest-cyclic-scc (into {}
                                               (map (fn [{ns-sym :namespace, required :deps}]
                                                      [ns-sym (into #{} (map :namespace) required)]))
                                               deps))]
     {:api-any-namespaces (count (filter #(contains? any-modules (:module %)) deps))
      :largest-api        (reduce max 0 api-sizes)
      :largest-ns-scc     (count ns-scc)
      :largest-scc-modules (count module-scc)
      :largest-scc-namespaces (count (filter #(contains? module-scc (:module %)) deps))
      :module-count       (count config)
      :module-exports     (transduce (map (comp count :module-exports)) + 0 values)
      :ns-prefix-overrides (count (filter (fn [[m {:keys [ns-prefix]}]]
                                            (and ns-prefix
                                                 (not= ns-prefix (default-ns-prefix m))))
                                          config))
      :total-api          (reduce + 0 api-sizes)})))

(defn module-boundary-ratchets
  "Committed exact ratchets for [[module-boundary-debt]]."
  []
  (edn/read-string (slurp module-boundary-ratchets-path)))

(defn committed-module-boundary-stats
  "Committed values of [[module-boundary-stats]]."
  []
  (edn/read-string (slurp module-boundary-stats-path)))

(defn write-module-boundary-stats!
  "Sync `module-stats.edn` to the current config. Unlike the ratchets, stats move freely in both
  directions; the committed file exists so the movement shows up in PR diffs."
  []
  (spit module-boundary-stats-path
        (str (pr-str (into (sorted-map) (module-boundary-stats))) \newline)))

(defn lowered-module-boundary-ratchets
  "Return `actual` when it only lowers `ratchets`; throw rather than blessing increased debt."
  [ratchets actual]
  (when-not (= (set (keys ratchets)) (set (keys actual)))
    (throw (ex-info "Module-boundary ratchet metrics do not match"
                    {:ratchets ratchets
                     :actual actual})))
  (let [increases (into (sorted-map)
                        (filter (fn [[metric value]]
                                  (> value (get ratchets metric -1))))
                        actual)]
    (when (seq increases)
      (throw (ex-info "Refusing to increase module-boundary ratchets"
                      {:increases increases
                       :ratchets ratchets
                       :actual actual})))
    actual))

(defn update-module-boundary-ratchets!
  "Lower committed module-boundary ratchets to current values (refuses increases) and sync
  `module-stats.edn` in whichever direction it moved."
  [_]
  (let [ratchets (module-boundary-ratchets)
        actual   (module-boundary-debt)
        updated  (lowered-module-boundary-ratchets ratchets actual)]
    (if (= ratchets updated)
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "Module-boundary ratchets are already current.")
      (do
        (spit module-boundary-ratchets-path
              (str (pr-str (into (sorted-map) updated)) \newline))
        #_{:clj-kondo/ignore [:discouraged-var]}
        (println "Lowered module-boundary ratchets in" module-boundary-ratchets-path)))
    (when-not (= (committed-module-boundary-stats) (module-boundary-stats))
      (write-module-boundary-stats!)
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println "Synced module-boundary stats in" module-boundary-stats-path))))

(mu/defn- project-root-directory :- (ms/InstanceOfClass java.io.File)
  ^java.io.File []
  (.. (java.nio.file.Paths/get (.toURI (io/resource "dev/deps_graph.clj")))
      toFile          ; /home/cam/metabase/dev/src/dev/deps_graph.clj
      getParentFile   ; /home/cam/metabase/dev/src/dev/
      getParentFile   ; /home/cam/metabase/dev/src/
      getParentFile   ; /home/cam/metabase/dev/
      getParentFile)) ; /home/cam/metabase/

(mu/defn- source-root :- (ms/InstanceOfClass java.io.File)
  "This is basically a non-hardcoded version of

    (io/file \"/home/cam/metabase/src/metabase\")"
  ^java.io.File []
  (io/file (str (.getAbsolutePath (project-root-directory)) "/src")))

(mu/defn- enterprise-source-root :- (ms/InstanceOfClass java.io.File)
  ^java.io.File []
  (io/file (str (.getAbsolutePath (project-root-directory)) "/enterprise/backend/src")))

(mu/defn- drivers-source-roots :- [:sequential (ms/InstanceOfClass java.io.File)]
  []
  (for [file (.listFiles (io/file (str (.getAbsolutePath (project-root-directory)) "/modules/drivers")))]
    (io/file file "src")))

(mu/defn- find-source-files :- [:sequential (ms/InstanceOfClass java.io.File)]
  []
  (mapcat ns.find/find-sources-in-dir
          (list* (source-root) (enterprise-source-root) (drivers-source-roots))))

(defn- module-split
  "Split a module symbol into `[ns-part name-parts-vec]`. Mirror of
  `hooks.common.modules/split-module`. Used by `module-parent` to walk the
  nested-module hierarchy (which is separate from `:ns-prefix`)."
  [m]
  [(namespace m) (str/split (name m) #"\.")])

(defn- module-join
  "Inverse of `module-split`."
  [[ns-part name-parts]]
  (if ns-part
    (symbol ns-part (str/join "." name-parts))
    (symbol (str/join "." name-parts))))

(defn default-ns-prefix
  "Default `:ns-prefix` for a module symbol, derived from its name. Mirror of
  `hooks.common.modules/default-ns-prefix` — see that function for details."
  [m]
  (if (= (namespace m) "enterprise")
    (str "metabase-enterprise." (name m))
    (str "metabase." (name m))))

(defn module-ns-prefix
  "Effective `:ns-prefix` for a module: explicit from the module's config
  entry, else the name-derived default. `modules-config` is the inner map
  from `kondo-config` (keyed by module symbol)."
  [modules-config m]
  (or (get-in modules-config [m :ns-prefix])
      (default-ns-prefix m)))

(defn build-prefix->module
  "Build the `{ns-prefix-string module-symbol}` map from all declared modules
  in `modules-config`. Used as the lookup table for longest-prefix resolution."
  [modules-config]
  (into {}
        (map (fn [m] [(module-ns-prefix modules-config m) m]))
        (keys modules-config)))

(defn- ns-starts-with-prefix? [ns-str prefix]
  (or (= ns-str prefix)
      (str/starts-with? ns-str (str prefix "."))))

(defn- longest-matching-prefix
  "Scan `prefix->module` and return the module whose ns-prefix is the longest
  string prefix of `ns-str` at segment boundaries."
  [prefix->module ns-str]
  (second
   (reduce-kv
    (fn [[best-prefix :as best] prefix module]
      (if (and (ns-starts-with-prefix? ns-str prefix)
               (or (nil? best-prefix)
                   (> (count prefix) (count best-prefix))))
        [prefix module]
        best))
    nil
    prefix->module)))

(defn- normalize-test-namespace [ns-symb]
  (if (str/ends-with? (name ns-symb) "-test")
    (symbol (str/replace (name ns-symb) #"-test$" ""))
    ns-symb))

(mu/defn- module :- [:maybe symbol?]
  "Resolve a namespace symbol to a module symbol via prefix-map lookup.

  The 2-arity form takes a pre-computed `prefix->module` map (as produced
  by `build-prefix->module`) and does longest-prefix-at-segment-boundaries
  matching. The 1-arity form is a flat fallback using single-segment regex
  extraction — retained for backwards compat and for callers that don't
  have a prefix map handy.

  MIRROR: deliberate duplicate of the canonical
  `hooks.common.modules/module` function. They live in different classpath
  contexts and cannot share source. See
  `metabase.core.modules-consistency-test` for the tripwire that keeps
  them in sync."
  ([ns-symb :- simple-symbol?]
   (module nil ns-symb))
  ([prefix->module :- [:maybe [:map-of :string symbol?]]
    ns-symb :- simple-symbol?]
   (let [ns-symb (normalize-test-namespace ns-symb)]
     (or
      ;; Primary path: prefix-map longest match over declared modules.
      (when (seq prefix->module)
        (longest-matching-prefix prefix->module (str ns-symb)))
      ;; Fallback: single-segment extraction. Regex literals preserved
      ;; byte-for-byte to match the kondo hook for the consistency test.
      (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
               second
               (symbol "enterprise"))
      (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
              second
              symbol)))))

(def ^:private require-symbols
  '#{require
     clojure.core/require
     classloader/require
     metabase.classloader.core/require
     metabase.classloader.impl/require
     requiring-resolve
     clojure.core/requiring-resolve})

(mr/def ::node
  [:and
   :map
   [:fn
    {:error/message "valid rewrite-clj node"}
    #(not= (n/tag %) :unknown)]])

(mr/def ::zloc
  [:tuple
   ::node
   :map])

(mu/defn- require-loc?
  "Whether this zipper location points to a `(require ...)` node or a something similar (`classloader/require` or
  `requiring-resolve`)."
  [zloc :- ::zloc]
  (when (= (z/tag zloc) :list)
    (let [first-child (z/down zloc)]
      (when (= (z/tag first-child) :token)
        ;; Check all child symbols on the line since `require` might be called in a threading macro
        ;; like (-> 'ns require)
        (some require-symbols (z/child-sexprs zloc))))))

(mu/defn- find-required-namespace :- [:maybe simple-symbol?]
  "Given a `zloc` pointing to one of the children of something like `(require ...)` find a required namespace symbol."
  [zloc :- ::zloc]
  (when-let [symbol-loc (z/find-depth-first zloc #(and (= (z/tag %) :token)
                                                       (symbol? (z/sexpr %))
                                                       (not= (z/sexpr %) 'quote)))]
    (let [symb (z/sexpr symbol-loc)]
      (if (qualified-symbol? symb)
        (symbol (namespace symb))
        symb))))

(mu/defn- find-required-namespaces :- [:set simple-symbol?]
  "Given a zipper location pointing to a `(require ...)` node, find all the symbols it loads."
  [require-loc :- ::zloc]
  (loop [acc #{}, zloc (-> require-loc
                           z/down    ; require
                           z/right)] ; second child
    (if-not zloc
      acc
      (recur (let [required-symbol (find-required-namespace zloc)]
               (cond-> acc
                 required-symbol (conj required-symbol)))
             (z/right zloc)))))

(mu/defn- comment-loc?
  [zloc :- ::zloc]
  (or (and (= (z/tag zloc) :list)
           (let [child-loc (z/down zloc)]
             (and (= (z/tag child-loc) :token)
                  (= (z/sexpr child-loc) 'comment))))
      (= (z/tag zloc) :uneval)))

(mu/defn- find-requires :- [:maybe [:sequential ::zloc]]
  "Find all the zipper locations for `(require ...)` nodes."
  [zloc :- ::zloc]
  (concat
   (when-not (comment-loc? zloc)
     (if (require-loc? zloc)
       [zloc]
       (when-let [down (z/down zloc)]
         (find-requires down))))
   (when-let [right (z/right zloc)]
     (find-requires right))))

(mu/defn- find-dynamically-loaded-namespaces :- [:set simple-symbol?]
  "Find the set of namespace symbols for namespaces loaded by `require` and friends in a `file`."
  [file]
  (try
    (let [node     (r.parser/parse-file-all file)
          zloc     (z/of-node node)
          requires (find-requires zloc)]
      (into #{} (mapcat find-required-namespaces) requires))
    (catch Throwable e
      (throw (ex-info (format "Error in file %s: %s" (str file) (ex-message e))
                      {:file file}
                      e)))))

(comment
  ;; uses require
  (find-dynamically-loaded-namespaces "src/metabase/core/init.clj")
  ;; uses classloader/require
  (find-dynamically-loaded-namespaces "src/metabase/app_db/setup.clj")
  ;; uses requiring-resolve, has more than one.
  (find-dynamically-loaded-namespaces "src/metabase/users/api.clj")
  ;; has require inside of a `comment` form, should ignore it.
  (find-dynamically-loaded-namespaces "src/metabase/xrays/automagic_dashboards/schema.clj")
  (find-dynamically-loaded-namespaces "src/metabase/api/open_api.clj"))

(mu/defn find-defenterprises
  "using rewrite-clj, find and return all the namespaces 'required' by defenterprise forms in a file."
  [file]
  ;; We want to know what namespace defendpoint 'requires': so do not need to parse anything in the enterprise dir.
  (if (str/includes? file "/metabase_enterprise/")
    []
    (let [defentz (atom #{})]
      (walk/postwalk
       (fn [x]
         (when-let [target-ns (and (= (:tag x) :list)
                                   (= (:string-value (first (:children x))) "defenterprise")
                                   ;; grabbing it naeivly should be OK, since the linter enforces there's a docstring
                                   (some->> x z/of-node z/down z/right z/right z/right z/sexpr))]
           (swap! defentz conj target-ns))
         x)
       (z/of-node (r.parser/parse-file-all file)))
      @defentz)))

(mu/defn find-defenterprise-schemas
  "using rewrite-clj, find and return all the namespaces 'required' by defenterprise-schema forms in a file."
  [file]
  ;; We want to know what namespace defendpoint 'requires': so do not need to parse anything in the enterprise dir.
  (if (str/includes? file "/metabase_enterprise/")
    []
    (let [defentz (atom #{})]
      (walk/postwalk
       (fn [x]
         (when-let [target-ns (and (= (:tag x) :list)
                                   (= (:string-value (first (:children x))) "defenterprise-schema")
                                   ;; grabbing it naeivly should be OK, since the linter enforces there's a docstring
                                   (some->> x z/of-node z/down z/right z/right z/right z/right z/right z/sexpr))]
           (swap! defentz conj target-ns))
         x)
       (z/of-node (r.parser/parse-file-all file)))
      @defentz)))

(comment
  ;; has 2 defenterprises
  (find-defenterprises "src/metabase/query_processor/middleware/permissions.clj")

  ;; has 2 defenterprise-schemas, both to the same ns:
  (find-defenterprise-schemas "src/metabase/sso/ldap/default_implementation.clj"))

(def ^:private ^String project-root (System/getProperty "user.dir"))

(defn- file->path-relative-to-project-root
  "Get the path of a file relative to the project (repo) root directory e.g.

    (file->path-relative-to-project-root \"/home/cam/metabase/deps.edn\")
    ;; =>
    \"deps.edn\""
  [file]
  (let [file (io/file file)
        path (.getAbsolutePath file)]
    (if (str/starts-with? path project-root)
      (subs path (inc (count project-root))) ; project root won't include trailing `/`
      path)))

(def ^:private ignored-dependencies
  "Technically `config` 'uses' `enterprise/core` and `test` since it tries to load them to see if they exist so we know
  if EE/test code is available; however we can ignore them since they're not 'real' usages. So add them here so we
  don't include them in our deps tree."
  '{metabase.config.core #{metabase-enterprise.core.dummy-namespace metabase.test.dummy-namespace}})

(mu/defn- file-dependencies :- [:map
                                [:namespace simple-symbol?]
                                [:filename  string?] ; filename is relative to [[project-root]]
                                [:module    symbol?]
                                [:deps      [:sequential
                                             [:map
                                              [:namespace simple-symbol?]
                                              [:module    symbol?]
                                              [:dynamic {:optional true} :keyword]]]]]
  ([file]
   (file-dependencies nil file))
  ([prefix->module :- [:maybe [:map-of :string symbol?]]
    file :- [:or
             string?
             [:fn {:error/message "Instance of a java.io.File"} #(instance? java.io.File %)]]]
   (try
     (let [decl         (ns.file/read-file-ns-decl file)
           ns-symb      (ns.parse/name-from-ns-decl decl)
           static-deps  (ns.parse/deps-from-ns-decl decl)
           dynamic-deps (for [symb (find-dynamically-loaded-namespaces file)]
                          (vary-meta symb assoc ::dynamic :require-and-friends))
           ;;
           ;; excluded from the diff for now, see https://metaboat.slack.com/archives/C0669P4AF9N/p1745875106092029 for
           ;; rationale.
           ;;
           ;; defenterprise-deps (for [symb (find-defenterprises file)]
           ;;                      (vary-meta symb assoc ::dynamic :defenterprise))
           ;; defenterprise-schema-deps (for [symb (find-defenterprise-schemas file)]
           ;;                             (vary-meta symb assoc ::dynamic :defenterprise-schema))
           deps         (into (sorted-set) cat
                              [static-deps
                               dynamic-deps
                               #_defenterprise-deps
                               #_defenterprise-schema-deps])]
       {:namespace ns-symb
        :filename  (file->path-relative-to-project-root file)
        :module    (module prefix->module ns-symb)
        :deps      (sort-by pr-str
                            (keep (fn [required-ns]
                                    (when-let [module (module prefix->module required-ns)]
                                      (when-not (some-> ignored-dependencies ns-symb required-ns)
                                        (merge
                                         {:namespace required-ns
                                          :module    module}
                                         (when-let [dynamic-type (::dynamic (meta required-ns))]
                                           {:dynamic dynamic-type})))))
                                  deps))})
     (catch Throwable e
       (throw (ex-info (format "Error calculating dependencies for %s" file)
                       {:file file}
                       e))))))

(comment
  (file-dependencies "src/metabase/app_db/setup.clj")
  ;; should ignore the entries from [[ignored-dependencies]]
  (file-dependencies "src/metabase/config.clj")

  (file-dependencies "src/metabase/query_processor/middleware/permissions.clj"))

(defn dependencies
  "Calculate information about all the modules dependencies for all *SOURCE*
  files in the Metabase project by parsing the files.

  The no-arg form resolves namespaces against the current module config, so
  nested modules map to themselves rather than collapsing into their
  top-level parent. Pass an explicit `prefix->module` (a pre-computed
  `{ns-prefix-string module-symbol}` map) to reuse a map you already built;
  pass `nil` for the flat single-segment extraction (pre-nested-modules
  behavior), used only by the consistency tests."
  ([]
   (dependencies (build-prefix->module (kondo-config))))
  ([prefix->module]
   (let [fd (partial file-dependencies prefix->module)]
     (pmap fd (find-source-files)))))

(defn configured-dependencies
  "Scan dependencies using every declared module's effective namespace prefix."
  []
  (let [config (kondo-config)]
    (dependencies (build-prefix->module config))))

(defn external-usages
  "All usages of a module named by `module-symb` outside that module."
  ([module-symb]
   (external-usages (configured-dependencies) module-symb))

  ([deps module-symb]
   (for [dep    deps
         :when  (not= (:module dep) module-symb)
         ns-dep (:deps dep)
         :when  (= (:module ns-dep) module-symb)]
     {:namespace            (:namespace dep)
      :module               (:module dep)
      :depends-on-namespace (:namespace ns-dep)
      :depends-on-module    (:module ns-dep)})))

(defn external-usages-by-namespace
  "Return a map of module namespace => set of external namespaces using it"
  ([module-symb]
   (external-usages-by-namespace (configured-dependencies) module-symb))

  ([deps module-symb]
   (into (sorted-map)
         (map (fn [[k v]]
                [k (into (sorted-set) (map :namespace) v)]))
         (group-by :depends-on-namespace (external-usages deps module-symb)))))

(defn module-friends
  "`:friends` of the module from the Kondo config -- these are allowed to freely use all namespaces in the module, not
  just `:api` ones.

    (module-friends (kondo-config) 'lib)
    ;; => #{query-processor}"
  [kondo-config module-symb]
  (get-in kondo-config [module-symb :friends]))

(declare module-ancestor-chain)

(defn externally-used-namespaces-ignoring-friends
  "All namespaces from a module that are used outside that module, excluding
  usages by `:friends` of the module AND usages by descendants of the
  module (subtree trust).

  Subtree trust means a descendant reaching into its ancestor's internals is
  allowed via `:uses` alone, without the namespace needing to appear in the
  ancestor's `:api`. Existing API entries that are still used by descendants
  are retained, however. This makes adopting nesting monotonic: it does not
  force an unrelated config cleanup, while new descendant-only uses do not
  enlarge the API. Ancestors, siblings, cousins, and unrelated consumers
  still count because they must respect `module-symb`'s `:api`."
  ([module-symb]
   (let [config (kondo-config)]
     (externally-used-namespaces-ignoring-friends
      (dependencies (build-prefix->module config)) config module-symb)))

  ([deps kondo-config module-symb]
   (let [friends       (module-friends kondo-config module-symb)
         declared      (set (keys kondo-config))
         descendant-of-me? (fn [other]
                             ;; `other` is a descendant of `module-symb` iff
                             ;; `module-symb` appears in `other`'s ancestor chain.
                             (some #(= module-symb %)
                                   (module-ancestor-chain declared other)))
         usages        (remove #(contains? friends (:module %))
                               (external-usages deps module-symb))
         configured-api (get-in kondo-config [module-symb :api])]
     (into (sorted-set)
           (comp (filter (fn [{:keys [module depends-on-namespace]}]
                           (or (not (descendant-of-me? module))
                               (and (set? configured-api)
                                    (contains? configured-api depends-on-namespace)))))
                 (map :depends-on-namespace))
           usages))))

(defn module-dependencies
  "Build a graph of module => set of modules it directly depends on."
  ([deps]
   (letfn [(reduce-module-deps [module-deps module deps]
             (reduce
              (fn [module-deps {dep-module :module, :as _dep}]
                (cond-> module-deps
                  (not= dep-module module) (conj dep-module)))
              (or module-deps (sorted-set))
              deps))
           (reduce-deps [module->deps {:keys [module deps]}]
             (update module->deps module reduce-module-deps module deps))]
     (reduce reduce-deps (sorted-map) deps)))

  ([deps module]
   (get (module-dependencies deps) module)))

(defn circular-dependencies
  "Build a graph of module => set of modules it refers to that also refer to this module."
  ([deps]
   (let [module->deps (module-dependencies deps)]
     (letfn [(circular-dependency? [module-x module-y]
               (and (contains? (get module->deps module-x) module-y)
                    (contains? (get module->deps module-y) module-x)))
             (circular-deps [module]
               (let [module-deps (get module->deps module)]
                 (not-empty (into (sorted-set)
                                  (filter (fn [dep]
                                            (circular-dependency? module dep)))
                                  module-deps))))]
       (into (sorted-map)
             (keep (fn [module]
                     (when-let [circular-deps (circular-deps module)]
                       [module circular-deps])))
             (keys module->deps)))))

  ([deps module]
   (get (circular-dependencies deps) module)))

(defn non-circular-module-dependencies
  "A graph of [[module-dependencies]], but with modules that have any circular dependencies filtered out. This is mostly
  meant to make it easier to fill out the `:metabase/modules` `:uses` section of the Kondo config, or to figure out
  which ones can easily get a consolidated API namespace without drama."
  [deps]
  (let [circular-dependencies (circular-dependencies deps)]
    (into (sorted-map)
          (remove (fn [[module _deps]]
                    (contains? circular-dependencies module)))
          (module-dependencies deps))))

(defn module-usages-of-other-module
  "Information about how `module-x` uses `module-y`."
  ([module-x module-y]
   (module-usages-of-other-module (configured-dependencies) module-x module-y))

  ([deps module-x module-y]
   (let [module-x-ns->module-y-ns (->> (external-usages deps module-y)
                                       (filter #(= (:module %) module-x))
                                       (map (juxt :namespace :depends-on-namespace)))]
     (reduce
      (fn [m [module-x-ns module-y-ns]]
        (update m module-x-ns (fn [deps]
                                (conj (or deps (sorted-set)) module-y-ns))))
      (sorted-map)
      module-x-ns->module-y-ns))))

(defn full-dependencies
  "Like [[dependencies]] but also includes transient dependencies."
  [deps]
  (let [deps-graph  (module-dependencies deps)
        ;; grow monotonically: dropping the seed set each round loses members whose own deps don't
        ;; re-reach them, which oscillates forever on cyclic graphs (StackOverflowError).
        expand-deps (fn expand-deps [deps]
                      (let [deps' (into (into (sorted-set) deps)
                                        (mapcat deps-graph)
                                        deps)]
                        (if (= deps deps')
                          deps
                          (recur deps'))))]
    (into (sorted-map)
          (map (fn [[k v]]
                 [k (expand-deps v)]))
          deps-graph)))

(defn module-deps-count
  "Map each module to the number of modules in its transitive dependency closure."
  [deps]
  (into (sorted-map)
        (map (fn [[k v]]
               [k (count v)]))
        (full-dependencies deps)))

(defn module-parent
  "Direct parent of a nested module symbol, or nil if top-level.
  Mirror of `hooks.common.modules/parent-module`. Public so the
  modules-test suite can use it for the subtree-membership lint check.

  With an optional `declared-modules` set, activates the `enterprise/X`
  shorthand: `enterprise/X` is treated as a nested child of the OSS
  module `X` when `X` is declared. Without the set, `enterprise/X`
  is treated as top-level (pure syntactic behavior)."
  ([m] (module-parent nil m))
  ([declared-modules m]
   (let [[ns-part parts] (module-split m)]
     (cond
       (> (count parts) 1)
       (module-join [ns-part (butlast parts)])

       (and (= ns-part "enterprise") declared-modules)
       (let [oss (symbol (first parts))]
         (when (contains? declared-modules oss) oss))

       :else nil))))

(defn module-ancestor-chain
  "Seq of ancestor module symbols of `m`, from direct parent up to top-level
  ancestor. Empty if `m` is top-level. Public for use by the
  subtree-membership lint check in the modules-test suite. Honors the
  `enterprise/X` shorthand when `declared-modules` is provided."
  ([m] (module-ancestor-chain nil m))
  ([declared-modules m]
   (take-while some?
               (iterate #(module-parent declared-modules %)
                        (module-parent declared-modules m)))))

(defn generate-config
  "Generate the Kondo config that should go in `.clj-kondo/config/modules/config.edn`.

  Under the strict module model, every dependency is explicit — there are
  no implicit edges based on tree structure. `generate-config` produces a
  literal one-to-one mapping from actual code dependencies (resolved via
  the prefix map) to `:uses` entries, with no filtering.

  Reads the current kondo config to discover declared modules (and their
  `:ns-prefix`es), then uses longest-prefix matching to assign each
  namespace to its owning module."
  ([]
   (let [kc          (kondo-config)
         prefix->mod (build-prefix->module kc)]
     (generate-config (dependencies prefix->mod) kc)))

  ([deps kondo-config]
   (into (sorted-map)
         (map (fn [[module uses]]
                [module {:api  (externally-used-namespaces-ignoring-friends deps kondo-config module)
                         :uses uses}]))
         (module-dependencies deps))))

(defn kondo-config
  "Read out the Kondo config for the modules linter."
  []
  (-> (with-open [r (java.io.PushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
        (edn/read r))
      :metabase/modules
      ;; ignore the config for [[metabase.connection-pool]] which comes from one of our libraries.
      (dissoc 'connection-pool)))

(defn module-team-source
  "Closest module at or above `module` that explicitly declares `:team`, or `nil` when none does."
  [config module]
  (let [declared-modules (set (keys config))]
    (loop [module module]
      (cond
        (contains? (get config module) :team) module
        :else (when-let [parent (module-parent declared-modules module)]
                (recur parent))))))

(defn module-team
  "Effective team for `module`, inherited from its closest configured ancestor when omitted locally."
  [config module]
  (some->> (module-team-source config module)
           (get config)
           :team))

(defn- top-level-oss-module?
  [module]
  (and (nil? (namespace module))
       (not (str/includes? (name module) "."))))

(defn- expanded-module-exports
  [config module]
  (let [explicit     (set (get-in config [module :module-exports]))
        ee-companion (when (top-level-oss-module? module)
                       (let [candidate (symbol "enterprise" (name module))]
                         (when (contains? config candidate)
                           candidate)))]
    (cond-> explicit
      ee-companion (conj ee-companion))))

(defn- default-api-namespaces
  [config module]
  (let [prefix (module-ns-prefix config module)]
    #{(symbol (str prefix ".api"))
      (symbol (str prefix ".core"))
      (symbol (str prefix ".init"))}))

(defn- module-top-level-ancestor
  [declared-modules module]
  (or (last (module-ancestor-chain declared-modules module)) module))

(defn- externally-referenceable-module?
  [config module]
  (let [declared-modules (set (keys config))]
    (loop [module module]
      (if-let [parent (module-parent declared-modules module)]
        (and (contains? (expanded-module-exports config parent) module)
             (recur parent))
        true))))

(defn- module-namable-from?
  [config caller target]
  (let [declared-modules (set (keys config))]
    (or (= (module-top-level-ancestor declared-modules caller)
           (module-top-level-ancestor declared-modules target))
        (externally-referenceable-module? config target))))

(defn- expanded-module-uses
  [config module]
  (let [uses (get-in config [module :uses])]
    (if (= uses :any)
      (into (sorted-set)
            (comp (remove #{module})
                  (filter (partial module-namable-from? config module)))
            (keys config))
      (set uses))))

(defn- module->owned-namespaces
  [deps]
  (reduce (fn [result {:keys [module namespace]}]
            (cond-> result
              module (update module (fnil conj (sorted-set)) namespace)))
          (sorted-map)
          deps))

(defn expanded-kondo-config
  "Return module config with config-only defaults and inherited properties materialized.

  Expands effective `:team`, `:ns-prefix`, default API namespaces, empty boundary sets, automatic EE companion
  exports, and `:uses :any`. The no-argument form also scans source dependencies to expand `:api :any` to every
  namespace owned by that module."
  ([]
   (let [config (kondo-config)]
     (expanded-kondo-config config (dependencies (build-prefix->module config)))))
  ([config]
   (expanded-kondo-config config nil))
  ([config deps]
   (let [module->namespaces (when deps (module->owned-namespaces deps))]
     (into (sorted-map)
           (map (fn [[module module-config]]
                  [module (-> module-config
                              (assoc :team (module-team config module)
                                     :ns-prefix (module-ns-prefix config module)
                                     :api (if (contains? module-config :api)
                                            (if (and (= :any (:api module-config)) deps)
                                              (get module->namespaces module (sorted-set))
                                              (:api module-config))
                                            (default-api-namespaces config module))
                                     :uses (expanded-module-uses config module)
                                     :friends (set (:friends module-config))
                                     :module-exports (expanded-module-exports config module)))]))
           config))))

(defn print-expanded-kondo-config
  "Print [[expanded-kondo-config]] as stable EDN. Accepts an ignored map for `clojure -X`."
  ([]
   (print-expanded-kondo-config nil))
  ([_opts]
   #_{:clj-kondo/ignore [:discouraged-var]}
   (prn (expanded-kondo-config))))

(defn- kondo-config-diff-ignore-any
  "Ignore entries in the config that use `:any`."
  [diff]
  (walk/postwalk
   (fn [x]
     (when-not (and (instance? lambdaisland.deep_diff2.diff_impl.Mismatch x)
                    (= (:- x) :any)
                    (set? (:+ x))
                    (seq (:+ x)))
       x))
   diff))

(defn kondo-config-diff
  "Return the difference between declared module boundaries and dependencies found in source."
  ([]
   (let [kc          (kondo-config)
         prefix->mod (build-prefix->module kc)]
     (kondo-config-diff (dependencies prefix->mod))))

  ([deps]
   (let [kondo-config (kondo-config)]
     (-> (ddiff/diff
          (update-vals kondo-config #(dissoc % :team :friends :model-imports :model-exports))
          (generate-config deps kondo-config))
         ddiff/minimize
         kondo-config-diff-ignore-any
         ddiff/minimize))))

(defn print-kondo-config-diff
  "Print the diff between how the config would look if regenerated with [[generate-config]] versus how it looks in
  reality ([[kondo-config]]). Use this to suggest updates to make to the config file."
  []
  (ddiff/pretty-print (kondo-config-diff)))

(comment
  (external-usages 'core)

  (module-dependencies (dependencies) 'lib)

  (module-usages-of-other-module 'lib 'models))

(defn all-module-deps-paths
  "Build a map of

    dep => path-to-dep

  for each dependency (direct or indirect) of a module, e.g.

    (all-module-deps-paths 'settings)
    ;; =>
    {api      []                         ; settings depends on api directly
     api-keys [permissions collections]} ; settings depends on permissions which depends on collections which depends on api-keys"
  ([module]
   (all-module-deps-paths (configured-dependencies) module))
  ([deps module]
   (all-module-deps-paths deps module (sorted-map) (atom #{}) []))
  ([deps module acc already-seen path]
   (let [module-deps (module-dependencies deps module)
         new-deps    (remove @already-seen module-deps)
         acc         (into acc
                           (map (fn [dep]
                                  [dep path]))
                           new-deps)]
     (swap! already-seen into new-deps)
     (reduce
      (fn [acc new-dep]
        (all-module-deps-paths deps new-dep acc already-seen (conj path new-dep)))
      acc
      new-deps))))

(defn module-dependencies-by-namespace
  "Return a map of external dependency of `module` => set of namespaces in `module` that use it:

    (module-dependencies-by-namespace 'permissions)
    ;; =>
    {api #{metabase.permissions.api
           metabase.permissions.models.collection.graph
           ...}
     app-db #{metabase.permissions.api
              metabase.permissions.models.permissions-group
              ...}
     ...}"
  ([module]
   (module-dependencies-by-namespace (configured-dependencies) module))

  ([deps module]
   (into (sorted-map)
         (map (fn [dep]
                [dep (into (sorted-set) (keys (module-usages-of-other-module deps module dep)))]))
         (module-dependencies deps module))))

(defn dependencies-eliminated-by-removing-namespaces
  "Return the set of `module` dependencies that we could eliminate if we were to split namespace(s) off into a separate
  module.

    ;; if we move `metabase.permissions.api` into a separate module then `permissions` no longer has a dependency on
    ;; `request`
    (dependencies-eliminated-by-removing-namespaces 'permissions 'metabase.permissions.api)
    ;; =>
    #{request}"
  [module namespace-symb-or-set]
  (let [deps            (configured-dependencies)
        namespace-symbs (if (symbol? namespace-symb-or-set)
                          #{namespace-symb-or-set}
                          namespace-symb-or-set)
        dep->namespaces (module-dependencies-by-namespace deps module)]
    (into (sorted-set)
          (keep (fn [[dep namespaces]]
                  (when (empty? (set/difference namespaces namespace-symbs))
                    dep)))
          dep->namespaces)))

(defn leaf-modules
  "Modules that are leaf nodes in the module dependency tree -- nothing else depends on them."
  ([]
   (leaf-modules (configured-dependencies)))
  ([deps]
   (into (sorted-set)
         (comp (map :module)
               (keep (fn [module]
                       (when (zero? (count (external-usages deps module)))
                         module))))
         deps)))

(defn non-dependencies
  "Modules that `module` does not depend on, either directly or indirectly -- changes to any of these modules should not
  affect `module`."
  [module]
  (let [deps        (configured-dependencies)
        all-modules (into (sorted-set) (map :module) deps)
        module-deps (set (keys (all-module-deps-paths deps module)))]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (printf "Module %s depends on %d/%d (%.1f%%) other modules.\n"
            module
            (count module-deps)
            (count all-modules)
            (double (* (/ (count module-deps) (count all-modules)) 100)))
    (flush)
    (set/difference all-modules module-deps)))

(defn- simulate-rename
  "Create a new version of `deps` as they would appear if you renamed namespace(s).

    (simulate-rename deps prefix->module '{metabase.users.api metabase.users-rest.api})"
  ([deps prefix->module old-namespace new-namespace]
   (for [dep deps]
     (-> dep
         (cond-> (= (:namespace dep) old-namespace)
           (assoc :namespace new-namespace
                  :module (module prefix->module new-namespace)))
         (update :deps (fn [deps]
                         (for [dep deps]
                           (if (= (:namespace dep) old-namespace)
                             {:namespace new-namespace, :module (module prefix->module new-namespace)}
                             dep)))))))

  ([deps prefix->module old-namespace->new-namespace]
   (reduce
    (fn [deps [old-namespace new-namespace]]
      (simulate-rename deps prefix->module old-namespace new-namespace))
    deps
    old-namespace->new-namespace)))

(defn dependencies-eliminated-by-renaming-namespaces
  "Calculate the set of dependencies of `module` (both explicit and transient) that would be eliminated by renaming
  `old-namespaces->new-namespaces`.

    (dependencies-eliminated-by-renaming-namespaces 'users '{metabase.users.api metabase.users-rest.api})"
  [module old-namespace->new-namespace]
  (let [config          (kondo-config)
        prefix->module  (build-prefix->module config)
        deps            (dependencies prefix->module)
        old-module-deps (into (sorted-set) (keys (all-module-deps-paths deps module)))
        new-deps        (simulate-rename deps prefix->module old-namespace->new-namespace)
        new-module-deps (into (sorted-set) (keys (all-module-deps-paths new-deps module)))]
    (set/difference old-module-deps new-module-deps)))

(mu/defn- module->source-files :- [:set :string]
  "Return the set of all *source* filenames (relative to the [[project-root]] directory) for a `module`."
  [deps module]
  (into
   (sorted-set)
   (comp (filter #(= (:module %) module))
         (map :filename))
   deps))

(defn- file->namespace
  "Infer the Clojure namespace from a core project filename.

    (file->namespace \"/home/cam/metabase/enterprise/backend/src/metabase_enterprise/advanced_permissions/common.clj\")
    ;; =>
    metabase-enterprise.advanced-permissions.common"
  [file]
  (let [relative-file (file->path-relative-to-project-root file)
        test-file?    (or (str/starts-with? relative-file "test/")
                          (str/starts-with? relative-file "enterprise/backend/test/"))]
    (-> relative-file
        (str/replace #"^enterprise/backend/" "")
        (str/replace #"^(?:(?:src)|(?:test))/" "")
        (str/replace #"\.clj[cs]?$" "")
        ;; Module-level tests live at e.g. test/metabase/lib/schema_test.cljc and
        ;; should map back to metabase.lib.schema for reverse lookup.
        (#(if test-file?
            (str/replace % #"[_-]test$" "")
            %))
        (str/replace #"/" ".")
        (str/replace #"_" "-")
        symbol)))

(defn- module->all-deps [deps module]
  (keys (all-module-deps-paths deps module)))

(defn test-filenames->relevant-source-filenames
  "Given a collection of `test-filenames`, return the set of source filenames (relative to the project root directory)
  that when changed should trigger these tests."
  ([test-filenames]
   (let [modules-config (kondo-config)
         prefix->mod    (build-prefix->module modules-config)]
     (test-filenames->relevant-source-filenames (dependencies prefix->mod) prefix->mod test-filenames)))
  ([deps prefix->mod test-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (map (partial module prefix->mod))
          (distinct)
          (mapcat (fn [module]
                    (into #{module} (module->all-deps deps module))))
          (distinct)
          (mapcat #(module->source-files deps %)))
    test-filenames)))

(comment
  ;; should include source files for `settings-rest` itself as well as all modules used either directly or indirectly
  ;; by `settings-rest` (currently this set is huge, 955 files as of 2025-11-26)
  (test-filenames->relevant-source-filenames ["test/metabase/settings_rest/api_test.clj"]))

(defn- direct-dependents
  "Set of modules that directly depend on `module`."
  [deps module]
  (into (sorted-set)
        (keep (fn [ns-info]
                (when (some (fn [ns-deps]
                              (= (:module ns-deps) module))
                            (:deps ns-info))
                  (:module ns-info))))
        deps))

(comment
  (direct-dependents (dependencies) 'driver)
  (direct-dependents (dependencies) 'settings-rest))

(defn- indirect-dependents
  "Set of modules that either directly or indirectly depend on `module`."
  ([module]
   (indirect-dependents (configured-dependencies) module))
  ([deps module]
   (indirect-dependents deps module (sorted-set)))
  ([deps module acc]
   (let [module-deps (direct-dependents deps module)
         new-deps    (set/difference module-deps acc)
         acc         (into acc new-deps)]
     (reduce
      (fn [acc new-dep]
        (indirect-dependents deps new-dep acc))
      acc
      new-deps))))

(comment
  (indirect-dependents (dependencies) 'settings-rest))

(defn- module->dependents [deps module]
  (into #{module}
        (indirect-dependents deps module)))

(comment
  (module->dependents (dependencies) 'settings-rest))

(def ^:private test-source-file-extensions
  [".clj" ".cljc" ".cljs" ".bb"])

(defn- ns-prefix->test-path-fragment [ns-prefix]
  (->> (str/split ns-prefix #"\.")
       (map #(str/replace % #"-" "_"))
       (str/join "/")))

(defn- module->test-path-prefix [modules-config module]
  (let [ns-prefix   (module-ns-prefix modules-config module)
        [parent-dir ns-fragment]
        (cond
          (str/starts-with? ns-prefix "metabase-enterprise.")
          ["enterprise/backend/test/metabase_enterprise/"
           (subs ns-prefix (count "metabase-enterprise."))]

          (str/starts-with? ns-prefix "metabase.")
          ["test/metabase/"
           (subs ns-prefix (count "metabase."))]

          :else
          (throw (ex-info (str "Cannot derive a test path for module " module ": its :ns-prefix "
                               (pr-str ns-prefix) " is not under metabase. or metabase-enterprise.")
                          {:module module, :ns-prefix ns-prefix})))]
    (str parent-dir
         (ns-prefix->test-path-fragment ns-fragment))))

(defn- existing-test-file-paths [path-prefix]
  (into (sorted-set)
        (keep (fn [extension]
                (let [file (io/file (str path-prefix "_test" extension))]
                  (when (.isFile file)
                    (file->path-relative-to-project-root file)))))
        test-source-file-extensions))

(mu/defn- module->test-files :- [:set :string]
  "Return the set of test filenames associated with a `module`. The 2-arity form rebuilds the
  `prefix->module` lookup on every call; pass a shared one to the 3-arity form when resolving many
  modules (as [[source-filenames->relevant-test-filenames]] does over a module's transitive dependents)."
  ([modules-config :- [:map-of :any :any]
    module-sym :- :symbol]
   (module->test-files modules-config (build-prefix->module modules-config) module-sym))
  ([modules-config :- [:map-of :any :any]
    prefix->module :- [:maybe [:map-of :string symbol?]]
    module-sym :- :symbol]
   (let [path-prefix  (module->test-path-prefix modules-config module-sym)
         test-dir     (io/file path-prefix)
         nested-tests (when (.isDirectory test-dir)
                        (into
                         (sorted-set)
                         (comp (filter #(= module-sym
                                           (module prefix->module (file->namespace %))))
                               (map file->path-relative-to-project-root))
                         (ns.find/find-sources-in-dir test-dir)))]
     (into (existing-test-file-paths path-prefix)
           nested-tests))))

(defn source-filenames->relevant-test-filenames
  "Given a collection of `source-filenames`, return the set of test filenames (relative to the project root directory)
  that we should re-run when any of `source-filenames` change."
  ([source-filenames]
   (let [modules-config (kondo-config)
         prefix->mod    (build-prefix->module modules-config)]
     (source-filenames->relevant-test-filenames (dependencies prefix->mod) modules-config prefix->mod source-filenames)))
  ([deps modules-config prefix->mod source-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (map (partial module prefix->mod))
          (remove nil?)
          (distinct)
          (mapcat #(module->dependents deps %))
          (mapcat #(module->test-files modules-config prefix->mod %)))
    source-filenames)))

(comment
  ;; should only include tests for `settings-rest`, `api-routes`, `core`, and the handful of random modules that use
  ;; `settings-rest` (21 files as of 2025-11-26)
  (source-filenames->relevant-test-filenames ["src/metabase/settings_rest/api.clj"]))

;;;; Model boundary enforcement

(mu/defn find-model-keywords :- [:set :keyword]
  "Find all `:model/X` keywords referenced in a source file, ignoring comments."
  [file]
  (try
    (let [models (atom #{})]
      (loop [stack [(z/of-node (r.parser/parse-file-all file))]]
        (when-let [zloc (peek stack)]
          (let [stack' (pop stack)
                stack' (if-let [right (z/right zloc)]
                         (conj stack' right)
                         stack')]
            (if (comment-loc? zloc)
              (recur stack')
              (do
                (when (and (= (z/tag zloc) :token)
                           (keyword? (z/sexpr zloc))
                           (= "model" (namespace (z/sexpr zloc)))
                           (Character/isUpperCase ^char (first (name (z/sexpr zloc)))))
                  (swap! models conj (z/sexpr zloc)))
                (recur (if-let [child (z/down zloc)]
                         (conj stack' child)
                         stack')))))))
      @models)
    (catch Throwable e
      (throw (ex-info (format "Error scanning model keywords in %s: %s" (str file) (ex-message e))
                      {:file file}
                      e)))))

(mu/defn find-model-definitions :- [:set :keyword]
  "Find all models with their `t2/table-name` defined in this file."
  [file]
  (let [models (atom #{})]
    (loop [stack [(z/of-node (r.parser/parse-file-all file))]]
      (when-let [zloc (peek stack)]
        (let [stack' (pop stack)
              stack' (if-let [right (z/right zloc)]
                       (conj stack' right)
                       stack')]
          (if (comment-loc? zloc)
            (recur stack')
            (do
              (when (= (z/tag zloc) :list)
                (let [first-child (z/down zloc)]
                  (when (and first-child
                             (= (z/tag first-child) :token)
                             (some-> (:string-value (z/node first-child)) (str/ends-with? "/defmethod")))
                    (let [second-zloc (z/right first-child)
                          third-zloc  (some-> second-zloc z/right)]
                      (when (and second-zloc
                                 (= (z/sexpr second-zloc) 't2/table-name)
                                 third-zloc
                                 (keyword? (z/sexpr third-zloc))
                                 (= "model" (namespace (z/sexpr third-zloc))))
                        (swap! models conj (z/sexpr third-zloc)))))))
              (recur (if-let [child (z/down zloc)]
                       (conj stack' child)
                       stack')))))))
    @models))

(defn model-ownership
  "Scan all source files via [[find-model-definitions]], building a map of `:model/X` => module symbol.
  The module is derived from the defining namespace via [[module]], using the
  prefix map built from the current kondo config so that nested modules
  (and modules with explicit `:ns-prefix`) resolve correctly."
  []
  (let [prefix->mod (build-prefix->module (kondo-config))]
    (into (sorted-map)
          (for [file  (find-source-files)
                :let  [ns-symb (-> (ns.file/read-file-ns-decl file)
                                   ns.parse/name-from-ns-decl)
                       mod     (module prefix->mod ns-symb)
                       models  (find-model-definitions file)]
                :when mod
                model models]
            [model mod]))))

(def ^:private model-boundary-exempt-namespaces
  "Namespaces that are exempt from model boundary checking. These are 'glue' namespaces that intentionally reference
  all models."
  #{'metabase.models.resolution})

(defn- model-reference-violations
  "Return violation types for a single model reference. Pure function — no IO.

  When `model-imports` is `:bypass`, the using module is exempt from all model boundary checks —
  it may reference any model regardless of whether it is exported."
  [model defining-mod model-exports model-imports]
  (if (= model-imports :bypass)
    []
    (cond-> []
      (nil? defining-mod)
      (conj :unknown-model)

      (and defining-mod
           (not= model-exports :any)
           (not (contains? model-exports model)))
      (conj :not-exported)

      (and defining-mod
           (not= model-imports :any)
           (not (contains? model-imports model)))
      (conj :not-imported))))

(defn model-references-by-module
  "Scan all source files and build a map of `{module => #{:model/X ...}}` — the set of model keywords
  referenced in each module's source files. Exempt namespaces (e.g. `metabase.models.resolution`) are excluded.
  Includes all modules (including bypass modules) — callers filter as needed.

  Uses the prefix map from the current kondo config so nested modules
  resolve via [[module]] correctly."
  []
  (let [prefix->mod (build-prefix->module (kondo-config))]
    (reduce
     (fn [acc file]
       (try
         (let [ns-symb (-> (ns.file/read-file-ns-decl file)
                           ns.parse/name-from-ns-decl)
               mod     (module prefix->mod ns-symb)]
           (if (and mod (not (contains? model-boundary-exempt-namespaces ns-symb)))
             (let [models (find-model-keywords file)]
               (if (seq models)
                 (update acc mod (fnil into (sorted-set)) models)
                 acc))
             acc))
         (catch Throwable e
           (throw (ex-info (format "Error scanning model references in %s" (str file))
                           {:file file}
                           e)))))
     (sorted-map)
     (find-source-files))))

(defn model-boundary-violations
  "Find all model boundary violations across the codebase.
  For each source file, checks that:
  1. The defining module's `:model-exports` allows the model (`:any` or set containing it)
  2. The using module's `:model-imports` allows the model (`:any` or set containing it)
  3. The model's definition exists somewhere (`:unknown-model` is always a violation)

  Modules with `:model-imports :bypass` are exempt from all checks — they may reference any model,
  even unexported ones.

  Returns a sequence of violation maps with `:file`, `:module`, `:model`, `:defining-module`, `:violation-type`."
  ([]
   (model-boundary-violations (kondo-config)))
  ([kondo-config]
   (let [ownership   (model-ownership)
         prefix->mod (build-prefix->module kondo-config)]
     (into []
           (mapcat
            (fn [file]
              (try
                (let [ns-symb (-> (ns.file/read-file-ns-decl file)
                                  ns.parse/name-from-ns-decl)
                      mod     (module prefix->mod ns-symb)]
                  (when (and mod
                             (not (contains? model-boundary-exempt-namespaces ns-symb)))
                    (let [model-imports (get-in kondo-config [mod :model-imports] #{})
                          models       (find-model-keywords file)
                          rel-path     (file->path-relative-to-project-root file)]
                      (for [model          models
                            :let           [defining-mod  (get ownership model)]
                            :when          (not= defining-mod mod)
                            :let           [model-exports (when defining-mod
                                                            (get-in kondo-config [defining-mod :model-exports] #{}))]
                            violation-type (model-reference-violations
                                            model defining-mod model-exports model-imports)]
                        {:file            rel-path
                         :module          mod
                         :model           model
                         :defining-module defining-mod
                         :violation-type  violation-type}))))
                (catch Throwable e
                  (throw (ex-info (format "Error checking model boundaries in %s" (str file))
                                  {:file file}
                                  e))))))
           (find-source-files)))))

(comment
  (model-ownership)
  (model-boundary-violations (kondo-config)))
