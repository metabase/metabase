(ns metabase.driver.sync-test
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [h2 :as h2]
                             [interface :as i]
                             [sync :as sync])
            [metabase.driver.generic-sql.util :refer [korma-entity]]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.test-data :refer :all]
            [metabase.test.util :refer [resolve-private-fns]]))

(def users-table
  (delay (sel :one Table :name "USERS")))

(def venues-table
  (delay (sel :one Table :name "VENUES")))

(def korma-users-table
  (delay (korma-entity @users-table)))

(def users-name-field
  (delay (sel :one Field :id (field->id :users :name))))


;; ## TEST PK SYNCING
(expect [:id
         nil
         :id
         :latitude
         :id]
  (let [get-special-type (fn [] (sel :one :field [Field :special_type] :id (field->id :venues :id)))]
    [;; Special type should be :id to begin with
     (get-special-type)
     ;; Clear out the special type
     (do (upd Field (field->id :venues :id) :special_type nil)
         (get-special-type))
     ;; Calling sync-table! should set the special type again
     (do (driver/sync-table! @venues-table)
         (get-special-type))
     ;; sync-table! should *not* change the special type of fields that are marked with a different type
     (do (upd Field (field->id :venues :id) :special_type :latitude)
         (get-special-type))
     ;; Make sure that sync-table runs set-table-pks-if-needed!
     (do (upd Field (field->id :venues :id) :special_type nil)
         (driver/sync-table! @venues-table)
         (get-special-type))]))

;; ## FK SYNCING

;; Check that Foreign Key relationships were created on sync as we expect

(expect (field->id :venues :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :checkins :venue_id)))

(expect (field->id :users :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :checkins :user_id)))

(expect (field->id :categories :id)
  (sel :one :field [ForeignKey :destination_id] :origin_id (field->id :venues :category_id)))

;; Check that sync-table! causes FKs to be set like we'd expect
(expect [[:fk true]
         [nil false]
         [:fk true]]
  (let [field-id (field->id :checkins :user_id)
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
     (let [table (sel :one Table :id (table->id :checkins))]
       (driver/sync-table! table)
       (get-special-type-and-fk-exists?))]))

;; ## Tests for DETERMINE-FK-TYPE
;; Since COUNT(category_id) > COUNT(DISTINCT(category_id)) the FK relationship should be Mt1
(expect :Mt1
  (sync/determine-fk-type (sel :one Field :id (field->id :venues :category_id))))

;; Since COUNT(id) == COUNT(DISTINCT(id)) the FK relationship should be 1t1
;; (yes, ID isn't really a FK field, but determine-fk-type doesn't need to know that)
(expect :1t1
  (sync/determine-fk-type (sel :one Field :id (field->id :venues :id))))
