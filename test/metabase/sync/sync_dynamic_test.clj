(ns metabase.sync.sync-dynamic-test
  "Tests for databases with a so-called 'dynamic' schema, i.e. one that is not hard-coded somewhere.
   A Mongo database is an example of such a DB."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata.fields :as sync.fields]
   [metabase.test :as mt]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(defn- remove-nonsense
  "Remove fields that aren't really relevant in the output for `tables` and their `fields`. Done for the sake of making
  debugging some of the tests below easier."
  [tables]
  (for [table tables]
    (-> (u/select-non-nil-keys table [:schema :name :fields])
        (update :fields (fn [fields]
                          (set
                           (for [field fields]
                             (u/select-non-nil-keys
                              field
                              [:table_id
                               :name
                               :fk_target_field_id
                               :parent_id
                               :base_type
                               :database_type
                               :database_is_auto_increment
                               :json-unfolding]))))))))

(defn- get-tables [database-or-id]
  (->> (t2/hydrate (t2/select :model/Table, :db_id (u/the-id database-or-id), {:order-by [:id]}) :fields)
       (mapv mt/boolean-ids-and-timestamps)))

(deftest sync-nested-fields-test
  (testing "basic test to make sure syncing nested fields works. This is sort of a higher-level test."
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      (try
        (sync/sync-database! (:id db))
        (is (= (remove-nonsense toucanery/toucanery-tables-and-fields)
               (remove-nonsense (get-tables db))))
        (finally
          (testing "removes the nested Fields it synced through delete-databases!, since on MySQL a plain delete cannot: their parent reference is ON DELETE RESTRICT"
            (database/delete-databases! [(:id db)])))))))

(def ^:private ^:dynamic *nested-fields?* true)

(defn- describe-table-dropping-nested-fields
  "The toucanery `describe-table`, without nested Fields when `*nested-fields?*` is false."
  [driver database table]
  (cond-> ((get-method driver/describe-table ::toucanery/toucanery) driver database table)
    (not *nested-fields?*)
    (update :fields #(set (map (fn [field] (dissoc field :nested-fields)) %)))))

(driver/register! ::toucanery-with-nested-fields-feature, :parent ::toucanery/toucanery, :abstract? true)

(defmethod driver/describe-table ::toucanery-with-nested-fields-feature
  [driver database table]
  (describe-table-dropping-nested-fields driver database table))

(driver/register! ::toucanery-without-nested-fields-feature, :parent ::toucanery/toucanery, :abstract? true)

(defmethod driver/database-supports? [::toucanery-without-nested-fields-feature :nested-fields]
  [_driver _feature _database]
  false)

(defmethod driver/describe-table ::toucanery-without-nested-fields-feature
  [driver database table]
  (describe-table-dropping-nested-fields driver database table))

(deftest retire-nested-fields-test
  (doseq [engine [::toucanery-with-nested-fields-feature ::toucanery-without-nested-fields-feature]]
    (testing (str "sync retires nested Fields when the warehouse no longer has any for their Table, with and without "
                  "the :nested-fields feature " engine)
      (mt/with-temp [:model/Database db {:engine engine}]
        (try
          (let [buyer-fields (fn []
                               (let [table-id (t2/select-one-pk :model/Table :db_id (:id db) :name "transactions")
                                     buyer-id (t2/select-one-pk :model/Field :table_id table-id :name "buyer" :parent_id nil)]
                                 (t2/select-fn->fn :name :active :model/Field :parent_id buyer-id)))]
            (sync/sync-database! (:id db))
            (is (= {"name" true, "cc" true}
                   (buyer-fields)))
            (binding [*nested-fields?* false]
              (sync/sync-database! (:id db)))
            (is (= {"name" false, "cc" false}
                   (buyer-fields))))
          (finally
            (database/delete-databases! [(:id db)])))))))

(deftest tables-without-nested-fields-sync-together-test
  (testing "with the :nested-fields feature, sync still syncs the Tables without nested Fields together, not one at a time"
    (mt/with-temp [:model/Database db {:engine ::toucanery/toucanery}]
      (try
        (let [one-at-a-time (atom #{})
              sync-one!     (mt/original-fn #'sync.fields/sync-tables-one-at-a-time!)]
          (mt/with-dynamic-fn-redefs [sync.fields/sync-tables-one-at-a-time! (fn [database entries]
                                                                               (swap! one-at-a-time into (map (comp :name :table)) entries)
                                                                               (sync-one! database entries))]
            (sync/sync-database! (:id db)))
          (is (= #{"transactions"} @one-at-a-time)))
        (finally
          (database/delete-databases! [(:id db)]))))))
