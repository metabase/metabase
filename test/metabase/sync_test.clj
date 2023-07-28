(ns ^:deprecated ^:mb/once metabase.sync-test
  "Tests for sync behavior that use a imaginary `SyncTestDriver`. These are kept around mainly because they've already
  been written. For newer sync tests see `metabase.sync.*` test namespaces.

  Your new tests almost certainly do not belong in this namespace. Please put them in ones mirroring the location of
  the specific part of sync you're testing."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.mock.util :as mock.util]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        End-to-end 'MovieDB' Sync Tests                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These tests make up a fake driver and then confirm that sync uses the various methods defined by the driver to
;; correctly sync appropriate metadata rows (Table/Field/etc.) in the Application DB

(def ^:private sync-test-tables
  {"movie"  {:name   "movie"
             :schema "default"
             :fields #{{:name              "id"
                        :database-type     "SERIAL"
                        :base-type         :type/Integer
                        :semantic-type     :type/PK
                        :database-is-auto-increment true
                        :json-unfolding    false
                        :database-position 0}
                       {:name              "title"
                        :database-type     "VARCHAR"
                        :base-type         :type/Text
                        :semantic-type     :type/Title
                        :database-is-auto-increment false
                        :json-unfolding    false
                        :database-position 1}
                       {:name              "studio"
                        :database-type     "VARCHAR"
                        :base-type         :type/Text
                        :database-is-auto-increment false
                        :json-unfolding    false
                        :database-position 2}}
             :description nil}
   "studio" {:name   "studio"
             :schema nil
             :fields #{{:name              "studio"
                        :database-type     "VARCHAR"
                        :base-type         :type/Text
                        :semantic-type     :type/PK
                        :database-is-auto-increment false
                        :json-unfolding    false
                        :database-position 0}
                       {:name              "name"
                        :database-type     "VARCHAR"
                        :base-type         :type/Text
                        :database-is-auto-increment false
                        :json-unfolding    false
                        :database-position 1}}
             :description ""}})

(driver/register! ::sync-test, :abstract? true)

(defmethod driver/describe-database ::sync-test
  [& _]
  {:tables (set (for [table (vals sync-test-tables)]
                  (dissoc table :fields)))})

(defmethod driver/describe-table ::sync-test
  [_ _ table]
  (get sync-test-tables (:name table)))

(defmethod driver/describe-table-fks ::sync-test
  [_ _ table]
  (set (when (= "movie" (:name table))
         #{{:fk-column-name   "studio"
            :dest-table       {:name   "studio"
                               :schema nil}
            :dest-column-name "studio"}})))

(defmethod driver/database-supports? [::sync-test :foreign-keys]
  [_driver _feature _db]
  true)

(defmethod driver/mbql->native ::sync-test
  [_ query]
  query)

(defmethod driver/execute-reducible-query ::sync-test
  [_ query _ respond]
  (mock.util/mock-execute-reducible-query query respond))

(defn- table-details [table]
  (into {} (-> (dissoc table :db :pk_field :field_values)
               (assoc :fields (for [field (t2/select Field, :table_id (:id table), {:order-by [:name]})]
                                (into {} (-> field
                                             (update :fingerprint map?)
                                             (update :fingerprint_version (complement zero?))))))
               tu/boolean-ids-and-timestamps)))

(defn- table-defaults []
  (merge
   (mt/object-defaults Table)
   {:created_at  true
    :db_id       true
    :entity_type :entity/GenericTable
    :id          true
    :updated_at  true}))

(defn- field-defaults []
  (merge
   (mt/object-defaults Field)
   {:created_at          true
    :fingerprint         false
    :fingerprint_version false
    :fk_target_field_id  false
    :database_is_auto_increment false
    :id                  true
    :last_analyzed       false
    :parent_id           false
    :position            0
    :json_unfolding      false
    :table_id            true
    :updated_at          true}))

(defn- field-defaults-with-fingerprint []
  (assoc (field-defaults)
    :last_analyzed       true
    :fingerprint_version true
    :fingerprint         true))

(defn- field:movie-id []
  (merge
   (field-defaults)
   {:name              "id"
    :display_name      "ID"
    :database_type     "SERIAL"
    :base_type         :type/Integer
    :effective_type    :type/Integer
    :semantic_type     :type/PK
    :database_position 0
    :database_is_auto_increment true
    :position          0}))

(defn- field:movie-studio []
  (merge
   (field-defaults-with-fingerprint)
   {:name               "studio"
    :display_name       "Studio"
    :database_type      "VARCHAR"
    :base_type          :type/Text
    :effective_type     :type/Text
    :fk_target_field_id true
    :semantic_type      :type/FK
    :database_position  2
    :position           2}))

(defn- field:movie-title []
  (merge
   (field-defaults-with-fingerprint)
   {:name              "title"
    :display_name      "Title"
    :database_type     "VARCHAR"
    :base_type         :type/Text
    :effective_type    :type/Text
    :semantic_type     :type/Title
    :database_position 1
    :position          1
    :has_field_values  :auto-list}))

(defn- field:studio-name []
  (merge
   (field-defaults-with-fingerprint)
   {:name              "name"
    :display_name      "Name"
    :database_type     "VARCHAR"
    :base_type         :type/Text
    :effective_type    :type/Text
    :semantic_type     :type/Name
    :database_position 1
    :position          1
    :has_field_values  :auto-list}))

;; `studio.studio`? huh?
(defn- field:studio-studio []
  (merge
   (field-defaults)
   {:name              "studio"
    :display_name      "Studio"
    :database_type     "VARCHAR"
    :base_type         :type/Text
    :effective_type    :type/Text
    :semantic_type     :type/PK
    :database_position 0
    :position          0}))

(deftest sync-database-test
  (t2.with-temp/with-temp [Database db {:engine ::sync-test}]
    (sync/sync-database! db)
    (let [[movie studio] (mapv table-details (t2/select Table :db_id (u/the-id db) {:order-by [:name]}))]
      (testing "`movie` Table"
        (is (= (merge
                (table-defaults)
                {:schema              "default"
                 :name                "movie"
                 :display_name        "Movie"
                 :initial_sync_status "complete"
                 :fields              [(field:movie-id) (field:movie-studio) (field:movie-title)]})
               movie)))
      (testing "`studio` Table"
        (is (= (merge
                (table-defaults)
                {:name                "studio"
                 :display_name        "Studio"
                 :initial_sync_status "complete"
                 :fields              [(field:studio-name) (field:studio-studio)]})
               studio)))))
  (testing "Returns results from sync-database step"
    (t2.with-temp/with-temp [Database db {:engine ::sync-test}]
      (let [results (sync/sync-database! db)]
        (is (= ["metadata" "analyze" "field-values"]
               (map :name results)))))))

(deftest sync-table-test
  (mt/with-temp* [Database [db {:engine ::sync-test}]
                  Table    [table {:name "movie", :schema "default", :db_id (u/the-id db)}]]
    (sync/sync-table! table)
    (is (= (merge
            (table-defaults)
            {:schema              "default"
             :name                "movie"
             :display_name        "Movie"
             :initial_sync_status "complete"
             :fields              [(field:movie-id)
                                   (assoc (field:movie-studio)
                                          :fk_target_field_id false
                                          :semantic_type nil
                                          :has_field_values :auto-list)
                                   (field:movie-title)]})
           (table-details (t2/select-one Table :id (:id table)))))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !! HEY! Your tests probably don't belong in this namespace! Put them in one appropriate to the specific part of  !!
;; !!                                            sync they are testing.                                             !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
