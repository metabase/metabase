(ns metabase.staleness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.staleness.core :as staleness]))

(deftest unregistered-model-has-no-spec-test
  (testing "a model with no staleness spec has no spec and no candidates"
    (is (nil? (staleness/spec :model/DefinitelyNotAModel)))
    (is (nil? (staleness/candidates-fn :model/DefinitelyNotAModel)))
    (is (nil? (staleness/spec :model/Collection)))))
