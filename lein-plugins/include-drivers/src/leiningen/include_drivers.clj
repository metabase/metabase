(ns leiningen.include-drivers
  (:require [clojure.string :as str]
            [leiningen.core.project :as p])
  (import java.io.File))

(defn- file-exists? [^String filename]
  (.exists (File. filename)))

(def ^:private test-drivers
  (some-> (System/getenv "DRIVERS") (str/split #",")))

(def ^:private test-drivers-source-paths
  (vec
   (for [driver test-drivers
         :let   [source-path (format "modules/drivers/%s/src" driver)]
         :when  (file-exists? source-path)]
     source-path)))

(def ^:private test-drivers-test-paths
  (vec
   (for [driver test-drivers
         :let   [test-path (format "modules/drivers/%s/test" driver)]
         :when  (file-exists? test-path)]
     test-path)))

(def ^:private test-drivers-dependencies
  (vec
   (for [driver test-drivers
         :let   [project-file (format "modules/drivers/%s/project.clj" driver)]
         :when  (file-exists? project-file)
         :let   [{:keys [dependencies]} (p/read project-file)]
         dep    dependencies
         :when  (not= 'metabase-core/metabase-core (first dep))]
     dep)))

(def ^:private test-drivers-profile
  {:dependencies test-drivers-dependencies
   :source-paths test-drivers-source-paths
   :test-paths   test-drivers-test-paths})

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
      (p/merge-profiles project [test-drivers-profile]))))
