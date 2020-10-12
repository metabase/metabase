(ns metabuild-common.entrypoint
  (:require [clojure.pprint :as pprint]
            [colorize.core :as colorize]))

(defn do-exit-when-finished-nonzero-on-exception [thunk]
  (try
    (thunk)
    (System/exit 0)
    (catch Throwable e
      (let [e-map (Throwable->map e)]
        (println (colorize/red (str "Command failed: " (:cause e-map))))
        (binding [pprint/*print-right-margin* 120]
          (pprint/pprint e-map))))))

(defmacro exit-when-finished-nonzero-on-exception
  "Execute `body` and catch exceptions. If an Exception is thrown, exit with status code 0; if an exception was
  thrown, print it and exit with a non-zero status code. Intended for use in `-main` functions."
  {:style/indent 0}
  [& body]
  `(do-exit-when-finished-nonzero-on-exception (fn [] ~@body)))
