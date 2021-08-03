(ns metabase.test-runner.init
  "Code related to test runner initialization and utils for asserting code that shouldn't run during test init doesn't
  get ran."
  (:require [clojure.pprint :as pprint]
            [metabase.config :as config]))

(def ^:dynamic *test-namespace-being-loaded*
  "Bound to the test namespace symbol that's currently getting loaded, if any."
  nil)

(defn assert-tests-are-not-initializing [disallowed-message]
  (when *test-namespace-being-loaded*
    (let [e (ex-info (str (format "%s happened as a side-effect of loading namespace %s."
                                  disallowed-message *test-namespace-being-loaded*)
                          " This is not allowed; make sure it's done in tests or fixtures only when running tests.")
                     {:namespace *test-namespace-being-loaded*})]
      (pprint/pprint (Throwable->map e))
      (if config/is-test?
        (System/exit -1)
        (throw e)))))
