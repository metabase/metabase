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

(defn- json-config->edn-ignored
  "Convert JSON config to hawk's EDN ignored format. Right now we only support individually ignored vars. In the future
  will extend to namespaces, drivers. Ideally e2e tests as well. Example config:
  ```javascript
     {
       \"ignored\": {
         \"vars\": [
           \"metabase.util.queue-test/bounded-transfer-queue-test\",
           \"metabase.util.queue-test/take-batch-test\"
         ]
       }
     }
  ```"
  [json-config]
  (try
    (let [{:keys [ignored] :as config} (json/parse-string (slurp json-config) true)]
      (when (seq ignored)
        #_{:clj-kondo/ignore [:discouraged-var]}
        (println (format "using config file: \n%s\n" config)))
      (cond-> {}
        (seq (:vars ignored))
        (assoc :vars (-> ignored :vars set))))
    (catch Exception e
      (log/warnf "Error parsing json config: %s '%s'" json-config (ex-message e)))))

(defn- default-options
  "Default options for test runner, with optional CI config integration."
  ([]
   (default-options {}))
  ([{:keys [ci-config-file]
     :or {ci-config-file "ci-test-config.json"}}]
   (let [base-options {:namespace-pattern #"^(?:(?:metabase.*)|(?:hooks\..*))" ; anything starting with `metabase*` (including `metabase-enterprise`) or `hooks.*`
                       :exclude-directories excluded-directories
                       :test-warn-time 3000}]
     (cond (and ci-config-file (.exists (io/file ci-config-file)))
           (do
             #_{:clj-kondo/ignore [:discouraged-var]}
             (println (format "Loading CI config file from %s" ci-config-file))
             (assoc base-options :ignored (json-config->edn-ignored ci-config-file)))
           ci-config-file
           (do (log/warnf "CI config file was specified but does not exist: %s" ci-config-file)
               base-options)
           :else
           base-options))))

(defn- build-final-options
  "Build final options by merging defaults, CI config, and runtime options.
   This centralizes all the option merging logic in one place."
  [runtime-options]
  (let [default-opts (default-options runtime-options)
        runtime-ignored (:ignored runtime-options)
        ;; Simple merge: if both have :ignored, merge them; otherwise use whichever exists
        final-ignored (if (and (:ignored default-opts) runtime-ignored)
                        (merge-with set/union (:ignored default-opts) runtime-ignored)
                        (or runtime-ignored (:ignored default-opts)))]
    (-> (merge default-opts runtime-options)
        (cond-> (seq final-ignored) (assoc :ignored final-ignored)))))

(defn find-tests
  "Find all tests, in case you wish to run them yourself."
  ([]
   (find-tests {}))
  ([options]
   (hawk/find-tests-with-options (build-final-options options))))

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
  (hawk/find-and-run-tests-repl (build-final-options options)))

(defn find-and-run-tests-cli
  "Entrypoint for `clojure -X:test`."
  [options]
  (initialize-all-fixtures)
  (hawk/find-and-run-tests-cli (build-final-options options)))
