(ns metabase-enterprise.metabot.tools.field-stats-test
  (:require
   [clojure.test :refer :all]
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
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))

(deftest refingerprint-bypasses-sandboxing-test
  (testing "When Metabot triggers re-fingerprinting for a missing fingerprint, the fingerprint reflects the full
            (unsandboxed) data, not the sandboxed view of the current user."
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [field-id            (mt/id :categories :name)
            table-id            (mt/id :categories)
            original-fp         (t2/select-one-fn :fingerprint :model/Field :id field-id)
            full-distinct-count (get-in original-fp [:global :distinct-count])]
        (testing "precondition: the field has a fingerprint with a distinct count greater than 0"
          (is (> full-distinct-count 0)))
        (try
          ;; Clear the fingerprint to force re-fingerprinting via get-or-create-fingerprint!
          (t2/update! :model/Field field-id {:fingerprint nil :fingerprint_version 0})
          (metabot.tools.field-stats/field-values
           {:entity-type "table", :entity-id table-id, :field-id field-id})
          (let [new-fp (t2/select-one-fn :fingerprint :model/Field :id field-id)]
            (testing "fingerprint was saved"
              (is (some? new-fp)))
            (testing "fingerprint reflects full table data, not the sandboxed subset"
              (is (= full-distinct-count (get-in new-fp [:global :distinct-count])))))
          (finally
            (t2/update! :model/Field field-id {:fingerprint original-fp})))))))
