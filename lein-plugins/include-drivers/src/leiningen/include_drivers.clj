(ns leiningen.include-drivers
     (:require [clojure.string :as str]
               [colorize.core :as colorize]
               [leiningen.core.project :as p])
     (:import java.io.File))

(defonce ^:private ^{:arglists '([s]), :doc "Log a message `s` the first time we see it. This middleware might run
  multiple times, and we only really need to log a message the first time we see it."}
  log-once
  (comp (memoize println) str))

(defn- file-exists? [^String filename]
  (.exists (File. filename)))

(defn- driver-parents
  "As listed in a 'parents' file in the module source directory. Add to the list of drivers to add sources for"
  [driver]
  (let [parents-file (File. (format "modules/drivers/%s/parents" driver))]
    (when (.exists parents-file)
      (str/split-lines (slurp parents-file)))))

(defn- driver->project [driver]
  (let [project-filename (format "modules/drivers/%s/project.clj" driver)]
    (when (file-exists? project-filename)
      (p/read project-filename))))

(defn- plugins-file-exists? [filename-pattern]
  (some
   (fn [filename]
     (re-matches filename-pattern filename))
   (.list (File. "plugins"))))

(defn- driver-dependencies-satisfied?
  "If a driver's project specifies a list of dependency filenames like

    {:include-drivers-dependencies [#\"^ojdbc[78]\\.jar$\"]}

  Make sure a file matching that name pattern exists in the `/plugins` directory."
  [driver]
  {:pre [(string? driver) (seq driver)]}
  (if-let [{:keys [include-drivers-dependencies]} (driver->project driver)]
    (or (every? plugins-file-exists? include-drivers-dependencies)
        (log-once
         (colorize/color
          :red
          (format "[include-drivers middleware] Not including %s because not all dependencies matching %s found in /plugins"
                  driver (set include-drivers-dependencies)))))
    (log-once
     (colorize/color
      :red
      (format "[include-drivers middleware] Not including %s because we could not its project.clj" driver)))))

;; if :include-drivers is specified in the project, and its value is `:all`, include all drivers; if it's a collection
;; of driver names, include the specified drivers; otherwise include whatever was set in the `DRIVERS` env var
(defn- test-drivers [{:keys [include-drivers]}]
  (let [drivers
        (cond
          (= include-drivers :all)
          (.list (File. "modules/drivers"))

          (coll? include-drivers)
          include-drivers

          :else
          (some-> (System/getenv "DRIVERS") (str/split #",") set (disj "h2" "postgres" "mysql")))

        _ (log-once
           (colorize/color
            :magenta
            (format "[include-drivers middleware] Attempting to include these drivers: %s" (set drivers))))

        available-drivers
        (for [driver drivers
              :when (driver-dependencies-satisfied? driver)]
          driver)]
    (concat
     available-drivers
     (set (mapcat driver-parents available-drivers)))))

(defn- test-drivers-source-paths [test-drivers]
  (vec
   (for [driver test-drivers
         :let   [source-path (format "modules/drivers/%s/src" driver)]
         :when  (file-exists? source-path)]
     source-path)))

(defn- test-drivers-test-paths [test-drivers]
  (vec
   (for [driver test-drivers
         :let   [test-path (format "modules/drivers/%s/test" driver)]
         :when  (file-exists? test-path)]
     test-path)))

(defn- test-drivers-test-paths [test-drivers]
  (vec
   (for [driver test-drivers
         :let   [test-path (format "modules/drivers/%s/test" driver)]
         :when  (file-exists? test-path)]
     test-path)))

(defn- test-drivers-projects [test-drivers]
  (filter some? (map driver->project test-drivers)))

(defn- test-drivers-dependencies [test-projects]
  (vec
   (for [{:keys [dependencies]} test-projects
         dep                    dependencies
         :when                  (not= :provided (keyword (:scope (apply array-map dep))))]
     dep)))

(defn- test-drivers-repositories [test-projects]
  (vec
   (for [{:keys [repositories]} test-projects
         repo                   repositories]
     repo)))

(defn- test-drivers-aot [test-projects]
  (vec
   (for [{:keys [aot]} test-projects
         ;; if aot is something like all we don't want to merge it into the MB project
         :when         (sequential? aot)
         klass         aot]
     klass)))

(defn- test-drivers-profile [project]
  (let [test-drivers  (test-drivers project)
        test-projects (test-drivers-projects test-drivers)]
    (log-once
     (colorize/color
      :magenta
      (format "[include-drivers middleware] including these drivers: %s" (set test-drivers))))
    {:repositories (test-drivers-repositories test-projects)
     :dependencies (test-drivers-dependencies test-projects)
     :aot          (test-drivers-aot          test-projects)
     :source-paths (test-drivers-source-paths test-drivers)
     :test-paths   (test-drivers-test-paths   test-drivers)}))

(defn middleware
  "Add dependencies, source paths, and test paths for to Metabase drivers that are packaged as separate projects and
  specified by the `DRIVERS` env var."
  [project]
  ;; When we merge a new profile into the project Leiningen will reload the project, which will cause our middleware
  ;; to run a second time. Make sure we don't add the profile a second time or we'll be stuck in an infinite loop of
  ;; adding a new profile and reloading.
  (if (::has-driver-profiles? project)
    project
    (p/merge-profiles project [(test-drivers-profile project) {::has-driver-profiles? true}])))
