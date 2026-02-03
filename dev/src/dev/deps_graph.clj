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

(mu/defn- module :- [:maybe symbol?]
  "E.g.

    (module 'metabase.qp.middleware.wow) => 'qp
    (module 'metabase-enterprise.whatever.core) => enterprise/whatever"
  [ns-symb :- simple-symbol?]
  (or (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
               second
               (symbol "enterprise"))
      (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
              second
              symbol)))

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
  [file :- [:or
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
       :module    (module ns-symb)
       :deps      (sort-by pr-str
                           (keep (fn [required-ns]
                                   (when-let [module (module required-ns)]
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

(comment
  (file-dependencies "src/metabase/app_db/setup.clj")
  ;; should ignore the entries from [[ignored-dependencies]]
  (file-dependencies "src/metabase/config.clj")

  (file-dependencies "src/metabase/query_processor/middleware/permissions.clj"))

(defn dependencies
  "Calculate information about all the modules dependencies for all *SOURCE* files in the Metabase project by parsing
  the files."
  []
  (pmap file-dependencies (find-source-files)))

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

(declare kondo-config)

(defn externally-used-namespaces-ignoring-friends
  "All namespaces from a module that are used outside that module, excluding usages by `:friends` of the module."
  ([module-symb]
   (externally-used-namespaces-ignoring-friends (dependencies) (kondo-config) module-symb))

  ([deps kondo-config module-symb]
   (let [friends (module-friends kondo-config module-symb)]
     (into (sorted-set)
           (comp (remove #(contains? friends (:module %)))
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
        expand-deps (fn expand-deps [deps]
                      (let [deps' (into (sorted-set)
                                        (mapcat deps-graph)
                                        deps)]
                        (if (= deps deps')
                          deps
                          (expand-deps deps'))))]
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
          (update-vals kondo-config #(dissoc % :team :friends))
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

    (simulate-rename (dependencies) '{metabase.users.api metabase.users-rest.api})"
  ([deps old-namespace new-namespace]
   (for [dep deps]
     (-> dep
         (cond-> (= (:namespace dep) old-namespace)
           (assoc :namespace new-namespace
                  :module (module new-namespace)))
         (update :deps (fn [deps]
                         (for [dep deps]
                           (if (= (:namespace dep) old-namespace)
                             {:namespace new-namespace, :module (module new-namespace)}
                             dep)))))))

  ([deps old-namespace->new-namespace]
   (reduce
    (fn [deps [old-namespace new-namespace]]
      (simulate-rename deps old-namespace new-namespace))
    deps
    old-namespace->new-namespace)))

(defn dependencies-eliminated-by-renaming-namespaces
  "Calculate the set of dependencies of `module` (both explicit and transient) that would be eliminated by renaming
  `old-namespaces->new-namespaces`.

    (dependencies-eliminated-by-renaming-namespaces 'users '{metabase.users.api metabase.users-rest.api})"
  [module old-namespace->new-namespace]
  (let [deps            (dependencies)
        old-module-deps (into (sorted-set) (keys (all-module-deps-paths deps module)))
        new-deps        (simulate-rename deps old-namespace->new-namespace)
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
   (test-filenames->relevant-source-filenames (dependencies) test-filenames))
  ([deps test-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (map module)
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

(defn- module->test-directory [module]
  (let [parent-dir (case (namespace module)
                     nil          "test/metabase/"
                     "enterprise" "enterprise/backend/test/metabase_enterprise/")
        module-dir (str/replace (name module) #"-" "_")]
    (str parent-dir module-dir)))

(mu/defn- module->test-files :- [:set :string]
  "Return the set of test filenames associated with a `module`."
  [module :- :symbol]
  (let [test-dir       (module->test-directory module)
        test-filenames (ns.find/find-sources-in-dir (io/file test-dir))]
    (into
     (sorted-set)
     (map file->path-relative-to-project-root)
     test-filenames)))

(defn source-filenames->relevant-test-filenames
  "Given a collection of `source-filenames`, return the set of test filenames (relative to the project root directory)
  that we should re-run when any of `source-filenames` change."
  ([source-filenames]
   (source-filenames->relevant-test-filenames (dependencies) source-filenames))
  ([deps source-filenames]
   (into
    (sorted-set)
    (comp (map file->namespace)
          (map module)
          (distinct)
          (mapcat #(module->dependents deps %))
          (mapcat module->test-files))
    source-filenames)))

(comment
  ;; should only include tests for `settings-rest`, `api-routes`, `core`, and the handful of random modules that use
  ;; `settings-rest` (21 files as of 2025-11-26)
  (source-filenames->relevant-test-filenames ["src/metabase/settings_rest/api.clj"]))
