(ns build
  (:require [build-drivers :as build-drivers]
            [build.licenses :as license]
            [build.version-info :as version-info]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [environ.core :as env]
            [flatland.ordered.map :as ordered-map]
            [i18n.create-artifacts :as i18n]
            [metabuild-common.core :as u]))

(defn- edition-from-env-var []
  (case (env/env :mb-edition)
    "oss" :oss
    "ee"  :ee
    nil   :oss))

(defn- build-frontend! [edition]
  {:pre [(#{:oss :ee} edition)]}
  (let [mb-edition (case edition
                     :ee "ee"
                     :oss "oss")]
    (u/step (format "Build frontend with MB_EDITION=%s" mb-edition)
      (u/step "Run 'yarn' to download javascript dependencies"
        (if (env/env :ci)
          (do
            (u/announce "CI run: enforce the lockfile")
            (u/sh {:dir u/project-root-directory} "yarn" "--frozen-lockfile"))
          (u/sh {:dir u/project-root-directory} "yarn")))
      ;; TODO -- I don't know why it doesn't work if we try to combine the two steps below by calling `yarn build`,
      ;; which does the same thing.
      (u/step "Build frontend (ClojureScript)"
        (u/sh {:dir u/project-root-directory
               :env {"PATH"       (env/env :path)
                     "HOME"       (env/env :user-home)
                     "NODE_ENV"   "production"
                     "MB_EDITION" mb-edition}}
              "./node_modules/.bin/shadow-cljs" "release" "app"))
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
  {:pre [(#{:oss :ee} edition)]}
  (u/delete-file-if-exists! uberjar-filename)
  (u/step (format "Build uberjar with profile %s" edition)
    (u/sh {:dir u/project-root-directory} "lein" "clean")
    (u/sh {:dir u/project-root-directory} "lein" "with-profile" (str \+ (name edition)) "uberjar")
    (u/assert-file-exists uberjar-filename)
    (u/announce "Uberjar built successfully.")))

(defn- build-backend-licenses-file! [edition]
  {:pre [(#{:oss :ee} edition)]}
  (let [classpath-and-logs        (u/sh {:dir    u/project-root-directory
                                         :quiet? true}
                                        "lein"
                                        "with-profile" (str \- "dev"
                                                            (str \, \+ (name edition))
                                                            \,"+include-all-drivers")
                                        "classpath")
        classpath                 (last
                                   classpath-and-logs)
        output-filename           (u/filename u/project-root-directory "license-backend-third-party")
        {:keys [with-license
                without-license]} (license/generate {:classpath       classpath
                                                     :backfill        (edn/read-string
                                                                       (slurp (io/resource "overrides.edn")))
                                                     :output-filename output-filename
                                                     :report?         false})]
    (when (seq without-license)
      (run! (comp (partial u/error "Missing License: %s") first)
            without-license))
    (u/announce "License information generated at %s" output-filename)))

(defn- build-frontend-licenses-file!
  []
  (let [license-text (str/join \newline
                               (u/sh {:dir    u/project-root-directory
                                      :quiet? true}
                                     "yarn" "licenses" "generate-disclaimer"))]
    (spit (u/filename u/project-root-directory "license-frontend-third-party") license-text)))

(def all-steps
  (ordered-map/ordered-map
   :version      (fn [{:keys [edition version]}]
                   (version-info/generate-version-info-file! edition version))
   :translations (fn [_]
                   (i18n/create-all-artifacts!))
   :frontend     (fn [{:keys [edition]}]
                   (build-frontend! edition))
   :drivers      (fn [{:keys [edition]}]
                   (build-drivers/build-drivers! edition))
   :backend-licenses (fn [{:keys [edition]}]
                       (build-backend-licenses-file! edition))
   :frontend-licenses (fn [{:keys []}]
                        (build-frontend-licenses-file!))
   :uberjar      (fn [{:keys [edition]}]
                   (build-uberjar! edition))))

(defn build!
  ([]
   (build! nil))

  ([{:keys [version edition steps]
     :or   {edition :oss
            steps   (keys all-steps)}}]
   (let [version (or version
                     (version-info/current-snapshot-version edition))]
     (u/step (format "Running build steps for %s version %s: %s"
                     (case edition
                       :oss "Community (OSS) Edition"
                       :ee  "Enterprise Edition")
                     version
                     (str/join ", " (map name steps)))
       (doseq [step-name steps
               :let      [step-fn (or (get all-steps (keyword step-name))
                                      (throw (ex-info (format "Invalid step: %s" step-name)
                                                      {:step        step-name
                                                       :valid-steps (keys all-steps)})))]]
         (step-fn {:version version, :edition edition}))
       (u/announce "All build steps finished.")))))

(defn -main [& steps]
  (u/exit-when-finished-nonzero-on-exception
    (build! (merge {:edition (edition-from-env-var)}
                   (when-let [steps (not-empty steps)]
                     {:steps steps})))))
