(ns release.elastic-beanstalk-test
  (:require
   [clojure.test :refer :all]
   [release.common :as c]
   [release.elastic-beanstalk :as release.eb]))

(deftest create-html-file-test
  (testing "Just make sure this doesn't barf."
    (binding [c/*build-options* (atom {:version "0.46.0-test"
                                       :edition :oss})]
      (is (string? (#'release.eb/create-html-file!))))))
