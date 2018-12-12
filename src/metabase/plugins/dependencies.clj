(ns metabase.plugins.dependencies
  (:require [clojure.tools.logging :as log]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(def ^:private plugins-with-unsatisfied-deps
  (atom #{}))


(defn- dependency-type [{classname :class, plugin :plugin}]
  (cond
    classname :class
    plugin    :plugin
    :else     :unknown))

(defmulti ^:private dependency-satisfied?
  {:arglists '([initialized-plugin-names info dependency])}
  (fn [_ _ dep] (dependency-type dep)))

(defmethod dependency-satisfied? :default [_ {{plugin-name :name} :info} dep]
  (log/error (u/format-color 'red
                 (trs "Plugin {0} declares a dependency that Metabase does not understand: {1}" plugin-name dep))
             (trs "Refer to the plugin manifest reference for a complete list of valid plugin dependencies:")
             "https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference")
  false)

(defmethod dependency-satisfied? :class
  [_ {{plugin-name :name} :info} {^String classname :class, message :message, :as dep}]
  (try
    (Class/forName classname false (classloader/the-classloader))
    (catch ClassNotFoundException _
      (log/info (u/format-color 'red
                    (trs "Metabase cannot initialize plugin {0} due to required dependencies." plugin-name))
                (or message
                    (trs "Class not found: {0}" classname)))
      false)))

(defmethod dependency-satisfied? :plugin
  [initialized-plugin-names {{plugin-name :name} :info, :as info} {dep-plugin-name :plugin}]
  (log/info (trs "Plugin ''{0}'' depends on plugin ''{1}''" plugin-name dep-plugin-name))
  ((set initialized-plugin-names) dep-plugin-name))

(defn- all-dependencies-satisfied?*
  [initialized-plugin-names {:keys [dependencies], {plugin-name :name} :info, :as info}]
  (let [dep-satisfied? (fn [dep]
                         (u/prog1 (dependency-satisfied? initialized-plugin-names info dep)
                           (log/debug
                            (trs "{0} dependency {1} satisfied? {2}" plugin-name (dissoc dep :message) (boolean <>)))))]
    (every? dep-satisfied? dependencies)))

(defn all-dependencies-satisfied?
  "Check whether all dependencies are satisfied for a plugin; return truthy if all are; otherwise log explanations about
  why they are not, and return falsey.

  For plugins that *might* have their dependencies satisfied in the near future"
  [initialized-plugin-names info]
  (or
   (all-dependencies-satisfied?* initialized-plugin-names info)

   (do
     (swap! plugins-with-unsatisfied-deps conj info)
     (log/debug (u/format-color 'yellow
                    (trs "Plugins with unsatisfied deps: {0}" (mapv (comp :name :info) @plugins-with-unsatisfied-deps))))
     false)))


(defn- remove-plugins-with-satisfied-deps [plugins initialized-plugin-names ready-for-init-atom]
  ;; since `remove-plugins-with-satisfied-deps` could theoretically be called multiple times we need to reset the atom
  ;; used to return the plugins ready for init so we don't accidentally include something in there twice etc.
  (reset! ready-for-init-atom nil)
  (set
   (for [info  plugins
         :let  [ready? (when (all-dependencies-satisfied?* initialized-plugin-names info)
                         (swap! ready-for-init-atom conj info))]
         :when (not ready?)]
     info)))

(defn update-unsatisfied-deps!
  "Updates internal list of plugins that still have unmet dependencies; returns sequence of plugin infos for all plugins
  that are now ready for initialization."
  [initialized-plugin-names]
  (let [ready-for-init (atom nil)]
    (swap! plugins-with-unsatisfied-deps remove-plugins-with-satisfied-deps initialized-plugin-names ready-for-init)
    @ready-for-init))
