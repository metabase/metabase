(ns macros.metabase.util.cond
  (:refer-clojure :exclude [cond]))

(defmacro cond
  "Kondo macro replacement for [[metabase.util.cond/cond]]. Expands the whole chain in one pass because Kondo does not
  re-expand a recursive call to a hook macro."
  [& clauses]
  (letfn [(expand [clauses]
            (when-let [[test expr & more-clauses] (seq clauses)]
              (if (next clauses)
                (if (= :let test)
                  (list 'clojure.core/let expr (expand more-clauses))
                  (list 'if test expr (expand more-clauses)))
                test)))]
    (expand clauses)))
