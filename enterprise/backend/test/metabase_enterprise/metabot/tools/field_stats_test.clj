(ns metabase-enterprise.metabot.tools.field-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.field-stats :as metabot.tools.field-stats]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-id (mt/id :categories :name)
          table-id (mt/id :categories)]
      (try
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 10})]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (get-in result [:structured-output :value_metadata :field_values])))))
        (finally
          (t2/delete! :model/FieldValues 'field_id field-id 'type :advanced))))))

(deftest refingerprint-skipped-for-sandboxed-user-test
  (testing "Metabot must not compute or return a fingerprint for a sandboxed user: fingerprints are global
            statistics, so an on-demand resample would run unsandboxed (via request/as-admin) and persist
            unsandboxed data to the shared Field row for a user who should never see it."
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [field-id    (mt/id :categories :name)
            table-id    (mt/id :categories)
            original-fp (t2/select-one-fn :fingerprint :model/Field 'id field-id)]
        (try
          ;; Clear the fingerprint -- pre-#436 (and pre this fix, for this call site) this would have
          ;; forced an unsandboxed on-demand refingerprint via get-or-create-fingerprint!.
          (t2/update! :model/Field field-id {'fingerprint nil 'fingerprint_version 0})
          (let [result (metabot.tools.field-stats/field-values
                        {:entity-type "table", :entity-id table-id, :field-id field-id})]
            (testing "no fingerprint statistics are returned to the sandboxed user"
              (is (nil? (get-in result [:structured-output :value_metadata :statistics]))))
            (testing "no fingerprint was computed or saved to the shared Field row"
              (is (nil? (t2/select-one-fn :fingerprint :model/Field 'id field-id)))))
          (finally
            (t2/update! :model/Field field-id {'fingerprint original-fp})))))))

(deftest fingerprint-withheld-for-sandboxed-user-test
  (testing "An existing global fingerprint is withheld from a sandboxed user, even though it's already
            computed and would otherwise just be read as-is."
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [field-id (mt/id :categories :name)
            table-id (mt/id :categories)]
        (is (some? (t2/select-one-fn :fingerprint :model/Field 'id field-id))
            "precondition: the field already has a fingerprint")
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id})]
          (is (nil? (get-in result [:structured-output :value_metadata :statistics]))))))))

(deftest fingerprint-withheld-when-model-metadata-spoofs-table-test
  (testing "A model cannot bypass sandbox fingerprint filtering by claiming that a real Field belongs to an open table"
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [restricted-field-id (mt/id :categories :name)
            open-table-id       (mt/id :venues)]
        (mt/with-temp [:model/Card {model-id :id}
                       {:name            "Model with stale metadata"
                        :type            :model
                        :database_id     (mt/id)
                        :dataset_query   {:database (mt/id)
                                          :type     :query
                                          :query    {:source-table open-table-id}}
                        ;; Model result metadata is editable and is merged over the metadata provider's
                        ;; canonical Field metadata. Simulate a stale/malicious table_id paired with a
                        ;; real Field ID from the sandboxed table.
                        :result_metadata [{:id             restricted-field-id
                                           :name           "SPOOF"
                                           :display_name   "Spoof"
                                           :base_type      :type/Text
                                           :effective_type :type/Text
                                           :table_id       open-table-id
                                           :field_ref      [:field restricted-field-id nil]}]}]
          (let [result (metabot.tools.field-stats/field-values
                        {:entity-type "model", :entity-id model-id, :field-id restricted-field-id})]
            (is (= ["African" "American"]
                   (get-in result [:structured-output :value_metadata :field_values]))
                "field values still use the current user's sandbox lens")
            (is (nil? (get-in result [:structured-output :value_metadata :statistics]))
                "the persisted Field owner, not spoofed Card metadata, controls fingerprint access")))))))

(deftest fingerprint-withheld-for-impersonated-user-test
  (testing "An impersonated user gets no fingerprint statistics, and no on-demand refingerprint is triggered"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.util-test/with-impersonations!
        {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
         :attributes     {"impersonation_attr" "impersonation_role"}}
        (let [field-id    (mt/id :venues :price)
              table-id    (mt/id :venues)
              original-fp (t2/select-one-fn :fingerprint :model/Field 'id field-id)]
          (is (some? original-fp) "precondition: the field already has a fingerprint")
          (testing "an existing fingerprint is withheld"
            (let [result (metabot.tools.field-stats/field-values
                          {:entity-type "table", :entity-id table-id, :field-id field-id})]
              (is (nil? (get-in result [:structured-output :value_metadata :statistics])))))
          (testing "a missing fingerprint is not computed or saved"
            (try
              (t2/update! :model/Field field-id {'fingerprint nil 'fingerprint_version 0})
              (metabot.tools.field-stats/field-values
               {:entity-type "table", :entity-id table-id, :field-id field-id})
              (is (nil? (t2/select-one-fn :fingerprint :model/Field 'id field-id)))
              (finally
                (t2/update! :model/Field field-id {'fingerprint original-fp})))))))))

(deftest fingerprint-withheld-for-routed-user-test
  (testing "A database-routed user gets no fingerprint statistics, and no on-demand refingerprint is
            triggered"
    (mt/with-temp [:model/Database       router-db {}
                   :model/Database       dest-db   {:router_database_id (:id router-db)}
                   :model/Table          table     {:db_id (:id router-db)}
                   :model/Field          field     {:table_id (:id table)
                                                    :fingerprint {:global {:distinct-count 1}}}
                   :model/DatabaseRouter _         {:database_id (:id router-db) :user_attribute "db_name"}]
      (met/with-user-attributes! :rasta {"db_name" (:name dest-db)}
        (mt/with-test-user :rasta
          (testing "an existing fingerprint is withheld"
            (let [result (metabot.tools.field-stats/field-values
                          {:entity-type "table", :entity-id (:id table), :field-id (:id field)})]
              (is (nil? (get-in result [:structured-output :value_metadata :statistics])))))
          (testing "a missing fingerprint is not computed or saved"
            (t2/update! :model/Field (:id field) {'fingerprint nil 'fingerprint_version 0})
            (metabot.tools.field-stats/field-values
             {:entity-type "table", :entity-id (:id table), :field-id (:id field)})
            (is (nil? (t2/select-one-fn :fingerprint :model/Field 'id (:id field))))))))))

(deftest fingerprint-returned-for-unrestricted-user-test
  (testing "A non-sandboxed, non-impersonated, non-routed user still gets fingerprint statistics -- this
            fix must not regress the common case."
    (mt/as-admin
      (let [field-id (mt/id :categories :name)
            table-id (mt/id :categories)]
        (is (some? (t2/select-one-fn :fingerprint :model/Field 'id field-id))
            "precondition: the field already has a fingerprint")
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id})]
          (is (some? (get-in result [:structured-output :value_metadata :statistics]))))))))
