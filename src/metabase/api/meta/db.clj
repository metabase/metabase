(ns metabase.api.meta.db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models common
                             [hydrate :refer [hydrate]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.util :as u]))

(defannotation DBEngine
  "Param must be a valid database engine type, e.g. `h2` or `postgres`."
  [symb value :nillable]
  (checkp-contains? (set (map name (keys driver/available-drivers))) symb value))

(defendpoint GET "/"
  "Fetch all `Databases`."
  []
  (sel :many Database (k/order :name)))

(defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details] :as body} :body}]
  {name    [Required NonEmptyString]
   engine  [Required DBEngine]
   details [Required Dict]}
  ;; TODO - we should validate the contents of `details` here based on the engine
  (check-superuser)
  (let-500 [new-db (ins Database :name name :engine engine :details details)]
    ;; kick off background job to gather schema metadata about our new db
    (future (driver/sync-database! new-db))
    ;; make sure we return the newly created db object
    new-db))

(defendpoint GET "/form_input"
  "Values of options for the create/edit `Database` UI."
  []
  {:timezones metabase.models.common/timezones
   :engines driver/available-drivers})

;; Stub function that will eventually validate a connection string
(defendpoint POST "/validate"
  "Validate that we can connect to a `Database`."
  [:as {{:keys [host port engine] :as details} :body}]
  (let [engine           (keyword engine)
        details          (assoc details :engine engine)
        response-invalid (fn [field m] {:status 400 :body {:valid false
                                                          field m        ; work with the new {:field error-message} format
                                                          :message m}})] ; but be backwards-compatible with the UI as it exists right now
    (try
      (cond
        (driver/can-connect-with-details? engine details :rethrow-exceptions) {:valid true}
        (and host port (u/host-port-up? host port))                           (response-invalid :dbname (format "Connection to '%s:%d' successful, but could not connect to DB." host port))
        (and host (u/host-up? host))                                          (response-invalid :port   (format "Connection to '%s' successful, but port %d is invalid." port))
        host                                                                  (response-invalid :host   (format "'%s' is not reachable" host))
        :else                                                                 (response-invalid :db     "Unable to connect to database."))
      (catch Throwable e
        (response-invalid :dbname (.getMessage e))))))

(defendpoint GET "/:id"
  "Get `Database` with ID."
  [id]
  (check-404 (Database id)))

(defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details]} :body}]
  {name NonEmptyString, details Dict} ; TODO - check that engine is a valid choice
  (write-check Database id)
  (check-500 (upd-non-nil-keys Database id
                               :name name
                               :engine engine
                               :details details))
  (Database id))

(defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (write-check Database id)
  (cascade-delete Database :id id))

(defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`.
   Returns DB, fields, and field values."
  [id]
  (->404 (Database id)
         read-check
         ;; TODO - this is a bit slow due to the nested hydration.  needs some optimizing.
         (hydrate [:tables [:fields :target :values]])))

(defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given PREFIX.
   This is intened for use with the ACE Editor when the User is typing raw SQL.
   Suggestions include matching `Tables` and `Fields` in this `Database`."
  [id prefix] ; TODO - should prefix be Required/NonEmptyString ?
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

(defendpoint GET "/:id/tables"
  "Get a list of all `Tables` in `Database`."
  [id]
  (read-check Database id)
  (sel :many Table :db_id id :active true (k/order :name)))

(defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id]
  (read-check Database id)
  (let [table_ids (sel :many :id Table :db_id id :active true)]
    (sort-by #(:name (:table %)) (-> (sel :many Field :table_id [in table_ids] :special_type "id")
                                     (hydrate :table)))))

(defendpoint POST "/:id/sync"
  "Update the metadata for this `Database`."
  [id]
  (let-404 [db (Database id)]
    (write-check db)
    (future (driver/sync-database! db))) ; run sync-tables asynchronously
  {:status :ok})


(define-routes)
