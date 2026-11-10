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
    (is (= [[{:id "abc" :type :category}]]
           (parameters/export-parameters (protocol.stub/stub-store {:fk (constantly nil)})
                                         [[{:id                   "abc"
                                            :type                 :category
                                            :values_source_type   :card
                                            :values_source_config {:card_id 1}}]])))))

(deftest ^:parallel parameters-round-trip-test
  (testing "export keeps the stored order of parameters, and import restores it with the values source card"
    (let [exported (first (parameters/export-parameters
                           (protocol.stub/stub-store {:fk (fn [id _] (str "card-" id))})
                           [[{:id "b" :type :category}
                             {:id "a" :type :category :values_source_type :card :values_source_config {:card_id 7}}]]))]
      (is (= ["b" "a"] (map :id exported)))
      (is (=? [{:id "b"} {:id "a" :values_source_config {:card_id 7}}]
              (first (parameters/import-parameters
                      (protocol.stub/stub-store {:fk (fn [eid _] (parse-long (subs eid 5)))})
                      [exported]
                      {}))))))
  (testing "import orders the parameters of an older export by the :position it recorded, and drops it"
    (is (= [{:id "b" :type :category} {:id "a" :type :category}]
           (first (parameters/import-parameters
                   (protocol.stub/stub-store {})
                   [[{:id "a" :type :category :position 1} {:id "b" :type :category :position 0}]]
                   {}))))))
