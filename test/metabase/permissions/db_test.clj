(ns metabase.permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.permissions.core :as perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]))

(deftest field-visibility-info-honors-user-set-visibility-type-test
  (testing "field-visibility-info honors a user-set visibility_type (e.g. sensitive) over the sync value"
    (mt/with-temp [:model/Table {table-id :id} {}
                   :model/Field {field-id :id} {:table_id table-id, :visibility_type "normal"}]
      (testing "sanity check: the sync value shows by default"
        (is (=? {:id field-id, :visibility_type :normal, :table_id table-id}
                (first (permissions.db/field-visibility-info #{field-id})))))
      (field-user-settings/upsert-field-user-settings! {:id field-id} {:visibility_type :sensitive})
      (is (=? {:id field-id, :visibility_type :sensitive, :table_id table-id}
              (first (permissions.db/field-visibility-info #{field-id})))))))

(deftest partitioned-reads-match-single-statement-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {:name "Partitioned Group A"}
                 :model/PermissionsGroup {other-id :id} {:name "Partitioned Group B"}
                 :model/Collection       {coll-1 :id}  {}
                 :model/Collection       {coll-2 :id}  {}
                 :model/Collection       {coll-3 :id}  {}]
    (let [table-ids  (mapv mt/id [:venues :checkins :users :categories :orders])
          [qb-ids no-ids] (split-at 3 table-ids)]
      (permissions.db/insert-data-permissions!
       (for [[table-ids value] [[qb-ids :query-builder] [no-ids :no]]
             table-id          table-ids]
         {:group_id group-id :db_id (mt/id) :perm_type :perms/create-queries :perm_value value :table_id table-id
          :schema_name "PUBLIC"}))
      (doseq [[group collection] [[group-id coll-1] [group-id coll-2] [other-id coll-3]]]
        (perms/grant-collection-read-permissions! group collection))
      (perms/grant-permissions! group-id "/collection/root/read/")
      (let [reads (fn []
                    {:table-database-ids (set (permissions.db/table-database-ids (set table-ids)))
                     :levels             (set (permissions.db/table-level-values-of-groups
                                               [group-id] :perms/create-queries table-ids))
                     :other-values       (permissions.db/other-table-permission-values
                                          group-id (mt/id) "perms/create-queries" (set (take 4 table-ids)))
                     :excluding          (set (map :id (permissions.db/table-ids-and-schemas-excluding
                                                        (mt/id) (take 4 table-ids))))
                     :names-taken        (permissions.db/lower-names-taken-outside
                                          ["partitioned group a" "partitioned group b" "x" "y" "z"] [other-id])
                     :name-exists?       (permissions.db/group-exists-with-lower-names?
                                          ["x" "y" "z" "w" "partitioned group b"])
                     :collections        (update-vals (permissions.db/collections-by-id [coll-1 coll-2 coll-3]) :id)
                     :related            (sort (map :id (permissions.db/related-permission-rows
                                                         (for [collection [coll-1 coll-2 coll-1 coll-3 coll-2]
                                                               :let [path (str "/collection/" collection "/read/")]]
                                                           [group-id path [path]]))))
                     :graph              (frequencies (into [] (map #(select-keys % [:group_id :collection_id :writable :readable]))
                                                            (permissions.db/collection-graph-rows
                                                             nil true "/collection/root/" [coll-1 coll-2 coll-3]
                                                             [group-id other-id] 1)))})
            single      (reads)
            partitioned (with-redefs [mdb.query/select-partition-size 2
                                      mdb.query/delete-partition-size 2]
                          (reads))]
        (testing "every read answers the same with partitions of 2 as with one statement"
          (is (= single partitioned)))
        (testing "the reads are not vacuous"
          (is (=? {:table-database-ids #(= 5 (count %))
                   :other-values       [{:perm_value "no"}]
                   :excluding          #(contains? % (last table-ids))
                   :names-taken        #{"partitioned group a"}
                   :name-exists?       true
                   :related            #(= 2 (count %))
                   :graph              #(and (every? #{1} (vals %))
                                             (some (comp nil? :collection_id) (keys %))
                                             (<= 6 (count %)))}
                  single)))))))
