(ns mage.modules
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- file->module [filename]
  (or
   (when-let [[_match module] (re-matches #"^(?:(?:src)|(?:test))/metabase/([^/]+)/.*$" filename)]
     (symbol (str/replace module #"_" "-")))
   (when-let [[_match module] (re-matches #"^enterprise/backend/(?:(?:src)|(?:test))/metabase_enterprise/([^/]+)/.*$" filename)]
     (symbol "enterprise" (str/replace module #"_" "-")))))

(defn- updated-modules [git-ref]
  (let [git-ref       (or git-ref "master")
        updated-files (u/updated-files git-ref)]
    (into (sorted-set)
          (keep file->module)
          updated-files)))

(defn- module->test-directory
  [module]
  (case (namespace module)
    "enterprise" (str "enterprise/backend/test/metabase_enterprise/" (str/replace (name module) #"-" "_"))
    nil          (str "test/metabase/" (str/replace (name module) #"-" "_"))))

(defn- dependencies
  "Read out the Kondo config for the modules linter; return a map of module => set of modules it directly depends on."
  []
  (let [config (-> (with-open [r (java.io.PushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
                     (edn/read r))
                   :metabase/modules
                   ;; ignore the config for [[metabase.connection-pool]] which comes from one of our libraries.
                   (dissoc 'connection-pool))]
    (into (sorted-map)
          (map (fn [[k config]]
                 [k (:uses config)]))
          config)))

(defn- direct-dependents
  "Set of modules that directly depend on `module`."
  [deps module]
  (into (sorted-set)
        (keep (fn [[a-module module-deps]]
                (when (or (= module-deps :any)
                          (contains? module-deps module))
                  a-module)))
        deps))

(comment
  (direct-dependents (dependencies) 'driver))

(defn- indirect-dependents
  "Set of modules that either directly or indirectly depend on `module`."
  ([deps module]
   (indirect-dependents deps module (sorted-set)))
  ([deps module acc]
   (let [module-deps (direct-dependents deps module)
         new-deps    (set/difference module-deps acc)
         acc         (into acc new-deps)]
     (reduce
      (fn [acc new-dep]
        (indirect-dependents deps new-dep acc))
      acc
      new-deps))))

(declare unaffected-modules)
(declare skip-driver-tests?)

(defn- affected-modules
  ([[git-ref]]
   (let [updated    (updated-modules git-ref)
         deps       (dependencies)
         affected   (affected-modules deps updated)
         unaffected (unaffected-modules deps updated)]
     (println "These modules have changed:" (pr-str updated))
     (println)
     (println)
     (println "These modules are unaffected by this change:" (pr-str unaffected))
     (println)
     (println)
     (println "Driver tests" (if (skip-driver-tests? deps updated) "CAN" "CAN NOT") "be skipped.")
     (println)
     (println)
     (println "You can run tests for these modules and all downstream modules as follows:")
     (println)
     (println)
     (printf "clojure -X :dev:ee:ee-dev:test :only '%s'\n" (pr-str (mapv module->test-directory affected)))
     (flush))
   (System/exit 0))

  ([deps modules]
   (into (sorted-set)
         (mapcat (partial indirect-dependents deps))
         modules)))

(defn- unaffected-modules
  "Return the set of modules that are unaffected "
  [deps modules]
  (set/difference
   (into (sorted-set) (keys deps))
   (affected-modules deps modules)))

(comment
  (unaffected-modules (dependencies) '#{enterprise/billing}))

(defn- skip-driver-tests?
  [deps modules]
  (let [unaffected (unaffected-modules deps modules)]
    (and (contains? unaffected 'driver)
         (contains? unaffected 'driver-api))))
