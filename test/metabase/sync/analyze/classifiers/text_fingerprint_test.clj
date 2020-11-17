(ns metabase.sync.analyze.classifiers.text-fingerprint-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :as field]
            [metabase.sync.analyze.classifiers.text-fingerprint :as text-fingerprint]))

(def can-edit? #'text-fingerprint/can-edit-special-type?)

(deftest can-edit-special-type?
  (testing "When special type is nil we can change it"
    (is (can-edit? {:name "field" :base_type :type/Text})))
  (testing "If we include metadata, can see if original was not set"
    (let [field {:name "field" :special_type :type/Category}]
      (is (not (can-edit? field)))
      (is (can-edit? (with-meta field {:sync.classify/original {:name "field" :special_type nil}}))))))

(def infer #'text-fingerprint/infer-special-type-for-text-fingerprint)
(def threshold @#'text-fingerprint/percent-valid-threshold)
(def lower-threshold @#'text-fingerprint/lower-percent-valid-threshold)

(deftest infer-special-type-for-text-fingerprint-test
  (let [expectations [[:percent-json  :type/SerializedJSON]
                      [:percent-url   :type/URL]
                      [:percent-email :type/Email]
                      [:percent-state :type/State]]
        empty-fingerprint (zipmap (map first expectations) (repeat 0.0))]
    (doseq [[metric expected-special-type] expectations]
      (is (= expected-special-type (infer (merge empty-fingerprint {metric threshold})))))
    (doseq [[metric expected-special-type] expectations]
      (is (not (= expected-special-type (infer (merge empty-fingerprint {metric (/ threshold 2)}))))))
    (testing "state has a lower threshold"
      (is (= :type/State (infer (zipmap (map first expectations) (repeat lower-threshold))))))))

(deftest infer-special-type-test
  (let [fingerprint       {:type {:type/Text {:percent-json threshold}}}
        state-fingerprint {:type {:type/Text {:percent-state lower-threshold}}}
        field             (field/map->FieldInstance {:name "field" :base_type :type/Text})]
    (testing "can infer a special type from text fingerprints"
      (is (= :type/SerializedJSON
             (:special_type (text-fingerprint/infer-special-type field fingerprint))))
      (is (= :type/State
             (:special_type (text-fingerprint/infer-special-type field state-fingerprint)))))
    (testing "can infer a special type from text fingerprints if another classifier has put one one"
      (let [field-with-original (with-meta (assoc field :special_type :type/Category) {:sync.classify/original field})]
        (is (= :type/SerializedJSON
               (:special_type (text-fingerprint/infer-special-type field-with-original fingerprint))))
        (is (= :type/State
               (:special_type (text-fingerprint/infer-special-type field-with-original state-fingerprint))))))))
