(ns metabase-enterprise.representations.v0.common-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.v0.common :as v0-common]))

(deftest type->model-test
  (is (thrown? clojure.lang.ExceptionInfo (v0-common/type->model :unknown))))
