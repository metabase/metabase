(ns metabase.util.ordered-hierarchy-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy]))

(def ^:private polygons
  (ordered-hierarchy/make-hierarchy
   [:quadrilateral
    [:trapezoid :isosceles-trapezoid :right-trapezoid]
    [:kite [:rhombus :square]]
    [:parallelogram
     :rhombus
     [:rectangle :square]]]
   [:triangle
    :scalene-triangle
    [:isosceles-triangle :equilateral-triangle]
    [:acute-triangle :equilateral-triangle]
    :right-angled-triangle
    :obtuse-triangle]))

(deftest make-hierarchy-test
  (testing "Hiccup structures have the expected topological order"
    (is (= [:isosceles-trapezoid
            :right-trapezoid
            :trapezoid
            :square
            :rhombus
            :kite
            :rectangle
            :parallelogram
            :quadrilateral
            ;; it's unfortunate that we would exhaustively test all the quadrilateral types, before checking
            ;; if it's a triangle (if "hypothetically" we were using the topological order to test a value
            ;; ... this is a case where a root-to-leaf traversal would make more sense.
            :scalene-triangle
            :equilateral-triangle
            :isosceles-triangle
            :acute-triangle
            :right-angled-triangle
            :obtuse-triangle
            :triangle]
           (vec (ordered-hierarchy/sorted-tags polygons)))))

  (testing "Hiccup structures are translated into the expected graph structure"
    (is (= {:trapezoid             [:quadrilateral]
            :isosceles-trapezoid   [:trapezoid]
            :right-trapezoid       [:trapezoid]
            :kite                  [:quadrilateral]
            :rhombus               [:kite :parallelogram]
            :square                [:rhombus :rectangle]
            :parallelogram         [:quadrilateral]
            :rectangle             [:parallelogram]
            :scalene-triangle      [:triangle]
            :isosceles-triangle    [:triangle]
            :equilateral-triangle  [:isosceles-triangle :acute-triangle]
            :acute-triangle        [:triangle]
            :right-angled-triangle [:triangle]
            :obtuse-triangle       [:triangle]}
           (update-vals (:parents polygons) vec)))))
