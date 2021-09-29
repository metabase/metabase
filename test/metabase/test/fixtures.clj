(ns metabase.test.fixtures
  (:require [metabase.test.initialize :as initialize]))

(defn initialize
  [& what]
  (fn [thunk]
    (apply initialize/initialize-if-needed! what)
    (thunk)))

;; change the arglists for `initialize` to list all the possible args for REPL-usage convenience. Don't do
;; this directly in `initialize` itself because it breaks Eastwood.
(alter-meta! #'initialize assoc :arglists (:arglists (meta #'initialize/initialize-if-needed!)))
