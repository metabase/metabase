(ns metabase.util.ordered-hierarchy-test
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

(deftest ^:parallel parents-test
  (testing "Parents are listed according to the order that this tag was derived from each of them"
    (is (nil? (parents h ::text)))
    (is (= [::text] (vec (parents h ::varchar-255))))
    (is (= [::*float-or-int*] (vec (parents h ::int))))
    (is (= [::boolean ::int] (vec (parents h ::*boolean-int*))))))

(deftest ^:parallel children-test
  (testing "Children are listed in reverse order to when they were each derived from this tag"
    (is (nil? (ordered-hierarchy/children h ::*boolean-int*)))
    (is (= [::varchar-255] (vec (ordered-hierarchy/children h ::text))))
    (is (= [::*float-or-int*] (vec (ordered-hierarchy/children h ::float))))
    (is (= [::auto-incrementing-int-pk ::*boolean-int*] (vec (ordered-hierarchy/children h ::int))))))

(deftest ^:parallel ancestors-test
  (testing "Linear ancestors are listed in order"
    (is (nil? (ancestors h ::text)))
    (is (= [::text] (vec (ancestors h ::varchar-255))))
    (is (= [::varchar-255 ::text] (vec (ancestors h ::boolean))))
    (is (= [::*float-or-int* ::float ::varchar-255 ::text] (vec (ancestors h ::int)))))

  (testing "Non-linear ancestors are listed in topological order, following edges in the order they were defined."
    (is (= [::boolean
            ::int
            ::*float-or-int*
            ::float
            ::varchar-255
            ::text]
           (vec (ancestors h ::*boolean-int*))))))

(deftest ^:parallel descendants-test
  (testing "Linear descendants are listed in order"
    (is (nil? (descendants h ::*boolean-int*)))
    (is (nil? (descendants h ::date)))
    (is (= [::date] (vec (descendants h ::datetime))))
    (is (= [::*boolean-int*] (vec (descendants h ::boolean)))))

  (testing "Non-linear descendants are listed in reverse topological order, following edges in reserve order."
    (is (= [::*float-or-int*
            ::int
            ::auto-incrementing-int-pk
            ::*boolean-int*]
           (vec (descendants h ::float))))
    (is (= [::varchar-255
            ::offset-datetime
            ::datetime
            ::date
            ::float
            ::*float-or-int*
            ::int
            ::auto-incrementing-int-pk
            ::boolean
            ::*boolean-int*]
           (vec (descendants h ::text))))))

(deftest ^:parallel sorted-tags-test
  (testing "Tags are returned in a topological ordering that also preserves insertion order of the edges."
    (is (= [::*boolean-int*
            ::boolean
            ::auto-incrementing-int-pk
            ::int
            ::*float-or-int*
            ::float
            ::date
            ::datetime
            ::offset-datetime
            ::varchar-255
            ::text]
           (vec (ordered-hierarchy/sorted-tags h))))))

(deftest ^:parallel first-common-ancestor-test
  (testing "The first-common-ancestor is the first tag in the lineage of tag-a that is also in the lineage of tag-b"
    (is (= ::*boolean-int* (ordered-hierarchy/first-common-ancestor h ::*boolean-int* nil)))
    (is (= ::*boolean-int* (ordered-hierarchy/first-common-ancestor h ::*boolean-int* ::*boolean-int*)))
    (is (= ::boolean (ordered-hierarchy/first-common-ancestor h ::*boolean-int* ::boolean)))
    (is (= ::varchar-255 (ordered-hierarchy/first-common-ancestor h ::boolean ::int)))))
