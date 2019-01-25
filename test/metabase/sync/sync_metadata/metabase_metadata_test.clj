(ns metabase.sync.sync-metadata.metabase-metadata-test
  "Tests for the logic that syncs the `_metabase_metadata` Table."
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
            [metabase.test.mock.moviedb :as moviedb]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

;; Test that the `_metabase_metadata` table can be used to populate values for things like descriptions
(defn- get-table-and-fields-descriptions [table-or-id]
  (-> (db/select-one [Table :id :name :description], :id (u/get-id table-or-id))
      (hydrate :fields)
      (update :fields #(for [field %]
                         (select-keys field [:name :description])))
      tu/boolean-ids-and-timestamps))

(expect
  [{:name        "movies"
    :description nil
    :id          true
    :fields      [{:name "filming", :description nil}]}
   {:name        "movies"
    :description "A cinematic adventure."
    :id          true
    :fields      [{:name "filming", :description "If the movie is currently being filmed."}]}]
  (tt/with-temp* [Database [db {:engine ::moviedb/moviedb}]]
    ;; manually add in the movies table
    (let [table (db/insert! Table
                  :db_id  (u/get-id db)
                  :name   "movies"
                  :active true)]
      (db/insert! Field
        :database_type "BOOL"
        :base_type     :type/Boolean
        :table_id      (u/get-id table)
        :name          "filming")
      ;; here we go
      [(get-table-and-fields-descriptions table)
       (do
         (metabase-metadata/sync-metabase-metadata! db)
         (get-table-and-fields-descriptions table))])))
