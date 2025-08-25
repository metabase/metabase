#_{:clj-kondo/ignore [:metabase/namespace-name]}
(ns metabase.test-runner
  "The only purpose of this namespace is to make sure all of the other stuff below gets loaded."
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [humane-are.core :as humane-are]
   [mb.hawk.core :as hawk]
   [metabase.config.core :as config]
   [metabase.core.bootstrap]
   [metabase.test-runner.assert-exprs]
   [metabase.test.data.env :as tx.env]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [metabase.util.date-2]
   [metabase.util.i18n.impl]
   [metabase.util.log :as log]
   [pjstadig.humane-test-output :as humane-test-output]))

(set! *warn-on-reflection* true)

;;; TODO -- consider whether we should just mode all of this stuff to [[user]] instead of doing it here

(comment
  metabase.core.bootstrap/keep-me
  ;; make sure stuff like `=?` and what not are loaded
  metabase.test-runner.assert-exprs/keep-me

  ;; these are necessary so data_readers.clj functions can function
  metabase.util.date-2/keep-me
  metabase.util.i18n.impl/keep-me)

;; Initialize Humane Test Output if it's not already initialized. Don't enable humane-test-output when running tests
;; from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;;; Same for https://github.com/camsaul/humane-are
(humane-are/install!)

;;; Ignore any directories for drivers that are not in the [[tx.env/test-drivers]] (i.e., not in `DRIVERS`)
;;;
;;; I supposed we COULD do this by dynamically generating `:exclude-directories` but it ends up being a pretty big list
;;; since we have to include `src`, `test`, `resources`, `resources-ee`; with both relative and absolute versions (since
;;; `:drivers` adds the deps as `:local/root` deps they're added to the classpath as absolute paths) -- this is
;;; ultimately easier and less noisy.

(defn- all-drivers []
  (into #{:h2 :postgres :mysql}
        (for [^java.io.File file (.listFiles (io/file "modules/drivers"))
              :when (.isDirectory file)]
          (keyword (.getName file)))))

(defn- excluded-drivers []
  (set/difference (all-drivers) (tx.env/test-drivers)))

;;; replace the default method that finds all tests on the classpath with one that ignores driver directories
(defmethod hawk/find-tests nil
  [_nil options]
  (let [excluded-driver-dirs (for [driver (excluded-drivers)]
                               (format "modules/drivers/%s" (name driver)))
        exclude-directory? (fn [dir]
                             (let [dir (str dir)]
                               (some (fn [excluded]
                                       (or (str/ends-with? dir excluded)
                                           (str/includes? dir (str excluded "/"))))
                                     excluded-driver-dirs)))
        directories (for [^java.io.File file (classpath/system-classpath)
                          :when (and (.isDirectory file)
                                     (not (exclude-directory? file)))]
                      file)]
    (hawk/find-tests directories options)))

(def ^:private excluded-directories
  [".clj-kondo/src"
   "classes"
   "dev"
   "enterprise/backend/src"
   "local"
   "resources"
   "resources-ee"
   "src"
   "target"
   "test_config"
   "test_resources"])

(defn- load-ci-config-json
  "Load and parse ci-test-config.json from the filesystem.
   Returns nil if file doesn't exist or parsing fails."
  [file-path]
  (try
    (when (.exists (io/file file-path))
      (-> file-path slurp (json/parse-string true)))
    (catch Exception e
      (log/warn e "Failed to load CI config from" file-path)
      nil)))

(defn- json-config->edn-ignored
  "Convert JSON config to hawk's EDN ignored format."
  [json-config]
  (let [backend (get json-config :backend {})]
    (cond-> {}
      (seq (get backend :ignored_vars []))
      (assoc :vars (set (get backend :ignored_vars [])))

      (seq (get backend :ignored_namespaces []))
      (assoc :namespaces (set (get backend :ignored_namespaces [])))

      (seq (get backend :ignored_drivers []))
      (assoc :drivers (set (get backend :ignored_drivers []))))))

(defn- merge-ignored-configs
  "Merge CI config ignores with CLI ignores and apply run-ignored-vars overrides."
  [ci-config cli-ignored run-ignored-vars]
  (let [edn-ci-config (json-config->edn-ignored ci-config)
        merged-ignored (merge-with set/union cli-ignored edn-ci-config)]
    ;; Remove any vars specified in run-ignored-vars
    (if (seq run-ignored-vars)
      (update merged-ignored :vars
              #(set/difference (set %) (set run-ignored-vars)))
      merged-ignored)))

(defn- default-options
  "Default options for test runner, with optional CI config integration."
  ([]
   (default-options {}))
  ([{:keys [ci-config-file ignore-ci-config run-ignored-vars ignored]
     :or {ci-config-file "ci-test-config.json"}}]
   (let [base-options {:namespace-pattern #"^(?:(?:metabase.*)|(?:hooks\..*))" ; anything starting with `metabase*` (including `metabase-enterprise`) or `hooks.*`
                       :exclude-directories excluded-directories
                       :test-warn-time 3000}]
     (if ignore-ci-config
       base-options
       (let [ci-config (load-ci-config-json ci-config-file)]
         (if ci-config
           (do
             (log/info "Loaded CI test config from" ci-config-file)
             (assoc base-options :ignored
                    (merge-ignored-configs ci-config (or ignored {}) run-ignored-vars)))
           base-options))))))

(defn find-tests
  "Find all tests, in case you wish to run them yourself."
  ([]
   (find-tests {}))
  ([options]
   (let [default-opts (default-options options)
         ;; Special handling for :ignored to merge rather than replace
         final-ignored (if (and (:ignored default-opts) (:ignored options))
                         (merge-with set/union (:ignored default-opts) (:ignored options))
                         (or (:ignored options) (:ignored default-opts)))
         merged-options (-> (merge default-opts options)
                            (assoc :ignored final-ignored))]
     (hawk/find-tests-with-options merged-options))))

(defn- initialize-all-fixtures []
  (let [steps (initialize/all-components)]
    (u/with-timer-ms [duration-ms]
      (doseq [init-step steps]
        (fixtures/initialize init-step))
      (log/info (str "Initialized " (count steps) " fixtures in " (duration-ms) "ms")))))

(defn find-and-run-tests-repl
  "Find and run tests from the REPL."
  [options]
  (initialize-all-fixtures)
  (let [default-opts (default-options options)
        ;; Special handling for :ignored to merge rather than replace
        final-ignored (if (and (:ignored default-opts) (:ignored options))
                        (merge-with set/union (:ignored default-opts) (:ignored options))
                        (or (:ignored options) (:ignored default-opts)))
        merged-options (-> (merge default-opts options)
                           (assoc :ignored final-ignored))]
    (hawk/find-and-run-tests-repl merged-options)))

(defn find-and-run-tests-cli
  "Entrypoint for `clojure -X:test`."
  [options]
  (initialize-all-fixtures)
  (let [default-opts (default-options options)
        ;; Special handling for :ignored to merge rather than replace
        final-ignored (if (and (:ignored default-opts) (:ignored options))
                        (merge-with set/union (:ignored default-opts) (:ignored options))
                        (or (:ignored options) (:ignored default-opts)))
        merged-options (-> (merge default-opts options)
                           (assoc :ignored final-ignored))]
    (hawk/find-and-run-tests-cli merged-options)))
