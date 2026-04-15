(ns metabase-enterprise.metabot.tools.entity-details-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-id (mt/id :categories :name)]
      (try
        (let [result     (entity-details/get-table-details {:table-id (mt/id :categories)})
              name-field (some #(when (= "NAME" (:name %)) %) (get-in result [:structured-output :fields]))]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (:field_values name-field)))))
        (finally
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))
