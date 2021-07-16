(ns metabase.test.fixtures
  (:require [metabase.test.initialize :as initialize]))

(defn initialize
  [& what]
  (fn [thunk]
    (apply initialize/initialize-if-needed! what)
    (thunk)))

(alter-meta! #'initialize assoc :arglists (:arglists (meta #'initialize/initialize-if-needed!)))
