(ns metabase.test.fixtures
  (:require [metabase.test.initialize :as initialize]))

(defn initialize
  {:arglists (:arglists (meta #'initialize/initialize-if-needed!))}
  [& what]
  (fn [thunk]
    (apply initialize/initialize-if-needed! what)
    (thunk)))
