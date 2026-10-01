(ns metabase.warehouse-schema-overlay.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.schema]
   [toucan2.core :as t2]))

(comment metabase.warehouse-schema.schema/keep-me)

(deftest ^:parallel table-columns-match-the-table-schema-test
  (testing "the spelled-out column list keeps up with the Table schema it cannot require"
    (is (= (into #{:id :unique_table_helper} (mu/map-schema-keys :metabase.warehouse-schema.schema/table.update))
           warehouse-schema-overlay/table-columns))))

(deftest ^:parallel field-columns-match-the-field-schema-test
  (testing "the spelled-out column list keeps up with the Field schema it cannot require"
    (is (= (into #{:id :unique_field_helper} (mu/map-schema-keys :metabase.warehouse-schema.schema/field.update))
           warehouse-schema-overlay/field-columns))))

(defn- visibility-types
  "`[table-user-visibility-type, visibility_type read through table-query]` for the Table `table-id`."
  [table-id]
  [(t2/select-one-fn :v [(t2/table-name :model/Table)
                         [(warehouse-schema-overlay/table-user-visibility-type :metabase_table) :v]]
                     {:where [:= :metabase_table.id table-id]})
   (some-> (t2/select-one-fn :visibility_type [:model/Table :visibility_type] :id table-id
                             {:from [(warehouse-schema-overlay/table-query)]})
           name)])

(deftest table-user-visibility-type-test
  (testing "table-user-visibility-type matches the visibility_type table-query reads"
    (mt/with-temp [:model/Table {plain :id}            {}
                   :model/Table {cruft :id}            {:visibility_type :cruft}
                   :model/Table {put-hidden :id}       {}
                   :model/Table {data-studio :id}      {}
                   :model/Table {cruft-cleared :id}    {:visibility_type :cruft}
                   :model/Table {description-only :id} {}]
      (mt/user-http-request :crowberto :put 200 (format "table/%d" put-hidden) {:visibility_type "hidden"})
      (mt/user-http-request :crowberto :post 200 "data-studio/table/edit"
                            {:table_ids [data-studio] :data_layer "hidden"})
      (t2/insert! :model/TableUserSettings {:table_id cruft-cleared :visibility_type nil})
      (t2/insert! :model/TableUserSettings {:table_id description-only :description "user description"})
      (doseq [[desc table-id expected] [["no settings row"                                  plain            nil]
                                        ["sync's cruft with no settings row"                cruft            "cruft"]
                                        ["hidden through PUT /api/table/:id"                put-hidden       "hidden"]
                                        ["data_layer hidden through Data Studio"            data-studio      "hidden"]
                                        ["an explicit user NULL over sync's cruft"          cruft-cleared    nil]
                                        ["a settings row that leaves visibility_type unset" description-only nil]]]
        (testing desc
          (is (= [expected expected] (visibility-types table-id))))))))
