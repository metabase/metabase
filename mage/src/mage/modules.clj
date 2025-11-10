(ns mage.modules
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;; TODO (Cam 2025-11-07) changes to test files should only cause us to run tests for that module as well, not
;;; everything that depends on that module directly or indirectly in `src`
(defn- file->module [filename]
  (or
   (when-let [[_match module] (re-matches #"^(?:(?:src)|(?:test))/metabase/([^/]+)/.*$" filename)]
     (symbol (str/replace module #"_" "-")))
   (when-let [[_match module] (re-matches #"^enterprise/backend/(?:(?:src)|(?:test))/metabase_enterprise/([^/]+)/.*$" filename)]
     (symbol "enterprise" (str/replace module #"_" "-")))))

(defn- updated-files->updated-modules [updated-files]
  (into (sorted-set)
        (keep file->module)
        updated-files))

(defn- updated-modules [git-ref]
  (let [git-ref       (or git-ref "master")
        updated-files (u/updated-files git-ref)]
    (updated-files->updated-modules updated-files)))

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

(defn- affected-modules
  "Set of modules that are direct or indirect dependents of `modules`, and thus are affected by changes to them."
  [deps modules]
  (into (sorted-set)
        (mapcat (partial indirect-dependents deps))
        modules))

(defn- unaffected-modules
  "Return the set of modules that are unaffected "
  [deps modules]
  (set/difference
   (into (sorted-set) (keys deps))
   (affected-modules deps modules)))

(comment
  (unaffected-modules (dependencies) '#{enterprise/billing}))

(defn- skip-driver-tests? [deps modules]
  (let [unaffected (unaffected-modules deps modules)]
    (contains? unaffected 'driver)))

(defn cli-print-affected-modules
  [[git-ref, :as _command-line-args]]
  (let [deps       (dependencies)
        updated    (updated-modules git-ref)
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

(defn- always-run-driver-tests?
  [git-ref]
  (some (fn [filename]
          (when (or (str/includes? filename "deps.edn")
                    (str/includes? filename "modules/drivers/"))
            (printf "Running driver tests because %s was changed\n" (pr-str filename))
            (flush)
            filename))
        (u/updated-files (or git-ref "master"))))

(defn- remove-non-driver-test-namespaces [files]
  (into []
        (remove (fn [filename]
                  (when (and (some #(str/includes? filename %)
                                   ["test/" "enterprise/backend/test/"])
                             (not (some #(str/includes? filename %)
                                        ["query_processor"
                                         "driver"])))
                    (printf "Ignorning changes in test namespace %s\n" (pr-str filename))
                    (flush)
                    filename)))
        files))

(defn cli-can-skip-driver-tests
  "Exits with nonzero status code if we can skip "
  [[git-ref, :as _command-line-args]]
  (try
    (let [deps          (dependencies)
          git-ref       (or git-ref "master")
          updated-files (remove-non-driver-test-namespaces (u/updated-files git-ref))
          updated       (updated-files->updated-modules updated-files)
          unaffected    (unaffected-modules deps updated)
          skip-tests?   (skip-driver-tests? deps updated)]
      ;; Not strictly necessary, but people looking at CI will appreciate having this extra info.
      (println "These modules have changed:" (pr-str updated))
      (println)
      (println)
      (println "These modules are unaffected by this change:" (pr-str unaffected))
      (println)
      (println)
      (println "Driver tests" (if skip-tests? "CAN" "CAN NOT") "be skipped.")
      (System/exit ^Long (cond
                           (not skip-tests?)                  0
                           (always-run-driver-tests? git-ref) 0
                           :else                              1)))
    ;; fail closed -- if code above barfs then still exit with status code zero (do not skip)
    (catch Throwable e
      (println "Error determining whether we can skip driver tests:\n" e)
      (System/exit 0))))
