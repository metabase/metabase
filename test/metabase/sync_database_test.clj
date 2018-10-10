(ns ^:deprecated metabase.sync-database-test
  "Tests for sync behavior that use a imaginary `SyncTestDriver`. These are kept around mainly because they've already
  been written. For newer sync tests see `metabase.sync.*` test namespaces.

  Your new tests almost certainly do not belong in this namespace. Please put them in ones mirroring the location of
  the specific part of sync you're testing."
  (:require [expectations :refer :all]
            [metabase
             [driver :as driver]
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test.mock.util :as mock-util]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        End-to-end 'MovieDB' Sync Tests                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; These tests make up a fake driver and then confirm that sync uses the various methods defined by the driver to
;; correctly sync appropriate metadata rows (Table/Field/etc.) in the Application DB

(def ^:private sync-test-tables
  {"movie"  {:name   "movie"
             :schema "default"
             :fields #{{:name          "id"
                        :database-type "SERIAL"
                        :base-type     :type/Integer
                        :special-type  :type/PK}
                       {:name          "title"
                        :database-type "VARCHAR"
                        :base-type     :type/Text
                        :special-type  :type/Title}
                       {:name          "studio"
                        :database-type "VARCHAR"
                        :base-type     :type/Text}}}
   "studio" {:name   "studio"
             :schema nil
             :fields #{{:name          "studio"
                        :database-type "VARCHAR"
                        :base-type     :type/Text
                        :special-type  :type/PK}
                       {:name          "name"
                        :database-type "VARCHAR"
                        :base-type     :type/Text}}}})


;; TODO - I'm 90% sure we could just reüse the "MovieDB" instead of having this subset of it used here
(defrecord ^:private SyncTestDriver []
  clojure.lang.Named
  (getName [_] "SyncTestDriver"))


(defn- describe-database [& _]
  {:tables (set (for [table (vals sync-test-tables)]
                  (dissoc table :fields)))})

(defn- describe-table [_ _ table]
  (get sync-test-tables (:name table)))

(defn- describe-table-fks [_ _ table]
  (set (when (= "movie" (:name table))
         #{{:fk-column-name   "studio"
            :dest-table       {:name   "studio"
                               :schema nil}
            :dest-column-name "studio"}})))

(extend SyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:describe-database        describe-database
          :describe-table           describe-table
          :describe-table-fks       describe-table-fks
          :features                 (constantly #{:foreign-keys})
          :details-fields           (constantly [])
          :process-query-in-context mock-util/process-query-in-context}))


(driver/register-driver! :sync-test (SyncTestDriver.))


(defn- table-details [table]
  (into {} (-> (dissoc table :db :pk_field :field_values)
               (assoc :fields (for [field (db/select Field, :table_id (:id table), {:order-by [:name]})]
                                (into {} (-> (dissoc field
                                                     :table :db :children :qualified-name :qualified-name-components
                                                     :values :target)
                                             (update :fingerprint map?)
                                             (update :fingerprint_version (complement zero?))))))
               tu/boolean-ids-and-timestamps)))

(def ^:private table-defaults
  {:active                  true
   :caveats                 nil
   :created_at              true
   :db_id                   true
   :description             nil
   :entity_name             nil
   :entity_type             :entity/GenericTable
   :id                      true
   :points_of_interest      nil
   :rows                    nil
   :schema                  nil
   :show_in_getting_started false
   :updated_at              true
   :visibility_type         nil
   :fields_hash             true})

(def ^:private field-defaults
  {:active              true
   :caveats             nil
   :created_at          true
   :description         nil
   :fingerprint         false
   :fingerprint_version false
   :fk_target_field_id  false
   :has_field_values    nil
   :id                  true
   :last_analyzed       false
   :parent_id           false
   :points_of_interest  nil
   :position            0
   :preview_display     true
   :special_type        nil
   :table_id            true
   :updated_at          true
   :visibility_type     :normal
   :settings            nil})

;; ## SYNC DATABASE
(expect
  [(merge table-defaults
          {:schema       "default"
           :name         "movie"
           :display_name "Movie"
           :fields       [(merge field-defaults
                                 {:name          "id"
                                  :display_name  "ID"
                                  :database_type "SERIAL"
                                  :base_type     :type/Integer
                                  :special_type  :type/PK})
                          (merge field-defaults
                                 {:name               "studio"
                                  :display_name       "Studio"
                                  :database_type      "VARCHAR"
                                  :base_type          :type/Text
                                  :fk_target_field_id true
                                  :special_type       :type/FK})
                          (merge field-defaults
                                 {:name          "title"
                                  :display_name  "Title"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :special_type  :type/Title})]})
   (merge table-defaults
          {:name         "studio"
           :display_name "Studio"
           :fields       [(merge field-defaults
                                 {:name          "name"
                                  :display_name  "Name"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text})
                          (merge field-defaults
                                 {:name          "studio"
                                  :display_name  "Studio"
                                  :database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :special_type  :type/PK})]})]
  (tt/with-temp Database [db {:engine :sync-test}]
    (sync/sync-database! db)
    ;; we are purposely running the sync twice to test for possible logic issues which only manifest on resync of a
    ;; database, such as adding tables that already exist or duplicating fields
    (sync/sync-database! db)
    (mapv table-details (db/select Table, :db_id (u/get-id db), {:order-by [:name]}))))


;; ## SYNC TABLE

(expect
  (merge table-defaults
         {:schema       "default"
          :name         "movie"
          :display_name "Movie"
          :fields       [(merge field-defaults
                                {:name          "id"
                                 :display_name  "ID"
                                 :database_type "SERIAL"
                                 :base_type     :type/Integer
                                 :special_type  :type/PK})
                         (merge field-defaults
                                {:name          "studio"
                                 :display_name  "Studio"
                                 :database_type "VARCHAR"
                                 :base_type     :type/Text})
                         (merge field-defaults
                                {:name          "title"
                                 :display_name  "Title"
                                 :database_type "VARCHAR"
                                 :base_type     :type/Text
                                 :special_type  :type/Title})]})
  (tt/with-temp* [Database [db    {:engine :sync-test}]
                  Table    [table {:name   "movie"
                                   :schema "default"
                                   :db_id  (u/get-id db)}]]
    (sync/sync-table! table)
    (table-details (Table (:id table)))))


;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; !!                                                                                                               !!
;; !! HEY! Your tests probably don't belong in this namespace! Put them in one appropriate to the specific part of  !!
;; !!                                            sync they are testing.                                             !!
;; !!                                                                                                               !!
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
