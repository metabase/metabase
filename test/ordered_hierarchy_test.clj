(ns ordered-hierarchy-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.ordered-hierarchy :as ordered-hierarchy]))

;;; It would be nice to have property tests, to expose any subtle edge cases.
;;; For now, we use an extraction of the first real world usage in the app, at the time of writing.

(def ^:private h
  (-> (ordered-hierarchy/make-hierarchy)
      (ordered-hierarchy/derive ::boolean-or-int ::boolean)
      (ordered-hierarchy/derive ::boolean-or-int ::int)
      (ordered-hierarchy/derive ::auto-incrementing-int-pk ::int)
      (ordered-hierarchy/derive ::int ::float)
      (ordered-hierarchy/derive ::date ::datetime)
      (ordered-hierarchy/derive ::boolean ::varchar-255)
      (ordered-hierarchy/derive ::float ::varchar-255)
      (ordered-hierarchy/derive ::datetime ::varchar-255)
      (ordered-hierarchy/derive ::offset-datetime ::varchar-255)
      (ordered-hierarchy/derive ::varchar-255 ::text)))

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
