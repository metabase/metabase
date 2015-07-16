(ns metabase.util.logic
  "Useful relations for `core.logic`."
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]))

(defne butlasto
  "A relation such that BUSTLAST is all items but the LAST of list L."
  [butlast last l]
  ([[]   ?x [?x]])
  ([_    _  [?x . ?more]] (fresh [more-butlast]
                            (butlasto more-butlast last ?more)
                            (conso ?x more-butlast butlast))))

(defna splito
  "A relation such that HALF1 and HALF2 are even divisions of list L.
   If L has an odd number of items, HALF1 will have one more item than HALF2."
  [half1 half2 l]
  ([[]   []   []])
  ([[?x] []   [?x]])
  ([[?x] [?y] [?x ?y]])
  ([[?x ?y . ?more-half1-butlast] [?more-half1-last . ?more-half2] [?x ?y . ?more]]
   (fresh [more-half1]
     (splito more-half1 ?more-half2 ?more)
     (butlasto ?more-half1-butlast ?more-half1-last more-half1))))

(defn sorted-intoo
  "A relation such that OUT is the list L with V sorted into it doing comparisons with PRED."
  [pred l v out]
  (matche [l]
    ([[]]           (== out [v]))
    ([[?x . ?more]] (conda
                     ((pred v ?x) (conso v (lcons ?x ?more) out))
                     (s#          (fresh [more]
                                    (sorted-intoo pred ?more v more)
                                    (conso ?x more out)))))))

(defna sorted-permutationo
  "A relation such that OUT is a permutation of L where all items are sorted by PRED."
  [pred l out]
  ([_ [] []])
  ([_ [?x . ?more] _] (fresh [more]
                        (sorted-permutationo pred ?more more)
                        (sorted-intoo pred more ?x out))))

(defn fpredo
  "Succeds if PRED holds true for the fresh values obtained by `(f value fresh-value)`."
  [pred f v1 v2]
  (fresh [fresh-v1 fresh-v2]
    (f v1 fresh-v1)
    (f v2 fresh-v2)
    (trace-lvars (str f) fresh-v1 fresh-v2)
    (pred fresh-v1 fresh-v2)))

(defmacro fpred-conda [[f & values] & clauses]
  `(conda
    ~@(for [[pred & body] clauses]
        `((fpredo ~pred ~f ~@values) ~@body))))

(defna matches-seq-ordero
  "A relation such that V1 is present and comes before V2 in list L."
  [v1 v2 l]
  ([_ _ [v1 . _]]    s#)
  ([_ _ [v2 . _]]    fail)
  ([_ _ [_ . ?more]] (matches-seq-ordero v1 v2 ?more)))
