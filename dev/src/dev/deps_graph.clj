(ns dev.deps-graph
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
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
      (and (= (z/tag first-child) :token)
           (require-symbols (z/sexpr first-child))))))

(mu/defn- find-required-namespace :- [:maybe simple-symbol?]
  "Given a `zloc` pointing to one of the children of something like `(require ...)` find a required namespace symbol."
  [zloc :- ::zloc]
  (when-let [symbol-loc (z/find-depth-first zloc #(and (= (z/tag %) :token)
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
  (find-dynamically-loaded-namespaces "src/metabase/db/setup.clj")
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

(def ^:private ignored-dependencies
  "Technically `config` 'uses' `enterprise/core` and `test` since it tries to load them to see if they exist so we know
  if EE/test code is available; however we can ignore them since they're not 'real' usages. So add them here so we
  don't include them in our deps tree."
  '{metabase.config #{metabase-enterprise.core.dummy-namespace metabase.test.dummy-namespace}})

(mu/defn- file-dependencies :- [:map
                                [:namespace simple-symbol?]
                                [:module    symbol?]
                                [:deps      [:sequential
                                             [:map
                                              [:namespace simple-symbol?]
                                              [:module    symbol?]
                                              [:dynamic {:optional true} :keyword]]]]]
  [file]
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
  (file-dependencies "src/metabase/db/setup.clj")
  ;; should ignore the entries from [[ignored-dependencies]]
  (file-dependencies "src/metabase/config.clj")

  (file-dependencies "src/metabase/query_processor/middleware/permissions.clj"))

(def ^{:arglists '([])} dependencies
  (memoize/ttl
   (fn []
     (doall (pmap file-dependencies (find-source-files))))
   ;; memoize for five seconds
   :ttl/threshold 5000))

(defn external-usages
  "All usages of a module named by `module-symb` outside that module."
  [module-symb]
  (for [dep    (dependencies)
        :when  (not= (:module dep) module-symb)
        ns-dep (:deps dep)
        :when  (= (:module ns-dep) module-symb)]
    {:namespace            (:namespace dep)
     :module               (:module dep)
     :depends-on-namespace (:namespace ns-dep)
     :depends-on-module    (:module ns-dep)}))

(defn external-usages-by-namespace
  "Return a map of module namespace => set of external namespaces using it"
  [module-symb]
  (into (sorted-map)
        (map (fn [[k v]]
               [k (into (sorted-set) (map :namespace) v)]))
        (group-by :depends-on-namespace (external-usages module-symb))))

(defn externally-used-namespaces
  "All namespaces from a module that are used outside that module."
  [module-symb]
  (into (sorted-set) (map :depends-on-namespace) (external-usages module-symb)))

(defn module-dependencies
  "Build a graph of module => set of modules it refers to."
  ([]
   (letfn [(reduce-module-deps [module-deps module deps]
             (reduce
              (fn [module-deps {dep-module :module, :as _dep}]
                (cond-> module-deps
                  (not= dep-module module) (conj dep-module)))
              (or module-deps (sorted-set))
              deps))
           (reduce-deps [module->deps {:keys [module deps]}]
             (update module->deps module reduce-module-deps module deps))]
     (reduce reduce-deps (sorted-map) (dependencies))))

  ([module]
   (get (module-dependencies) module)))

(defn circular-dependencies
  "Build a graph of module => set of modules it refers to that also refer to this module."
  ([]
   (let [module->deps (module-dependencies)]
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

  ([module]
   (get (circular-dependencies) module)))

(defn non-circular-module-dependencies
  "A graph of [[module-dependencies]], but with modules that have any circular dependencies filtered out. This is mostly
  meant to make it easier to fill out the `:metabase/modules` `:uses` section of the Kondo config, or to figure out
  which ones can easily get a consolidated API namespace without drama."
  []
  (let [circular-dependencies (circular-dependencies)]
    (into (sorted-map)
          (remove (fn [[module _deps]]
                    (contains? circular-dependencies module)))
          (module-dependencies))))

(defn module-usages-of-other-module
  "Information about how `module-x` uses `module-y`."
  [module-x module-y]
  (let [module-x-ns->module-y-ns   (->> (external-usages module-y)
                                        (filter #(= (:module %) module-x))
                                        (map (juxt :namespace :depends-on-namespace)))]
    (reduce
     (fn [m [module-x-ns module-y-ns]]
       (update m module-x-ns (fn [deps]
                               (conj (or deps (sorted-set)) module-y-ns))))
     (sorted-map)
     module-x-ns->module-y-ns)))

(defn full-dependencies
  "Like [[dependencies]] but also includes transient dependencies."
  []
  (let [deps-graph  (module-dependencies)
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

(defn module-deps-count []
  (into (sorted-map)
        (map (fn [[k v]]
               [k (count v)]))
        (full-dependencies)))

(defn module-dependencies-mermaid []
  (println "flowchart TD")
  (doseq [[module deps] (module-dependencies)
          dep deps]
    (printf "%s-->%s\n" module dep)))

(defn module-dependencies-graphviz []
  (println "digraph {")
  (doseq [[module deps] (module-dependencies)
          dep deps]
    (printf "  \"%s\" -> \"%s\"\n" module dep))
  (println "}"))

(defn generate-config
  "Generate the Kondo config that should go in `.clj-kondo/config/modules/config.edn`."
  []
  (into (sorted-map)
        (map (fn [[module uses]]
               [module {:api (externally-used-namespaces module)
                        :uses uses}]))
        (module-dependencies)))

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
  []
  (-> (ddiff/diff (kondo-config) (generate-config))
      ddiff/minimize
      kondo-config-diff-ignore-any
      ddiff/minimize))

(defn print-kondo-config-diff
  "Print the diff between how the config would look if regenerated with [[generate-config]] versus how it looks in
  reality ([[kondo-config]]). Use this to suggest updates to make to the config file."
  []
  (ddiff/pretty-print (kondo-config-diff)))
