(ns metabase.sync.sync-dynamic-test
  "Tests for databases with a so-called 'dynamic' schema, i.e. one that is not hard-coded somewhere.
   A Mongo database is an example of such a DB. "
  (:require [expectations :refer [expect]]
            [metabase
             [sync :as sync]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.test.mock.toucanery :as toucanery]
            [metabase.test.util :as tu]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn- remove-nonsense
  "Remove fields that aren't really relevant in the output for `tables` and their `fields`. Done for the sake of making
  debugging some of the tests below easier."
  [tables]
  (for [table tables]
    (-> (u/select-non-nil-keys table [:schema :name :fields])
        (update :fields (fn [fields]
                          (for [field fields]
                            (u/select-non-nil-keys
                             field
                             [:table_id :name :fk_target_field_id :parent_id :base_type :database_type])))))))

(defn- get-tables [database-or-id]
  (->> (hydrate (db/select Table, :db_id (u/get-id database-or-id), {:order-by [:id]}) :fields)
       (mapv tu/boolean-ids-and-timestamps)))

;; basic test to make sure syncing nested fields works. This is sort of a higher-level test.
(expect
  (remove-nonsense toucanery/toucanery-tables-and-fields)
  (tt/with-temp* [Database [db {:engine ::toucanery/toucanery}]]
    (sync/sync-database! db)
    (remove-nonsense (get-tables db))))
