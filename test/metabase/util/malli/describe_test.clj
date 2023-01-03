(ns metabase.util.malli.describe-test
  (:require [clojure.test :refer [deftest is]]
            [metabase.util.malli.describe :as umd]))

(deftest descriptor-test

  (is (= "vector" (umd/describe vector?)))

  (is (= "vector of integer" (umd/describe [:vector :int])))

  (is (= "map" (umd/describe map?)))

  (is (= "map where {:x -> <integer>}"
         (umd/describe [:map [:x int?]])))

  (is (= "map where {:x (optional) -> <integer>, :y -> <boolean>}"
         (umd/describe [:map [:x {:optional true} int?] [:y :boolean]])))

  (is (= "map where {:x -> <integer>} with no other keys"
         (umd/describe [:map {:closed true} [:x int?]])))

  (is (= "map where {:x (optional) -> <integer>, :y -> <boolean>} with no other keys"
         (umd/describe [:map {:closed true} [:x {:optional true} int?] [:y :boolean]])))

  (is (= "function that takes input: [integer] and returns integer"
         (umd/describe [:=> [:cat int?] int?])))

  (is (= "map where {:j-code -> <keyword, and has length 4>}"
         (umd/describe [:map [:j-code [:and
                                          :keyword
                                          [:fn {:description "has length 4"} #(= 4 (count (name %)))]]]])))

  (is (= (umd/describe [:map-of {:title "dict"} :int :string])
         "map (titled: ‘dict’) from <integer> to <string>"))

  (is (= (umd/describe [:vector [:sequential [:set :int]]])
         "vector of sequence of set of integer"))

  (is (= "one of <:dog = map where {:x -> <integer>} | :cat = anything> dispatched by the type of animal"
         (umd/describe [:multi {:dispatch :type
                                   :dispatch-description "the type of animal"}
                           [:dog [:map [:x :int]]]
                           [:cat :any]])))

  (is (= "one of <:dog = map where {:x -> <integer>} | :cat = anything> dispatched by :type"
         (umd/describe [:multi {:dispatch :type}
                           [:dog [:map [:x :int]]]
                           [:cat :any]])))

  (is (= "Order which is: <Country is map where {:name -> <enum of :FI, :PO>, :neighbors (optional) -> <vector of \"Country\">} with no other keys, Burger is map where {:name -> <string>, :description (optional) -> <string>, :origin -> <nullable Country>, :price -> <integer greater than 0>}, OrderLine is map where {:burger -> <Burger>, :amount -> <integer>} with no other keys, Order is map where {:lines -> <vector of OrderLine>, :delivery -> <map where {:delivered -> <boolean>, :address -> <map where {:street -> <string>, :zip -> <integer>, :country -> <Country>}>} with no other keys>} with no other keys>"
         (umd/describe [:schema
                           {:registry {"Country" [:map
                                                  {:closed true}
                                                  [:name [:enum :FI :PO]]
                                                  [:neighbors
                                                   {:optional true}
                                                   [:vector [:ref "Country"]]]],
                                       "Burger" [:map
                                                 [:name string?]
                                                 [:description {:optional true} string?]
                                                 [:origin [:maybe "Country"]]
                                                 [:price pos-int?]],
                                       "OrderLine" [:map
                                                    {:closed true}
                                                    [:burger "Burger"]
                                                    [:amount int?]],
                                       "Order" [:map
                                                {:closed true}
                                                [:lines [:vector "OrderLine"]]
                                                [:delivery
                                                 [:map
                                                  {:closed true}
                                                  [:delivered boolean?]
                                                  [:address
                                                   [:map
                                                    [:street string?]
                                                    [:zip int?]
                                                    [:country "Country"]]]]]]}}
                           "Order"])))

  (is (= "ConsCell <nullable vector with exactly 2 items of type: integer, \"ConsCell\">"
         (umd/describe [:schema
                           {:registry {"ConsCell" [:maybe [:tuple :int [:ref "ConsCell"]]]}}
                           "ConsCell"]))))
