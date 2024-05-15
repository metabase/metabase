(ns metabase.analyze.classify-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.core :as classifiers]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]))

(defn- ->field [field]
  (mi/instance
   Field
   (merge {:semantic_type nil}
          field)))

(deftest ^:parallel run-classifiers-test
  (testing "Fields marked state are not overridden"
    (let [field (->field {:name "state", :base_type :type/Text, :semantic_type :type/State})]
      (is (= :type/State (:semantic_type (classifiers/run-classifiers field nil)))))))

(deftest ^:parallel run-classifiers-test-2
  (testing "Fields with few values are marked as category and list"
    (let [field      (->field {:name "state", :base_type :type/Text})
          classified (classifiers/run-classifiers field {:global
                                                      {:distinct-count
                                                       (dec field-values/category-cardinality-threshold)
                                                       :nil% 0.3}})]
      (is (= {:has_field_values :auto-list, :semantic_type :type/Category}
             (select-keys classified [:has_field_values :semantic_type]))))))

(deftest ^:parallel run-classifiers-test-3
  (testing "Earlier classifiers prevent later classifiers"
    (let [field       (->field {:name "site_url" :base_type :type/Text})
          fingerprint {:global {:distinct-count 4
                                :nil%           0}}
          classified  (classifiers/run-classifiers field fingerprint)]
      (is (= {:has_field_values :auto-list, :semantic_type :type/URL}
             (select-keys classified [:has_field_values :semantic_type]))))))

(deftest ^:parallel run-classifiers-test-4
  (testing "Classififying using fingerprinters can override previous classifications"
    (testing "Classify state fields on fingerprint rather than name"
      (let [field       (->field {:name "order_state" :base_type :type/Text})
            fingerprint {:global {:distinct-count 4
                                  :nil%           0}
                         :type   {:type/Text {:percent-state 0.98}}}
            classified  (classifiers/run-classifiers field fingerprint)]
        (is (= {:has_field_values :auto-list, :semantic_type :type/State}
               (select-keys classified [:has_field_values :semantic_type])))))
    (let [field       (->field {:name "order_status" :base_type :type/Text})
          fingerprint {:type {:type/Text {:percent-json 0.99}}}]
      (is (= :type/SerializedJSON
             ;; this will be marked as :type/Category based on name, but fingerprinters should override
             (:semantic_type (classifiers/run-classifiers field fingerprint)))))))
