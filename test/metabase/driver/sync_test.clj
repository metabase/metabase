(ns metabase.driver.sync-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [h2 :as h2]
                             [sync :as sync])
            [metabase.driver.generic-sql :refer [korma-entity]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [field-values :refer [FieldValues]]
                             [foreign-key :refer [ForeignKey]]
                             [hydrate :refer :all]
                             [table :refer [Table]])
            (metabase.test [data :refer :all]
                           [util :refer [resolve-private-fns] :as tu])
            (metabase.test.data [datasets :as datasets]
                                [interface :refer [create-database-definition]])
            [metabase.util :as u]))

(def sync-test-tables
  {"movie"  {:name "movie"
             :schema "default"
             :fields #{{:name      "id"
                        :base-type :IntegerField}
                       {:name      "title"
                        :base-type :TextField}
                       {:name      "studio"
                        :base-type :TextField}}}
   "studio" {:name "studio"
             :schema nil
             :fields #{{:name         "studio"
                        :base-type    :TextField
                        :special-type :id}
                       {:name      "name"
                        :base-type :TextField}}}})

(defrecord SyncTestDriver []
  clojure.lang.Named
  (getName [_] "SyncTestDriver"))

(extend SyncTestDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table       (constantly nil)
          :describe-database   (fn [_ _]
                                 {:tables (set (->> (vals sync-test-tables)
                                                    (map #(dissoc % :fields))))})
          :describe-table      (fn [_ table]
                                 (get sync-test-tables (:name table)))
          :descrite-table-fks  (fn [_ _]
                                 #{{:fk-column-name   "studio"
                                    :dest-table-name  "studio"
                                    :dest-column-name "studio"}})}))

;(driver/register-driver! :sync-test (SyncTestDriver.))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (Table (id :venues))))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (Field (id :users :name))))


(defn table-details [table]
  (into {} (-> (dissoc table :id :db :db_id :created_at :updated_at :pk_field :field_values)
               (assoc :fields (->> (sel :many Field :table_id (:id table) (k/order :name))
                                   (map #(dissoc % :table_id :table :db :children :qualified-name :qualified-name-components :created_at :updated_at :id :values :target))
                                   (map #(into {} %)))))))

;; ## SYNC DATABASE
(expect
  [{:schema "default"
    :name   "movie"
    :display_name "Movie"
    :description nil
    :entity_type nil
    :entity_name nil
    :visibility_type nil
    :rows   nil
    :active true
    :fields [{:description nil,
              :special_type :id,
              :name "id",
              :active true,
              :parent_id nil,
              :field_type :info,
              :position 0,
              :preview_display true,
              :display_name "Id",
              :base_type :IntegerField}
             {:description nil,
              :special_type nil,
              :name "studio",
              :active true,
              :parent_id nil,
              :field_type :info,
              :position 0,
              :preview_display true,
              :display_name "Studio",
              :base_type :TextField}
             {:description nil,
              :special_type nil,
              :name "title",
              :active true,
              :parent_id nil,
              :field_type :info,
              :position 0,
              :preview_display true,
              :display_name "Title",
              :base_type :TextField}]}
   {:schema nil
    :name   "studio"
    :display_name "Studio"
    :description nil
    :entity_type nil
    :entity_name nil
    :visibility_type nil
    :rows   nil
    :active true
    :fields [{:description nil,
              :special_type :name,
              :name "name",
              :active true,
              :parent_id nil,
              :field_type :info,
              :position 0,
              :preview_display true,
              :display_name "Name",
              :base_type :TextField}
             {:description nil,
              :special_type :id,
              :name "studio",
              :active true,
              :parent_id nil,
              :field_type :info,
              :position 0,
              :preview_display true,
              :display_name "Studio",
              :base_type :TextField}]}]
  (tu/with-temp Database [fake-db {:name    "sync-test"
                                   :engine  :sync-test
                                   :details {}}]
    (sync/sync-database! (SyncTestDriver.) fake-db)
    ;; we are purposely running the sync twice to test for possible logic issues which only manifest
    ;; on resync of a database, such as adding tables that already exist or duplicating fields
    (sync/sync-database! (SyncTestDriver.) fake-db)
    (->> (sel :many Table :db_id (:id fake-db) (k/order :name))
         (mapv table-details))))


;; ## SYNC TABLE

(expect
  {:schema "default"
   :name   "movie"
   :display_name "Movie"
   :description nil
   :entity_type nil
   :entity_name nil
   :visibility_type nil
   :rows   nil
   :active true
   :fields [{:description nil,
             :special_type :id,
             :name "id",
             :active true,
             :parent_id nil,
             :field_type :info,
             :position 0,
             :preview_display true,
             :display_name "Id",
             :base_type :IntegerField}
            {:description nil,
             :special_type nil,
             :name "studio",
             :active true,
             :parent_id nil,
             :field_type :info,
             :position 0,
             :preview_display true,
             :display_name "Studio",
             :base_type :TextField}
            {:description nil,
             :special_type nil,
             :name "title",
             :active true,
             :parent_id nil,
             :field_type :info,
             :position 0,
             :preview_display true,
             :display_name "Title",
             :base_type :TextField}]}
  (tu/with-temp Database [fake-db {:name    "sync-test"
                                   :engine  :sync-test
                                   :details {}}]
    (tu/with-temp Table [fake-table {:name "movie"
                                     :schema "default"
                                     :db_id (:id fake-db)
                                     :active true}]
      (sync/sync-table! (SyncTestDriver.) fake-table)
      (table-details (sel :one Table :id (:id fake-table))))))


;; ## Test that we will remove field-values when they aren't appropriate

(expect
  [[1,2,3]
   [1,2,3]]
  (tu/with-temp Database [fake-db {:name    "sync-test"
                                   :engine  :sync-test
                                   :details {}}]
    (tu/with-temp Table [fake-table {:name "movie"
                                     :schema "default"
                                     :db_id (:id fake-db)
                                     :active true}]
      (sync/sync-table! (SyncTestDriver.) fake-table)
      (let [{:keys [id]} (sel :one Field :table_id (:id fake-table) :name "title")]
        (tu/with-temp FieldValues [_ {:field_id id
                                      :values   "[1,2,3]"}]
          (let [starting (sel :one :field [FieldValues :values] :field_id id)]
            (sync/sync-table! (SyncTestDriver.) fake-table)
            [starting
             (sel :one :field [FieldValues :values] :field_id id)]))))))


;; ## Individual Helper Fns

;; infer-field-special-type

(expect nil (sync/infer-field-special-type {:name      "whatever"
                                            :base-type :foo}))
(expect :id (sync/infer-field-special-type {:name      "whatever"
                                            :base-type :TextField
                                            :pk?       :id}))
(expect :id (sync/infer-field-special-type {:name      "id"
                                            :base-type :IntegerField}))
(expect :category (sync/infer-field-special-type {:name         "whatever"
                                                  :base-type    :IntegerField
                                                  :special-type :category}))
(expect :country (sync/infer-field-special-type {:name      "country"
                                                 :base-type :TextField}))
(expect :state (sync/infer-field-special-type {:name      "state"
                                               :base-type :TextField}))


;; ## TEST PK SYNCING
(expect [:id
         nil
         :id
         :latitude
         :id]
  (let [get-special-type (fn [] (sel :one :field [Field :special_type] :id (id :venues :id)))]
    [;; Special type should be :id to begin with
     (get-special-type)
     ;; Clear out the special type
     (do (upd Field (id :venues :id) :special_type nil)
         (get-special-type))
     ;; Calling sync-table! should set the special type again
     (do (driver/sync-table! @venues-table)
         (get-special-type))
     ;; sync-table! should *not* change the special type of fields that are marked with a different type
     (do (upd Field (id :venues :id) :special_type :latitude)
         (get-special-type))
     ;; Make sure that sync-table runs set-table-pks-if-needed!
     (do (upd Field (id :venues :id) :special_type nil)
         (driver/sync-table! @venues-table)
         (get-special-type))]))

;; ## FK SYNCING

;; Check that Foreign Key relationships were created on sync as we expect

(expect (id :venues :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (id :checkins :venue_id)))

(expect (id :users :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (id :checkins :user_id)))

(expect (id :categories :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (id :venues :category_id)))

;; Check that sync-table! causes FKs to be set like we'd expect
(expect [[:fk true]
         [nil false]
         [:fk true]]
  (let [field-id (id :checkins :user_id)
        get-special-type-and-fk-exists? (fn []
                                          [(sel :one :field [Field :special_type] :id field-id)
                                           (exists? ForeignKey :origin_id field-id)])]
    [ ;; FK should exist to start with
     (get-special-type-and-fk-exists?)
     ;; Clear out FK / special_type
     (do (del ForeignKey :origin_id field-id)
         (upd Field field-id :special_type nil)
         (get-special-type-and-fk-exists?))
     ;; Run sync-table and they should be set again
     (let [table (Table (id :checkins))]
       (driver/sync-table! table)
       (get-special-type-and-fk-exists?))]))


;;; ## FieldValues Syncing

(let [get-field-values    (fn [] (sel :one :field [FieldValues :values] :field_id (id :venues :price)))
      get-field-values-id (fn [] (sel :one :id FieldValues :field_id (id :venues :price)))]
  ;; Test that when we delete FieldValues syncing the Table again will cause them to be re-created
  (expect
      [[1 2 3 4]  ; 1
       nil        ; 2
       [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (get-field-values)
     ;; 2. Delete the Field values, make sure they're gone
     (do (cascade-delete FieldValues :id (get-field-values-id))
         (get-field-values))
     ;; 3. Now re-sync the table and make sure they're back
     (do (driver/sync-table! @venues-table)
         (get-field-values))])

  ;; Test that syncing will cause FieldValues to be updated
  (expect
      [[1 2 3 4]  ; 1
       [1 2 3]    ; 2
       [1 2 3 4]] ; 3
    [ ;; 1. Check that we have expected field values to start with
     (get-field-values)
     ;; 2. Update the FieldValues, remove one of the values that should be there
     (do (upd FieldValues (get-field-values-id) :values [1 2 3])
         (get-field-values))
     ;; 3. Now re-sync the table and make sure the value is back
     (do (driver/sync-table! @venues-table)
         (get-field-values))]))


;;; ## mark-json-field!

(resolve-private-fns metabase.driver.sync values-are-valid-json?)

(def ^:const ^:private fake-values-seq-json
  "A sequence of values that should be marked is valid JSON.")

;; When all the values are valid JSON dicts they're valid JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"
                           "{\"this\":\"is\",\"valid\":\"json\"}"]))

;; When all the values are valid JSON arrays they're valid JSON
(expect true
  (values-are-valid-json? ["[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; Some combo of both can still be marked as JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           "[1, 2, 3, 4]"
                           "[1, 2, 3, 4]"]))

;; If the values have some valid JSON dicts but is mostly null, it's still valid JSON
(expect true
  (values-are-valid-json? ["{\"this\":\"is\",\"valid\":\"json\"}"
                           nil
                           nil]))

;; If every value is nil then the values should not be considered valid JSON
(expect false
  (values-are-valid-json? [nil, nil, nil]))

;; Check that things that aren't dictionaries or arrays aren't marked as JSON
(expect false (values-are-valid-json? ["\"A JSON string should not cause a Field to be marked as JSON\""]))
(expect false (values-are-valid-json? ["100"]))
(expect false (values-are-valid-json? ["true"]))
(expect false (values-are-valid-json? ["false"]))


(datasets/expect-with-engine :postgres
  :json
  (with-temp-db
    [_
     (create-database-definition "Postgres with a JSON Field"
       ["venues"
        [{:field-name "address", :base-type {:native "json"}}]
        [[(k/raw "to_json('{\"street\": \"431 Natoma\", \"city\": \"San Francisco\", \"state\": \"CA\", \"zip\": 94103}'::text)")]]])]
    (sel :one :field [Field :special_type] :id (id :venues :address))))
