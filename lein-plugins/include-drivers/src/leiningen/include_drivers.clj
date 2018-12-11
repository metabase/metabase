(ns leiningen.include-drivers
  (:require [clojure.string :as str]
            [leiningen.core.project :as p])
  (import java.io.File))

(defn- file-exists? [^String filename]
  (.exists (File. filename)))

;; if :include-drivers is specified in the project, and its value is `:all`, include all drivers; if it's a collection
;; of driver names, include the specified drivers; otherwise include whatever was set in the `DRIVERS` env var
(defn- test-drivers [{:keys [include-drivers]}]
  (cond
    (= include-drivers :all)
    (.list (java.io.File. "modules/drivers"))

    (coll? include-drivers)
    include-drivers

    :else
    (some-> (System/getenv "DRIVERS") (str/split #","))))

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

(defn- test-drivers-dependencies [test-drivers]
  (vec
   (for [driver test-drivers
         :let   [project-file (format "modules/drivers/%s/project.clj" driver)]
         :when  (file-exists? project-file)
         :let   [{:keys [dependencies]} (p/read project-file)]
         dep    dependencies
         :when  (not= 'metabase-core/metabase-core (first dep))]
     dep)))

(defn- test-drivers-repositories [test-drivers]
  (vec
   (for [driver test-drivers
         :let   [project-file (format "modules/drivers/%s/project.clj" driver)]
         :when  (file-exists? project-file)
         :let   [{:keys [repositories]} (p/read project-file)]
         repo   repositories]
     repo)))

(defn- test-drivers-profile [project]
  (let [test-drivers (test-drivers project)]
    {:repositories (test-drivers-repositories test-drivers)
     :dependencies (test-drivers-dependencies test-drivers)
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
