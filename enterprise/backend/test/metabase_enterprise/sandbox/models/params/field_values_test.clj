(ns metabase-enterprise.sandbox.models.params.field-values-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase-enterprise.sandbox.models.params.field-values :as ee-params.field-values]
            [metabase.models :refer [Card Field FieldValues PermissionsGroup PermissionsGroupMembership User]]
            [metabase.models.field-values :as field-values]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.server.middleware.session :as mw.session]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest get-or-create-advanced-field-values!
  (doseq [fv-type [:sandbox :linked-filter]]
    (testing "create a new field values and fix up the human readable values"
      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:and
                                                                                      [:> $id 3]
                                                                                      [:< $id 6]]})}}}
        ;; the categories-id doesn't have a field values, we fake it with a full fieldvalues to make it easier to test
        (db/insert! FieldValues {:type                  :full
                                 :field_id              (mt/id :categories :id)
                                 :values                (range 10)
                                 :human_readable_values (map #(str "id_" %) (range 10))})
        (let [categories-id (mt/id :categories :id)
              fv            (params.field-values/get-or-create-advanced-field-values!
                              fv-type
                              (db/select-one Field :id (mt/id :categories :id)))]
          (is (= 1 (db/count FieldValues :field_id categories-id :type fv-type)))
          (is (= [4 5] (:values fv)))
          (is (= ["id_4" "id_5"] (:human_readable_values fv)))
          (is (some? (:hash_key fv)))

          (testing "call second time shouldn't create a new FieldValues"
            (params.field-values/get-or-create-advanced-field-values!
              :sandbox
              (db/select-one Field :id (mt/id :categories :id)))
            (is (= 1 (db/count FieldValues :field_id categories-id :type fv-type)))))))

    (testing "make sure the Fieldvalues respect [field-values/*total-max-length*]"
      (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:and
                                                                                      [:> $id 3]
                                                                                      [:< $id 6]]})}}}
        (binding [field-values/*total-max-length* 5]
          (is (= ["Asian"]
                 (:values (params.field-values/get-or-create-advanced-field-values!
                            fv-type
                            (db/select-one Field :id (mt/id :categories :name)))))))))))

(deftest advanced-field-values-hash-test
  (premium-features-test/with-premium-features #{:sandboxes}
    ;; copy at top level so that `with-gtaps-for-user` does not have to create a new copy every time it gets called
    (mt/with-temp-copy-of-db
      (testing "gtap with remappings"
        (letfn [(hash-for-user-id [user-id login-attributes]
                  (mt/with-gtaps-for-user user-id
                    {:gtaps      {:categories {:remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}}
                     :attributes login-attributes}
                    (ee-params.field-values/hash-key-for-sandbox (mt/id :categories :name))))]
          (mt/with-temp* [User [{user-id-1 :id}]
                          User [{user-id-2 :id}]]

            (testing "2 users with the same attribute should have the same hash"
              (is (= (hash-for-user-id user-id-1 {"State" "CA"})
                     (hash-for-user-id user-id-2 {"State" "CA"})))
              (testing "having extra login attributes won't effect the hash"
                (is (= (hash-for-user-id user-id-1 {"State" "CA"
                                                    "City"  "San Jose"})
                       (hash-for-user-id user-id-2 {"State" "CA"})))))

            (testing "same users but the login_attributes change should have different hash"
              (is (not= (hash-for-user-id user-id-1 {"State" "CA"})
                        (hash-for-user-id user-id-1 {"State" "NY"}))))

            (testing "2 users with different login_attributes should have different hash"
              (is (not= (hash-for-user-id user-id-1 {"State" "CA"})
                        (hash-for-user-id user-id-2 {"State" "NY"})))
              (is (not= (hash-for-user-id user-id-1 {})
                        (hash-for-user-id user-id-2 {"State" "NY"}))))))))

    (testing "gtap with card and remappings"
      ;; hack so that we don't have to setup all the sandbox permissions the table
      (with-redefs [ee-params.field-values/field-is-sandboxed? (constantly true)]
        (letfn [(hash-for-user-id-with-attributes [user-id login_attributes]
                  (mt/with-temp-vals-in-db User user-id {:login_attributes login_attributes}
                    (mw.session/with-current-user user-id
                      (ee-params.field-values/hash-key-for-sandbox (mt/id :categories :name)))))]
          (testing "2 users in the same group"
            (mt/with-temp*
              [Card                       [{card-id :id}]
               PermissionsGroup           [{group-id :id}]
               User                       [{user-id-1 :id}]
               User                       [{user-id-2 :id}]
               PermissionsGroupMembership [_ {:group_id group-id
                                              :user_id user-id-1}]
               PermissionsGroupMembership [_ {:group_id group-id
                                              :user_id user-id-2}]
               GroupTableAccessPolicy     [_ {:card_id card-id
                                              :group_id group-id
                                              :table_id (mt/id :categories)
                                              :attribute_remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}]]
              (testing "if the have the same attributes, the hash should be the ssame"
                (is (= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                       (hash-for-user-id-with-attributes user-id-2 {"State" "CA"}))))

              (testing "if the have the different attributes, the hash should be the different"
                (is (not= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                          (hash-for-user-id-with-attributes user-id-2 {"State" "NY"}))))))

          (testing "2 users in different groups but gtaps use the same card"
            (mt/with-temp*
              [Card                       [{card-id :id}]

               ;; user 1 in group 1
               User                       [{user-id-1 :id}]
               PermissionsGroup           [{group-id-1 :id}]
               PermissionsGroupMembership [_ {:group_id group-id-1
                                              :user_id user-id-1}]
               GroupTableAccessPolicy     [_ {:card_id card-id
                                              :group_id group-id-1
                                              :table_id (mt/id :categories)
                                              :attribute_remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}]
               ;; user 2 in group 2 with gtap using the same card
               User                       [{user-id-2 :id}]
               PermissionsGroup           [{group-id-2 :id}]
               PermissionsGroupMembership [_ {:group_id group-id-2
                                              :user_id user-id-2}]
               GroupTableAccessPolicy     [_ {:card_id card-id
                                              :group_id group-id-2
                                              :table_id (mt/id :categories)
                                              :attribute_remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}]]
              (testing "if the have the same attributes, the hash should be the ssame"
                (is (= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                       (hash-for-user-id-with-attributes user-id-2 {"State" "CA"}))))

              (testing "if the have the different attributes, the hash should be the different"
                (is (not= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                          (hash-for-user-id-with-attributes user-id-2 {"State" "NY"}))))))

          (testing "2 users in different groups and gtaps use 2 different cards"
            (mt/with-temp*
              [Card                       [{card-id-1 :id}]
               User                       [{user-id-1 :id}]
               PermissionsGroup           [{group-id-1 :id}]
               PermissionsGroupMembership [_ {:group_id group-id-1
                                              :user_id user-id-1}]
               GroupTableAccessPolicy     [_ {:card_id card-id-1
                                              :group_id group-id-1
                                              :table_id (mt/id :categories)
                                              :attribute_remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}]
               ;; user 2 in group 2 with gtap using card 2
               Card                       [{card-id-2 :id}]
               User                       [{user-id-2 :id}]
               PermissionsGroup           [{group-id-2 :id}]
               PermissionsGroupMembership [_ {:group_id group-id-2
                                              :user_id user-id-2}]
               GroupTableAccessPolicy     [_ {:card_id card-id-2
                                              :group_id group-id-2
                                              :table_id (mt/id :categories)
                                              :attribute_remappings {"State" [:dimension [:field (mt/id :categories :name) nil]]}}]]
              (testing "the hash are different even though they have the same attribute"
                (is (not= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                          (hash-for-user-id-with-attributes user-id-2 {"State" "CA"})))
                (is (not= (hash-for-user-id-with-attributes user-id-1 {"State" "CA"})
                          (hash-for-user-id-with-attributes user-id-2 {"State" "NY"})))))))))))
