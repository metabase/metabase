(ns metabase-enterprise.representations.v0.common-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.v0.common :as v0-common]))

(deftest type->model-test
  (doseq [type [:question :metric :model :database :transform :snippet :collection]]
    (is (v0-common/type->model type))
    (is (v0-common/type->model (name type)))))
