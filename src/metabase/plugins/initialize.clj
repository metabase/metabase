(ns metabase.plugins.initialize
  "Logic related to initializing plugins, i.e. running the `init` steps listed in the plugin manifest. This is done when
  Metabase launches as soon as all dependencies for that plugin are met; for plugins with unmet dependencies, it is
  retried after other plugins are loaded (e.g. for things like BigQuery which depend on the shared Google driver.)

  Note that this is not the same thing as initializing *drivers* -- drivers are initialized lazily when first needed;
  this step on the other hand runs at launch time and sets up that lazy load logic."
  (:require [clojure.tools.logging :as log]
            [metabase.plugins
             [dependencies :as deps]
             [init-steps :as init-steps]
             [lazy-loaded-driver :as lazy-loaded-driver]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(defonce ^:private initialized-plugin-names (atom #{}))

(defn- init!
  [{:keys [add-to-classpath!], init-steps :init, {plugin-name :name} :info, driver-or-drivers :driver, :as info}]
  {:pre [(string? plugin-name)]}
  (when (deps/all-dependencies-satisfied? @initialized-plugin-names info)
    ;; for each driver, if it's lazy load, register a lazy-loaded placeholder driver
    (let [drivers (u/one-or-many driver-or-drivers)]
      (doseq [{:keys [lazy-load], :or {lazy-load true}, :as driver} drivers]
        (when lazy-load
          (lazy-loaded-driver/register-lazy-loaded-driver! (assoc info :driver driver))))
      ;; if *any* of the drivers is not lazy-load, initialize it now
      (when (some false? (map :lazy-load drivers))
        (when add-to-classpath!
          (add-to-classpath!))
        (init-steps/do-init-steps! init-steps)))
    ;; record this plugin as initialized and find any plugins ready to be initialized because depended on this one !
    ;;
    ;; Fun fact: we already have the `plugin-initialization-lock` if we're here so we don't need to worry about
    ;; getting it again
    (let [plugins-ready-to-init (deps/update-unsatisfied-deps! (swap! initialized-plugin-names conj plugin-name))]
      (when (seq plugins-ready-to-init)
        (log/debug (u/format-color 'yellow (trs "Dependencies satisfied; these plugins will now be loaded: {0}"
                                                (mapv (comp :name :info) plugins-ready-to-init)))))
      (doseq [plugin-info plugins-ready-to-init]
        (init! plugin-info)))
    :ok))

(defn- initialized? [{plugin-name :name}]
  (@initialized-plugin-names plugin-name))

(defonce ^:private plugin-initialization-lock (Object.))

(defn init-plugin-with-info!
  "Initiaize plugin using parsed info from a plugin maifest. Returns truthy if plugin was successfully initialized;
  falsey otherwise."
  [info]
  (or
   (initialized? info)
   (locking plugin-initialization-lock
     (or
      (initialized? info)
      (init! info)))))
