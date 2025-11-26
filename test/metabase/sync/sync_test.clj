(ns ^:deprecated metabase.sync.sync-test
  "Tests for sync behavior that use a imaginary `SyncTestDriver`. These are kept around mainly because they've already
  been written. For newer sync tests see `metabase.sync.*` test namespaces.

  Your new tests almost certainly do not belong in this namespace. Please put them in ones mirroring the location of
  the specific part of sync you're testing."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.sync.sync :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.mock.util :as mock.util]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        End-to-end 'MovieDB' Sync Tests                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These tests make up a fake driver and then confirm that sync uses the various methods defined by the driver to
;; correctly sync appropriate metadata rows (Table/Field/etc.) in the Application DB

(driver/register! ::sync-test, :abstract? true)

(def ^:dynamic *supports-schemas?*
  "Whether the database supports schemas."
  true)

(defmethod driver/database-supports? [::sync-test :schemas] [_driver _feature _db] *supports-schemas?*)

(defn- sync-test-tables []
  {"movie"  {:name   "movie"
             :schema (when *supports-schemas?* "default")
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
             :schema (when *supports-schemas?* "public")
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

(defmethod driver/describe-database* ::sync-test
  [& _]
  {:tables (set (for [table (vals (sync-test-tables))]
                  (dissoc table :fields)))})

(defmethod driver/describe-table ::sync-test
  [_ _ table]
  (get (sync-test-tables) (:name table)))

#_{:clj-kondo/ignore [:deprecated-var]}
(defmethod driver/describe-table-fks ::sync-test
  [_ _ table]
  (set (when (= "movie" (:name table))
         #{{:fk-column-name   "studio"
            :dest-table       {:name   "studio"
                               :schema (when *supports-schemas?* "public")}
            :dest-column-name "studio"}})))

(defmethod driver/database-supports? [::sync-test :metadata/key-constraints]
  [_driver _feature _db]
  true)

(defmethod driver/mbql->native ::sync-test
  [_ _query]
  {:query "SQL string"})

(defn- ^:dynamic *execute-response*
  [query respond]
  (mock.util/mock-execute-reducible-query query respond))

(defmethod driver/execute-reducible-query ::sync-test
  [_ query _ respond]
  (*execute-response* query respond))

(defn- table-details [table]
  (into {} (-> (dissoc table :db :pk_field :field_values)
               (assoc :fields (for [field (t2/select :model/Field, :table_id (:id table), {:order-by [:name]})]
                                (into {} (-> field
                                             (update :fingerprint map?)
                                             (update :fingerprint_version (complement zero?))))))
               tu/boolean-ids-and-timestamps)))

(defn- table-defaults []
  (merge
   (mt/object-defaults :model/Table)
   {:created_at  true
    :db_id       true
    :entity_type :entity/GenericTable
    :id          true
    :archived_at false
    :deactivated_at false
    :updated_at  true
    :owner_user_id false}))

(defn- field-defaults []
  (merge
   (mt/object-defaults :model/Field)
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

(defn- expected-movie-table []
  (merge (table-defaults)
         {:schema              (when *supports-schemas?* "default")
          :name                "movie"
          :display_name        "Movie"
          :initial_sync_status "complete"
          :fields              [(field:movie-id) (field:movie-studio) (field:movie-title)]
          :description         nil
          :collection_id       false}))

(defn- expected-studio-table []
  (merge (table-defaults)
         {:schema              (when *supports-schemas?* "public")
          :name                "studio"
          :display_name        "Studio"
          :initial_sync_status "complete"
          :fields              [(field:studio-name) (field:studio-studio)]
          :description         ""
          :collection_id       false}))

(deftest sync-database-test
  (doseq [supports-schemas? [true false]]
    (testing (str "[[sync/sync-database!]] works if `driver/supports-schemas?` returns " supports-schemas?)
      (binding [*supports-schemas?*                      supports-schemas?
                sync-util/*log-exceptions-and-continue?* false]
        (mt/with-temp [:model/Database db {:engine ::sync-test}]
          (let [results (sync/sync-database! db)]
            (testing "Returns results from sync-database step"
              (is (= ["metadata" "analyze" "field-values"]
                     (map :name results)))))
          (let [[movie studio] (mapv table-details (t2/select :model/Table :db_id (u/the-id db) {:order-by [:name]}))]
            (testing "Tables and Fields are synced"
              (is (= (expected-movie-table) movie))
              (is (= (expected-studio-table) studio)))))))))

(deftest sync-table-test
  (doseq [supports-schemas? [true false]]
    (testing (str "[[sync/sync-table!]] works if `driver/supports-schemas? returns " supports-schemas?)
      (binding [*supports-schemas?*                      supports-schemas?
                sync-util/*log-exceptions-and-continue?* false]
        (mt/with-temp [:model/Database db     {:engine ::sync-test}
                       :model/Table    movie  {:name        "movie"
                                               :schema      (when *supports-schemas?* "default")
                                               :db_id       (u/the-id db)
                                               :description nil}
                       :model/Table    studio {:name        "studio"
                                               :schema      (when *supports-schemas?* "public")
                                               :db_id       (u/the-id db)
                                               :description ""}]
          (sync/sync-table! studio)
          (sync/sync-table! movie)
          (let [[movie studio] (mapv table-details (t2/select :model/Table :db_id (u/the-id db) {:order-by [:name]}))]
            (testing "Tables and Fields are synced"
              (is (= (expected-movie-table) movie))
              (is (= (expected-studio-table) studio)))))))))

(deftest scanning-test
  (mt/with-temp [:model/Database db {:engine ::sync-test}]
    (sync/sync-database! db)
    (let [query-field-and-values (fn []
                                   (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id db) :name "movie")
                                         title-field (t2/select-one :model/Field :table_id table-id :name "title")
                                         field-value (t2/select-one :model/FieldValues :field_id (:id title-field))]
                                     {:f title-field :fv field-value}))
          field-and-values (query-field-and-values)
          field (:f field-and-values)
          get-or-create-vals (fn [col]
                               (binding [*execute-response* (fn [_query respond] (respond {:cols [{:name "field"}]}
                                                                                          (partition-all 1 col)))]
                                 (into [] (field-values/get-or-create-full-field-values! (:f (query-field-and-values))))))]
      (testing "Initial sync set to auto-list but no fieldvalues"
        (is (=? {:f {:name "title" :has_field_values :auto-list}
                 :fv nil}
                field-and-values)))

      (testing "After querying field values they are stored"
        (get-or-create-vals ["a" "b" "c"])
        (is (=? {:f {:name "title" :has_field_values :auto-list}
                 :fv {:values ["a" "b" "c"] :has_more_values false}}
                (query-field-and-values))))

      (testing "After clearing and querying use long field values"
        (field-values/clear-field-values-for-field! field)
        (get-or-create-vals ["a" "b" "c" (apply str (map str (range 100000)))])
        (is (=? {:f {:name "title" :has_field_values :auto-list}
                 :fv {:values ["a" "b" "c"] :has_more_values true}}
                (query-field-and-values))))

      (testing "Querying again will use cache"
        (get-or-create-vals ["x" "y" "z"])
        (is (=? {:f {:name "title" :has_field_values :auto-list}
                 :fv {:values ["a" "b" "c"] :has_more_values true}}
                (query-field-and-values))))

      (testing "New values come in after sync"
        (binding [*execute-response* (fn [_query respond] (respond {:cols [{:name "field"}]}
                                                                   (partition-all 1 ["d" "e" "f"])))]
          (sync/sync-database! db))
        (is (=? {:f {:name "title" :has_field_values :auto-list}
                 :fv {:values ["d" "e" "f"] :has_more_values false}}
                (query-field-and-values))))

      (testing "After setting to search it should stay search and sync removes field-values"
        (t2/update! :model/Field (:id field) {:has_field_values "search"})
        (sync/sync-database! db)
        (get-or-create-vals ["x" "y" "z"])
        (is (=? {:f {:name "title" :has_field_values :search}
                 :fv nil}
                (query-field-and-values)))))))

(driver/register! ::sync-database-error-test)

(defmethod driver/describe-database* ::sync-database-error-test
  [_driver _database]
  (throw (doto (Exception. "OOPS!")
           (.setStackTrace (into-array StackTraceElement [])))))

(deftest sync-database!-error-test
  (testing "Errors in sync-database! should be caught and handled correctly (#45848)"
    (mt/with-temp [:model/Database db {:engine ::sync-database-error-test}]
      (binding [sync-util/*log-exceptions-and-continue?* true]
        (let [results (sync/sync-database! db)]
          (testing "Skips the metadata step"
            (is (= ["analyze" "field-values"]
                   (map :name results)))))))))

;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !! HEY! Your tests probably don't belong in this namespace! Put them in one appropriate to the specific part of  !!
;; !!                                            sync they are testing.                                             !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
