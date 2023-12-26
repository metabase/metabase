(ns metabase.test.util.thread-local
  (:require
   [clojure.test :as t]
   [mb.hawk.parallel]
   [metabase.util :as u]))

(def ^{:dynamic true
       :doc     "Used to tells testl helpers to run in an unsafe manner.
                You shouldn't set this directly, instead wrap the form with [[with-test-helpers-set-global-values!]]."}
  *thread-local* true)

(defn do-with-test-helpers-set-global-values! [thunk]
  (if-not *thread-local*
    (thunk)
    (binding [*thread-local* false]
      (mb.hawk.parallel/assert-test-is-not-parallel `test-helpers-set-global-values!)
      (t/testing (u/colorize :red "\n\n***** metabase.test/test-helpers-set-global-values! ENABLED, TEST HELPERS THAT SUPPORT IT WILL SET VALUES GLOBALLY ***\n\n")
        (thunk)))))

(defmacro with-test-helpers-set-global-values!
  "Tells various test helpers like [[metabase.test/with-temp]] to set values globally in a
  thread-unsafe manner (e.g. via with [[with-redefs]]) rather than thread-locally (e.g. with [[binding]]). Check
  docstrings for which helpers support this."
  {:style/indent 0}
  [& body]
  `(do-with-test-helpers-set-global-values! (^:once fn* [] ~@body)))
