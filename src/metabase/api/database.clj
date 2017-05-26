(ns metabase.api.database
  "/api/database endpoints."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [config :as config]
             [driver :as driver]
             [events :as events]
             [sample-data :as sample-data]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [database :as database :refer [Database protected-password]]
             [field :refer [Field]]
             [interface :as mi]
             [permissions :as perms]
             [table :refer [Table]]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def DBEngine
  "Schema for a valid database engine name, e.g. `h2` or `postgres`."
  (su/with-api-error-message (s/constrained su/NonBlankString driver/is-engine? "Valid database engine")
    "value must be a valid database engine."))


;;; ------------------------------------------------------------ GET /api/database ------------------------------------------------------------


(defn- add-tables [dbs]
  (let [db-id->tables (group-by :db_id (filter mi/can-read? (db/select Table
                                                                  :active true
                                                                  :db_id  [:in (map :id dbs)]
                                                                  {:order-by [[:%lower.display_name :asc]]})))]
    (for [db dbs]
      (assoc db :tables (get db-id->tables (:id db) [])))))

(defn- add-native-perms-info [dbs]
  (for [db dbs]
    (let [user-has-perms? (fn [path-fn] (perms/set-has-full-permissions? @api/*current-user-permissions-set* (path-fn (u/get-id db))))]
      (assoc db :native_permissions (cond
                                      (user-has-perms? perms/native-readwrite-path) :write
                                      (user-has-perms? perms/native-read-path)      :read
                                      :else                                         :none)))))

(defn- dbs-list [include-tables?]
  (when-let [dbs (seq (filter mi/can-read? (db/select Database {:order-by [:%lower.name]})))]
    (add-native-perms-info (if-not include-tables?
                             dbs
                             (add-tables dbs)))))

(api/defendpoint GET "/"
  "Fetch all `Databases`."
  [include_tables]
  (or (dbs-list include_tables)
      []))


;;; ------------------------------------------------------------ GET /api/database/:id ------------------------------------------------------------

(api/defendpoint GET "/:id"
  "Get `Database` with ID."
  [id]
  (api/read-check Database id))


;;; ------------------------------------------------------------ GET /api/database/:id/metadata ------------------------------------------------------------

(defn- db-metadata [id]
  (-> (api/read-check Database id)
      (hydrate [:tables [:fields :target :values] :segments :metrics])
      (update :tables   (fn [tables]
                          (for [table tables
                                :when (mi/can-read? table)]
                            (-> table
                                (update :segments (partial filter mi/can-read?))
                                (update :metrics  (partial filter mi/can-read?))))))))

(api/defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`.
   Returns DB, fields, and field values."
  [id]
  (db-metadata id))


;;; ------------------------------------------------------------ GET /api/database/:id/autocomplete_suggestions ------------------------------------------------------------

(defn- autocomplete-tables [db-id prefix]
  (db/select [Table :id :db_id :schema :name]
    {:where    [:and [:= :db_id db-id]
                     [:= :active true]
                     [:like :%lower.name (str (str/lower-case prefix) "%")]
                     [:or [:= :visibility_type nil]
                          [:not= :visibility_type "hidden"]]]
     :order-by [[:%lower.name :asc]]}))

(defn- autocomplete-fields [db-id prefix]
  (db/select [Field :name :base_type :special_type :id :table_id [:table.name :table_name]]
    :metabase_field.active          true
    :%lower.metabase_field.name     [:like (str (str/lower-case prefix) "%")]
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
  (let [tables (filter mi/can-read? (autocomplete-tables db-id prefix))
        fields (filter mi/can-read? (autocomplete-fields db-id prefix))]
    (autocomplete-results tables fields)))

(api/defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given PREFIX.
   This is intened for use with the ACE Editor when the User is typing raw SQL.
   Suggestions include matching `Tables` and `Fields` in this `Database`.

   Tables are returned in the format `[table_name \"Table\"]`;
   Fields are returned in the format `[field_name \"table_name base_type special_type\"]`"
  [id prefix]
  {prefix su/NonBlankString}
  (api/read-check Database id)
  (try
    (autocomplete-suggestions id prefix)
    (catch Throwable t
      (log/warn "Error with autocomplete: " (.getMessage t)))))


;;; ------------------------------------------------------------ GET /api/database/:id/fields ------------------------------------------------------------

(api/defendpoint GET "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [id]
  (api/read-check Database id)
  (for [{:keys [id display_name table base_type special_type]} (filter mi/can-read? (-> (db/select [Field :id :display_name :table_id :base_type :special_type]
                                                                                                   :table_id        [:in (db/select-field :id Table, :db_id id)]
                                                                                                   :visibility_type [:not-in ["sensitive" "retired"]])
                                                                                        (hydrate :table)))]
    {:id           id
     :name         display_name
     :base_type    base_type
     :special_type special_type
     :table_name   (:display_name table)
     :schema       (:schema table)}))


;;; ------------------------------------------------------------ GET /api/database/:id/idfields ------------------------------------------------------------

(api/defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id]
  (api/read-check Database id)
  (sort-by (comp str/lower-case :name :table) (filter mi/can-read? (-> (database/pk-fields {:id id})
                                                                         (hydrate :table)))))


;;; ------------------------------------------------------------ POST /api/database ------------------------------------------------------------

(defn- invalid-connection-response [field m]
  ;; work with the new {:field error-message} format but be backwards-compatible with the UI as it exists right now
  {:valid   false
   field    m
   :message m})

(defn- test-database-connection
  "Try out the connection details for a database and useful error message if connection fails, returns `nil` if connection succeeds."
  [engine {:keys [host port] :as details}]
  (when-not config/is-test?
    (let [engine  (keyword engine)
          details (assoc details :engine engine)]
      (try
        (cond
          (driver/can-connect-with-details? engine details :rethrow-exceptions) nil
          (and host port (u/host-port-up? host port))                           (invalid-connection-response :dbname (format "Connection to '%s:%d' successful, but could not connect to DB." host port))
          (and host (u/host-up? host))                                          (invalid-connection-response :port   (format "Connection to '%s' successful, but port %d is invalid." port))
          host                                                                  (invalid-connection-response :host   (format "'%s' is not reachable" host))
          :else                                                                 (invalid-connection-response :db     "Unable to connect to database."))
        (catch Throwable e
          (invalid-connection-response :dbname (.getMessage e)))))))

;; TODO - Just make `:ssl` a `feature`
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [engine]
  {:pre [(driver/is-engine? engine)]}
  (let [driver-props (set (for [field (driver/details-fields (driver/engine->driver engine))]
                            (:name field)))]
    (contains? driver-props "ssl")))

(defn- test-connection-details
  "Try a making a connection to database ENGINE with DETAILS.
   Tries twice: once with SSL, and a second time without if the first fails.
   If either attempt is successful, returns the details used to successfully connect.
   Otherwise returns the connection error message."
  [engine details]
  (let [error (test-database-connection engine details)]
    (if (and error
             (true? (:ssl details)))
      (recur engine (assoc details :ssl false))
      (or error details))))

(api/defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync]} :body}]
  {name         su/NonBlankString
   engine       DBEngine
   details      su/Map
   is_full_sync (s/maybe s/Bool)}
  (api/check-superuser)
  ;; this function tries connecting over ssl and non-ssl to establish a connection
  ;; if it succeeds it returns the `details` that worked, otherwise it returns an error
  (let [details          (if (supports-ssl? engine)
                           (assoc details :ssl true)
                           details)
        details-or-error (test-connection-details engine details)
        is-full-sync?     (or (nil? is_full_sync)
                              (boolean is_full_sync))]
    (if-not (false? (:valid details-or-error))
      ;; no error, proceed with creation. If record is inserted successfuly, publish a `:database-create` event. Throw a 500 if nothing is inserted
      (u/prog1 (api/check-500 (db/insert! Database, :name name, :engine engine, :details details-or-error, :is_full_sync is-full-sync?))
        (events/publish-event! :database-create <>))
      ;; failed to connect, return error
      {:status 400
       :body   details-or-error})))


;;; ------------------------------------------------------------ POST /api/database/sample_dataset ------------------------------------------------------------

(api/defendpoint POST "/sample_dataset"
  "Add the sample dataset as a new `Database`."
  []
  (api/check-superuser)
  (sample-data/add-sample-dataset!)
  (Database :is_sample true))

;;; ------------------------------------------------------------ PUT /api/database/:id ------------------------------------------------------------

(api/defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync description caveats points_of_interest]} :body}]
  {name    su/NonBlankString
   engine  DBEngine
   details su/Map}
  (api/check-superuser)
  (api/let-404 [database (Database id)]
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
          (api/check-500 (db/update-non-nil-keys! Database id
                           :name               name
                           :engine             engine
                           :details            details
                           :is_full_sync       is_full_sync
                           :description        description
                           :caveats            caveats
                           :points_of_interest points_of_interest)) ; TODO - this means one cannot unset the description. Does that matter?
          (events/publish-event! :database-update (Database id)))
        ;; failed to connect, return error
        {:status 400
         :body   conn-error}))))

;;; ------------------------------------------------------------ DELETE /api/database/:id ------------------------------------------------------------

(api/defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (api/let-404 [db (Database id)]
    (api/write-check db)
    (db/delete! Database :id id)
    (events/publish-event! :database-delete db))
  api/generic-204-no-content)


;;; ------------------------------------------------------------ POST /api/database/:id/sync ------------------------------------------------------------

;; TODO - Shouldn't we just check for superuser status instead of write checking?
(api/defendpoint POST "/:id/sync"
  "Update the metadata for this `Database`."
  [id]
  ;; just publish a message and let someone else deal with the logistics
  (events/publish-event! :database-trigger-sync (api/write-check Database id))
  {:status :ok})


(api/define-routes)
