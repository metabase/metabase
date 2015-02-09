(ns metabase.models.hydrate-test
  (:require [expectations :refer :all]
            [metabase.models.hydrate :refer :all]))

(def obj1 {:a 1
           :b (fn [] 100)})

;; make sure we can do basic hydration
(expect {:a 1 :b 100}
        (hydrate obj1 :b))

;; specifying "nested" hydration with no "nested" keys should still work
(expect {:a 1 :b 100}
        (hydrate obj1 [:b]))

;; check that returning an array works correctly
(def obj2 {:c (fn [] [1 2 3])})
(expect {:c [1 2 3]}
        (hydrate obj2 :c))


(defn fn-that-returns-1 [] 1)
(def obj3 {:d (fn [] {:e fn-that-returns-1})})

;; check that nested keys aren't hydrated if we don't ask for it
(expect {:d {:e fn-that-returns-1}}
        (hydrate obj3 :d))

;; check that nested keys can be hydrated if we DO ask for it
(expect {:d {:e 1}}
        (hydrate obj3 [:d :e]))


(def obj4 {:f (fn [] [{:g (fn [] 1)}
                     {:g (fn [] 2)}
                     {:g (fn [] 3)}])})

;; check that nested hydration also works if one step returns multiple results
(expect {:f [{:g 1}
             {:g 2}
             {:g 3}]}
        (hydrate obj4 [:f :g]))


;;; tests for realize-json

(def card
  {:name "Guides with Locations"
   :dataset_query "{\"query\": {\"filter\": [null, null], \"source_table\": 122, \"breakout\": [1055], \"limit\": null, \"aggregation\": [\"count\"]}, \"type\": \"query\", \"database\": 3}"
   :id 1
   :visualization_settings "{\"bar\": {\"color\": \"#f15c80\"}}"})

(expect {:name "Guides with Locations",
         :dataset_query {:query {:filter [nil nil]
                                 :source_table 122
                                 :breakout [1055]
                                 :limit nil
                                 :aggregation ["count"]}
                         :type "query"
                         :database 3}
         :id 1,
         :visualization_settings {:bar {:color "#f15c80"}}}
  (realize-json card :dataset_query :visualization_settings))
