(ns build
  (:require
   [build-drivers :as build-drivers]
   [build.licenses :as license]
   [build.uberjar :as uberjar]
   [build.version-properties :as version-properties]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.build.api :as b]
   [environ.core :as env]
   [flatland.ordered.map :as ordered-map]
   [i18n.create-artifacts :as i18n]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

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
    (u/step (format "Build frontend with MB_EDITION=%s (using wireit cache)" mb-edition)
      (when-not (env/env :ci)
        (u/step "Run 'yarn' to download JavaScript dependencies"
          (u/sh {:dir u/project-root-directory} "yarn")))
      (u/step "Build frontend (wireit-cached)"
        (u/sh {:dir u/project-root-directory
               :env {"PATH"       (env/env :path)
                     "HOME"       (env/env :user-home)
                     "WEBPACK_BUNDLE"   "production"
                     "MB_EDITION" mb-edition}}
              "yarn" "build-release"))
      (u/announce "Frontend built successfully."))))

(defn- build-licenses!
  [edition]
  {:pre [(#{:oss :ee} edition)]}
  (when-not (= (env/env :skip-licenses) "true")
    (u/step "Generate backend license information from jar files"
      (let [basis                     (b/create-basis {:project (u/filename u/project-root-directory "deps.edn")})
            output-filename           (u/filename u/project-root-directory
                                                  "resources"
                                                  "license-backend-third-party.txt")
            {:keys [without-license]} (license/generate {:basis           basis
                                                         :backfill        (edn/read-string
                                                                           (slurp (io/resource "overrides.edn")))
                                                         :output-filename output-filename
                                                         :report?         false})]
        (when (seq without-license)
          (run! (comp (partial u/error "Missing License: %s") first)
                without-license))
        (u/announce "License information generated at %s" output-filename)))

    (u/step "Run `yarn licenses generate-disclaimer`"
      (let [license-text (str/join \newline
                                   (u/sh {:dir    u/project-root-directory
                                          :quiet? true}
                                         "yarn" "licenses" "generate-disclaimer"))]
        (spit (u/filename u/project-root-directory
                          "resources"
                          "license-frontend-third-party.txt") license-text)))))

(defn build-licenses-direct!
  "Build licenses without requiring edition parameter. Used for yarn/wireit caching."
  [_options]
  (build-licenses! (edition-from-env-var)))

(defn build-version-direct!
  "Generate version properties file without requiring explicit parameters. Used for yarn/wireit caching."
  [_options]
  (let [edition (edition-from-env-var)
        version (version-properties/current-snapshot-version edition)]
    (version-properties/generate-version-properties-file! edition version)))

(defn build-drivers-direct!
  "Build drivers without requiring edition parameter. Used for yarn/wireit caching."
  [_options]
  (build-drivers/build-drivers! (edition-from-env-var)))

(defn- build-uberjar! [edition]
  {:pre [(#{:oss :ee} edition)]}
  (u/delete-file-if-exists! uberjar/uberjar-filename)
  (u/step (format "Build uberjar with profile %s" edition)
    (uberjar/uberjar {:edition edition})
    (u/assert-file-exists uberjar/uberjar-filename)
    (u/announce "Uberjar built successfully.")))

(defn- build-via-yarn!
  ([step-name]
   (build-via-yarn! step-name {}))
  ([step-name {:keys [edition]}]
   (let [mb-edition (when edition
                      (case edition
                        :ee "ee"
                        :oss "oss"))]
     (u/step (format "Build %s (using wireit cache)" step-name)
       (u/sh {:dir u/project-root-directory
              :env (cond-> {"PATH" (env/env :path)
                            "HOME" (env/env :user-home)}
                     mb-edition (assoc "MB_EDITION" mb-edition))}
             "yarn" (str "build:" step-name))
       (u/announce "%s built successfully (cached)." step-name)))))

(defn build-uberjar-direct!
  "Build uberjar without requiring edition parameter. Used for yarn/wireit caching."
  [_options]
  (build-uberjar! (edition-from-env-var)))

(def ^:private all-steps
  "These build steps are run in order during the build process."
  (ordered-map/ordered-map
   :version      (fn [{:keys [edition]}]
                   (build-via-yarn! "version" {:edition edition}))
   :translations (fn [{:keys [edition]}]
                   (build-via-yarn! "translations" {:edition edition}))
   :frontend     (fn [{:keys [edition]}]
                   (build-frontend! edition))
   :licenses     (fn [{:keys [edition]}]
                   (build-via-yarn! "licenses" {:edition edition}))
   :drivers      (fn [{:keys [edition]}]
                   (build-via-yarn! "drivers" {:edition edition}))
   :uberjar      (fn [{:keys [edition]}]
                   (build-via-yarn! "uberjar" {:edition edition}))))

(defn build!
  "Programmatic entrypoint."
  ([]
   (build! nil))

  ([{:keys [version edition steps]
     :or   {edition (edition-from-env-var)
            steps   (keys all-steps)}}]
   (let [version (or version
                     (version-properties/current-snapshot-version edition))
         timer         (u/start-timer)]
     (u/step (format "Running build steps for %s version %s: %s"
                     (case edition
                       :oss "Community (OSS) Edition"
                       :ee  "Enterprise Edition")
                     version
                     (str/join ", " (map name steps)))
       (doseq [step-name steps
               :let      [step-fn (or (get all-steps (u/parse-as-keyword step-name))
                                      (throw (ex-info (format "Invalid step: %s" step-name)
                                                      {:step        step-name
                                                       :valid-steps (keys all-steps)})))]]
         (step-fn {:version version, :edition edition})
         (u/announce "Did %s in %d ms." step-name (u/since-ms timer)))
       (u/announce "All build steps finished.")))))

(defn build-cli
  "CLI entrypoint. This is just a slim wrapper around [[build!]] that exists with a nonzero status if an exception is
  thrown."
  [options]
  (u/exit-when-finished-nonzero-on-exception
    (build! options)))

(defn list-without-license
  "From the command line:

    clojure -X:build:build/list-without-license"
  [_options]
  (let [[classpath]               (u/sh {:dir    u/project-root-directory
                                         :quiet? true}
                                        "clojure" "-A:ee" "-Spath")
        classpath-entries         (license/jar-entries classpath)
        {:keys [without-license]} (license/process*
                                   {:classpath-entries classpath-entries
                                    :backfill          (edn/read-string
                                                        (slurp (io/resource "overrides.edn")))})]
    (if (seq without-license)
      (run! (comp (partial u/error "Missing License: %s") first)
            without-license)
      (u/announce "All dependencies have licenses"))
    (shutdown-agents)
    (System/exit (if (seq without-license) 1 0))))
