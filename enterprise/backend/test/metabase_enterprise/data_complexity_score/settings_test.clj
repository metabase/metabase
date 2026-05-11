(ns metabase-enterprise.data-complexity-score.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase.premium-features.settings :as premium-features.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest data-complexity-scoring-enabled-test
  (doseq [[label                             hosted? staging-env scoring-env db-value expected]
          [["pure self-hosted off"           false   "false"     nil         nil      false]
           ["self-hosted ignores staging"    false   "true"      nil         nil      false]
           ["prod cloud defaults off"        true    "false"     nil         nil      false]
           ["cloud staging defaults on"      true    "true"      nil         nil      true]
           ["env=true forces on self-host"   false   "false"     "true"      nil      true]
           ["env=false opts staging out"     true    "true"      "false"     nil      false]
           ["DB=true enables self-host"      false   "false"     nil         "true"   true]
           ["DB=false beats staging default" true    "true"      nil         "false"  false]
           ["env beats DB"                   true    "true"      "false"     "true"   false]]]
    (testing label
      (mt/with-temporary-raw-setting-values [data-complexity-scoring-enabled db-value]
        (mt/with-dynamic-fn-redefs [premium-features.settings/is-hosted? (constantly hosted?)]
          (mt/with-temp-env-var-value! [mb-store-use-staging               staging-env
                                        mb-data-complexity-scoring-enabled scoring-env]
            (is (= expected (settings/data-complexity-scoring-enabled)))))))))
