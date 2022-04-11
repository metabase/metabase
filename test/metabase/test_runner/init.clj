(ns metabase.test-runner.init
  "Code related to [[metabase.test-runner]] initialization and utils for enforcing that code isn't allowed to run while
  loading namespaces."
  (:require [clojure.pprint :as pprint]
            [metabase.config :as config]))

(def ^:dynamic *test-namespace-being-loaded*
  "Bound to the test namespace symbol that's currently getting loaded, if any."
  nil)

(defn assert-tests-are-not-initializing
  "Check that we are not in the process of loading test namespaces when starting up the [[metabase.test-runner]]. We
  shouldn't be doing stuff like creating application DB connections as a side-effect of loading test namespaces -- so
  don't use stuff like [[metabase.test/id]] or [[metabase.test/db]] in top-level forms."
  [disallowed-message]
  (when *test-namespace-being-loaded*
    (let [e (ex-info (str (format "%s happened as a side-effect of loading namespace %s."
                                  disallowed-message *test-namespace-being-loaded*)
                          " This is not allowed; make sure it's done in tests or fixtures only when running tests.")
                     {:namespace *test-namespace-being-loaded*})]
      (pprint/pprint (Throwable->map e))
      (if config/is-test?
        (System/exit -1)
        (throw e)))))
