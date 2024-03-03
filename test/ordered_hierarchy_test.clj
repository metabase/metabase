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

(-> (ordered-hierarchy/make-hierarchy)
    (ordered-hierarchy/derive ::boolean-or-int ::boolean)
    (ordered-hierarchy/derive ::boolean-or-int ::int)
    (ordered-hierarchy/derive ::auto-incrementing-int-pk ::int)
    (ordered-hierarchy/derive ::varchar-255 ::text)
    :children
    ::int)

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
    ;; NB - it feels surprising that ::varchar-255 comes before ::float, as it is its parent.
    ;; This does not seem to be what we want when we are using these "lists" find the most specific common ancestor!
    ;; Moving to a topological sort would fix this.
    (is (= [::boolean ::int ::varchar-255 ::float ::text] (vec (ancestors h ::boolean-or-int))))))

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
            ::float
            ::boolean
            ::date
            ::int
            ;; This ordering is unintuitive, as it's reversed according to how they appear as children of ::int
            ;; Moving to a topological sort would NOT fix this, however.
            ::boolean-or-int
            ::auto-incrementing-int-pk]
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
