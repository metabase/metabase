(ns mage.modules
  (:require
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.color :as c]
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

(defn- print-updated-and-unaffected-modules [deps updated]
  (let [unaffected (unaffected-modules deps updated)]
    (println "These modules have changed:" (pr-str updated))
    (println)
    (println)
    (println "These are all the modules are unaffected by these changes:" (pr-str unaffected))
    (println)
    (println)
    (println "(By unaffected, this means these modules do not have a direct or indirect dependency on the modules that have been changed.)")
    (println)
    (println)
    (println (if (skip-driver-tests? deps updated)
               (c/green "Driver tests " (c/bold "CAN be skipped") "")
               (c/red "Driver tests " (c/bold "MUST be run") ".")))))

(defn cli-print-affected-modules
  [[git-ref, :as _command-line-args]]
  (let [deps       (dependencies)
        updated    (updated-modules git-ref)
        affected   (affected-modules deps updated)]
    (print-updated-and-unaffected-modules deps updated)
    (println)
    (println)
    (println "You can run tests for these modules and all downstream modules as follows:")
    (println)
    (println)
    (printf "clojure -X :dev:ee:ee-dev:test :only '%s'\n" (pr-str (mapv module->test-directory affected)))
    (flush)
    (u/exit 0)))

(defn- changes-important-file-for-drivers?
  "Whether we should always run driver tests if we have changes relative to `git-ref` to something important like
  `deps.edn`."
  [git-ref]
  (some (fn [filename]
          (when (or (str/includes? filename "deps.edn")
                    (str/includes? filename "modules/drivers/"))
            (printf "Running driver tests because %s was changed\n" (pr-str filename))
            (flush)
            filename))
        (u/updated-clojure-files (or git-ref "master"))))

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
  "Exits with zero status code if we can skip driver tests, nonzero if we cannot.

  Invoke this from the CLI with

    ./bin/mage can-skip-driver-tests [git-ref]"
  [[git-ref, :as _arguments]]
  (let [deps          (dependencies)
        git-ref       (or git-ref "master")
        updated-files (remove-non-driver-test-namespaces (u/updated-files git-ref))
        updated       (updated-files->updated-modules updated-files)
        skip-tests?   (skip-driver-tests? deps updated)]
    ;; Not strictly necessary, but people looking at CI will appreciate having this extra info.
    (print-updated-and-unaffected-modules deps updated)
    (u/exit (cond
              (not skip-tests?)                             1
              (changes-important-file-for-drivers? git-ref) 1
              :else                                         0))))
