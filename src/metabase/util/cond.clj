(ns metabase.util.cond
  "Tighter rewrite of `better-cond` library, without unnecessary defn* macros, and clj-only. Supports only `:let`
  declarations over regular `cond` and nothing else."
  (:refer-clojure :exclude [cond]))

(defmacro cond
  "A variation on cond which sports let bindings:
     (cond
       (odd? a) 1
       :let [a (quot a 2)]
       (odd? a) 2
       :else 3)."
  [& clauses]
  (when-let [[test expr & more-clauses] (seq clauses)]
    (if (next clauses)
      (if (= :let test)
        `(let ~expr (cond ~@more-clauses))
        `(if ~test ~expr (cond ~@more-clauses)))
      test)))
