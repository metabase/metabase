(ns metabase.automagic-dashboards.rules-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.rules :as rules :refer :all]))

(expect true  (ga-dimension? "ga:foo"))
(expect false (ga-dimension? "foo"))

(expect :foo      (#'rules/->type :foo))
(expect "ga:foo"  (#'rules/->type "ga:foo"))
(expect :type/Foo (#'rules/->type "Foo"))

;; This also tests that all the rules are valid (else there would be nils returned)
(expect (every? some? (get-rules ["table"])))
(expect (every? some? (get-rules ["metrics"])))
(expect (every? some? (get-rules ["fields"])))

(expect (some? (get-rules ["table" "GenericTable" "ByCountry"])))

(expect true  (dimension-form? [:dimension "Foo"]))
(expect true  (dimension-form? ["dimension" "Foo"]))
(expect true  (dimension-form? ["DIMENSION" "Foo"]))
(expect false (dimension-form? 42))
(expect false (dimension-form? [:baz :bar]))

(expect
  ["Foo" "Baz" "Bar"]
  (#'rules/collect-dimensions
   [{:metrics [{"Foo" {:metric [:sum [:dimension "Foo"]]}}
               {"Foo" {:metric [:avg [:dimension "Foo"]]}}
               {"Baz" {:metric [:sum ["dimension" "Baz"]]}}]}
    [:dimension "Bar"]]))
