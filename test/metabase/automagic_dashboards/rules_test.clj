(ns metabase.automagic-dashboards.rules-test
  (:require [expectations :refer :all]
            [metabase.automagic-dashboards.rules :refer :all :as rules]))

(expect
  [nil
   [nil]
   [42]
   [42]]
  (map #'rules/ensure-seq [nil [nil] 42 [42]]))

(expect
  [true
   false]
  (map ga-dimension? ["ga:foo" "foo"]))

(expect
  [:foo
   "ga:foo"
   :type/Foo]
  (map #'rules/->type [:foo "ga:foo" "Foo"]))

(expect
  true
  (every? some? (load-rules)))

(expect
  [true
   true
   true
   false
   false]
  (map (comp boolean #'rules/dimension-form?) [[:dimension "Foo"]
                                               ["dimension" "Foo"]
                                               ["DIMENSION" "Foo"]
                                               42
                                               [:baz :bar]]))

(expect
  ["Foo" "Baz" "Bar"]
  (#'rules/collect-dimensions
   [{:metrics [{"Foo" {:metric [:sum [:dimension "Foo"]]}}
               {"Foo" {:metric [:avg [:dimension "Foo"]]}}
               {"Baz" {:metric [:sum ["dimension" "Baz"]]}}]}
    [:dimension "Bar"]]))
