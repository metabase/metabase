(ns metabase.util.logic
  "Useful relations for `core.logic`."
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]))

(defna butlast°
  "A relation such that BUSTLASTV is all items but the last item LASTV of list L."
  [butlastv lastv l]
  ([[]   ?x [?x]])
  ([_    _  [?x . ?more]] (fresh [more-butlast]
                            (butlast° more-butlast lastv ?more)
                            (conso ?x more-butlast butlastv))))

(defna split°
  "A relation such that HALF1 and HALF2 are even divisions of list L.
   If L has an odd number of items, HALF1 will have one more item than HALF2."
  [half1 half2 l]
  ([[]   []   []])
  ([[?x] []   [?x]])
  ([[?x] [?y] [?x ?y]])
  ([[?x ?y . ?more-half1-butlast] [?more-half1-last . ?more-half2] [?x ?y . ?more]]
   (fresh [more-half1]
     (split° more-half1 ?more-half2 ?more)
     (butlast° ?more-half1-butlast ?more-half1-last more-half1))))

(defn sorted-into°
  "A relation such that OUT is the list L with V sorted into it doing comparisons with PRED-F."
  [pred-f l v out]
  (matche [l]
    ([[]]           (== out [v]))
    ([[?x . ?more]] (conda
                     ((pred-f v ?x) (conso v (lcons ?x ?more) out))
                     (s#            (fresh [more]
                                      (sorted-into° pred-f ?more v more)
                                      (conso ?x more out)))))))

(defna sorted-permutation°
  "A relation such that OUT is a permutation of L where all items are sorted by PRED-F."
  [pred-f l out]
  ([_ [] []])
  ([_ [?x . ?more] _] (fresh [more]
                        (sorted-permutation° pred-f ?more more)
                        (sorted-into° pred-f more ?x out))))

(defn matches-seq-order°
  "A relation such that V1 is present and comes before V2 in list L."
  [v1 v2 l]
  (conda
    ;; This is just an optimization for cases where L isn't a logic var; it's much faster <3
    ((nonlvaro l) ((fn -ordered° [[item & more]]
                     (conda
                       ((== v1 item)         s#)
                       ((== v2 item)         fail)
                       ((when (seq more) s#) (-ordered° more))))
                   l))
    (s#           (conda
                    ((firsto l v1))
                    ((firsto l v2) fail)
                    ((fresh [more]
                       (resto l more)
                       (matches-seq-order° v1 v2 more)))))))
