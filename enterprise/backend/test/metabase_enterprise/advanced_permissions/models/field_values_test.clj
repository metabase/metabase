(ns metabase-enterprise.advanced-permissions.models.field-values-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.driver
    :as impersonation]
   [metabase-enterprise.impersonation.util-test
    :as impersonation.util-test]
   [metabase-enterprise.test :as met]
   [metabase.parameters.field-values :as params.field-values]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(deftest get-or-create-field-values!-test
  (mt/with-premium-features #{:advanced-permissions}
    (let [field (assoc (t2/select-one :model/Field :id (mt/id :categories :id)) :has_field_values :list)]
      (try
        (testing "creates new field values for user using impersonation"
          (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                         :attributes     {"impersonation_attr" "impersonation_role"}}
            (let [hash-key-1 (str
                              (hash
                               (merge
                                (params.field-values/hash-input-for-field-values field)
                                ;; this is already included above, but we're just making sure.
                                (impersonation/hash-input-for-impersonation (mt/id)))))]
              (params.field-values/get-or-create-field-values! field)
              (is (= #{hash-key-1}
                     (into #{}
                           (map :hash_key (t2/select :model/FieldValues :field_id (u/the-id field) :type :advanced)))))
              (testing "calling a second time shouldn't create new FieldValues"
                (params.field-values/get-or-create-field-values! field)
                (is (= 1 (t2/count :model/FieldValues :field_id (u/the-id field) :type :advanced))))
              (testing "and a warm hit is served without a detached fetch — it is one SELECT, so
                        handing it to a background thread costs more than it saves (GHY-2937)"
                (let [detached (atom 0)
                      real     (mt/original-fn #'field-values/detached-fetch!)]
                  (mt/with-dynamic-fn-redefs [field-values/detached-fetch! (fn [& args]
                                                                             (swap! detached inc)
                                                                             (apply real args))]
                    (params.field-values/get-or-create-field-values! field)
                    (is (zero? @detached)))))
              (testing "changing the impersonation role creates new FieldValues"
                (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                               :attributes     {"impersonation_attr" "impersonation_role_2"}}
                  (let [hash-key-2 (str
                                    (hash
                                     (merge
                                      (params.field-values/hash-input-for-field-values field)
                                      ;; again, this is already included above, but we're adding it for documentation
                                      (impersonation/hash-input-for-impersonation (mt/id)))))]
                    (params.field-values/get-or-create-field-values! field)
                    (is (= #{hash-key-1 hash-key-2}
                           (into #{}
                                 (map :hash_key (t2/select :model/FieldValues :field_id (u/the-id field) :type :advanced)))))
                    (is (= 2 (t2/count :model/FieldValues :field_id (u/the-id field) :type :advanced)))))))))
        (finally
          (t2/delete! :model/FieldValues :field_id (u/the-id field) :type :advanced))))))

(deftest hash-input-without-advanced-permissions-test
  (testing "an impersonated user gets no FieldValues cache key while advanced permissions are unavailable"
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      (mt/with-premium-features #{}
        (is (nil? (params.field-values/hash-input-for-field-values
                   (t2/select-one :model/Field :id (mt/id :categories :id)))))))))

(defn- hash-inputs
  "The hash inputs of `field` for the current user, from the single-Field path and from the per-Table path."
  [field]
  [(params.field-values/hash-input-for-field-values field)
   ((#'params.field-values/hash-inputs-by-table [field]) field)])

(deftest hash-input-per-user-test
  (mt/with-premium-features #{:advanced-permissions :database-routing}
    (let [field (t2/select-one :model/Field :id (mt/id :categories :id))]
      (testing "a plain user's hash input is the Field id alone, the same for two users"
        (let [rasta (mt/with-test-user :rasta (hash-inputs field))
              lucky (mt/with-test-user :lucky (hash-inputs field))]
          (is (= [{:field-id (:id field)} {:field-id (:id field)}] rasta))
          (is (= rasta lucky))))
      (testing "an impersonated user's hash input holds the role"
        (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                       :attributes     {"impersonation_attr" "impersonation_role"}}
          (let [expected {:field-id (:id field) :impersonation-role "impersonation_role"}]
            (is (= [expected expected] (mt/with-test-user :rasta (hash-inputs field))))
            (is (not= (hash expected) (hash {:field-id (:id field)})))))))
    (mt/with-temp [:model/Database       {router-id :id}      {:engine :h2 :details {}}
                   :model/Database       {destination-id :id} {:engine :h2 :details {} :name "destination-1"
                                                               :router_database_id router-id}
                   :model/DatabaseRouter _                    {:database_id router-id :user_attribute "db_name"}
                   :model/Table          {table-id :id}       {:db_id router-id}
                   :model/Field          field                {:table_id table-id}]
      (testing "a routed user's hash input holds the destination, the same for two users routed to it"
        (met/with-user-attributes! :rasta {"db_name" "destination-1"}
          (met/with-user-attributes! :lucky {"db_name" "destination-1"}
            (let [expected {:field-id (:id field) :destination-db-id destination-id}
                  rasta    (mt/with-test-user :rasta (hash-inputs field))]
              (is (= [expected expected] rasta))
              (is (= rasta (mt/with-test-user :lucky (hash-inputs field))))
              (is (not= (hash expected) (hash {:field-id (:id field)}))))))))))

(defn- field-values-call-count!
  "The number of statements reading the FieldValues of one Field of each of `n` fresh Tables issues for rasta."
  [n]
  (mt/with-model-cleanup [:model/Table]
    (let [field-ids (vec (for [i (range n)]
                           (let [table-id (t2/insert-returning-pk! :model/Table {:db_id (mt/id) :name (str "fresh_" i)
                                                                                 :active true})
                                 field-id (t2/insert-returning-pk! :model/Field {:table_id         table-id
                                                                                 :name             "field"
                                                                                 :base_type        :type/Text
                                                                                 :database_type    "VARCHAR"
                                                                                 :has_field_values :list})]
                             (t2/insert! :model/FieldValues {:field_id field-id :type :full :values ["a" "b"]})
                             field-id)))]
      (mt/with-test-user :rasta
        (t2/with-call-count [call-count]
          (is (= (set field-ids)
                 (set (keys (params.field-values/field-id->field-values-for-current-user field-ids)))))
          (call-count))))))

(deftest field-values-of-fresh-tables-call-count-test
  (mt/with-premium-features #{:advanced-permissions :database-routing :sandboxes}
    (testing "reading the FieldValues of Fields of more fresh Tables issues no more statements"
      (field-values-call-count! 1)
      (is (= (field-values-call-count! 2)
             (field-values-call-count! 6))))))

(defn- impersonated-field-values-call-count!
  "The number of statements `read!` issues for the current user with one Field of each of `n` fresh Tables whose advanced
  FieldValues for that user are stored, checking that it returns them."
  [n read!]
  (mt/with-model-cleanup [:model/Table]
    (let [fields (vec (for [i (range n)]
                        (let [table-id (t2/insert-returning-pk! :model/Table {:db_id (mt/id) :name (str "stored_" i)
                                                                              :active true})]
                          (t2/select-one :model/Field :id (t2/insert-returning-pk! :model/Field
                                                                                   {:table_id         table-id
                                                                                    :name             "field"
                                                                                    :base_type        :type/Text
                                                                                    :database_type    "VARCHAR"
                                                                                    :has_field_values :list})))))]
      (doseq [field fields]
        (t2/insert! :model/FieldValues {:field_id (:id field)
                                        :type     :advanced
                                        :hash_key (str (hash (params.field-values/hash-input-for-field-values field)))
                                        :values   ["stored" (str (:id field))]}))
      (t2/with-call-count [call-count]
        (is (= (into {} (for [{:keys [id]} fields] [id ["stored" (str id)]]))
               (update-vals (read! fields) :values)))
        (call-count)))))

(deftest impersonated-stored-field-values-call-count-test
  (mt/with-premium-features #{:advanced-permissions}
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                   :attributes     {"impersonation_attr" "impersonation_role"}}
      (doseq [[what read!] [["field-id->field-values-for-current-user"
                             #(params.field-values/field-id->field-values-for-current-user (map :id %))]
                            ["get-or-create-field-values-by-field-id!"
                             #(params.field-values/get-or-create-field-values-by-field-id! (t2/hydrate % :table))]]]
        (testing (str what " issues as many statements for stored FieldValues of Fields of 6 Tables as of 2")
          (impersonated-field-values-call-count! 1 read!)
          (is (= (impersonated-field-values-call-count! 2 read!)
                 (impersonated-field-values-call-count! 6 read!))))))))
