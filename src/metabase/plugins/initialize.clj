(ns metabase.plugins.initialize
  "Plugin discovery, registration, and lazy loading.

  Manifests are validated and registered at startup as soon as their dependencies are met. Plugin code is loaded only
  when [[load-plugin!]] is called. Driver manifests use the same loader through their lazy driver placeholders."
  (:require
   [clojure.string :as str]
   [metabase.plugins.dependencies :as deps]
   [metabase.plugins.init-steps :as init-steps]
   [metabase.plugins.lazy-loaded-driver :as lazy-loaded-driver]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util.concurrent.locks ReentrantLock)))

(set! *warn-on-reflection* true)

(defonce ^:private ^ReentrantLock
  ^{:doc "Guards every write to [[plugins]] and the running of a plugin's init steps.

  Registration waits for the lock, but loading refuses to wait: a caller that breaks the serialization
  contract gets an error rather than a silently blocked thread.

  Both paths take this one lock. The eager driver path registers a plugin while its own init steps run,
  so the lock has to be reentrant."}
  plugin-lock
  (ReentrantLock.))

(defonce ^:private
  ^{:doc "Plugin name -> registry entry, where an entry holds:

    `:info`    the parsed manifest, present once the plugin is registered
    `:loaded?` whether the plugin's init steps have run

  The eager driver path loads a plugin before registering it, so an entry can hold either key alone."}
  plugins
  (atom {}))

(defonce ^:private
  ^{:doc "The loads in progress, outermost first.

  Only the thread holding [[plugin-lock]] touches it.
  A name already on the stack is a cycle: its init steps have not finished, so loading it again would never stop."}
  loading-plugins
  (atom []))

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

(defn- registered-info [plugin-name]
  (get-in @plugins [plugin-name :info]))

(defn- registered-plugin-names []
  (for [[plugin-name {:keys [info]}] @plugins
        :when info]
    plugin-name))

(defn registered?
  "Whether a plugin with `plugin-name` has been registered."
  [plugin-name]
  {:pre [(string? plugin-name)]}
  (some? (registered-info plugin-name)))

(defn- loaded? [plugin-name]
  (boolean (get-in @plugins [plugin-name :loaded?])))

(defn- lock-holder-description []
  (if-let [loading (peek @loading-plugins)]
    (format "plugin %s is loading" (pr-str loading))
    "another thread holds the plugin lock"))

(defn- claim-plugin-load!
  "Take [[plugin-lock]] and record `plugin-name` as loading.
  Throws if another thread is loading, or if this would re-enter a plugin whose init steps have not finished."
  [plugin-name]
  (when-not (.tryLock plugin-lock)
    (throw (ex-info (format "Cannot load plugin %s while %s; concurrent plugin loading is not supported."
                            (pr-str plugin-name) (lock-holder-description))
                    {:plugin-name     plugin-name
                     :loading-plugins @loading-plugins})))
  (let [in-progress @loading-plugins]
    (when (some #{plugin-name} in-progress)
      (.unlock plugin-lock)
      (throw (ex-info (format "Cannot load plugin %s while it is already loading: %s."
                              (pr-str plugin-name) (str/join " -> " (conj in-progress plugin-name)))
                      {:plugin-name     plugin-name
                       :loading-plugins in-progress}))))
  (swap! loading-plugins conj plugin-name))

(defn- release-plugin-load! []
  (swap! loading-plugins pop)
  (.unlock plugin-lock))

(defn- load-plugin-info!
  [{:keys [add-to-classpath!], init-steps :init, {plugin-name :name} :info}]
  (when-not (loaded? plugin-name)
    ;; Adding a JAR to the shared JVM classpath cannot be undone or isolated per plugin. Keep it delayed until this
    ;; point, but assume plugin classes and their transitive dependencies remain visible for the life of the process.
    ;;
    ;; We mark a plugin loaded only after every init step succeeds. A failed activation can therefore be retried, so
    ;; initialization steps should tolerate retry after a partially completed attempt.
    (claim-plugin-load! plugin-name)
    (try
      ;; A competing call can finish after the fast-path check but before this call takes the lock.
      (when-not (loaded? plugin-name)
        (when add-to-classpath!
          (add-to-classpath!))
        (init-steps/do-init-steps! init-steps)
        (swap! plugins update plugin-name assoc :loaded? true))
      (finally
        (release-plugin-load!))))
  :ok)

(defn load-plugin!
  "Load a registered plugin by name, adding its JAR to the classpath and running its manifest initialization steps.
  Loading is idempotent. Callers must serialize plugin activation; concurrent plugin loading is not supported.

  Discovery does not call this automatically. The code that owns a plugin type is responsible for calling it at the
  point where a configured plugin is first needed; calling it during startup would defeat lazy loading."
  [plugin-name]
  {:pre [(string? plugin-name)]}
  (if-let [info (registered-info plugin-name)]
    (load-plugin-info! info)
    (throw (ex-info (format "Plugin %s is not registered." (pr-str plugin-name))
                    {:plugin-name              plugin-name
                     :registered-plugin-names (set (registered-plugin-names))}))))

(defn- register!
  [{{plugin-name :name} :info, driver-or-drivers :driver, :as info}]
  {:pre [(string? plugin-name)]}
  (when (deps/all-dependencies-satisfied? (registered-plugin-names) info)
    ;; for each driver, if it's lazy load, register a lazy-loaded placeholder driver
    (let [drivers (u/one-or-many driver-or-drivers)]
      (doseq [{:keys [lazy-load], :or {lazy-load true}, :as driver} drivers]
        (when lazy-load
          (lazy-loaded-driver/register-lazy-loaded-driver!
           (assoc info
                  :driver       driver
                  :load-plugin! #(load-plugin-info! info)))))
      ;; Preserve the existing eager path for driver manifests that explicitly opt out of lazy loading.
      (when (some false? (map :lazy-load drivers))
        (load-plugin-info! info)))
    ;; Record this plugin as registered and find plugins that can now be registered because they depend on it.
    ;;
    ;; We already hold `plugin-lock` here, and it is reentrant, so recursively registering newly unblocked plugins is
    ;; safe.
    (swap! plugins update plugin-name assoc :info info)
    (let [plugins-ready-to-register (deps/update-unsatisfied-deps! (registered-plugin-names))]
      (when (seq plugins-ready-to-register)
        (log/debug (u/format-color 'yellow (format "Dependencies satisfied; these plugins will now be registered: %s"
                                                   (mapv (comp :name :info) plugins-ready-to-register)))))
      (doseq [plugin-info plugins-ready-to-register]
        (register! plugin-info)))
    :ok))

(defn- info-registered? [{{plugin-name :name} :info}]
  (registered? plugin-name))

(mu/defn register-plugin-with-info!
  "Register a plugin using parsed info from its manifest. Returns truthy if the plugin was successfully registered;
  falsey otherwise."
  [info :- [:map
            [:metabase-plugin-api-version {:optional true} :int]
            [:info [:map
                    [:name    :string]
                    [:version :string]]]]]
  (validate-plugin-api-version! info)
  (or (info-registered? info)
      (do
        (.lock plugin-lock)
        (try
          (or (info-registered? info)
              (register! info))
          (finally
            (.unlock plugin-lock))))))
