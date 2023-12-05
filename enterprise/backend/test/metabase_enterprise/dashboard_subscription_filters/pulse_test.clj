(ns ^:mb/once metabase-enterprise.dashboard-subscription-filters.pulse-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.pulse.parameters :as pulse-params]))

(deftest parameters-test
  (testing "Get params from both pulse and dashboard if :dashboard-subscription-filters feature is enabled"
   (premium-features-test/with-premium-features #{:dashboard-subscription-filters}
     (is (= [{:id "1" :v "a"}
             {:id "2" :v "b"}
             {:id "3" :v "yes"}]
            (pulse-params/the-parameters
             {:parameters [{:id "1" :v "a"} {:id "2" :v "b"}]}
             {:parameters [{:id "1" :v "no, since it's trumped by the pulse"} {:id "3" :v "yes"}]})))))

  (testing "Get params from dashboard only if :dashboard-subscription-filters feature is disabled"
    (premium-features-test/with-premium-features #{}
      (is (= [{:id "1" :v "no, since it's trumped by the pulse"}
              {:id "3" :v "yes"}]
             (pulse-params/the-parameters
              {:parameters [{:id "1" :v "a"} {:id "2" :v "b"}]}
              {:parameters [{:id "1" :v "no, since it's trumped by the pulse"} {:id "3" :v "yes"}]}))))))
