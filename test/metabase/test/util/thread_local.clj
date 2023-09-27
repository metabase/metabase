(ns metabase.test.util.thread-local
  (:require [clojure.test :as t]
            [metabase.util :as u]))

(def ^:dynamic *thread-local* true)

(defn do-test-helpers-set-global-values! [thunk]
  (if-not *thread-local*
    (thunk)
    (binding [*thread-local* false]
      (t/testing (u/colorize :red "\n\n***** metabase.test/test-helpers-set-global-values! ENABLED, TEST HELPERS THAT SUPPORT IT WILL SET VALUES GLOBALLY ***\n\n")
        (thunk)))))

(defmacro test-helpers-set-global-values!
  "Tells various test helpers like [[metabase.test/with-temporary-setting-values]] to set values globally in a
  thread-unsafe manner (e.g. via with [[with-redefs]]) rather than thread-locally (e.g. with [[binding]]). Check
  docstrings for which helpers support this."
  {:style/indent 0}
  [& body]
  `(do-test-helpers-set-global-values! (^:once fn* [] ~@body)))
