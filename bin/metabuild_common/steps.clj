(ns metabuild-common.steps
  (:require [colorize.core :as colorize]
            [metabuild-common.output :as out]))

(defn do-step
  "Impl for `step` macro."
  [step thunk]
  (out/safe-println (colorize/green (str step)))
  (binding [out/*steps* (conj (vec out/*steps*) step)]
    (try
      (thunk)
      (catch Throwable e
        (throw (ex-info (str step) {} e))))))

(defmacro step
  "Start a new build step, which:

  1. Logs the `step` message
  2. Indents all output inside `body` by one level
  3. Catches any exceptions inside `body` and rethrows with additional context including `step` message

  These are meant to be nested, e.g.

    (step \"Build driver\"
      (step \"Build dependencies\")
      (step \"Build driver JAR\")
      (step \"Verify driver\"))"
  {:style/indent 1}
  [step & body]
  `(do-step ~step (fn [] ~@body)))
