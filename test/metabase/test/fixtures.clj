(ns metabase.test.fixtures
  (:require [metabase.test.initialize :as initialize]))

(defn initialize
  {:arglists (:arglists (meta #'initialize/initialize-if-needed!))}
  [& what]
  (fn [f]
    (apply initialize/initialize-if-needed! what)
    (f)))
