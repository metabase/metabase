(ns build
  (:require
   [build.licenses :as license]
   [build.python :as build.python]
   [build.uberjar :as uberjar]
   [build.version-properties :as version-properties]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.build.api :as b]
   [environ.core :as env]
   [flatland.ordered.map :as ordered-map]
   [i18n.create-artifacts :as i18n]
   [metabuild-common.core :as u])
  (:import
   (java.util.concurrent ExecutionException)))

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
    (u/step (format "Build frontend with MB_EDITION=%s" mb-edition)
      (when-not (env/env :ci)
        (u/step "Run 'bun install' to download JavaScript dependencies"
          (u/sh {:dir u/project-root-directory} "bun" "install")))
      (u/step "Build frontend"
        (u/sh {:dir u/project-root-directory
               :env {"PATH"       (env/env :path)
                     "HOME"       (env/env :user-home)
                     "WEBPACK_BUNDLE"   "production"
                     "MB_EDITION" mb-edition
                     "EMIT_BUNDLE_STATS" (or (env/env :emit-bundle-stats) "false")
                     "INSTRUMENT_COVERAGE" (or (env/env :instrument-coverage) "false")
                     ;; Whether to emit pre-compressed (.br/.gz) copies of every asset. Defaults to "true" to
                     ;; match what a production bundle has always done; CI turns it off for PR builds, where
                     ;; brotli-at-max-quality over the whole bundle is a lot of time to spend on files
                     ;; `metabase.server.routes.static` will happily do without.
                     "COMPRESSION" (or (env/env :compression) "true")}}
              "bun" "run" "build-release"))
      (u/step "Build static viz"
        (u/sh {:dir u/project-root-directory
               :env {"PATH"       (env/env :path)
                     "HOME"       (env/env :user-home)
                     "WEBPACK_BUNDLE"   "production"
                     "MB_EDITION" mb-edition}}
              "bun" "run" "build-release:static-viz"))
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
    (u/step "Run `bun run generate-license-disclaimer`"
      (u/sh {:dir u/project-root-directory}
            "bun" "run" "generate-license-disclaimer"))))

(defn- build-frontend-async!
  "Start [[build-frontend!]] on a background thread. Returns a function that blocks until it finishes, rethrowing
  whatever it threw.

  The frontend build reads the translations the `:translations` step produced and writes `resources/frontend_client`;
  the Clojure AOT compilation in the `:uberjar` step reads neither (everything it does load out of
  `resources/frontend_client` at compile time is checked in, not generated). So the two can overlap, which matters
  because they are the two longest steps in the build by a wide margin."
  [edition]
  (let [timer (u/start-timer)
        fut   (future (build-frontend! edition))]
    (u/announce "Frontend build running in the background; the uberjar step will wait for it.")
    (fn await-frontend! []
      (u/step "Wait for the background frontend build"
        (try
          @fut
          (catch ExecutionException e
            (throw (or (ex-cause e) e))))
        (u/announce "Background frontend build finished in %d ms." (u/since-ms timer))))))

(defn- build-uberjar!
  [edition {:keys [await-frontend!]}]
  {:pre [(#{:oss :ee} edition)]}
  (u/delete-file-if-exists! uberjar/uberjar-filename)
  (u/step (format "Build uberjar with profile %s" edition)
    (uberjar/uberjar {:edition edition, :await-frontend! await-frontend!})
    (u/assert-file-exists uberjar/uberjar-filename)
    (u/announce "Uberjar built successfully.")))

(def ^:private all-steps
  "These build steps are run in order during the build process."
  (ordered-map/ordered-map
   :version      (fn [{:keys [edition version]}]
                   (version-properties/generate-version-properties-file! edition version))
   :translations (fn [_]
                   (i18n/create-all-artifacts!))
   :frontend     (fn [{:keys [edition]}]
                   (build-frontend! edition))
   :licenses     (fn [{:keys [edition]}]
                   (build-licenses! edition))
   #_#_:drivers      (fn [{:keys [edition]}]
                       (build-drivers/build-drivers! edition))
   :python       (fn [{:keys [edition]}]
                   (build.python/build-python-deps! edition))
   :uberjar      (fn [{:keys [edition]}]
                   (build-uberjar! edition nil))))

(defn- overlap-frontend-with-uberjar?
  "Whether this build can run the `:frontend` step in the background while the `:uberjar` step AOT-compiles the
  backend. Only when both steps are in the build and the frontend comes first -- i.e. the normal full build. Anything
  else (a frontend-only build, an uberjar-only build, a hand-rolled `:steps` that inverts the two) runs sequentially,
  since there would be nothing to overlap with or nobody left to wait for the background thread."
  [step-names]
  (let [position (into {} (map-indexed (fn [i step-name] [step-name i])) step-names)]
    (boolean (when-let [frontend (:frontend position)]
               (when-let [uberjar (:uberjar position)]
                 (< frontend uberjar))))))

(defn- steps-for-build
  "The step fns to run for `step-names`. Usually just [[all-steps]], but for a full build we swap in `:frontend` and
  `:uberjar` steps that overlap -- see [[build-frontend-async!]]."
  [step-names]
  (if-not (overlap-frontend-with-uberjar? step-names)
    all-steps
    (let [await-frontend! (atom nil)]
      (assoc all-steps
             :frontend (fn [{:keys [edition]}]
                         (reset! await-frontend! (build-frontend-async! edition)))
             :uberjar  (fn [{:keys [edition]}]
                         (build-uberjar! edition {:await-frontend! @await-frontend!}))))))

(defn build!
  "Programmatic entrypoint."
  ([]
   (build! nil))

  ([{:keys [version edition steps]
     :or   {edition (edition-from-env-var)
            steps   (keys all-steps)}}]
   (let [version    (or version
                        (version-properties/current-snapshot-version edition))
         step-names (mapv u/parse-as-keyword steps)
         step-fns   (steps-for-build step-names)
         timer      (u/start-timer)]
     (u/step (format "Running build steps for %s version %s: %s"
                     (case edition
                       :oss "Community (OSS) Edition"
                       :ee  "Enterprise Edition")
                     version
                     (str/join ", " (map name step-names)))
       (doseq [step-name step-names
               :let      [step-fn (or (get step-fns step-name)
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
