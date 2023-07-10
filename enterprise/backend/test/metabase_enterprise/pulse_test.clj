(ns metabase-enterprise.pulse-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.pulse :as pulse]
   [metabase.public-settings.premium-features-test
    :as
    premium-features-test]))

(deftest parameters-test
  (is (= [{:id "1" :v "a"}
          {:id "2" :v "b"}
          {:id "3" :v "yes"}]
       (premium-features-test/with-premium-features #{:advanced-config}
         (pulse/the-parameters
          {:parameters [{:id "1" :v "a"} {:id "2" :v "b"}]}
          {:parameters [{:id "1" :v "no, since it's trumped by the pulse"} {:id "3" :v "yes"}]})))))
