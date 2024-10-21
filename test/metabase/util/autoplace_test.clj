(ns metabase.util.autoplace-test
  (:require [clojure.test :refer :all]
            [metabase.util.autoplace :as autoplace]))

(def ^:private test-grid-width 6)
(def ^:private test-card-width 2)
(def ^:private test-card-height 2)

(defn- get-position [cards]
  (autoplace/get-position-for-new-dashcard cards test-card-width test-card-height test-grid-width))

(defn- pos [m]
  (merge {:size_x 2 :size_y 2 :dashboard_tab_id nil} m))

(deftest get-position-for-new-dashcard-works
  (testing "place first card at 0,0"
    (is (= (pos {:col 0 :row 0})
           (get-position []))))
  (testing "place card at correct locations on the first row"
    (is (= (pos {:col 2 :row 0})
           (get-position [(pos {:col 0 :row 0})])))
    (is (= (pos {:col 3 :row 0})
           (get-position [(pos {:col 1 :row 0})])))
    (is (= (pos {:col 4 :row 0})
           (get-position [(pos {:col 0 :row 0})
                          (pos {:col 2 :row 0})])))
    (is (= (pos {:col 2 :row 0})
           (get-position [(pos {:col 0 :row 0})
                          (pos {:col 4 :row 0})]))))
  (testing "place card at correct locations on the second row"
    (is (= (pos {:col 0 :row 2})
           (get-position [(pos {:col 0 :row 0})
                          (pos {:col 2 :row 0})
                          (pos {:col 4 :row 0})])))
    (is (= (pos {:col 0 :row 2})
           (get-position [(pos {:col 1 :row 0})
                          (pos {:col 4 :row 0})]))))
  (testing "place card correctly with non-default sizes"
    (is (= (pos {:col 3 :row 2})
           (get-position [(pos {:col 1 :row 0 :size_x 2 :size_y 4})
                          (pos {:col 4 :row 0})])))
    (is (= (pos {:col 0 :row 1})
           (get-position [(pos {:col 0 :row 0 :size_x 3 :size_y 1})
                          (pos {:col 4 :row 0 :size_x 2 :size_y 1})]))))
  (testing "should not place card over the right edge of the grid"
    (is (= (pos {:col 0 :row 1})
           (get-position [(pos {:col 0 :row 0 :size_x 5 :size_y 1})])))))
