(ns metabase.query-processor.setup-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.setup :as qp.setup]))

(deftest ^:parallel get-normalized-test
  (is (= 2
         (#'qp.setup/get-normalized {"database" 2} :database))))
