(ns metabase.serialization.parameters-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.parameters :as parameters]
   [metabase.serialization.protocol.stub :as protocol.stub]))

(deftest ^:parallel export-parameters-test
  (let [export (fn [x]
                 (first (parameters/export-parameters
                         (protocol.stub/stub-store
                          {:fk    (fn [id model] (format "%s___%d" (name model) id))
                           :field (constantly ["DATABASE" "SCHEMA" "TABLE" "FIELD"])})
                         [x])))]
    (is (= [{:id                   "abc"
             :name                 "CATEGORY"
             :position             0
             :type                 :category
             :values_source_config {:card_id     "Card___1"
                                    :value_field [:field ["DATABASE" "SCHEMA" "TABLE" "FIELD"] nil]}
             :values_source_type   :card}]
           (export [{:id                   "abc"
                     :type                 :category
                     :name                 "CATEGORY"
                     :values_source_type   :card
                     :values_source_config {:card_id 1, :value_field [:field 53 nil]}
                     :position             0}])))))

(deftest ^:parallel export-parameter-with-missing-values-source-card-test
  (testing "a values source Card that no longer exists is dropped, falling back to the parameter's own values"
    (is (= [[{:id "abc" :type :category :position 0}]]
           (parameters/export-parameters (protocol.stub/stub-store {:fk (constantly nil)})
                                         [[{:id                   "abc"
                                            :type                 :category
                                            :values_source_type   :card
                                            :values_source_config {:card_id 1}}]])))))

(deftest ^:parallel parameters-round-trip-test
  (testing "import restores the display order export recorded in :position, and the values source card"
    (let [exported (first (parameters/export-parameters
                           (protocol.stub/stub-store {:fk (fn [id _] (str "card-" id))})
                           [[{:id "b" :type :category}
                             {:id "a" :type :category :values_source_type :card :values_source_config {:card_id 7}}]]))]
      (is (= ["a" "b"] (map :id exported)))
      (is (=? [{:id "b"} {:id "a" :values_source_config {:card_id 7}}]
              (first (parameters/import-parameters
                      (protocol.stub/stub-store {:fk (fn [eid _] (parse-long (subs eid 5)))})
                      [exported]
                      {})))))))
