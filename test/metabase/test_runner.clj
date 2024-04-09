(ns metabase.test-runner
  "The only purpose of this namespace is to make sure all of the other stuff below gets loaded."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [humane-are.core :as humane-are]
   [mb.hawk.core :as hawk]
   [metabase.bootstrap]
   [metabase.config :as config]
   [metabase.test-runner.assert-exprs]
   [metabase.test.data.env :as tx.env]
   [metabase.util.date-2]
   [metabase.util.i18n.impl]
   [pjstadig.humane-test-output :as humane-test-output]))

(set! *warn-on-reflection* true)

;;; TODO -- consider whether we should just mode all of this stuff to [[user]] instead of doing it here

(comment
  metabase.bootstrap/keep-me
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
              :when              (.isDirectory file)]
          (keyword (.getName file)))))

(defn- excluded-drivers []
  (set/difference (all-drivers) (tx.env/test-drivers)))

;;; replace the default method that finds all tests on the classpath with one that ignores driver directories
(defmethod hawk/find-tests nil
  [_nil options]
  (let [excluded-driver-dirs (for [driver (excluded-drivers)]
                               (format "modules/drivers/%s" (name driver)))
        exclude-directory?   (fn [dir]
                               (some (partial str/includes? (str dir))
                                     excluded-driver-dirs))
        directories          (for [^java.io.File file (classpath/system-classpath)
                                   :when              (and (.isDirectory file)
                                                           (not (exclude-directory? file)))]
                               file)]
    (hawk/find-tests directories options)))

(def ^:private excluded-directories
  ["classes"
   "dev"
   "enterprise/backend/src"
   "local"
   "resources"
   "resources-ee"
   "src"
   "target"
   "test_config"
   "test_resources"])

(defn- default-options []
  {:namespace-pattern   #"^metabase.*"
   :exclude-directories excluded-directories
   :test-warn-time      3000})

(defn find-tests
  "Find all tests, in case you wish to run them yourself."
  ([] (find-tests {}))
  ([options]
   (hawk/find-tests nil (merge (default-options) options))))

(defn find-and-run-tests-repl
  "Find and run tests from the REPL."
  [options]
  (hawk/find-and-run-tests-repl (merge (default-options) options)))

(defn find-and-run-tests-cli
  "Entrypoint for `clojure -X:test`."
  [options]
  (hawk/find-and-run-tests-cli (merge (default-options) options)))
