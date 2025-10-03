(ns metabase.parameters.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.schema :as parameters.schema]))

(deftest ^:parallel default-to-type-text-test
  (is (= {:id "x", :type :text}
         (parameters.schema/normalize-parameter {:id "x"}))))
