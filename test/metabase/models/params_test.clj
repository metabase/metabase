(ns metabase.models.params-test
  "Tests for the utility functions for dealing with parameters in `metabase.models.params`."
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card Field]]
             [test :as mt]]
            [metabase.api.public-test :as public-test]
            [metabase.models.params :as params]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(deftest wrap-field-id-if-needed-test
  (doseq [[x expected] {10                                 [:field-id 10]
                        [:field-id 10]                     [:field-id 10]
                        [:field-literal "name" :type/Text] [:field-literal "name" :type/Text]}]
    (testing x
      (is (= expected
             (params/wrap-field-id-if-needed x)))))
  (testing "Should throw Exception if form is invalid"
    (is (thrown?
         java.lang.IllegalArgumentException
         (params/wrap-field-id-if-needed nil)))))


;;; ---------------------------------------------- name_field hydration ----------------------------------------------

(deftest hydrate-name-field-test
  (testing "make sure that we can hydrate the `name_field` property for PK Fields"
    (is (= {:name         "ID"
            :table_id     (mt/id :venues)
            :special_type :type/PK
            :name_field   {:id               (mt/id :venues :name)
                           :table_id         (mt/id :venues)
                           :display_name     "Name"
                           :base_type        :type/Text
                           :special_type     :type/Name
                           :has_field_values :list}}
           (-> (db/select-one [Field :name :table_id :special_type], :id (mt/id :venues :id))
               (hydrate :name_field)
               mt/derecordize))))

  (testing "make sure it works for multiple fields efficiently. Should only require one DB call to hydrate many Fields"
    (let [venues-fields (db/select Field :table_id (mt/id :venues))]
      (db/with-call-counting [call-count]
        (hydrate venues-fields :name_field)
        (is (= 1
               (call-count))))))

  (testing "It shouldn't hydrate for Fields that aren't PKs"
    (is (= {:name         "PRICE"
            :table_id     (mt/id :venues)
            :special_type :type/Category
            :name_field   nil}
           (-> (db/select-one [Field :name :table_id :special_type], :id (mt/id :venues :price))
               (hydrate :name_field)
               mt/derecordize))))

  (testing "Or if it *is* a PK, but no name Field is available for that Table, it shouldn't hydrate"
    (is (= {:name         "ID"
            :table_id     (mt/id :checkins)
            :special_type :type/PK
            :name_field   nil}
           (-> (db/select-one [Field :name :table_id :special_type], :id (mt/id :checkins :id))
               (hydrate :name_field)
               mt/derecordize)))))


;;; -------------------------------------------------- param_fields --------------------------------------------------

(deftest hydrate-param-fields-for-card-test
  (testing "check that we can hydrate param_fields for a Card"
    (tt/with-temp Card [card {:dataset_query
                              {:database (mt/id)
                               :type     :native
                               :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{x}}"
                                          :template-tags {"name" {:name         "name"
                                                                  :display_name "Name"
                                                                  :type         :dimension
                                                                  :dimension    [:field-id (mt/id :venues :id)]}}}}}]
      (is (= {(mt/id :venues :id) {:id               (mt/id :venues :id)
                                   :table_id         (mt/id :venues)
                                   :display_name     "ID"
                                   :base_type        :type/BigInteger
                                   :special_type     :type/PK
                                   :has_field_values :none
                                   :name_field       {:id               (mt/id :venues :name)
                                                      :table_id         (mt/id :venues)
                                                      :display_name     "Name"
                                                      :base_type        :type/Text
                                                      :special_type     :type/Name
                                                      :has_field_values :list}
                                   :dimensions       []}}
             (-> (hydrate card :param_fields)
                 :param_fields
                 mt/derecordize))))))

(deftest hydate-param-fields-for-dashboard-test
  (testing "check that we can hydrate param_fields for a Dashboard"
    (public-test/with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
      (is (= {(mt/id :venues :id) {:id               (mt/id :venues :id)
                                   :table_id         (mt/id :venues)
                                   :display_name     "ID"
                                   :base_type        :type/BigInteger
                                   :special_type     :type/PK
                                   :has_field_values :none
                                   :name_field       {:id               (mt/id :venues :name)
                                                      :table_id         (mt/id :venues)
                                                      :display_name     "Name"
                                                      :base_type        :type/Text
                                                      :special_type     :type/Name
                                                      :has_field_values :list}
                                   :dimensions       []}}
             (-> (hydrate dashboard :param_fields)
                 :param_fields
                 mt/derecordize))))))

(deftest card->template-tag-test
  (let [card {:dataset_query (mt/native-query {:template-tags {"id"   {:name         "id"
                                                                       :display_name "ID"
                                                                       :type         :dimension
                                                                       :dimension    [:field-id (mt/id :venues :id)]}
                                                               "name" {:name         "name"
                                                                       :display_name "Name"
                                                                       :type         :dimension
                                                                       :dimension    [:field-literal "name" :type/Text]}}})}]
    (testing "card->template-tag-field-clauses"
      (is (= #{[:field-id (mt/id :venues :id)]
               [:field-literal "name" :type/Text]}
             (params/card->template-tag-field-clauses card))))

    (testing "card->template-tag-field-ids"
      (is (= #{(mt/id :venues :id)}
             (params/card->template-tag-field-ids card))))))
