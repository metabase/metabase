(ns leiningen.include-drivers
  (:require [clojure.string :as str]
            [leiningen.core.project :as p])
  (import java.io.File))

(defn- file-exists? [^String filename]
  (.exists (File. filename)))

(defn- driver-parents
  "As listed in a 'parents' file in the module source directory. Add to the list of drivers to add sources for"
  [driver]
  (let [parents-file (File. (format "modules/drivers/%s/parents" driver))]
    (when (.exists parents-file)
      (str/split-lines (slurp parents-file)))))

;; if :include-drivers is specified in the project, and its value is `:all`, include all drivers; if it's a collection
;; of driver names, include the specified drivers; otherwise include whatever was set in the `DRIVERS` env var
(defn- test-drivers [{:keys [include-drivers]}]
  (let [drivers
        (cond
          (= include-drivers :all)
          (.list (java.io.File. "modules/drivers"))

          (coll? include-drivers)
          include-drivers

          :else
          (some-> (System/getenv "DRIVERS") (str/split #",")))]
    (concat drivers
            (set (mapcat driver-parents drivers)))))

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

(defn- test-drivers-projects [test-drivers]
  (for [driver test-drivers
        :let   [project-file (format "modules/drivers/%s/project.clj" driver)]
        :when  (file-exists? project-file)]
    (p/read project-file)))

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
    (when (seq test-drivers)
      (println "[include drivers middleware] adding sources/deps for these drivers:" test-drivers))
    {:repositories (test-drivers-repositories test-projects)
     :dependencies (test-drivers-dependencies test-projects)
     :aot          (test-drivers-aot          test-projects)
     :source-paths (test-drivers-source-paths test-drivers)
     :test-paths   (test-drivers-test-paths   test-drivers)}))

;; When we merge a new profile into the project Leiningen will reload the project, which will cause our middleware to
;; run a second time. Make sure we don't add the profile a second time or we'll be stuck in an infinite loop of adding
;; a new profile and reloading.
(defonce ^:private has-added-test-drivers-profile? (atom false))

(defn middleware
  "Add dependencies, source paths, and test paths for to Metabase drivers that are packaged as separate projects and
  specified by the `DRIVERS` env var."
  [project]
  (if @has-added-test-drivers-profile?
    project
    (do
      (reset! has-added-test-drivers-profile? true)
      (p/merge-profiles project [(test-drivers-profile project)]))))
