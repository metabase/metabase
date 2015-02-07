(ns metabase.models.hydrate-test
  (:require [expectations :refer :all]
            [metabase.models.hydrate :refer :all]))

(def obj1 {:a 1
           :b (fn [] 100)})

(expect {:a 1 :b 100}
        (hydrate obj1 :b))

(expect {:a 1 :b 100}
        (hydrate obj1 [:b]))


(def obj2 {:c (fn [] [1 2 3])})
(expect {:c [1 2 3]}
        (hydrate obj2 :c))


(defn fn-that-returns-1 [] 1)
(def obj3 {:d (fn [] {:e fn-that-returns-1})})

(expect {:d {:e fn-that-returns-1}}
        (hydrate obj3 :d))

(expect {:d {:e 1}}
        (hydrate obj3 [:d :e]))


(def obj4 {:f (fn [] [{:g (fn [] 1)}
                     {:g (fn [] 2)}
                     {:g (fn [] 3)}])})

(expect {:f [{:g 1}
             {:g 2}
             {:g 3}]}
        (hydrate obj4 [:f :g]))
