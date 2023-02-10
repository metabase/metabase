(ns ^:mb/once metabase.util.malli.describe-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase.util.malli.describe :as umd]))

(deftest descriptor-test
  (testing "vector"
    (is (= "value must be a vector" (umd/describe vector?)))
    (is (= "value must be a vector of integer" (umd/describe [:vector :int]))))

  (testing "string"
    (is (= "value must be a string with length <= 5" (umd/describe [:string {:min 5}])))
    (is (= "value must be a string with length >= 5" (umd/describe [:string {:max 5}])))
    (is (= "value must be a string with length between 3 and 5 inclusive" (umd/describe [:string {:min 3 :max 5}]))))

  (testing "function"
    (is (= "value must be a function that takes input: [value must be a integer] and returns value must be a integer"
           (umd/describe [:=> [:cat int?] int?]))))

  (testing "map"
    (is (= "value must be a map" (umd/describe map?)))
    (is (= "value must be a map where {:x -> <integer>}"
           (umd/describe [:map [:x int?]])))
    (is (= "value must be a map where {:x (optional) -> <integer>, :y -> <boolean>}"
           (umd/describe [:map [:x {:optional true} int?] [:y :boolean]])))
    (is (= "value must be a map where {:x -> <integer>} with no other keys"
           (umd/describe [:map {:closed true} [:x int?]])))
    (is (= "value must be a map where {:x (optional) -> <integer>, :y -> <boolean>} with no other keys"
           (umd/describe [:map {:closed true} [:x {:optional true} int?] [:y :boolean]])))
    (is (= "value must be a map where {:j-code -> <keyword, and has length 4>}"
           (umd/describe [:map [:j-code [:and
                                         :keyword
                                         [:fn {:description "has length 4"} #(= 4 (count (name %)))]]]])))
    (is (= "value must be a map (titled: ‘dict’) from <integer> to <string>"
           (umd/describe [:map-of {:title "dict"} :int :string]))))

  (testing "compound schemas"
    (is (= "value must be a vector of sequence of set of integer"
           (umd/describe [:vector [:sequential [:set :int]]]))))

  (testing "multi"
    (is (= "value must be a one of <:dog = map where {:x -> <integer>} | :cat = anything> dispatched by the type of animal"
           (umd/describe [:multi {:dispatch :type
                                  :dispatch-description "the type of animal"}
                          [:dog [:map [:x :int]]]
                          [:cat :any]])))
    (is (= "value must be a one of <:dog = map where {:x -> <integer>} | :cat = anything> dispatched by :type"
           (umd/describe [:multi {:dispatch :type}
                          [:dog [:map [:x :int]]]
                          [:cat :any]]))))

  (testing "schema registry"
    (is (= "value must be a Order which is: <Country is value must be a map where {:name -> <enum of :FI, :PO>, :neighbors (optional) -> <vector of \"Country\">} with no other keys, Burger is value must be a map where {:name -> <string>, :description (optional) -> <string>, :origin -> <nullable Country>, :price -> <integer greater than 0>}, OrderLine is value must be a map where {:burger -> <Burger>, :amount -> <integer>} with no other keys, Order is value must be a map where {:lines -> <vector of OrderLine>, :delivery -> <map where {:delivered -> <boolean>, :address -> <map where {:street -> <string>, :zip -> <integer>, :country -> <Country>}>} with no other keys>} with no other keys>"
           (umd/describe [:schema
                          {:registry
                           {"Country"
                            [:map
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
    (is (= "value must be a ConsCell <value must be a nullable vector with exactly 2 items of type: integer, \"ConsCell\">"
           (umd/describe [:schema
                          {:registry {"ConsCell" [:maybe [:tuple :int [:ref "ConsCell"]]]}}
                          "ConsCell"]))))

  (testing "int"
    (is (= "value must be a integer greater than or equal to 0"
           (umd/describe [:int {:min 0}])))
    (is (= "value must be a integer less than or equal to 1"
           (umd/describe [:int {:max 1}])))
    (is (= "value must be a integer between 0 and 1 inclusive"
           (umd/describe [:int {:min 0 :max 1}]))))

  (testing "repeat"
    (is (= "value must be a repeat <integer> at least 1 time"
           (umd/describe [:repeat {:min 1} int?])))
    (is (= "value must be a repeat <integer> at most 7 times"
           (umd/describe [:repeat {:max 7} int?])))
    (is (= "value must be a repeat <integer> at least 1 time, up to 7 times"
           (umd/describe [:repeat {:min 1 :max 7} int?])))))
