(ns metabase.transforms.models.transform-run-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest can-check-keys-test
  (doseq [[operation can? full-instance] [[:read mi/can-read? {:transform_id nil}]]
          k                              (keys full-instance)]
    (testing (str operation " without " k)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "No " k " is set for a TransformRun"))
                            (can? (t2/instance :model/TransformRun (dissoc full-instance k))))))))
