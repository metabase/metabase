(ns metabase.test.util.thread-local
  (:require
   [clojure.test :as t]
   [mb.hawk.parallel]
   [metabase.util :as u]))

(def ^:dynamic *thread-local*
  "Whether test helpers should set thread-local values for things, as opposed to setting global values."
  true)

(defn do-test-helpers-set-global-values! [thunk]
  (if-not *thread-local*
    (thunk)
    (binding [*thread-local* false]
      (mb.hawk.parallel/assert-test-is-not-parallel `test-helpers-set-global-values!)
      (t/testing (u/colorize :red "\n\n***** metabase.test/test-helpers-set-global-values! ENABLED, TEST HELPERS THAT SUPPORT IT WILL SET VALUES GLOBALLY ***\n\n")
        (thunk)))))

(defmacro test-helpers-set-global-values!
  "Tells various test helpers like [[metabase.test/with-temp]] to set values globally in a thread-unsafe manner (e.g.
  via with [[with-redefs]], or by affecting the global state of the application database) rather than
  thread-locally (e.g. with [[binding]]). Check docstrings for which helpers support this."
  {:style/indent 0}
  [& body]
  `(do-test-helpers-set-global-values! (^:once fn* [] ~@body)))
