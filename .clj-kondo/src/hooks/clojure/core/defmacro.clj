(ns hooks.clojure.core.defmacro
  (:require
   [hooks.clojure.core.def]))

(defn lint-defmacro [x]
  (hooks.clojure.core.def/lint-def* x)
  x)
