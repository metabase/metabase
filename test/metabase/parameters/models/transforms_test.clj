(ns metabase.parameters.models.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.parameters.core :as parameters]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]))

(deftest handle-errors-gracefully-test
  (testing (str "Cheat and override the `normalization-tokens` function to always throw an Exception so we can make "
                "sure the Toucan type fn handles the error gracefully")
    (with-redefs [parameters.schema/normalize-parameters (fn [& _] (throw (Exception. "BARF")))]
      (is (= nil
             ((:out parameters/transform-parameters)
              (json/encode
               [{:target [:dimension [:field "ABC" nil]]}])))))))

(deftest do-not-eat-exceptions-test
  (testing "should not eat Exceptions if normalization barfs when saving"
    (is (thrown?
         Exception
         (with-redefs [parameters.schema/normalize-parameters (fn [& _] (throw (Exception. "BARF")))]
           ((:in parameters/transform-parameters)
            [{:target [:dimension [:field "ABC" nil]]}]))))))

(deftest ^:parallel normalize-parameter-mappings-test
  (testing "DashboardCard parameter mappings should get normalized when coming out of the DB"
    (mt/with-temp [:model/Dashboard     dashboard {:parameters [{:name "Venue ID"
                                                                 :slug "venue_id"
                                                                 :id   "22486e00"
                                                                 :type "id"}]}
                   :model/Card          card      {}
                   :model/DashboardCard dashcard  {:dashboard_id       (u/the-id dashboard)
                                                   :card_id            (u/the-id card)
                                                   :parameter_mappings [{:parameter_id "22486e00"
                                                                         :card_id      (u/the-id card)
                                                                         :target       [:dimension [:field-id (mt/id :venues :id)]]}]}]
      (is (= [{:parameter_id "22486e00"
               :card_id      (u/the-id card)
               :target       [:dimension [:field (mt/id :venues :id) nil]]}]
             (t2/select-one-fn :parameter_mappings :model/DashboardCard :id (u/the-id dashcard)))))))

(deftest ^:parallel normalize-parameter-mappings-test-2
  (testing "make sure parameter mappings correctly normalize things like legacy MBQL clauses"
    (is (=? [{:target [:dimension [:field 30 {:source-field 23}]]}]
            ((:out parameters/transform-parameter-mappings)
             (json/encode
              [{:parameter_id "a", :target [:dimension [:fk-> 23 30]]}]))))))

(deftest ^:parallel keep-empty-parameter-mappings-empty-test
  (testing (str "we should keep empty parameter mappings as empty instead of making them nil (if `normalize` removes "
                "them because they are empty) (I think this is to prevent NPEs on the FE? Not sure why we do this)")
    (is (= []
           ((:out parameters/transform-parameters)
            (json/encode []))))))

(deftest ^:parallel normalize-card-parameter-mappings-test
  (doseq [parameters [[]
                      [{:name "Time grouping"
                        :slug "time_grouping"
                        :id "8e366c15"
                        :type :temporal-unit
                        :sectionId "temporal-unit"
                        :temporal_units [:minute :quarter-of-year]}]]]
    (is (= parameters
           ((:out parameters/transform-parameters)
            (json/encode parameters))))))
