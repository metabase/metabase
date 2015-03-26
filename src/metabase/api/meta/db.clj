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
                             [hydrate :refer [hydrate]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [org :refer [Org org-can-read org-can-write]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(defannotation DBEngine [symb value :nillable]
  (checkp-contains? (set (map first driver/available-drivers)) symb value))

(defendpoint GET "/" [org]
  {org Required}
  (read-check Org org)
  (-> (sel :many Database :organization_id org (order :name))
      (hydrate :organization)))

(defendpoint POST "/" [:as {{:keys [org name engine details] :as body} :body}]
  {org     Required
   name    [Required NonEmptyString]
   engine  [Required DBEngine]
   details [Required Dict]}
  (write-check Org org)
  (let-500 [new-db (ins Database :organization_id org :name name :engine engine :details details)]
    ;; kick off background job to gather schema metadata about our new db
    (future (driver/sync-database new-db))
    ;; make sure we return the newly created db object
    new-db))

(defendpoint GET "/form_input" []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

;; Stub function that will eventually validate a connection string
(defendpoint POST "/validate" [:as {{:keys [host port]} :body}]
  {host Required
   port Required}
  ((let [response-invalid (fn [m] {:status 400 :body {:valid false :message m}})]
    (cond
      (u/host-port-up? host port) {:valid true}
      (u/host-up? host)           (response-invalid "Invalid port")
      :else                       (response-invalid "Host not reachable")))))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Database :id id)
         (hydrate :organization)))

(defendpoint PUT "/:id" [id :as {{:keys [name engine details]} :body}]
  {name NonEmptyString, details Dict} ; TODO - check that engine is a valid choice
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
                                       (and (>= (count table-name) prefix-len)
                                            (= prefix (.substring table-name 0 prefix-len)))))
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
        (hydrate :table))))

(defendpoint POST "/:id/sync" [id]
  (let-404 [db (sel :one Database :id id)]
    (future (driver/sync-database db))) ; run sync-tables asynchronously
  {:status :ok})


(define-routes)
