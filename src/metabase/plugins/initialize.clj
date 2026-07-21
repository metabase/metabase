(ns metabase.plugins.initialize
  "Logic related to initializing plugins, i.e. running the `init` steps listed in the plugin manifest. This is done when
  Metabase launches as soon as all dependencies for that plugin are met; for plugins with unmet dependencies, it is
  retried after other plugins are loaded (e.g. for things like BigQuery which depend on the shared Google driver.)

  Non-driver plugins initialize at launch. Driver plugins can instead register a lazy placeholder and defer their code
  until the driver is first needed."
  (:require
   [metabase.plugins.dependencies :as deps]
   [metabase.plugins.init-steps :as init-steps]
   [metabase.plugins.lazy-loaded-driver :as lazy-loaded-driver]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defonce ^:private initialized-plugin-names (atom #{}))

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

(defn- init!
  [{:keys [add-to-classpath!], init-steps :init, {plugin-name :name} :info, driver-or-drivers :driver, :as info}]
  {:pre [(string? plugin-name)]}
  (when (deps/all-dependencies-satisfied? @initialized-plugin-names info)
    ;; for each driver, if it's lazy load, register a lazy-loaded placeholder driver
    (let [drivers (u/one-or-many driver-or-drivers)]
      (doseq [{:keys [lazy-load], :or {lazy-load true}, :as driver} drivers]
        (when lazy-load
          (lazy-loaded-driver/register-lazy-loaded-driver! (assoc info :driver driver))))
      ;; Non-driver plugins have no lazy placeholder to register, so initialize them eagerly. Driver
      ;; plugins keep their existing behavior: initialize now only when at least one driver opts out of
      ;; lazy loading.
      (when (or (empty? drivers)
                (some false? (map :lazy-load drivers)))
        (when add-to-classpath!
          (add-to-classpath!))
        (init-steps/do-init-steps! init-steps)))
    ;; record this plugin as initialized and find any plugins ready to be initialized because depended on this one !
    ;;
    ;; Fun fact: we already have the `plugin-initialization-lock` if we're here so we don't need to worry about
    ;; getting it again
    (let [plugins-ready-to-init (deps/update-unsatisfied-deps! (swap! initialized-plugin-names conj plugin-name))]
      (when (seq plugins-ready-to-init)
        (log/debug (u/format-color 'yellow (format "Dependencies satisfied; these plugins will now be loaded: %s"
                                                   (mapv (comp :name :info) plugins-ready-to-init)))))
      (doseq [plugin-info plugins-ready-to-init]
        (init! plugin-info)))
    :ok))

(defn- initialized? [{{plugin-name :name} :info}]
  (@initialized-plugin-names plugin-name))

(mu/defn init-plugin-with-info!
  "Initialize plugin using parsed info from a plugin manifest. Returns truthy if plugin was successfully initialized;
  falsey otherwise."
  [info :- [:map
            [:metabase-plugin-api-version {:optional true} :int]
            [:info [:map
                    [:name    :string]
                    [:version :string]]]]]
  (validate-plugin-api-version! info)
  (or (initialized? info)
      (locking initialized-plugin-names
        (or (initialized? info)
            (init! info)))))
