(ns metabase.api.meta.db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [korma.core :refer :all]
            [medley.core :as medley]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models common
                             [hydrate :refer [hydrate simple-batched-hydrate]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [org :refer [Org org-can-read org-can-write]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(defendpoint GET "/" [org]
  {org Required}
  (read-check Org org)
  (-> (sel :many Database :organization_id org (order :name))
      (simple-batched-hydrate Org :organization_id :organization)))

(defendpoint POST "/" [:as {{:keys [org name engine details] :as body} :body}]
  {org     Required
   name    [Required NonEmptyString]
   engine  Required                  ; TODO - check that engine is a valid engine
   details [Required IsDict]}
  (write-check Org org)
  (ins Database :organization_id org :name name :engine engine :details details))

(defendpoint GET "/form_input" []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint PUT "/:id" [id :as {{:keys [name engine details]} :body}]
  {name NonEmptyString, details IsDict} ; TODO - check that engine is a valid choice
  (write-check Database id)
  (check-500 (upd-non-nil-keys Database id
                               :name name
                               :engine engine
                               :details details))
  (sel :one Database :id id))

(defendpoint DELETE "/:id" [id]
  (write-check Database id)
  (del Database :id id))

(defendpoint GET "/:id/autocomplete_suggestions" [id prefix]
  (read-check Database id)
  (let [prefix-len (count prefix)
        table-id->name (->> (sel :many [Table :id :name] :db_id id)                                             ; fetch all name + ID of all Tables for this DB
                            (map (fn [{:keys [id name]}]                                                         ; make a map of Table ID -> Table Name
                                   {id name}))
                            (into {}))
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

(defendpoint GET "/:id/idfields" [id]
  (read-check Database id)
  (let [table_ids (sel :many :id Table :db_id id)]
    (-> (sel :many Field :table_id [in table_ids] :special_type "id")
        (simple-batched-hydrate Table :table_id :table))))

(defendpoint POST "/:id/sync" [id]
  (let-404 [db (sel :one Database :id id)]   ; TODO - run sync-tables asynchronously
           (driver/sync-tables db))
  {:status :ok})

(define-routes)
