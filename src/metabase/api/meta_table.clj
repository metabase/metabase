(ns metabase.api.meta-table
  "/api/meta/table endpoints."
  (:require [compojure.core :refer [GET]]
            [korma.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [table :refer [Table]])))

(defendpoint GET "/:id/query_metadata" [id]
  (or-404-> (sel :one Table :id id)
    (hydrate :db :fields)))

(defendpoint GET "/" [org]
  (let [dbs (->> (sel :many Database :organization_id org)    ; create dict of db_id -> db
                 (mapcat (fn [db] [(:id db) db]))
                 (apply assoc {}))
        db-ids (keys dbs)]
    (->> (sel :many Table :db_id [in db-ids] (order :name :ASC))
         (map (fn [table]                                      ; reduce the number of DB calls by setting `:database` for each Table by pulling from `dbs` above
                (assoc table :db (dbs (:db_id table))))))))

(define-routes)
