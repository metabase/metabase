(ns metabase.api.meta.db
  "/api/meta/db endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST PUT DELETE]]
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
  (require-params org)
  (check-403 (org-can-read org))
  (-> (sel :many Database :organization_id org (order :name))
      (simple-batched-hydrate Org :organization_id :organization)))

(defendpoint POST "/" [:as {{:keys [org name engine details] :as body} :body}]
  (require-params org name engine details)
  (check (contains? (set (map first driver/available-drivers)) engine) [400 "Invalid engine type specified."])
  (check-403 (org-can-write org))
  (ins Database :organization_id org :name name :engine engine :details details))

(defendpoint GET "/form_input" []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

;Stub function that will eventually validate a connection string
(defendpoint POST "/validate" [:as {{:keys [host port]} :body}]
  (require-params host port)
  (let [response-invalid (fn [m] {:status 400 :body {:valid false :message m}})]
    (cond
      (not (u/host-up? host)) (response-invalid "Host not reachable")
      (not (u/host-port-up? host port)) (response-invalid "Invalid port")
      :else {:valid true})))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint PUT "/:id" [id :as {body :body}]
  (write-check Database id)
  (check-500 (->> (u/select-non-nil-keys body :name :engine :details)
                  (medley/mapply upd Database id)))
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
