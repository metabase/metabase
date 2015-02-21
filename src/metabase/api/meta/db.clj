(ns metabase.api.meta.db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET POST DELETE]]
            [korma.core :refer :all]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.postgres.sync :as pgsync]
            (metabase.models common
                             [hydrate :refer [hydrate]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [org :refer [org-can-read org-can-write]]
                             [table :refer [Table]])))

(defendpoint GET "/" [org]
  (check-403 (org-can-read org))
  (-> (sel :many Database :organization_id org (order :name))
      (hydrate :organization)))

(defendpoint POST "/" [:as {{:keys [org] :as body} :body}]
  (check-403 (org-can-write org))
  (->> (-> body
           (select-keys [:name :engine :details])
           (assoc :organization_id org))
       (medley/mapply ins Database)))

(defendpoint GET "/form_input" []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint DELETE "/:id" [id]
  (let-404 [{:keys [can_write]} (sel :one Database :id id)]
    (check-403 @can_write))
  (del Database :id id))

(defendpoint GET "/:id/autocomplete_suggestions" [id prefix]
  (let-404 [{:keys [can_read]} (sel :one Database :id id)]
    (check-403 @can_read))
  (let [prefix-len (count prefix)
        table-id->name (->> (sel :many [Table :id :name] :db_id id)                                             ; fetch all name + ID of all Tables for this DB
                            (map (fn [{:keys [id name]}]                                                         ; make a map of Table ID -> Table Name
                                   {id name}))
                            (apply merge {}))
        matching-tables (->> (vals table-id->name)                                                              ; get all Table names that start with PREFIX
                             (filter (fn [^String table-name]
                                       (= prefix (.substring table-name 0 prefix-len))))
                             (map (fn [table-name]                                                               ; return them in the format [table_name "Table"]
                                    [table-name "Table"])))
        fields (->> (sel :many [Field :name :base_type :special_type :table_id]                                 ; get all Fields with names that start with PREFIX
                         :table_id [in (keys table-id->name)]                                                   ; whose Table is in this DB
                         :name [like (str prefix "%")])
                    (map (fn [{:keys [name base_type special_type table_id]}]                                    ; return them in the format
                           [name (str (table-id->name table_id) " " base_type (when special_type                ; [field_name "table_name base_type special_type"]
                                                                                (str " " special_type)))])))]
    (concat matching-tables fields)))                                                                           ; return combined seq of Fields + Tables

(defendpoint GET "/:id/tables" [id]
  (sel :many Table :db_id id (order :name)))

(defendpoint POST "/:id/sync" [id]
  (let-404 [db (sel :one Database :id id)]   ; run sync-tables asynchronously.
    (future (pgsync/sync-tables db)))        ; TODO - this only works for Postgres right now (since that's the only driver we have)
  {:status :ok})

(define-routes)
