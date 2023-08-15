(ns metabase.automagic-dashboards.rules-test
  (:require
   [clojure.test :refer :all]
   [metabase.automagic-dashboards.rules :as rules]))

(deftest ^:parallel ga-dimension?-test
  (are [x expected] (= expected
                       (rules/ga-dimension? x))
    "ga:foo" true
    "foo"    false))

(deftest ^:parallel ->type-test
  (are [x expected] (= expected
                       (#'rules/->type x))
    :foo     :foo
    "ga:foo" "ga:foo"
    "Foo"    :type/Foo))

(deftest ^:parallel get-rules-test
  (testing "This also tests that all the rules are valid (else there would be nils returned)"
    (doseq [s ["table"
               "metrics"
               "fields"]]
      (testing s
        (is (every? some? (rules/get-rules [s]))))))

  (is (some? (rules/get-rules ["table" "GenericTable" "ByCountry"]))))

(deftest ^:parallel dimension-form?-test
  (are [x expected] (= expected
                       (rules/dimension-form? x))
    [:dimension "Foo"]  true
    ["dimension" "Foo"] true
    ["DIMENSION" "Foo"] true
    42                  false
    [:baz :bar]         false))

(deftest ^:parallel collect-dimensions-test
  (is (= ["Foo" "Baz" "Bar"]
         (#'rules/collect-dimensions
          [{:metrics [{"Foo" {:metric [:sum [:dimension "Foo"]]}}
                      {"Foo" {:metric [:avg [:dimension "Foo"]]}}
                      {"Baz" {:metric [:sum ["dimension" "Baz"]]}}]}
           [:dimension "Bar"]]))))
