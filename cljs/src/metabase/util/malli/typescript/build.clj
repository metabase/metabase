(ns metabase.util.malli.typescript.build
  (:require
   [cljs.analyzer :as ana]
   [cljs.compiler :as comp]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.declaration :as declaration]
   [metabase.util.malli.typescript.refs :as refs]
   [shadow.build.data :as b.data]))

(set! *warn-on-reflection* true)

(defn entry-namespaces
  "Return configured Shadow CLJS entry namespaces in declaration order."
  [state]
  (vec (or (get-in state [:shadow.build/config :entries])
           (get-in state [::b.data/config :entries])
           (get-in state [:build-config :entries])
           (get-in state [:config :entries])
           [])))

(defn exported-defs
  "Return analyzer defs explicitly exported as runtime JS values."
  [defs]
  (into {}
        (filter (fn [[_ {:keys [export export-symbol]}]]
                  (or export export-symbol)))
        defs))

(defn entry-definitions
  "Return exported schema defs for configured Shadow entry namespaces."
  [state]
  (let [namespaces (get-in state [:compiler-env ::ana/namespaces])]
    (into (sorted-map-by #(compare (str %1) (str %2)))
          (keep (fn [entry-ns]
                  (let [defs (exported-defs (get-in namespaces [entry-ns :defs]))]
                    (when (seq defs)
                      [entry-ns defs]))))
          (entry-namespaces state))))

(defn module-reexports
  "Return dependency re-exports for an entry module.

  Entry declarations describe only values exported by that runtime module, so
  dependency namespace re-exports are intentionally absent."
  [_all-namespaces]
  nil)

(defn- debug-cljs?
  []
  (some? (System/getenv "MB_DEBUG_CLJS")))

(defn- registry-schema-resolver
  [resolve-schema require-ns]
  (let [attempted-namespaces (atom #{})]
    (fn [schema-keyword]
      (or (try
            (resolve-schema schema-keyword)
            (catch Exception _
              nil))
          (when-let [ns-name (namespace schema-keyword)]
            (let [ns-sym (symbol ns-name)]
              (when-not (contains? @attempted-namespaces ns-sym)
                (swap! attempted-namespaces conj ns-sym)
                (require-ns ns-sym))
              (try
                (resolve-schema schema-keyword)
                (catch Exception _
                  nil))))))))

(defn- try-require-ns
  [ns-sym]
  (try
    (require ns-sym)
    true
    (catch java.io.FileNotFoundException _
      (log/debug "Skipping CLJS-only registry namespace" {:ns ns-sym})
      false)))

(defonce ^:private resolve-global-schema
  (registry-schema-resolver mr/resolve-schema try-require-ns))

(defn- resolve-registry-schema
  [local-definitions schema-keyword]
  (or (get local-definitions schema-keyword)
      (resolve-global-schema schema-keyword)))

(defn- generate-type-alias-result
  [initial-refs local-definitions expand? ref-name]
  (refs/type-aliases
   initial-refs
   {:resolve-schema #(resolve-registry-schema local-definitions %)
    :compile-options {:registry local-definitions}
    :expand? expand?
    :type-name declaration/base-type-name
    :ref-name ref-name}))

(defn- merge-weak-types
  [results]
  (apply merge-with into (map :weak-types results)))

(defn- declaration-results
  [ns defs shared-types]
  (mapv #(declaration/def->result % {:current-ns ns
                                     :shared-types shared-types})
        (vals defs)))

(defn- merged-local-definitions
  [results]
  (let [definitions-by-key (reduce (fn [acc definitions]
                                     (reduce-kv #(update %1 %2 (fnil conj []) %3)
                                                acc
                                                definitions))
                                   {}
                                   (map :local-definitions results))]
    (reduce-kv
     (fn [{:keys [definitions diagnostics]} schema-keyword definitions-for-key]
       (let [definition-forms (map #(if (mc/schema? %) (mc/form %) %) definitions-for-key)
             distinct-definitions (distinct definition-forms)
             conflict? (< 1 (count distinct-definitions))]
         {:definitions (assoc definitions schema-keyword
                              (if conflict? :any (first distinct-definitions)))
          :diagnostics (cond-> diagnostics
                         conflict?
                         (conj {:type :conflicting-inline-registry-definition
                                :schema schema-keyword}))}))
     {:definitions {}, :diagnostics []}
     definitions-by-key)))

(defn- collect-refs-from-defs
  "Collect global registry refs reachable from exported defs. Inline registry
  definitions remain local, while global refs nested inside them are retained."
  [ns defs]
  (let [results      (declaration-results ns defs #{})
        direct-refs  (into #{} (mapcat :registry-refs) results)
        local-defs   (:definitions (merged-local-definitions results))
        alias-result (generate-type-alias-result
                      direct-refs
                      local-defs
                      (constantly true)
                      #(declaration/registry-type-name % #{}))]
    (set/difference (set (:refs-used alias-result))
                    (set (keys local-defs)))))

(defn- ts-content
  "Generate TypeScript content and diagnostics for one runtime entry namespace."
  [ns defs shared-types ns-refs]
  (let [results        (declaration-results ns defs shared-types)
        declarations   (str/join "\n\n" (map :declaration results))
        direct-refs    (into (set ns-refs) (mapcat :registry-refs) results)
        {local-defs :definitions local-diagnostics :diagnostics} (merged-local-definitions results)
        alias-result   (generate-type-alias-result
                        direct-refs
                        local-defs
                        #(not (contains? shared-types %))
                        #(declaration/registry-type-name % shared-types))
        type-aliases   (str/join "\n\n" (:declarations alias-result))
        shared-refs-used (filter shared-types (:refs-used alias-result))
        import-stmt    (when (seq shared-refs-used)
                         "import type * as Shared from './metabase.lib.shared';\n\n")]
    {:content (str (or import-stmt "")
                   (if (seq type-aliases)
                     (str "// Type aliases for registry schemas\n" type-aliases "\n\n" declarations)
                     declarations))
     :diagnostics (vec (concat (mapcat :diagnostics results)
                               local-diagnostics
                               (:diagnostics alias-result)))
     :weak-types (merge-weak-types results)}))

(defn- generate-shared-types-result
  "Generate content and diagnostics for the shared registry alias module."
  [shared-refs]
  (let [alias-result (generate-type-alias-result
                      shared-refs
                      {}
                      (constantly true)
                      #(declaration/registry-type-name % #{}))]
    {:content (str "// Shared type aliases for registry schemas used by multiple modules\n"
                   "// Auto-generated - do not edit\n\n"
                   (str/join "\n\n" (:declarations alias-result)))
     :diagnostics (:diagnostics alias-result)}))

(defn- ns->file-path
  "Convert a namespace symbol to a source file path.
   e.g., metabase.lib.limit -> src/metabase/lib/limit.cljs"
  [ns-sym]
  (let [ns-str (str ns-sym)
        path (-> ns-str
                 (str/replace "." "/")
                 (str/replace "-" "_"))
        base-path (str "src/" path)
        candidates [(str base-path ".cljs")
                    (str base-path ".cljc")
                    (str base-path ".clj")]]
    (or (first (filter #(.exists (java.io.File. ^String %)) candidates))
        (str base-path ".cljs"))))

(defn- output-weak-type-warnings!
  "Output warnings for namespaces that have any/unknown types."
  [weak-types]
  (when (seq weak-types)
    (log/warn "=== TypeScript generation: files with weak types (any/unknown) ===")
    (doseq [[ns entries] (sort-by key weak-types)]
      (let [any-count (count (filter #(= :any (:type %)) entries))
            unknown-count (count (filter #(= :unknown (:type %)) entries))
            file-path (ns->file-path ns)]
        (log/warn (str "  " file-path " - any: " any-count ", unknown: " unknown-count))))
    (log/warn "Set MB_DEBUG_CLJS=verbose to list entities with weak types")
    (when (= "verbose" (System/getenv "MB_DEBUG_CLJS"))
      (log/warn "=== Entities with weak types ===")
      (doseq [[ns entries] (sort-by key weak-types)]
        (let [by-def (group-by :def entries)]
          (log/warn (str "  " (ns->file-path ns) ":"))
          (doseq [[def-name def-entries] (sort-by key by-def)]
            (let [types (->> def-entries (map :type) distinct sort (map name) (str/join ", "))]
              (log/warn (str "    " def-name " [" types "]")))))))))

(defn- declaration-module-names
  [nses-defs]
  (mapv #(comp/munge (str %)) (keys nses-defs)))

(defn- cleanup-stale-declarations!
  [^java.io.File output-directory previous-modules current-modules shared?]
  (let [current-modules (set current-modules)]
    (doseq [module-name previous-modules
            :when (not (contains? current-modules module-name))]
      (java.nio.file.Files/deleteIfExists
       (.toPath (java.io.File. output-directory (str module-name ".d.ts")))))
    (when-not shared?
      (java.nio.file.Files/deleteIfExists
       (.toPath (java.io.File. output-directory "metabase.lib.shared.d.ts"))))))

(defn- previous-module-names
  [^java.io.File manifest-file]
  (if (.exists manifest-file)
    (->> (slurp manifest-file) str/split-lines (remove str/blank?) vec)
    []))

(defn produce-dts
  "Shadow-cljs build hook that writes generated TypeScript declaration files for exported CLJS values."
  {:shadow.build/stage :flush}
  [state]
  (let [nses         (get-in state [:compiler-env ::ana/namespaces])
        total        (count nses)
        nses-defs    (entry-definitions state)
        defs-count   (count nses-defs)
        module-names (declaration-module-names nses-defs)
        manifest-file (b.data/output-file state "cljs-dts-modules.txt")
        output-directory (.getParentFile ^java.io.File manifest-file)
        previous-modules (previous-module-names manifest-file)
        weak-types   (atom {})]
    (log/info "Compiling TypeScript defs" {:namespaces defs-count :total total})
    (log/debug "Pass 1: Collecting entry references")
    (let [ns-refs (into {}
                        (for [[ns defs] nses-defs]
                          [ns (collect-refs-from-defs ns defs)]))
          ;; Registry aliases used by entry declarations form the shared type surface;
          ;; inline registries remain local to their entry module.
          shared-refs (into #{} (mapcat val) ns-refs)]
      (log/info "Shared types analysis" {:total-refs (count shared-refs)
                                         :shared-refs (count shared-refs)})
      (when (seq shared-refs)
        (let [f      (b.data/output-file state "metabase.lib.shared.d.ts")
              result (generate-shared-types-result shared-refs)]
          (spit f (:content result))
          (when (seq (:diagnostics result))
            (log/debug "Shared TypeScript schema diagnostics"
                       {:diagnostics (:diagnostics result)}))
          (log/debug "Generated shared types file" {:types (count shared-refs)})))
      (log/debug "Pass 2: Generating per-namespace type files")
      (doseq [[ns defs] nses-defs]
        (let [t            (u/start-timer)
              fname        (comp/munge (str ns))
              f            (b.data/output-file state (str fname ".d.ts"))
              this-ns-refs (get ns-refs ns #{})
              result       (ts-content ns defs shared-refs this-ns-refs)]
          (spit f (:content result))
          (swap! weak-types #(merge-with into % (:weak-types result)))
          (when (seq (:diagnostics result))
            (log/debug "TypeScript schema diagnostics" {:ns ns
                                                        :diagnostics (:diagnostics result)}))
          (log/debug "Type generation completed" {:ns ns :time (u/since-ms t)})))
      (cleanup-stale-declarations! output-directory previous-modules module-names (seq shared-refs))
      (spit manifest-file (str (str/join "\n" module-names) "\n")))
    (when (debug-cljs?)
      (output-weak-type-warnings! @weak-types))
    (log/info "TypeScript defs compilation complete" {:namespaces defs-count}))
  state)
