(ns metabase.test-runner
  "The only purpose of this namespace is to make sure all of the other stuff below gets loaded."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [hawk.core :as hawk]
   [humane-are.core :as humane-are]
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
  ;; make sure stuff like `schema=` and what not are loaded
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

;;; Dynamically generate a `:namespace-pattern` to pass to [[hawk.core]] that will exclude all driver namespaces for
;;; anything that's not in the [[tx.env/test-drivers]] (i.e., not in `DRIVERS`)

(defn- all-drivers []
  (into #{:h2 :postgres :mysql}
        (for [^java.io.File file (.listFiles (io/file "modules/drivers"))
              :when              (.isDirectory file)]
          (keyword (.getName file)))))

(defn- excluded-drivers []
  (set/difference (all-drivers) (tx.env/test-drivers)))

(defn- exclude-driver-pattern [driver]
  (re-pattern (format "(?!^metabase\\.driver\\.%s)" (name driver))))

(defn- exclude-drivers-pattern []
  (re-pattern (str/join (map exclude-driver-pattern (excluded-drivers)))))

(defn- namespace-pattern []
  (re-pattern (str (exclude-drivers-pattern) #"^metabase.*test$")))

(deftest ^:parallel namespace-pattern-test
  (is (re-matches (namespace-pattern) "metabase.util-test"))
  (binding [tx.env/*test-drivers* (constantly #{:h2})]
    (is (re-matches (namespace-pattern) "metabase.driver.h2-test"))
    (is (not (re-matches (namespace-pattern) "metabase.driver.postgres-test"))))
  (binding [tx.env/*test-drivers* (constantly #{:postgres})]
    (is (re-matches (namespace-pattern) "metabase.driver.postgres-test"))
    (is (not (re-matches (namespace-pattern) "metabase.driver.h2-test")))))

(def ^:private excluded-directories
  ["classes"
   "dev"
   "enterprise/backend/src"
   "local"
   "resources"
   "resources-ee"
   "shared/src"
   "src"
   "target"
   "test_config"
   "test_resources"])

(defn- default-options []
  {:namespace-pattern   (namespace-pattern)
   :exclude-directories excluded-directories})

(defn find-and-run-tests-repl
  "Find and run tests from the REPL."
  [options]
  (hawk.core/find-and-run-tests-repl (merge (default-options) options)))

(defn find-and-run-tests-cli
  "Entrypoint for `clojure -X:test`."
  [options]
  (hawk.core/find-and-run-tests-cli (merge (default-options) options)))
