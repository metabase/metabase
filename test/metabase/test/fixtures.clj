(ns metabase.test.fixtures
  (:require [metabase.test.initialize :as initialize]))

(defn initialize
  {:arglists (list (vec (cons '& (disj (set (keys (methods initialize/initialize-if-needed!))) :many))))}
  [& what]
  (fn [f]
    (apply initialize/initialize-if-needed! what)
    (f)))
