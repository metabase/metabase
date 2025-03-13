(ns metabase-enterprise.advanced-permissions.models.field-values-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.driver
    :as impersonation]
   [metabase-enterprise.impersonation.util-test
    :as impersonation.util-test]
   [metabase.models.params.field-values :as params.field-values]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest get-or-create-field-values!-test
  (mt/with-premium-features #{:advanced-permissions}
    (let [field (t2/select-one :model/Field :id (mt/id :categories :id))]
      (try
        (testing "creates new field values for user using impersonation"
          (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                         :attributes     {"impersonation_attr" "impersonation_role"}}
            (let [hash-key-1 (str
                              (hash
                               (merge
                                (params.field-values/hash-input-for-field-values field)
                                ;; this is already included above, but we're just making sure.
                                (impersonation/hash-input-for-impersonation field))))]
              (params.field-values/get-or-create-field-values! field)
              (is (= #{hash-key-1}
                     (into #{}
                           (map :hash_key (t2/select :model/FieldValues :field_id (u/the-id field) :type :advanced)))))

              (testing "calling a second time shouldn't create new FieldValues"
                (params.field-values/get-or-create-field-values! field)
                (is (= 1 (t2/count :model/FieldValues :field_id (u/the-id field) :type :advanced))))

              (testing "changing the impersonation role creates new FieldValues"
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "impersonation_role_2"}}
                  (let [hash-key-2 (str
                                    (hash
                                     (merge
                                      (params.field-values/hash-input-for-field-values field)
                                      ;; again, this is already included above, but we're adding it for documentation
                                      (impersonation/hash-input-for-impersonation field))))]
                    (params.field-values/get-or-create-field-values! field)
                    (is (= #{hash-key-1 hash-key-2}
                           (into #{}
                                 (map :hash_key (t2/select :model/FieldValues :field_id (u/the-id field) :type :advanced)))))
                    (is (= 2 (t2/count :model/FieldValues :field_id (u/the-id field) :type :advanced)))))))))
        (finally
          (t2/delete! :model/FieldValues :field_id (u/the-id field) :type :advanced))))))
