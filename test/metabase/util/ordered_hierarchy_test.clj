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

(deftest ^:parallel make-hierarchy-test
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

(deftest ^:parallel root-order-test
  (testing "A root without children is included"
    (is (= [:root]
           (vec (ordered-hierarchy/sorted-tags
                 (ordered-hierarchy/make-hierarchy [:root]))))))
  (testing "Root order remains stable after the underlying map grows"
    (let [roots     (mapv #(keyword (str "root-" %)) (range 12))
          hierarchy (apply ordered-hierarchy/make-hierarchy
                           (map (fn [root]
                                  [root (keyword (str (name root) "-child"))])
                                roots))]
      (is (= roots
             (filterv (set roots) (ordered-hierarchy/sorted-tags hierarchy)))))))

(deftest ^:parallel hierarchy-syntax-validation-test
  (testing "A basis must be a vector"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Hierarchy basis must be a vector"
                          (ordered-hierarchy/make-hierarchy :root))))
  (testing "Vector tags must be keywords"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Hierarchy vectors must begin with a keyword tag"
                          (ordered-hierarchy/make-hierarchy [])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Hierarchy vectors must begin with a keyword tag"
                          (ordered-hierarchy/make-hierarchy [:root []]))))
  (testing "Children must be keywords or vectors"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Hierarchy children must be keywords or vectors"
                          (ordered-hierarchy/make-hierarchy [:root 1]))))
  (testing "Children may only be declared at a tag's first occurrence"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Children of :child may only be listed at its first occurrence"
                          (ordered-hierarchy/make-hierarchy [:root :child [:child :grandchild]])))
    (testing "including when the later occurrence heads its own basis"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Children of :child may only be listed at its first occurrence"
                            (ordered-hierarchy/make-hierarchy [:root :child] [:child :grandchild])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Children of :root may only be listed at its first occurrence"
                            (ordered-hierarchy/make-hierarchy [:root] [:root :child])))))
  (testing "Repeating a tag without listing children is allowed"
    (is (= [:child :root]
           (vec (ordered-hierarchy/sorted-tags
                 (ordered-hierarchy/make-hierarchy [:root :child [:child]])))))
    (is (= [:child :root]
           (vec (ordered-hierarchy/sorted-tags
                 (ordered-hierarchy/make-hierarchy [:root :child] [:child])))))))

(deftest ^:parallel derive-validation-test
  (is (thrown-with-msg? AssertionError
                        #"Tag must be a keyword"
                        (ordered-hierarchy/derive (ordered-hierarchy/make-hierarchy) 'child :parent))))

(deftest ^:parallel first-common-ancestor-test
  (testing "The shared ancestor closest to the first tag wins"
    (is (= :quadrilateral (ordered-hierarchy/first-common-ancestor polygons :square :trapezoid))))
  (testing "A tag counts as its own ancestor"
    (is (= :kite (ordered-hierarchy/first-common-ancestor polygons :square :kite))))
  (testing "Tags under separate roots have no common ancestor"
    (is (nil? (ordered-hierarchy/first-common-ancestor polygons :square :triangle)))
    (is (nil? (ordered-hierarchy/first-common-ancestor polygons :triangle :square))))
  (testing "Tags outside the hierarchy have no common ancestor"
    (is (nil? (ordered-hierarchy/first-common-ancestor polygons :square :circle)))
    (is (nil? (ordered-hierarchy/first-common-ancestor polygons :circle :square)))))
