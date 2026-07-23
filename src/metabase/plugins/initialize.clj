(ns metabase.plugins.initialize
  "Plugin discovery, registration, and lazy loading.

  Manifests are validated and registered at startup as soon as their dependencies are met. Plugin code is loaded only
  when `load-plugin!` is called. Driver manifests use the same loader through their lazy driver placeholders."
  (:require
   [metabase.plugins.dependencies :as deps]
   [metabase.plugins.init-steps :as init-steps]
   [metabase.plugins.lazy-loaded-driver :as lazy-loaded-driver]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defonce ^:private registered-plugins (atom {}))
(defonce ^:private loaded-plugin-names (atom #{}))

;; `:info :name` predates generic plugins and is currently both the human-readable name and the identifier used by
;; `load-plugin!` and `dependencies: [{plugin: ...}]`. Plugin authors must therefore treat it as unique and stable.

(def plugin-api-version
  "Current version of the generic Metabase plugin initialization contract."
  1)

(defn- validate-plugin-api-version!
  [{declared-version :metabase-plugin-api-version, {plugin-name :name} :info, driver-or-drivers :driver}]
  ;; Existing driver manifests predate the generic contract and remain valid when the field is absent.
  (cond
    (and (nil? declared-version) (empty? (u/one-or-many driver-or-drivers)))
    (throw (ex-info (format "Non-driver plugin %s must declare Metabase plugin API version %s."
                            (pr-str plugin-name) plugin-api-version)
                    {:plugin-name           plugin-name
                     :supported-api-version plugin-api-version}))

    (and (some? declared-version) (not= plugin-api-version declared-version))
    (throw (ex-info (format "Plugin %s requires unsupported Metabase plugin API version %s; this server supports %s."
                            (pr-str plugin-name) (pr-str declared-version) plugin-api-version)
                    {:plugin-name           plugin-name
                     :plugin-api-version    declared-version
                     :supported-api-version plugin-api-version}))))

(defn- loaded? [plugin-name]
  (contains? @loaded-plugin-names plugin-name))

(defn- load-plugin-info!
  [{:keys [add-to-classpath!], init-steps :init, {plugin-name :name} :info}]
  (when-not (loaded? plugin-name)
    ;; Adding a JAR to the shared JVM classpath cannot be undone or isolated per plugin. Keep it delayed until this
    ;; point, but assume plugin classes and their transitive dependencies remain visible for the life of the process.
    ;;
    ;; We mark a plugin loaded only after every init step succeeds. A failed activation can therefore be retried, so
    ;; initialization steps should tolerate retry after a partially completed attempt.
    (locking loaded-plugin-names
      (when-not (loaded? plugin-name)
        (when add-to-classpath!
          (add-to-classpath!))
        (init-steps/do-init-steps! init-steps)
        (swap! loaded-plugin-names conj plugin-name))))
  :ok)

(defn load-plugin!
  "Load a registered plugin by name, adding its JAR to the classpath and running its manifest initialization steps.
  Loading is idempotent.

  Discovery does not call this automatically. The code that owns a plugin type is responsible for calling it at the
  point where a configured plugin is first needed; calling it during startup would defeat lazy loading."
  [plugin-name]
  {:pre [(string? plugin-name)]}
  (if-let [info (@registered-plugins plugin-name)]
    (load-plugin-info! info)
    (throw (ex-info (format "Plugin %s is not registered." (pr-str plugin-name))
                    {:plugin-name              plugin-name
                     :registered-plugin-names (set (keys @registered-plugins))}))))

(defn- register!
  [{{plugin-name :name} :info, driver-or-drivers :driver, :as info}]
  {:pre [(string? plugin-name)]}
  (when (deps/all-dependencies-satisfied? (keys @registered-plugins) info)
    ;; for each driver, if it's lazy load, register a lazy-loaded placeholder driver
    (let [drivers (u/one-or-many driver-or-drivers)]
      (doseq [{:keys [lazy-load], :or {lazy-load true}, :as driver} drivers]
        (when lazy-load
          (lazy-loaded-driver/register-lazy-loaded-driver!
           (assoc info
                  :driver driver
                  :load-plugin! #(load-plugin-info! info)))))
      ;; Preserve the existing eager path for driver manifests that explicitly opt out of lazy loading.
      (when (some false? (map :lazy-load drivers))
        (load-plugin-info! info)))
    ;; Record this plugin as registered and find plugins that can now be registered because they depend on it.
    ;;
    ;; We already hold the plugin registration lock here, so recursively registering newly unblocked plugins is safe.
    (swap! registered-plugins assoc plugin-name info)
    (let [plugins-ready-to-register (deps/update-unsatisfied-deps! (keys @registered-plugins))]
      (when (seq plugins-ready-to-register)
        (log/debug (u/format-color 'yellow (format "Dependencies satisfied; these plugins will now be registered: %s"
                                                   (mapv (comp :name :info) plugins-ready-to-register)))))
      (doseq [plugin-info plugins-ready-to-register]
        (register! plugin-info)))
    :ok))

(defn- registered? [{{plugin-name :name} :info}]
  (contains? @registered-plugins plugin-name))

(mu/defn register-plugin-with-info!
  "Register a plugin using parsed info from its manifest. Returns truthy if the plugin was successfully registered;
  falsey otherwise."
  [info :- [:map
            [:metabase-plugin-api-version {:optional true} :int]
            [:info [:map
                    [:name    :string]
                    [:version :string]]]]]
  (validate-plugin-api-version! info)
  (or (registered? info)
      (locking registered-plugins
        (or (registered? info)
            (register! info)))))

(defn init-plugin-with-info!
  "Deprecated compatibility alias for `register-plugin-with-info!`."
  [info]
  (register-plugin-with-info! info))
