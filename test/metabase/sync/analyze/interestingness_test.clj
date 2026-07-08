(ns metabase.sync.analyze.interestingness-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.interestingness.core :as interestingness]
   [metabase.interestingness.dimension :as dim]))

;;; Smoke tests for the canonical weight profiles. The sync step itself is verified
;;; end-to-end via `automagic_dashboards` integration tests (which fingerprint + score
;;; real tables). Here we just pin down the profile shape and directional behavior.

(deftest ^:parallel canonical-dimension-weights-shape-test
  (is (map? dim/canonical-dimension-weights))
  (is (every? fn? (keys dim/canonical-dimension-weights)))
  (is (every? pos? (vals dim/canonical-dimension-weights))))

(deftest ^:parallel dimension-interestingness-kills-pks-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/PK
                 :base_type :type/Integer
                 :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
    (is (<= result 0.1))))

(deftest ^:parallel dimension-interestingness-rewards-temporal-test
  (let [result (interestingness/dimension-interestingness
                {:semantic_type :type/CreationTimestamp
                 :base_type :type/DateTime
                 :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                               :type {:type/DateTime {:earliest "2022-01-01"
                                                      :latest "2024-12-31"}}}})]
    (is (>= result 0.7))))
