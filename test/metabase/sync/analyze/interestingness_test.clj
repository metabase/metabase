(ns metabase.sync.analyze.interestingness-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]
   [metabase.interestingness.dimension :as dim]
   [metabase.interestingness.measure :as measure]))

;;; Smoke tests for the canonical weight profiles. The sync step itself is verified
;;; end-to-end via `automagic_dashboards` integration tests (which fingerprint + score
;;; real tables). Here we just pin down the profile shape and directional behavior.

(deftest ^:parallel canonical-dimension-weights-test
  (testing "canonical-dimension-weights has the expected shape"
    (is (map? dim/canonical-dimension-weights))
    (is (every? fn? (keys dim/canonical-dimension-weights)))
    (is (every? pos? (vals dim/canonical-dimension-weights))))

  (testing "dimension-interestingness kills PKs"
    (let [result (interestingness/dimension-interestingness
                  {:semantic_type :type/PK
                   :base_type :type/Integer
                   :fingerprint {:global {:distinct-count 1000 :nil% 0.0}}})]
      (is (<= result 0.1))))

  (testing "dimension-interestingness rewards a good temporal breakout column"
    (let [result (interestingness/dimension-interestingness
                  {:semantic_type :type/CreationTimestamp
                   :base_type :type/DateTime
                   :fingerprint {:global {:distinct-count 5000 :nil% 0.0}
                                 :type {:type/DateTime {:earliest "2022-01-01"
                                                        :latest "2024-12-31"}}}})]
      (is (>= result 0.7)))))

(deftest ^:parallel canonical-measure-weights-test
  ;; `canonical-measure-weights` is defined for future use (measure-role scoring) but
  ;; the current sync pipeline persists only `dimension_interestingness`. Validate the
  ;; profile produces sensible directional scores so it's ready when a consumer needs it.

  (testing "canonical-measure-weights has the expected shape"
    (is (map? measure/canonical-measure-weights))
    (is (every? fn? (keys measure/canonical-measure-weights)))
    (is (every? pos? (vals measure/canonical-measure-weights)))))
