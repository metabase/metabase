(ns metabase.models.params-test
  "Tests for the utility functions for dealing with parameters in `metabase.models.params`."
  (:require
   [clojure.test :refer :all]
   [metabase.api.public-test :as public-test]
   [metabase.models :refer [Card Field]]
   [metabase.models.params :as params]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel wrap-field-id-if-needed-test
  (doseq [[x expected] {10                                      [:field 10 nil]
                        [:field 10 nil]                         [:field 10 nil]
                        [:field "name" {:base-type :type/Text}] [:field "name" {:base-type :type/Text}]}]
    (testing x
      (is (= expected
             (params/wrap-field-id-if-needed x))))))


;;; ---------------------------------------------- name_field hydration ----------------------------------------------

(deftest hydrate-name-field-test
  (testing "make sure that we can hydrate the `name_field` property for PK Fields"
    (is (= {:name          "ID"
            :table_id      (mt/id :venues)
            :semantic_type :type/PK
            :name_field    {:id               (mt/id :venues :name)
                            :table_id         (mt/id :venues)
                            :display_name     "Name"
                            :base_type        :type/Text
                            :semantic_type    :type/Name
                            :has_field_values :list}}
           (-> (t2/select-one [Field :name :table_id :semantic_type], :id (mt/id :venues :id))
               (t2/hydrate :name_field)
               mt/derecordize))))

  (testing "make sure it works for multiple fields efficiently. Should only require one DB call to hydrate many Fields"
    (let [venues-fields (t2/select Field :table_id (mt/id :venues))]
      (t2/with-call-count [call-count]
        (t2/hydrate venues-fields :name_field)
        (is (= 1
               (call-count))))))

  (testing "It shouldn't hydrate for Fields that aren't PKs"
    (is (= {:name          "PRICE"
            :table_id      (mt/id :venues)
            :semantic_type :type/Category
            :name_field    nil}
           (-> (t2/select-one [Field :name :table_id :semantic_type], :id (mt/id :venues :price))
               (t2/hydrate :name_field)
               mt/derecordize))))

  (testing "Or if it *is* a PK, but no name Field is available for that Table, it shouldn't hydrate"
    (is (= {:name          "ID"
            :table_id      (mt/id :checkins)
            :semantic_type :type/PK
            :name_field    nil}
           (-> (t2/select-one [Field :name :table_id :semantic_type], :id (mt/id :checkins :id))
               (t2/hydrate :name_field)
               mt/derecordize)))))


;;; -------------------------------------------------- param_fields --------------------------------------------------

(deftest hydrate-param-fields-for-card-test
  (testing "check that we can hydrate param_fields for a Card"
    (t2.with-temp/with-temp [Card card {:dataset_query
                                        {:database (mt/id)
                                         :type     :native
                                         :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{x}}"
                                                    :template-tags {"name" {:name         "name"
                                                                            :display_name "Name"
                                                                            :type         :dimension
                                                                            :dimension    [:field (mt/id :venues :id) nil]}}}}}]
      (is (= {(mt/id :venues :id) {:id               (mt/id :venues :id)
                                   :table_id         (mt/id :venues)
                                   :display_name     "ID"
                                   :base_type        :type/BigInteger
                                   :semantic_type    :type/PK
                                   :has_field_values :none
                                   :name_field       {:id               (mt/id :venues :name)
                                                      :table_id         (mt/id :venues)
                                                      :display_name     "Name"
                                                      :base_type        :type/Text
                                                      :semantic_type    :type/Name
                                                      :has_field_values :list}
                                   :dimensions       []}}
             (-> (t2/hydrate card :param_fields)
                 :param_fields
                 mt/derecordize))))))

(deftest hydate-param-fields-for-dashboard-test
  (testing "check that we can hydrate param_fields for a Dashboard"
    (public-test/with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
      (is (= {(mt/id :venues :id) {:id               (mt/id :venues :id)
                                   :table_id         (mt/id :venues)
                                   :display_name     "ID"
                                   :base_type        :type/BigInteger
                                   :semantic_type    :type/PK
                                   :has_field_values :none
                                   :name_field       {:id               (mt/id :venues :name)
                                                      :table_id         (mt/id :venues)
                                                      :display_name     "Name"
                                                      :base_type        :type/Text
                                                      :semantic_type    :type/Name
                                                      :has_field_values :list}
                                   :dimensions       []}}
             (-> (t2/hydrate dashboard :param_fields)
                 :param_fields
                 mt/derecordize))))))

(deftest ^:parallel card->template-tag-test
  (let [card {:dataset_query (mt/native-query {:template-tags {"id"   {:name         "id"
                                                                       :display_name "ID"
                                                                       :type         :dimension
                                                                       :dimension    [:field (mt/id :venues :id) nil]}
                                                               "name" {:name         "name"
                                                                       :display_name "Name"
                                                                       :type         :dimension
                                                                       :dimension    [:field "name" {:base-type :type/Text}]}}})}]
    (testing "card->template-tag-field-clauses"
      (is (= #{[:field (mt/id :venues :id) nil]
               [:field "name" {:base-type :type/Text}]}
             (params/card->template-tag-field-clauses card))))

    (testing "card->template-tag-field-ids"
      (is (= #{(mt/id :venues :id)}
             (params/card->template-tag-field-ids card))))))

(deftest get-linked-field-ids-test
  (testing "get-linked-field-ids basic test"
    (is (= {"foo" #{256}
            "bar" #{267}}
           (params/get-linked-field-ids
            [{:parameter_mappings
              [{:parameter_id "foo" :target [:dimension [:field 256 nil]]}
               {:parameter_id "bar" :target [:dimension [:field 267 nil]]}]}]))))
  (testing "get-linked-field-ids multiple fields to one param test"
    (is (= {"foo" #{256 10}
            "bar" #{267}}
           (params/get-linked-field-ids
            [{:parameter_mappings
              [{:parameter_id "foo" :target [:dimension [:field 256 nil]]}
               {:parameter_id "bar" :target [:dimension [:field 267 nil]]}]}
             {:parameter_mappings
              [{:parameter_id "foo" :target [:dimension [:field 10 nil]]}]}]))))
  (testing "get-linked-field-ids-test misc fields"
    (is (= {"1" #{1} "2" #{2} "3" #{3} "4" #{4} "5" #{5}}
           (params/get-linked-field-ids
            [{:parameter_mappings
              [{:parameter_id "1" :target [:dimension [:field 1 {}]]}
               {:parameter_id "2" :target [:dimension [:field 2 {:x true}]]}
               {:parameter_id "wow" :target [:dimension [:field "wow" {:base-type :type/Integer}]]}
               {:parameter_id "3" :target [:dimension [:field 3 {:source-field 1}]]}
               {:parameter_id "4" :target [:dimension [:field 4 {:binning {:strategy :num-bins, :num-bins 1}}]]}
               {:parameter_id "5" :target [:dimension [:field 5]]}]}]))))
  (testing "get-linked-field-ids-test no fields"
    (is (= {}
           (params/get-linked-field-ids
            [{:parameter_mappings []}])))))
