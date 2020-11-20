(ns build
  (:require [build-drivers :as build-drivers]
            [build.version-info :as version-info]
            [clojure.string :as str]
            [environ.core :as env]
            [flatland.ordered.map :as ordered-map]
            [metabuild-common
             [core :as u]
             [java :as java]]))

(defn- build-translation-resources!
  []
  (u/step "Build translation resources"
    (java/check-java-8)
    (u/sh {:dir u/project-root-directory} "./bin/i18n/build-translation-resources")
    (u/announce "Translation resources built successfully.")))

(defn- edition-from-env-var []
  ;; MB_EDITION is either oss/ee, but the Clojure build scripts currently use :ce/:ee
  (case (env/env :mb-edition)
    "oss" :ce
    "ee"  :ee
    nil   :ce))

(defn- build-frontend! [edition]
  {:pre [(#{:ce :ee} edition)]}
  (let [mb-edition (case edition
                     :ee "ee"
                     :ce "oss")]
    (u/step (format "Build frontend with MB_EDITION=%s" mb-edition)
      (u/step "Run 'yarn' to download javascript dependencies"
        (if (env/env :ci)
          (do
            (u/announce "CI run: enforce the lockfile")
            (u/sh {:dir u/project-root-directory} "yarn" "--frozen-lockfile"))
          (u/sh {:dir u/project-root-directory} "yarn")))
      (u/step "Run 'webpack' with NODE_ENV=production to assemble and minify frontend assets"
        (u/sh {:dir u/project-root-directory
               :env {"PATH"       (env/env :path)
                     "HOME"       (env/env :user-home)
                     "NODE_ENV"   "production"
                     "MB_EDITION" mb-edition}}
              "./node_modules/.bin/webpack" "--bail"))
      (u/announce "Frontend built successfully."))))

(def uberjar-filename (u/filename u/project-root-directory "target" "uberjar" "metabase.jar"))

(defn- build-uberjar! [edition]
  {:pre [(#{:ce :ee} edition)]}
  ;; clojure scripts currently use :ee vs :ce but everything else uses :ee vs :oss
  (let [profile (case edition
                  :ee "ee"
                  :ce "oss")]
    (u/delete-file-if-exists! uberjar-filename)
    (u/step (format "Build uberjar with profile %s" profile)
      (u/sh {:dir u/project-root-directory} "lein" "clean")
      (u/sh {:dir u/project-root-directory} "lein" "with-profile" (str \+ profile) "uberjar")
      (u/assert-file-exists uberjar-filename)
      (u/announce "Uberjar built successfully."))))

(def all-steps
  (ordered-map/ordered-map
   :version      (fn [{:keys [version]}]
                   (version-info/generate-version-info-file! version))
   :translations (fn [_]
                   (build-translation-resources!))
   :frontend     (fn [{:keys [edition]}]
                   (build-frontend! edition))
   :drivers      (fn [_]
                   (build-drivers/build-drivers!))
   :uberjar      (fn [{:keys [edition]}]
                   (build-uberjar! edition))))

(defn build!
  ([]
   (build! nil))

  ([{:keys [version edition steps]
     :or   {version (version-info/current-snapshot-version)
            edition :ce
            steps   (keys all-steps)}}]
   (u/step (format "Running build steps for %s version %s: %s"
                   (case edition
                     :ce "Community (OSS) Edition"
                     :ee "Enterprise Edition")
                   version
                   (str/join ", " (map name steps)))
     (doseq [step-name steps
             :let      [step-fn (or (get all-steps (keyword step-name))
                                    (throw (ex-info (format "Invalid step: %s" step-name)
                                                    {:step        step-name
                                                     :valid-steps (keys all-steps)})))]]
       (step-fn {:version version, :edition edition}))
     (u/announce "All build steps finished."))))

(defn -main [& steps]
  (u/exit-when-finished-nonzero-on-exception
    (build! (merge {:edition (edition-from-env-var)}
                   (when-let [steps (not-empty steps)]
                     {:steps steps})))))
