(ns util.ordered-hierarchy-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [metabase.upload :as upload]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy]))

;;; It would be nice to have property tests, to expose any subtle edge cases.
;;; For now, we use a translation of some real world usage in the app.
(def ^:private h
  (walk/postwalk
   (fn [x]
     (if (and (keyword? x) (namespace x))
       (keyword (name (ns-name *ns*)) (name x))
       x))
   @#'upload/h))

(deftest parents-test
  (testing "Parents are listed according to the order that this tag was derived from each of them"
    (is (nil? (parents h ::text)))
    (is (= [::text] (vec (parents h ::varchar-255))))
    (is (= [::float] (vec (parents h ::int))))
    (is (= [::boolean ::int] (vec (parents h ::boolean-or-int))))))

(deftest children-test
  (testing "Children are listed in reverse order to when they were each derived from this tag"
    (is (nil? (ordered-hierarchy/children h ::boolean-or-int)))
    (is (= [::varchar-255] (vec (ordered-hierarchy/children h ::text))))
    (is (= [::int] (vec (ordered-hierarchy/children h ::float))))
    (is (= [::auto-incrementing-int-pk ::boolean-or-int] (vec (ordered-hierarchy/children h ::int))))))

(deftest ancestors-test
  (testing "Linear ancestors are listed in order"
    (is (nil? (ancestors h ::text)))
    (is (= [::text] (vec (ancestors h ::varchar-255))))
    (is (= [::varchar-255 ::text] (vec (ancestors h ::boolean))))
    (is (= [::float ::varchar-255 ::text] (vec (ancestors h ::int)))))

  (testing "Non-linear ancestors are listed in breadth-first order"
    (is (= [::boolean
            ::int
            ::float
            ::varchar-255
            ::text]
           (vec (ancestors h ::boolean-or-int))))))

(deftest descendants-test
  (testing "Linear descendants are listed in order"
    (is (nil? (descendants h ::boolean-or-int)))
    (is (nil? (descendants h ::date)))
    (is (= [::date] (vec (descendants h ::datetime))))
    (is (= [::boolean-or-int] (vec (descendants h ::boolean)))))

  (testing "Non-linear descendants are listed in breadth-first order"
    (is (= [::int ::auto-incrementing-int-pk ::boolean-or-int] (vec (descendants h ::float))))
    (is (= [::varchar-255
            ::offset-datetime
            ::datetime
            ::date
            ::float
            ::int
            ::auto-incrementing-int-pk
            ::boolean
            ::boolean-or-int]
           (vec (descendants h ::text))))))

(deftest tags-test
  (testing "Tags are returned in a topologically sorted order that also preserves insert order"
    (is (= [::boolean-or-int
            ::boolean
            ::auto-incrementing-int-pk
            ::int
            ::float
            ::date
            ::datetime
            ::offset-datetime
            ::varchar-255
            ::text]
           (vec (ordered-hierarchy/sorted-tags h))))))

(deftest first-common-ancestor-test
  (testing "The first-common-ancestor is the first tag in the lineage of tag-a that is also in the lineage of tag-b"
    (is (= ::boolean-or-int (ordered-hierarchy/first-common-ancestor h ::boolean-or-int nil)))
    (is (= ::boolean-or-int (ordered-hierarchy/first-common-ancestor h ::boolean-or-int ::boolean-or-int)))
    (is (= ::boolean (ordered-hierarchy/first-common-ancestor h ::boolean-or-int ::boolean)))
    (is (= ::varchar-255 (ordered-hierarchy/first-common-ancestor h ::boolean ::int)))))



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
