(ns metabase.api.database
  "/api/database endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.api.common :refer :all]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver]
                      [events :as events]
                      [sample-data :as sample-data]
                      [util :as u])
            (metabase.models common
                             [hydrate :refer [hydrate]]
                             [database :refer [Database protected-password]]
                             [field :refer [Field]]
                             [table :refer [Table]])))

(defannotation DBEngine
  "Param must be a valid database engine type, e.g. `h2` or `postgres`."
  [symb value :nillable]
  (checkp-with driver/is-engine? symb value))

(defn test-database-connection
  "Try out the connection details for a database and useful error message if connection fails, returns `nil` if connection succeeds."
  [engine {:keys [host port] :as details}]
  (when-not config/is-test?
    (let [engine           (keyword engine)
          details          (assoc details :engine engine)
          response-invalid (fn [field m] {:valid false
                                          field m        ; work with the new {:field error-message} format
                                          :message m})]  ; but be backwards-compatible with the UI as it exists right now
      (try
        (cond
          (driver/can-connect-with-details? engine details :rethrow-exceptions) nil
          (and host port (u/host-port-up? host port))                           (response-invalid :dbname (format "Connection to '%s:%d' successful, but could not connect to DB." host port))
          (and host (u/host-up? host))                                          (response-invalid :port   (format "Connection to '%s' successful, but port %d is invalid." port))
          host                                                                  (response-invalid :host   (format "'%s' is not reachable" host))
          :else                                                                 (response-invalid :db     "Unable to connect to database."))
        (catch Throwable e
          (response-invalid :dbname (.getMessage e)))))))

;; TODO - Just make `:ssl` a `feature`
(defn supports-ssl?
  "Predicate function which determines if a given `engine` supports the `:ssl` setting."
  [engine]
  {:pre [(driver/is-engine? engine)]}
  (let [driver-props (->> (driver/engine->driver engine)
                          driver/details-fields
                          (map :name)
                          set)]
    (contains? driver-props "ssl")))

(defendpoint GET "/"
  "Fetch all `Databases`."
  [include_tables]
  (let [dbs (db/select Database {:order-by [:%lower.name]})]
    (if-not include_tables
      dbs
      (let [db-id->tables (group-by :db_id (db/select Table, :active true))]
        (for [db dbs]
          (assoc db :tables (sort-by :name (get db-id->tables (:id db) []))))))))

(defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync]} :body}]
  {name         [Required NonEmptyString]
   engine       [Required DBEngine]
   details      [Required Dict]}
  (check-superuser)
  ;; this function tries connecting over ssl and non-ssl to establish a connection
  ;; if it succeeds it returns the `details` that worked, otherwise it returns an error
  (let [try-connection   (fn [engine details]
                           (let [error (test-database-connection engine details)]
                             (if (and error
                                      (true? (:ssl details)))
                               (recur engine (assoc details :ssl false))
                               (or error details))))
        details          (if (supports-ssl? engine)
                           (assoc details :ssl true)
                           details)
        details-or-error (try-connection engine details)
        is_full_sync     (if (nil? is_full_sync)
                           true
                           (boolean is_full_sync))]
    (if-not (false? (:valid details-or-error))
      ;; no error, proceed with creation
      (let-500 [new-db (db/insert! Database, :name name, :engine engine, :details details-or-error, :is_full_sync is_full_sync)]
        (events/publish-event :database-create new-db))
      ;; failed to connect, return error
      {:status 400
       :body   details-or-error})))

(defendpoint POST "/sample_dataset"
  "Add the sample dataset as a new `Database`."
  []
  (check-superuser)
  (sample-data/add-sample-dataset!)
  (Database :is_sample true))

(defendpoint GET "/:id"
  "Get `Database` with ID."
  [id]
  (check-404 (Database id)))

(defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync]} :body}]
  {name    [Required NonEmptyString]
   engine  [Required DBEngine]
   details [Required Dict]}
  (check-superuser)
  (let-404 [database (Database id)]
    (let [details      (if-not (= protected-password (:password details))
                         details
                         (assoc details :password (get-in database [:details :password])))
          conn-error   (test-database-connection engine details)
          is_full_sync (if (nil? is_full_sync)
                         nil
                         (boolean is_full_sync))]
      (if-not conn-error
        ;; no error, proceed with update
        (do
          ;; TODO: is there really a reason to let someone change the engine on an existing database?
          ;;       that seems like the kind of thing that will almost never work in any practical way
          (check-500 (db/update-non-nil-keys! Database id
                       :name         name
                       :engine       engine
                       :details      details
                       :is_full_sync is_full_sync))
          (events/publish-event :database-update (Database id)))
        ;; failed to connect, return error
        {:status 400
         :body   conn-error}))))

(defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (let-404 [db (Database id)]
    (write-check db)
    (u/prog1 (db/cascade-delete! Database :id id)
      (events/publish-event :database-delete db))))

(defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`.
   Returns DB, fields, and field values."
  [id]
  (->404 (Database id)
         read-check
         ;; TODO - this is a bit slow due to the nested hydration.  needs some optimizing.
         (hydrate [:tables [:fields :target :values] :segments :metrics])))

(defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given PREFIX.
   This is intened for use with the ACE Editor when the User is typing raw SQL.
   Suggestions include matching `Tables` and `Fields` in this `Database`."
  [id prefix] ; TODO - should prefix be Required/NonEmptyString ?
  (read-check Database id)
  (try
    (let [prefix-len      (count prefix)
          table-id->name  (db/select-id->field :name Table, :db_id id, :active true)
          matching-tables (->> (vals table-id->name)                                                              ; get all Table names that start with PREFIX
                               (filter (fn [^String table-name]
                                         (and (>= (count table-name) prefix-len)
                                              (= prefix (.substring table-name 0 prefix-len)))))
                               (map (fn [table-name]                                                              ; return them in the format [table_name "Table"]
                                      [table-name "Table"])))
          fields (->> (db/select [Field :name :base_type :special_type :table_id]                                 ; get all Fields with names that start with PREFIX
                                 :table_id        [:in (keys table-id->name)]                                              ; whose Table is in this DB
                                 :name            [:like (str prefix "%")]
                                 :visibility_type [:not-in ["sensitive" "retired"]])
                      (map (fn [{:keys [name base_type special_type table_id]}]                                   ; return them in the format
                             [name (str (table-id->name table_id) " " base_type (when special_type                ; [field_name "table_name base_type special_type"]
                                                                                  (str " " special_type)))])))]
      (concat matching-tables fields))                                                                           ; return combined seq of Fields + Tables
    (catch Throwable t
      (log/warn "Error with autocomplete: " (.getMessage t)))))

(defendpoint GET "/:id/tables"
  "Get a list of all `Tables` in `Database`."
  [id]
  (read-check Database id)
  (db/select Table, :db_id id, :active true, {:order-by [:name]})) ; TODO - should this be case-insensitive -- {:order-by [:%lower.name]} -- instead?

(defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id]
  (read-check Database id)
  (let [table_ids (db/select-ids Table, :db_id id, :active true)]
    (sort-by #(:name (:table %)) (-> (db/select Field, :table_id [:in table_ids], :special_type "id")
                                     (hydrate :table)))))

(defendpoint POST "/:id/sync"
  "Update the metadata for this `Database`."
  [id]
  (let-404 [db (Database id)]
    (write-check db)
    ;; just publish a message and let someone else deal with the logistics
    (events/publish-event :database-trigger-sync db))
  {:status :ok})


(define-routes)
