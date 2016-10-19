(ns metabase.api.database
  "/api/database endpoints."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST PUT DELETE]]
            [metabase.api.common :refer :all]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver]
                      [events :as events])
            (metabase.models common
                             [database :refer [Database protected-password], :as database]
                             [field :refer [Field]]
                             [hydrate :refer [hydrate]]
                             [interface :as models]
                             [permissions :as perms]
                             [table :refer [Table]])
            (metabase [sample-data :as sample-data]
                      [util :as u])))

(defannotation DBEngine
  "Param must be a valid database engine type, e.g. `h2` or `postgres`."
  [symb value :nillable]
  (checkp-with driver/is-engine? symb value))


;;; ------------------------------------------------------------ GET /api/database ------------------------------------------------------------


(defn- add-tables [dbs]
  (let [db-id->tables (group-by :db_id (filter models/can-read? (db/select Table
                                                                  :active true
                                                                  :db_id  [:in (map :id dbs)]
                                                                  {:order-by [[:%lower.display_name :asc]]})))]
    (for [db dbs]
      (assoc db :tables (get db-id->tables (:id db) [])))))

(defn- add-native-perms-info [dbs]
  (for [db dbs]
    (let [user-has-perms? (fn [f] (perms/set-has-full-permissions? @*current-user-permissions-set* (f (u/get-id db))))]
      (assoc db :native_permissions (cond
                                      (user-has-perms? perms/native-readwrite-path) :write
                                      (user-has-perms? perms/native-read-path)      :read
                                      :else                                         :none)))))

(defn- dbs-list [include-tables?]
  (when-let [dbs (seq (filter models/can-read? (db/select Database {:order-by [:%lower.name]})))]
    (add-native-perms-info (if-not include-tables?
                             dbs
                             (add-tables dbs)))))

(defendpoint GET "/"
  "Fetch all `Databases`."
  [include_tables]
  (or (dbs-list include_tables)
      []))


;;; ------------------------------------------------------------ GET /api/database/:id ------------------------------------------------------------

(defendpoint GET "/:id"
  "Get `Database` with ID."
  [id]
  (read-check Database id))


;;; ------------------------------------------------------------ GET /api/database/:id/metadata ------------------------------------------------------------

(defn- db-metadata [id]
  (-> (read-check Database id)
      (hydrate [:tables [:fields :target :values] :segments :metrics])
      (update :tables   (fn [tables]
                          (for [table tables
                                :when (models/can-read? table)]
                            (-> table
                                (update :segments (partial filter models/can-read?))
                                (update :metrics  (partial filter models/can-read?))))))))

(defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`.
   Returns DB, fields, and field values."
  [id]
  (db-metadata id))


;;; ------------------------------------------------------------ GET /api/database/:id/autocomplete_suggestions ------------------------------------------------------------

(defn- autocomplete-tables [db-id prefix]
  (db/select [Table :id :db_id :schema :name]
    :db_id       db-id
    :active      true
    :%lower.name [:like (str (s/lower-case prefix) "%")]
    {:order-by [[:%lower.name :asc]]}))

(defn- autocomplete-fields [db-id prefix]
  (db/select [Field :name :base_type :special_type :id :table_id [:table.name :table_name]]
    :metabase_field.active          true
    :%lower.metabase_field.name     [:like (str (s/lower-case prefix) "%")]
    :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
    :table.db_id                    db-id
    {:order-by  [[:%lower.metabase_field.name :asc]
                 [:%lower.table.name :asc]]
     :left-join [[:metabase_table :table] [:= :table.id :metabase_field.table_id]]}))

(defn- autocomplete-results [tables fields]
  (concat (for [{table-name :name} tables]
            [table-name "Table"])
          (for [{:keys [table_name base_type special_type name]} fields]
            [name (str table_name
                       " "
                       base_type
                       (when special_type
                         (str " " special_type)))])))

(defn- autocomplete-suggestions [db-id prefix]
  (let [tables (filter models/can-read? (autocomplete-tables db-id prefix))
        fields (filter models/can-read? (autocomplete-fields db-id prefix))]
    (autocomplete-results tables fields)))

(defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given PREFIX.
   This is intened for use with the ACE Editor when the User is typing raw SQL.
   Suggestions include matching `Tables` and `Fields` in this `Database`.

   Tables are returned in the format `[table_name \"Table\"]`;
   Fields are returned in the format `[field_name \"table_name base_type special_type\"]`"
  [id prefix]
  {prefix [Required NonEmptyString]}
  (read-check Database id)
  (try
    (autocomplete-suggestions id prefix)
    (catch Throwable t
      (log/warn "Error with autocomplete: " (.getMessage t)))))


;;; ------------------------------------------------------------ GET /api/database/:id/tables ------------------------------------------------------------

(defendpoint GET "/:id/tables"
  "Get a list of all `Tables` in `Database`."
  [id]
  (read-check Database id)
  (filter models/can-read? (db/select Table, :db_id id, :active true, {:order-by [:%lower.name]})))


;;; ------------------------------------------------------------ GET /api/database/:id/fields ------------------------------------------------------------

(defendpoint GET "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [id]
  (read-check Database id)
  (for [{:keys [id display_name table]} (filter models/can-read? (-> (db/select [Field :id :display_name :table_id]
                                                                       :table_id        [:in (db/select-field :id Table, :db_id id)]
                                                                       :visibility_type [:not-in ["sensitive" "retired"]])
                                                                     (hydrate :table)))]
    {:id         id
     :name       display_name
     :table_name (:display_name table)
     :schema     (:schema table)}))


;;; ------------------------------------------------------------ GET /api/database/:id/idfields ------------------------------------------------------------

(defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id]
  (read-check Database id)
  (sort-by (comp s/lower-case :name :table) (filter models/can-read? (-> (database/pk-fields {:id id})
                                                                         (hydrate :table)))))


;;; ------------------------------------------------------------ POST /api/database ------------------------------------------------------------

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
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [engine]
  {:pre [(driver/is-engine? engine)]}
  (let [driver-props (set (for [field (driver/details-fields (driver/engine->driver engine))]
                            (:name field)))]
    (contains? driver-props "ssl")))

(defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync]} :body}]
  {name    [Required NonEmptyString]
   engine  [Required DBEngine]
   details [Required Dict]}
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
        (events/publish-event :database-create new-db)
        new-db)
      ;; failed to connect, return error
      {:status 400
       :body   details-or-error})))


;;; ------------------------------------------------------------ POST /api/database/sample_dataset ------------------------------------------------------------

(defendpoint POST "/sample_dataset"
  "Add the sample dataset as a new `Database`."
  []
  (check-superuser)
  (sample-data/add-sample-dataset!)
  (Database :is_sample true))

;;; ------------------------------------------------------------ PUT /api/database/:id ------------------------------------------------------------

(defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync description caveats points_of_interest]} :body}]
  {name    [Required NonEmptyString]
   engine  [Required DBEngine]
   details [Required Dict]}
  (check-superuser)
  (let-404 [database (Database id)]
    (let [details      (if-not (= protected-password (:password details))
                         details
                         (assoc details :password (get-in database [:details :password])))
          conn-error   (test-database-connection engine details)
          is_full_sync (when-not (nil? is_full_sync)
                         (boolean is_full_sync))]
      (if-not conn-error
        ;; no error, proceed with update
        (do
          ;; TODO: is there really a reason to let someone change the engine on an existing database?
          ;;       that seems like the kind of thing that will almost never work in any practical way
          (check-500 (db/update-non-nil-keys! Database id
                       :name               name
                       :engine             engine
                       :details            details
                       :is_full_sync       is_full_sync
                       :description        description
                       :caveats            caveats
                       :points_of_interest points_of_interest)) ; TODO - this means one cannot unset the description. Does that matter?
          (events/publish-event :database-update (Database id)))
        ;; failed to connect, return error
        {:status 400
         :body   conn-error}))))

;;; ------------------------------------------------------------ DELETE /api/database/:id ------------------------------------------------------------

(defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (let-404 [db (Database id)]
    (write-check db)
    (u/prog1 (db/cascade-delete! Database :id id)
      (events/publish-event :database-delete db))))


;;; ------------------------------------------------------------ POST /api/database/:id/sync ------------------------------------------------------------

;; TODO - Shouldn't we just check for superuser status instead of write checking?
(defendpoint POST "/:id/sync"
  "Update the metadata for this `Database`."
  [id]
  ;; just publish a message and let someone else deal with the logistics
  (events/publish-event :database-trigger-sync (write-check Database id))
  {:status :ok})


(define-routes)
