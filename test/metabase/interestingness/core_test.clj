(ns metabase.interestingness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]))

;;; Tests here cover only the public facade — the `compute interestingness for X`
;;; user-facing legos. The underlying composition machinery is tested in
;;; `metabase.interestingness.impl-test` and the scorers in
;;; `metabase.interestingness.dimension-test`.

(deftest ^:parallel dimension-interestingness-test
  (testing "scores a normalized field"
    (is (>= (interestingness/dimension-interestingness
             {:semantic-type :type/CreationTimestamp
              :base-type :type/DateTime
              :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                            :type {:type/DateTime {:earliest "2022-01-01"
                                                   :latest "2024-12-31"}}}})
            0.7)))

  (testing "accepts raw snake_case field maps"
    (is (<= (interestingness/dimension-interestingness
             {:semantic_type :type/PK
              :base_type :type/Integer
              :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})
            0.1))))
