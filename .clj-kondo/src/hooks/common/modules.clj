(ns hooks.common.modules
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

(defn module
  "E.g.

    (module 'metabase.qp.middleware.wow) => 'qp
    (module 'metabase-enterprise.whatever.core) => enterprise/whatever"
  [ns-symb]
  {:pre [(simple-symbol? ns-symb)]}
  ;; treat something like `metabase.driver-test` (for a module that hasn't fully been updated to use `.core`
  ;; namespaces) as being in the `driver` module
  (let [ns-symb (if (str/ends-with? (name ns-symb) "-test")
                  (symbol (str/replace (name ns-symb) #"-test$" ""))
                  ns-symb)]
    (or (some->> (re-find #"^metabase-enterprise\.([^.]+)" (str ns-symb))
                 second
                 (symbol "enterprise"))
        (some-> (re-find #"^metabase\.([^.]+)" (str ns-symb))
                second
                symbol))))

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
      (let [ns-prefix (if (= (namespace module) "enterprise")
                        (str "metabase-enterprise." (name module))
                        (name module))]
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
  (let [module                (module ns-symb)
        module-api-namespaces (module-api-namespaces config module)
        module-friends        (module-friends config module)]
    (or (empty? module-api-namespaces)
        (contains? module-api-namespaces ns-symb)
        (contains? module-friends current-module))))

(defn- rest-module? [module]
  (str/ends-with? module "-rest"))

(defn- routes-module? [module]
  (str/ends-with? module "-routes"))

(defn- core-module? [module]
  (str/ends-with? module "core"))

(defn usage-error
  "Find usage errors when a `required-namespace` is required in the `current-module`. Returns a string describing the
  error type if there is one, otherwise `nil` if there are no errors."
  [config current-module required-namespace]
  ;; ignore stuff not in a module i.e. non-Metabase stuff.
  (when-let [required-module (module required-namespace)]
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
                (symbol (str/replace required-module #"-rest$" "")))))))
