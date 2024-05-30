(ns metabase.xrays.automagic-dashboards.dashboard-templates-test
  (:require
   [clojure.test :refer :all]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as dashboard-templates]))

(deftest ^:parallel ->type-test
  (are [x expected] (= expected
                       (#'dashboard-templates/->type x))
    :foo  :foo
    "Foo" :type/Foo))

(deftest ^:parallel get-dashboard-templates-test
  (testing "This also tests that all the dashboard templates are valid (else there would be nils returned)"
    (doseq [s ["table"
               "metrics"
               "fields"]]
      (testing s
        (is (every? some? (dashboard-templates/get-dashboard-templates [s]))))))

  (is (some? (dashboard-templates/get-dashboard-templates ["table" "GenericTable" "ByCountry"]))))

(deftest ^:parallel dimension-form?-test
  (are [x expected] (= expected
                       (dashboard-templates/dimension-form? x))
    [:dimension "Foo"]  true
    ["dimension" "Foo"] true
    ["DIMENSION" "Foo"] true
    42                  false
    [:baz :bar]         false))

(deftest ^:parallel collect-dimensions-test
  (is (= ["Foo" "Baz" "Bar"]
         (#'dashboard-templates/collect-dimensions
          [{:metrics [{"Foo" {:metric [:sum [:dimension "Foo"]]}}
                      {"Foo" {:metric [:avg [:dimension "Foo"]]}}
                      {"Baz" {:metric [:sum ["dimension" "Baz"]]}}]}
           [:dimension "Bar"]]))))

(deftest ^:parallel collect-dimensions-string-form-test
  (testing "Dimensions can be specified using a double-bracket string form."
    ;; Is this form of dimension specification actually used anywhere?
    (is (= ["ABC"] (#'dashboard-templates/collect-dimensions "[[ABC]]")))
    (is (= ["ABC"] (#'dashboard-templates/collect-dimensions {:metric [:foo "[[ABC]]"]})))))

(deftest ^:parallel validate-specs-test
  ;; just make sure nothing barfs
  (is (doall (#'dashboard-templates/all-dashboard-templates))))
