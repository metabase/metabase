(ns metabase.analyze.classifiers.text-fingerprint-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.text-fingerprint :as classifiers.text-fingerprint]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]))

(def ^:private ^{:arglists '([field])} can-edit?
  #'classifiers.text-fingerprint/can-edit-semantic-type?)

(deftest ^:parallel can-edit-semantic-type?
  (testing "When semantic type is nil we can change it"
    (is (can-edit? {:name "field" :base_type :type/Text})))
  (testing "If we include metadata, can see if original was not set"
    (let [field {:name "field" :semantic_type :type/Category}]
      (is (not (can-edit? field)))
      (is (can-edit? (with-meta field {:sync.classify/original {:name "field" :semantic_type nil}}))))))

(def ^:private ^{:arglists '([text-fingerprint])} infer
  #'classifiers.text-fingerprint/infer-semantic-type-for-text-fingerprint)

(def ^:private threshold       @#'classifiers.text-fingerprint/percent-valid-threshold)
(def ^:private lower-threshold @#'classifiers.text-fingerprint/lower-percent-valid-threshold)

(deftest ^:parallel infer-semantic-type-for-text-fingerprint-test
  (let [expectations [[:percent-json  :type/SerializedJSON]
                      [:percent-url   :type/URL]
                      [:percent-email :type/Email]
                      [:percent-state :type/State]]
        empty-fingerprint (zipmap (map first expectations) (repeat 0.0))]
    (doseq [[metric expected-semantic-type] expectations]
      (is (= expected-semantic-type (infer (merge empty-fingerprint {metric threshold})))))
    (doseq [[metric expected-semantic-type] expectations]
      (is (not (= expected-semantic-type (infer (merge empty-fingerprint {metric (/ threshold 2)}))))))
    (testing "state has a lower threshold"
      (is (= :type/State (infer (zipmap (map first expectations) (repeat lower-threshold))))))))

(deftest ^:parallel infer-semantic-type-test
  (let [fingerprint       {:type {:type/Text {:percent-json threshold}}}
        state-fingerprint {:type {:type/Text {:percent-state lower-threshold}}}
        field             (mi/instance Field {:name "field" :base_type :type/Text})]
    (testing "can infer a semantic type from text fingerprints"
      (is (= :type/SerializedJSON
             (:semantic_type (classifiers.text-fingerprint/infer-semantic-type field fingerprint))))
      (is (= :type/State
             (:semantic_type (classifiers.text-fingerprint/infer-semantic-type field state-fingerprint)))))
    (testing "can infer a semantic type from text fingerprints if another classifier has put one one"
      (let [field-with-original (with-meta (assoc field :semantic_type :type/Category) {:sync.classify/original field})]
        (is (= :type/SerializedJSON
               (:semantic_type (classifiers.text-fingerprint/infer-semantic-type field-with-original fingerprint))))
        (is (= :type/State
               (:semantic_type (classifiers.text-fingerprint/infer-semantic-type field-with-original state-fingerprint))))))))
