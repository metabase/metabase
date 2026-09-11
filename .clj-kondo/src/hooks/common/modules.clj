(ns hooks.common.modules
  "Resolves namespaces to modules and enforces module boundaries.

  The Kondo linter, config generator, and CI tooling share this namespace so
  they apply the same rules."
  (:require
   [clojure.string :as str]))

(defn ignored-namespace? [config ns-symb]
  (some
   (fn [pattern-str]
     (re-find (re-pattern pattern-str) (str ns-symb)))
   (:ignored-namespace-patterns config)))

(defn config [{:keys [config], :as _hook-input}]
  (merge (get-in config [:linters :metabase/modules])
         (select-keys config [:metabase/modules])))

;;;; Module tree. These functions take the `:metabase/modules` map, or the prefix map built from it.
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
  "Map each declared namespace prefix to its module, for [[declared-module]]."
  [modules]
  (into {}
        (map (fn [module] [(module-ns-prefix modules module) module]))
        (keys modules)))

(defn declared-module
  "Resolve `ns-symb` to its declared module, or `nil`.

  Chooses the most specific dotted prefix and ignores a trailing `-test`."
  [prefix->module ns-symb]
  (loop [candidate (str/replace (str ns-symb) #"-test$" "")]
    (or (get prefix->module candidate)
        (when-let [dot (str/last-index-of candidate ".")]
          (recur (subs candidate 0 dot))))))

(defn resolve-module
  "E.g.

    (resolve-module prefix->module 'metabase.qp.middleware.wow) => 'qp
    (resolve-module prefix->module 'metabase-enterprise.whatever.core) => enterprise/whatever

  An unmatched Metabase namespace resolves to its first segment so the linter can report an undeclared module."
  [prefix->module ns-symb]
  {:pre [(simple-symbol? ns-symb)]}
  ;; treat something like `metabase.driver-test` (for a module that hasn't fully been updated to use `.core`
  ;; namespaces) as being in the `driver` module
  (let [ns-symb (if (str/ends-with? (name ns-symb) "-test")
                  (symbol (str/replace (name ns-symb) #"-test$" ""))
                  ns-symb)]
    (or (declared-module prefix->module ns-symb)
        (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
                 second
                 (symbol "enterprise"))
        (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
                second
                symbol))))

(defn parent-module
  "The direct parent of `module`, or `nil` when it is top-level."
  [modules module]
  (let [module-name (name module)]
    (if-let [dot (str/last-index-of module-name ".")]
      (symbol (namespace module) (subs module-name 0 dot))
      (when (= "enterprise" (namespace module))
        (let [oss (symbol module-name)]
          (when (contains? modules oss)
            oss))))))

(defn descendant-of?
  "Whether `module` is `ancestor` or one of its descendants."
  [modules module ancestor]
  (boolean (some #{ancestor} (take-while some? (iterate #(parent-module modules %) module)))))

(defn module-team
  "Team owning `module`: its own `:team`, else its nearest ancestor's."
  [modules module]
  (some #(get-in modules [% :team])
        (take-while some? (iterate #(parent-module modules %) module))))

(defn- rest-module? [module]
  (re-find #"[.-]rest$" (str module)))

(defn- exports-child?
  [modules parent child]
  (or (contains? (set (get-in modules [parent :module-exports])) child)
      ;; A `.rest` child is its parent's public HTTP surface.
      (rest-module? child)
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
  "Explain why `caller` may not refer to `target` in `:uses`, or return `nil` if it may.

  A nested module is private to the nearest ancestor with a missing export.
  Exporting every link makes it public."
  [modules caller target]
  (when-let [{:keys [ancestor child]} (blocking-export modules target)]
    (when-not (descendant-of? modules caller ancestor)
      (format (str "Module %s is nested and not exported by its ancestors; %s may not use it. Add %s to %s's "
                   ":module-exports, or move the caller into the %s subtree. [:metabase/modules %s :module-exports]")
              target caller child ancestor ancestor ancestor))))

;;;; Lint rules. These functions take the full linter config.

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
  "Resolve `ns-symb` to its module under `config`; see [[resolve-module]]."
  [config ns-symb]
  (resolve-module (prefix->module config) ns-symb))

(defn- module-api-namespaces
  "Set of API namespace symbols for a given module. `:any` means you can use anything, there are no API namespaces for
  this module (yet). If unspecified, the default is just the `<module>.core` namespace."
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
  [config module]
  "Set of modules that are `:friends` of `module`, i.e. allowed to use *any* namespace from the module, not just the
  designated [[module-api-namespaces]]."
  (set (get-in config [:metabase/modules module :friends])))

(defn allowed-modules
  "Set of namespace symbols that `module` is allowed to use. `:any` means it's allowed to use anything."
  [config module]
  (get-in config [:metabase/modules module :uses]))

(defn allowed-module? [config module required-module]
  (let [allowed-modules (allowed-modules config module)]
    (or (= allowed-modules :any)
        (contains? (set allowed-modules) required-module))))

(defn- allowed-module-namespace? [config current-module ns-symb]
  (let [module                (module config ns-symb)
        module-api-namespaces (module-api-namespaces config module)
        module-friends        (module-friends config module)]
    (or (nil? module-api-namespaces)
        (contains? module-api-namespaces ns-symb)
        (contains? module-friends current-module)
        ;; a child may use its ancestors' internals; a parent still goes through its child's `:api`
        (descendant-of? (:metabase/modules config) current-module module))))

(defn- routes-module? [module]
  (str/ends-with? module "-routes"))

(defn- core-module? [module]
  (str/ends-with? module "core"))

(defn usage-error
  "Find usage errors when a `required-namespace` is required in the `current-module`. Returns a string describing the
  error type if there is one, otherwise `nil` if there are no errors."
  [config current-module required-namespace]
  ;; ignore stuff not in a module i.e. non-Metabase stuff.
  (when-let [required-module (module config required-namespace)]
    (when-not (= current-module required-module)
      (cond
        (not (allowed-module? config current-module required-module))
        (format "Module %s should not be used in the %s module. [:metabase/modules %s :uses]"
                required-module
                current-module
                current-module)

        (not (allowed-module-namespace? config current-module required-namespace))
        (format "Namespace %s is not an allowed external API namespace for the %s module. [:metabase/modules %s :api]"
                required-namespace
                required-module
                required-module)

        ;; (for now) rest modules are allowed to use one another; `routes` is ok because it collects routes together
        ;; and `core` is ok because [[metabase.core.init]] might need to init some of the `-routes` modules'
        ;; namespaces
        (and (not ((some-fn rest-module? routes-module? core-module?) current-module))
             (rest-module? required-module))
        (format "Do not use -rest modules (%s) in non-rest modules (%s) -- move things from %s to %s if needed"
                required-module
                current-module
                required-module
                (symbol (str/replace required-module #"[.-]rest$" "")))

        ;; Config tests check explicit `:uses`; wildcard callers are checked here.
        (= :any (allowed-modules config current-module))
        (namability-error (:metabase/modules config) current-module required-module)))))
