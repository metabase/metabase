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
   [hooks.common.modules :as modules]
   [lambdaisland.deep-diff2 :as ddiff]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

;; Many functions in this namespace re-parse the same files over and over again during testing, so introduce a
;; mechanism for bounded caching of those parsed files.
(def ^:dynamic *parsed-file-cache* nil)

(defn- parse-file-all
  "Calls `rewrite-.clj.parser/parse-file-all`, but first checks in `*parsed-file-cache*` if it is bound."
  [file]
  (if *parsed-file-cache*
    (or (@*parsed-file-cache* file)
        (get (swap! *parsed-file-cache* assoc file (r.parser/parse-file-all file)) file))
    (r.parser/parse-file-all file)))

(defn- skip-node? [node]
  (let [tag (n/tag node)]
    (or (#{:uneval :comment :newline :whitespace} tag)
        (and (= tag :list)
             (when-let [fst (first (n/children node))]
               (and (= (n/tag fst) :token)
                    (= (:value fst) 'comment)))))))

(defn- walk-parsed-ignore-comments!
  "Simple fast recursive walker over `tree` which should be a file parsed with rewrite-clj. The passed consumer function
  `f` should use side-effects to accumulate the results."
  [f tree]
  (letfn [(walk [node]
            (when-not (skip-node? node)
              ;; Don't descend into comments
              (f node)
              (when-let [children (:children node)]
                (run! walk children))))]
    (walk tree)))

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

(mu/defn- plugin-source-roots :- [:sequential (ms/InstanceOfClass java.io.File)]
  "Source roots of the separately built plugin modules under `modules/`: every driver, plus the siblings that
  ship as their own jar. They are off the main classpath, so nothing else here would find them."
  []
  (let [modules (io/file (str (.getAbsolutePath (project-root-directory)) "/modules"))]
    (concat
     (for [driver (.listFiles (io/file modules "drivers"))]
       (io/file driver "src"))
     [(io/file modules "embedder" "src")])))

(mu/defn- find-source-files :- [:sequential (ms/InstanceOfClass java.io.File)]
  []
  (mapcat ns.find/find-sources-in-dir
          (list* (source-root) (enterprise-source-root) (plugin-source-roots))))

(def ^:private require-symbols
  '#{require
     clojure.core/require
     classloader/require
     metabase.classloader.core/require
     metabase.classloader.impl/require
     requiring-resolve
     clojure.core/requiring-resolve})

(defn- find-required-namespaces
  "Find all `(require ...)` forms in a file and return symbols it they load."
  [file]
  (let [acc (atom #{})]
    (walk-parsed-ignore-comments!
     (fn [node]
       (when (= (n/tag node) :list)
         (when-let [[first-child & other :as children] (remove skip-node? (n/children node))]
           (when (and first-child
                      (= (n/tag first-child) :token)
                      ;; Check all child symbols on the line since `require` might be called in a threading macro
                      ;; like (-> 'ns require)
                      (some #(and (= (n/tag %) :token)
                                  (require-symbols (n/sexpr %)))
                            children))
             (run! #(when (and (= (n/tag %) :quote))
                      (when-let [in (some-> (n/children %) first n/sexpr)]
                        (when (symbol? in)
                          (swap! acc conj (if (qualified-symbol? in)
                                            (symbol (namespace in))
                                            in)))))
                   other)))))
     (parse-file-all file))
    @acc))

(mu/defn- find-dynamically-loaded-namespaces :- [:set simple-symbol?]
  "Find the set of namespace symbols for namespaces loaded by `require` and friends in a `file`."
  [file]
  (try
    (find-required-namespaces file)
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
       (z/of-node (parse-file-all file)))
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
       (z/of-node (parse-file-all file)))
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
  [prefix->module :- map?
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
       :module    (modules/resolve-module prefix->module ns-symb)
       :deps      (sort-by pr-str
                           (keep (fn [required-ns]
                                   (when-let [module (modules/resolve-module prefix->module required-ns)]
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
                      e)))))

(declare kondo-config)

(comment
  (file-dependencies (modules/build-prefix->module (kondo-config)) "src/metabase/app_db/setup.clj")
  ;; should ignore the entries from [[ignored-dependencies]]
  (file-dependencies (modules/build-prefix->module (kondo-config)) "src/metabase/config.clj")

  (file-dependencies (modules/build-prefix->module (kondo-config)) "src/metabase/query_processor/middleware/permissions.clj"))

(defn dependencies
  "Parse source files into module dependency data.

  Namespaces resolve through `prefix->module`, which defaults to the current
  module config."
  ([]
   (dependencies (modules/build-prefix->module (kondo-config))))
  ([prefix->module]
   (map (partial file-dependencies prefix->module) (find-source-files))))

(defn external-usages
  "All usages of a module named by `module-symb` outside that module."
  ([module-symb]
   (external-usages (dependencies) module-symb))

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
   (external-usages-by-namespace (dependencies) module-symb))

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

(defn externally-used-namespaces-ignoring-friends
  "Namespaces that external callers require from `module-symb`.

  Ignores friends and descendants, which may use internal namespaces. A
  descendant still preserves an existing API entry that it uses."
  ([module-symb]
   (externally-used-namespaces-ignoring-friends (dependencies) (kondo-config) module-symb))

  ([deps kondo-config module-symb]
   (let [friends (module-friends kondo-config module-symb)
         api     (get-in kondo-config [module-symb :api])]
     (into (sorted-set)
           (comp (remove #(contains? friends (:module %)))
                 ;; Descendant use does not create API, but it preserves existing entries.
                 (remove (fn [{:keys [module depends-on-namespace]}]
                           (and (modules/descendant-of? kondo-config module module-symb)
                                (not (and (set? api) (contains? api depends-on-namespace))))))
                 (map :depends-on-namespace))
           (external-usages deps module-symb)))))

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
   (module-usages-of-other-module (dependencies) module-x module-y))

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
        ;; Keep the seed set so cycles converge instead of oscillating.
        expand-deps (fn expand-deps [deps]
                      (let [deps' (into deps (mapcat deps-graph deps))]
                        (if (= deps deps')
                          deps
                          (recur deps'))))]
    (into (sorted-map)
          (map (fn [[k v]]
                 [k (expand-deps v)]))
          deps-graph)))

(defn module-deps-count [deps]
  (into (sorted-map)
        (map (fn [[k v]]
               [k (count v)]))
        (full-dependencies deps)))

(defn generate-config
  "Generate the Kondo config that should go in `.clj-kondo/config/modules/config.edn`."
  ([]
   (generate-config (dependencies) (kondo-config)))

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

(defn module-team
  "Team owning `module`: its own `:team`, else its nearest ancestor's."
  [config module]
  (some #(get-in config [% :team])
        (take-while some? (iterate #(modules/parent-module config %) module))))

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
  ([]
   (kondo-config-diff (dependencies)))

  ([deps]
   (let [kondo-config (kondo-config)]
     (-> (ddiff/diff
          (update-vals kondo-config #(dissoc % :team :friends :model-imports :model-exports :module-exports :ns-prefix))
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
   (all-module-deps-paths (dependencies) module))
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
   (module-dependencies-by-namespace (dependencies) module))

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
  (let [deps            (dependencies)
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
   (leaf-modules (dependencies)))
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
  (let [deps        (dependencies)
        all-modules (into (sorted-set) (map :module) deps)
        module-deps (set (keys (all-module-deps-paths deps module)))]
    ;; dev REPL tool; the summary line is for the human at the console
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
                  :module (modules/resolve-module prefix->module new-namespace)))
         (update :deps (fn [deps]
                         (for [dep deps]
                           (if (= (:namespace dep) old-namespace)
                             {:namespace new-namespace, :module (modules/resolve-module prefix->module new-namespace)}
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
  (let [prefix->module  (modules/build-prefix->module (kondo-config))
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
  (-> file
      file->path-relative-to-project-root
      (str/replace #"^enterprise/backend/" "")
      (str/replace #"^(?:(?:src)|(?:test))/" "")
      (str/replace #"\.clj[cs]?$" "")
      (str/replace #"/" ".")
      (str/replace #"_" "-")
      symbol))

(defn- module->all-deps [deps module]
  (keys (all-module-deps-paths deps module)))

(defn test-filenames->relevant-source-filenames
  "Given a collection of `test-filenames`, return the set of source filenames (relative to the project root directory)
  that when changed should trigger these tests."
  ([test-filenames]
   (let [prefix->module (modules/build-prefix->module (kondo-config))]
     (test-filenames->relevant-source-filenames (dependencies prefix->module) prefix->module test-filenames)))
  ([deps prefix->module test-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (map #(modules/resolve-module prefix->module %))
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
   (indirect-dependents (dependencies) module))
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

(defn- module->test-path-prefix [modules-config module]
  (let [ns-prefix (modules/module-ns-prefix modules-config module)]
    (str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")
         "test/"
         (-> ns-prefix (str/replace "." "/") (str/replace "-" "_")))))

(defn- existing-test-file-paths [path-prefix]
  (into (sorted-set)
        (keep (fn [extension]
                (let [file (io/file (str path-prefix "_test" extension))]
                  (when (.isFile file)
                    (file->path-relative-to-project-root file)))))
        test-source-file-extensions))

(mu/defn- module->test-files :- [:set :string]
  "Return the set of test filenames associated with a `module`."
  ([modules-config :- map?
    module-sym :- :symbol]
   (module->test-files modules-config (modules/build-prefix->module modules-config) module-sym))
  ([modules-config :- map?
    prefix->module :- map?
    module-sym :- :symbol]
   (let [path-prefix  (module->test-path-prefix modules-config module-sym)
         test-dir     (io/file path-prefix)
         nested-tests (when (.isDirectory test-dir)
                        (into
                         (sorted-set)
                         (comp (filter #(= module-sym
                                           (modules/resolve-module prefix->module (file->namespace %))))
                               (map file->path-relative-to-project-root))
                         (ns.find/find-sources-in-dir test-dir)))]
     (into (existing-test-file-paths path-prefix)
           nested-tests))))

(defn source-filenames->relevant-test-filenames
  "Given a collection of `source-filenames`, return the set of test filenames (relative to the project root directory)
  that we should re-run when any of `source-filenames` change."
  ([source-filenames]
   (let [modules-config (kondo-config)
         prefix->module (modules/build-prefix->module modules-config)]
     (source-filenames->relevant-test-filenames
      (dependencies prefix->module) modules-config prefix->module source-filenames)))
  ([deps modules-config prefix->module source-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (keep #(modules/resolve-module prefix->module %))
          (distinct)
          (mapcat #(module->dependents deps %))
          (distinct)
          (mapcat #(module->test-files modules-config prefix->module %)))
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
      (walk-parsed-ignore-comments!
       (fn [node]
         (when (= (n/tag node) :token)
           (let [sexpr (n/sexpr node)]
             (when (and (keyword? sexpr)
                        (= "model" (namespace sexpr))
                        (Character/isUpperCase ^char (first (name sexpr))))
               (swap! models conj sexpr)))))
       (parse-file-all file))
      @models)
    (catch Throwable e
      (throw (ex-info (format "Error scanning model keywords in %s: %s" (str file) (ex-message e))
                      {:file file}
                      e)))))

(mu/defn find-model-definitions :- [:set :keyword]
  "Find all models with their `t2/table-name` defined in this file."
  [file]
  (let [models (atom #{})]
    (walk-parsed-ignore-comments!
     (fn [node]
       (when (= (n/tag node) :list)
         (let [[fst snd trd :as children] (remove skip-node? (n/children node))]
           (when (and fst (= (n/tag fst) :token)
                      (some-> (n/string fst) (str/ends-with? "/defmethod")))
             (when (and fst snd trd
                        (= (n/tag fst) :token)
                        (= (n/tag snd) :token)
                        (= (n/tag trd) :token)
                        (some-> (n/string fst) (str/ends-with? "/defmethod"))
                        (= (n/sexpr snd) 't2/table-name)
                        (keyword? (n/sexpr trd))
                        (= "model" (namespace (n/sexpr trd))))
               (swap! models conj (n/sexpr trd)))))))
     (parse-file-all file))
    @models))

(defn model-ownership
  "Map each defined `:model/X` to the module that owns its namespace."
  []
  (let [prefix->mod (modules/build-prefix->module (kondo-config))]
    (into (sorted-map)
          (for [file  (find-source-files)
                :let  [ns-symb (-> (ns.file/read-file-ns-decl file)
                                   ns.parse/name-from-ns-decl)
                       mod     (modules/resolve-module prefix->mod ns-symb)
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
  Includes all modules (including bypass modules) — callers filter as needed."
  []
  (let [prefix->mod (modules/build-prefix->module (kondo-config))]
    (reduce
     (fn [acc file]
       (try
         (let [ns-symb (-> (ns.file/read-file-ns-decl file)
                           ns.parse/name-from-ns-decl)
               mod     (modules/resolve-module prefix->mod ns-symb)]
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
   (model-boundary-violations kondo-config (model-ownership)))
  ([kondo-config ownership]
   (let [prefix->mod (modules/build-prefix->module kondo-config)]
     (into []
           (comp
            (mapcat
             (fn [file]
               (try
                 (let [ns-symb (-> (ns.file/read-file-ns-decl file)
                                   ns.parse/name-from-ns-decl)
                       mod     (modules/resolve-module prefix->mod ns-symb)]
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
                                   e)))))))
           (find-source-files)))))

(comment
  (model-ownership)
  (model-boundary-violations (kondo-config)))

;;;; Module boundary analysis

(defn- graph-nodes [graph]
  (into (set (keys graph)) (mapcat val) graph))

(defn strongly-connected-components
  "Return the strongly connected components of `graph` as a vector of sets.
  A node outside every cycle comes back as a singleton set."
  [graph]
  ;; Tarjan's algorithm, kept recursive because that reads better than an explicit stack of frames.
  ;; Each node on the search path costs a level of recursion, so the worst case is one level per node.
  ;; As of 2026-09-11 the 206-module graph peaks at 40 levels; the default 2 MB thread stack fits about 2,600.
  (letfn [(pop-component [state root]
            (loop [state state, component #{}]
              (let [node      (peek (:stack state))
                    state     (-> state
                                  (update :stack pop)
                                  (update :on-stack disj node))
                    component (conj component node)]
                (if (= node root)
                  (update state :components conj component)
                  (recur state component)))))
          (visit [state node]
            (let [node-index (:next-index state)
                  state      (-> state
                                 (assoc-in [:index node] node-index)
                                 (assoc-in [:lowlink node] node-index)
                                 (update :next-index inc)
                                 (update :stack conj node)
                                 (update :on-stack conj node))
                  state      (reduce (fn [state successor]
                                       (cond
                                         (not (contains? (:index state) successor))
                                         (let [state (visit state successor)]
                                           (update-in state [:lowlink node]
                                                      min
                                                      (get-in state [:lowlink successor])))

                                         (contains? (:on-stack state) successor)
                                         (update-in state [:lowlink node]
                                                    min
                                                    (get-in state [:index successor]))

                                         :else
                                         state))
                                     state
                                     (get graph node))]
              (cond-> state
                (= (get-in state [:lowlink node]) (get-in state [:index node]))
                (pop-component node))))]
    (:components
     (reduce (fn [state node]
               (cond-> state
                 (not (contains? (:index state) node)) (visit node)))
             {:components []
              :index      {}
              :lowlink    {}
              :next-index 0
              :on-stack   #{}
              :stack      []}
             (sort (graph-nodes graph))))))

(defn cyclic-components
  "Non-singleton [[strongly-connected-components]], largest first; ties sort by first member."
  [graph]
  (->> (strongly-connected-components graph)
       (filter #(> (count %) 1))
       (sort-by (fn [component] [(- (count component)) (str (first (sort component)))]))
       vec))

(defn model-import-dependencies
  "Module => the modules defining the models it imports. This is real coupling that the `:uses` graph does not
  carry: a module can depend on another module's row shapes without requiring any of its namespaces, so cycles
  that only exist through models are invisible in the require graph.

  `ownership` maps each model to its defining module, as [[model-ownership]] does.
  A module imports its `:model-imports` set, or with `:model-imports :any` every model in its `references`
  entry, as [[model-references-by-module]] builds them.
  A `:bypass` module contributes no edges; the `:model-imports-bypass` module ratchet counts those instead."
  [config ownership references]
  (into (sorted-map)
        (map (fn [[module {:keys [model-imports]}]]
               (let [imports (cond
                               (set? model-imports)   model-imports
                               (= :any model-imports) (get references module))]
                 [module (into (sorted-set) (comp (keep ownership) (remove #{module})) imports)])))
        config))

(defn- cyclic-component-sizes
  "Module and namespace counts for each [[cyclic-components]] cluster."
  [graph node->namespace-count]
  (mapv (fn [component]
          {:modules    (count component)
           :namespaces (transduce (map #(get node->namespace-count % 0)) + 0 component)})
        (cyclic-components graph)))

(defn module-boundary-stats
  "REPL diagnostics for the module graph:

  - `:api-any-namespaces`  namespaces exposed by `:api :any` modules
  - `:module-count`        configured modules
  - `:scc-module-sizes`    modules per cycle, largest first
  - `:scc-namespace-sizes` namespaces per cycle, in the same order

  These values are not ratcheted because any source change can move them. Use namespace sizes to track
  cycle reduction: splitting a module can grow a cycle's module count without removing namespaces."
  ([]
   (module-boundary-stats (dependencies) (kondo-config)))
  ([deps config]
   (let [any-modules (into #{} (keep (fn [[module cfg]] (when (= :any (:api cfg)) module))) config)
         sizes       (cyclic-component-sizes (module-dependencies deps)
                                             (frequencies (keep :module deps)))]
     {:api-any-namespaces  (count (filter #(contains? any-modules (:module %)) deps))
      :module-count        (count config)
      :scc-module-sizes    (mapv :modules sizes)
      :scc-namespace-sizes (mapv :namespaces sizes)})))

(comment
  (module-boundary-stats))
