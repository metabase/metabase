(ns hooks.common.modules
  "Resolves namespaces to modules and enforces module boundaries.

  The Kondo linter, config generator, and CI tooling share this namespace so
  they apply the same rules."
  (:require
   [clojure.string :as str]))

(defn ignored-namespace?
  "Whether `ns-symb` matches one of the configured module-linter exclusions."
  [config ns-symb]
  (some
   (fn [pattern-str]
     (re-find (re-pattern pattern-str) (str ns-symb)))
   (:ignored-namespace-patterns config)))

;;;; Module tree. These functions take the `:metabase/modules` map.
;;;;
;;;; Dots express nesting: `lib.schema` is a child of `lib`. A declared
;;;; `enterprise/X` module is also a child of OSS module `X`. A namespace
;;;; belongs to the module with the most specific matching `:ns-prefix`.

(defn default-ns-prefix
  "Namespace prefix a module owns unless it sets `:ns-prefix`: `metabase.lib.schema` for `lib.schema`,
  `metabase-enterprise.foo` for `enterprise/foo`."
  [module]
  (str (if (= "enterprise" (namespace module)) "metabase-enterprise." "metabase.") (name module)))

(defn module-ns-prefix
  "Namespace prefix `module` owns: its `:ns-prefix`, else [[default-ns-prefix]]."
  [modules module]
  (or (get-in modules [module :ns-prefix])
      (default-ns-prefix module)))

(defn build-prefix->module
  "Map of each declared module's namespace prefix to the module, for [[resolve-module]]."
  [modules]
  (into {}
        (map (fn [module] [(module-ns-prefix modules module) module]))
        (keys modules)))

(defn resolve-module
  "Resolve `ns-symb` to its owning module.

  Chooses the most specific dotted prefix and ignores a trailing `-test`.
  An unmatched Metabase namespace resolves to its first segment so the linter
  can report an undeclared module; other namespaces resolve to `nil`."
  [prefix->module ns-symb]
  (let [ns-str (str/replace (str ns-symb) #"-test$" "")]
    (or (loop [candidate ns-str]
          (or (get prefix->module candidate)
              (when-let [dot (str/last-index-of candidate ".")]
                (recur (subs candidate 0 dot)))))
        ;; Resolve undeclared Metabase modules so the linter can report them.
        (some->> (re-find #"^metabase-enterprise\.([^.]+)" ns-str) second (symbol "enterprise"))
        (some-> (re-find #"^metabase\.([^.]+)" ns-str) second symbol))))

(defn parent-module
  "The module `module` sits directly under, or `nil` for a top-level module."
  [modules module]
  (let [module-name (name module)]
    (if-let [dot (str/last-index-of module-name ".")]
      (symbol (namespace module) (subs module-name 0 dot))
      (when (= "enterprise" (namespace module))
        (let [oss (symbol module-name)]
          (when (contains? modules oss)
            oss))))))

(defn descendant-of?
  "Whether `module` is `ancestor` or sits anywhere beneath it."
  [modules module ancestor]
  (boolean (some #{ancestor} (take-while some? (iterate #(parent-module modules %) module)))))

(defn- exports-child?
  [modules parent child]
  (or (contains? (set (get-in modules [parent :module-exports])) child)
      ;; OSS module `X` implicitly exports its `enterprise/X` companion.
      (and (not= (namespace parent) (namespace child))
           (contains? modules child))))

(defn- blocking-export
  "The first missing export from `module` toward the root.

  Returns `{:ancestor parent, :child child}`, or `nil` when every link is
  exported."
  [modules module]
  (loop [child module]
    (when-let [ancestor (parent-module modules child)]
      (if (exports-child? modules ancestor child)
        (recur ancestor)
        {:ancestor ancestor, :child child}))))

(defn namability-error
  "Explain why `caller` may not name `target`, or return `nil` if it may.

  A nested module is private to the nearest ancestor with a missing export.
  Exporting every link makes it public."
  [modules caller target]
  (when-let [{:keys [ancestor child]} (blocking-export modules target)]
    (when-not (descendant-of? modules caller ancestor)
      (format (str "Module %s is nested and not exported by its ancestors; %s may not use it. Add %s to %s's "
                   ":module-exports, or move the caller into the %s subtree. [:metabase/modules %s :module-exports]")
              target caller child ancestor ancestor ancestor))))

;;;; Lint rules. These functions take the full linter config.

(defn config
  "The module linter's config, from a hook's input."
  [{:keys [config], :as _hook-input}]
  (merge (get-in config [:linters :metabase/modules])
         (select-keys config [:metabase/modules])))

(defonce ^:private prefix->module-cache
  (atom nil))

(defn- prefix->module
  "[[build-prefix->module]] for `config`, cached because Kondo hands every hook call the same `:metabase/modules` map."
  [config]
  (let [modules (:metabase/modules config)
        cached  @prefix->module-cache]
    (if (identical? modules (:modules cached))
      (:prefix->module cached)
      (:prefix->module (reset! prefix->module-cache {:modules        modules
                                                     :prefix->module (build-prefix->module modules)})))))

(defn module
  "The module owning `ns-symb` under `config`; see [[resolve-module]]."
  [config ns-symb]
  {:pre [(simple-symbol? ns-symb)]}
  (resolve-module (prefix->module config) ns-symb))

(defn- module-api-namespaces
  "The module's public namespaces, or `nil` for `:api :any`.

  An omitted `:api` defaults to the module's `.api`, `.core`, and `.init`
  namespaces."
  [config module]
  (let [module-config (get-in config [:metabase/modules module :api])]
    (cond
      (= module-config :any)
      nil

      (set? module-config)
      module-config

      :else
      (let [ns-prefix (module-ns-prefix (:metabase/modules config) module)]
        #{(symbol (str ns-prefix ".api"))
          (symbol (str ns-prefix ".core"))
          (symbol (str ns-prefix ".init"))}))))

(defn- module-friends
  "Modules allowed to use any namespace from `module`, not only its API."
  [config module]
  (set (get-in config [:metabase/modules module :friends])))

(defn allowed-modules
  "Modules named in `module`'s `:uses`, or `:any`."
  [config module]
  (get-in config [:metabase/modules module :uses]))

(defn allowed-module?
  "Whether `current-module`'s `:uses` is `:any` or names `required-module` exactly: `:uses #{lib}` does not cover
  `lib.schema`."
  [config current-module required-module]
  (let [allowed-modules (allowed-modules config current-module)]
    (or (= allowed-modules :any)
        ;; Avoid vector index semantics if a hand-edited config uses a vector.
        (contains? (set allowed-modules) required-module))))

(defn- rest-module?
  "Whether `module` is a REST module: `x.rest`, or the deprecated `x-rest`."
  [module]
  (boolean (re-find #"[.-]rest$" (str module))))

(defn- allowed-rest-consumer?
  "Whether `module` may depend on REST modules: other REST modules, route aggregators, and core initializers."
  [module]
  (or (rest-module? module)
      (boolean (re-find #"[.-]routes$" (str module)))
      (= "core" (name module))))

(defn- allowed-module-namespace?
  "Whether `current-module` may require `ns-symb` from `required-module`.

  The namespace must be public, the caller must be a friend, or the caller
  must be a descendant of the required module."
  [config current-module required-module ns-symb]
  ;; Subtree trust runs one way: a child may use its ancestors' internals, but a parent goes through its child's `:api`.
  (or (descendant-of? (:metabase/modules config) current-module required-module)
      (let [api-namespaces (module-api-namespaces config required-module)]
        (or (nil? api-namespaces)
            (contains? api-namespaces ns-symb)
            (contains? (module-friends config required-module) current-module)))))

(defn usage-error
  "Explain why a require crosses a forbidden module boundary.

  Returns `nil` when the require is allowed or outside the module system."
  [config current-module required-namespace]
  (when-let [required-module (module config required-namespace)]
    (when-not (= current-module required-module)
      ;; Config tests check explicit `:uses`; wildcard callers are checked here.
      (let [unnamable (when (= :any (allowed-modules config current-module))
                        (namability-error (:metabase/modules config) current-module required-module))]
        (cond
          (not (allowed-module? config current-module required-module))
          (format "Module %s should not be used in the %s module. [:metabase/modules %s :uses]"
                  required-module
                  current-module
                  current-module)

          (and (not (allowed-rest-consumer? current-module))
               (rest-module? required-module))
          (format "Do not use REST modules (%s) in non-REST modules (%s) -- move things from %s to %s if needed"
                  required-module
                  current-module
                  required-module
                  (symbol (str/replace (str required-module) #"[.-]rest$" "")))

          unnamable
          unnamable

          (not (allowed-module-namespace? config current-module required-module required-namespace))
          (format "Namespace %s is not an allowed external API namespace for the %s module. [:metabase/modules %s :api]"
                  required-namespace
                  required-module
                  required-module))))))
