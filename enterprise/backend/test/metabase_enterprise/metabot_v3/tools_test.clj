(ns metabase-enterprise.metabot-v3.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]))

(deftest ^:parallel validate-tools-test
  (testing "Check that all tools are valid."
    (is (seq (metabot-v3.tools/*tools-metadata*)))))
