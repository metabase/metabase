(ns metabase.automagic-dashboards.rules-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.rules :refer :all :as rules]))

(expect nil   (#'rules/ensure-seq nil))
(expect [nil] (#'rules/ensure-seq [nil]))
(expect [42]  (#'rules/ensure-seq 42))
(expect [42]  (#'rules/ensure-seq [42]))

(expect true  (ga-dimension? "ga:foo"))
(expect false (ga-dimension? "foo"))

(expect :foo      (#'rules/->type :foo))
(expect "ga:foo"  (#'rules/->type "ga:foo"))
(expect :type/Foo (#'rules/->type "Foo"))

(expect (every? some? (load-rules "table")))
(expect (every? some? (load-rules "metrics")))
(expect (every? some? (load-rules "fields")))

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
