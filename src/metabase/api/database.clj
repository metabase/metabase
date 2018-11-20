(ns metabase.api.database
  "/api/database endpoints."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [config :as config]
             [driver :as driver]
             [events :as events]
             [public-settings :as public-settings]
             [sample-data :as sample-data]
             [util :as u]]
            [metabase.api
             [common :as api]
             [table :as table-api]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database protected-password]]
             [field :refer [Field readable-fields-only]]
             [field-values :refer [FieldValues]]
             [interface :as mi]
             [permissions :as perms]
             [table :refer [Table]]]
            [metabase.sync
             [analyze :as analyze]
             [field-values :as sync-field-values]
             [sync-metadata :as sync-metadata]]
            [metabase.util
             [cron :as cron-util]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import metabase.models.database.DatabaseInstance))

(def DBEngineString
  "Schema for a valid database engine name, e.g. `h2` or `postgres`."
  (su/with-api-error-message (s/constrained su/NonBlankString driver/is-engine? "Valid database engine")
    "value must be a valid database engine."))


;;; ----------------------------------------------- GET /api/database ------------------------------------------------

(defn- add-tables [dbs]
  (let [db-id->tables (group-by :db_id (filter mi/can-read? (db/select Table
                                                              :active true
                                                              :db_id  [:in (map :id dbs)]
                                                              {:order-by [[:%lower.display_name :asc]]})))]
    (for [db dbs]
      (assoc db :tables (get db-id->tables (:id db) [])))))

(s/defn ^:private add-native-perms-info :- [{:native_permissions (s/enum :write :none), s/Keyword s/Any}]
  "For each database in DBS add a `:native_permissions` field describing the current user's permissions for running
  native (e.g. SQL) queries. Will be either `:write` or `:none`. `:write` means you can run ad-hoc native queries,
  and save new Cards with native queries; `:none` means you can do neither.

  For the curious: the use of `:write` and `:none` is mainly for legacy purposes, when we had data-access-based
  permissions; there was a specific option where you could give a Perms Group permissions to run existing Cards with
  native queries, but not to create new ones. With the advent of what is currently being called 'Space-Age
  Permissions', all Cards' permissions are based on their parent Collection, removing the need for native read perms."
  [dbs :- [su/Map]]
  (for [db dbs]
    (assoc db :native_permissions (if (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                        (perms/adhoc-native-query-path (u/get-id db)))
                                    :write
                                    :none))))

(defn- card-database-supports-nested-queries? [{{database-id :database} :dataset_query, :as card}]
  (when database-id
    (when-let [driver (driver/database-id->driver database-id)]
      (driver/driver-supports? driver :nested-queries))))

(defn- card-has-ambiguous-columns?
  "We know a card has ambiguous columns if any of the columns that come back end in `_2` (etc.) because that's what
   clojure.java.jdbc 'helpfully' does for us automatically.
   Presence of ambiguous columns disqualifies a query for use as a source query because something like

     SELECT name
     FROM (
       SELECT x.name, y.name
       FROM x
       LEFT JOIN y on x.id = y.id
     )

   would be ambiguous. Too many things break when attempting to use a query like this. In the future, this may be
   supported, but it will likely require rewriting the source SQL query to add appropriate aliases (this is even
   trickier if the source query uses `SELECT *`)."
  [{result-metadata :result_metadata}]
  (some (partial re-find #"_2$")
        (map (comp name :name) result-metadata)))

(defn- card-uses-unnestable-aggregation?
  "Since cumulative count and cumulative sum aggregations are done in Clojure-land we can't use Cards that
   use queries with those aggregations as source queries. This function determines whether CARD is using one
   of those queries so we can filter it out in Clojure-land."
  [{{{aggregations :aggregation} :query} :dataset_query}]
  (mbql.u/match aggregations #{:cum-count :cum-sum}))

(defn- source-query-cards
  "Fetch the Cards that can be used as source queries (e.g. presented as virtual tables)."
  []
  (as-> (db/select [Card :name :description :database_id :dataset_query :id :collection_id :result_metadata]
          :result_metadata [:not= nil] :archived false
          {:order-by [[:%lower.name :asc]]}) <>
    (filter card-database-supports-nested-queries? <>)
    (filter mi/can-read? <>)
    (remove card-uses-unnestable-aggregation? <>)
    (remove card-has-ambiguous-columns? <>)
    (hydrate <> :collection)))

(defn- cards-virtual-tables
  "Return a sequence of 'virtual' Table metadata for eligible Cards.
   (This takes the Cards from `source-query-cards` and returns them in a format suitable for consumption by the Query
   Builder.)"
  [& {:keys [include-fields?]}]
  (for [card (source-query-cards)]
    (table-api/card->virtual-table card :include-fields? include-fields?)))

(defn- saved-cards-virtual-db-metadata [& {:keys [include-fields?]}]
  (when (public-settings/enable-nested-queries)
    (when-let [virtual-tables (seq (cards-virtual-tables :include-fields? include-fields?))]
      {:name               "Saved Questions"
       :id                 database/virtual-id
       :features           #{:basic-aggregations}
       :tables             virtual-tables
       :is_saved_questions true})))

;; "Virtual" tables for saved cards simulate the db->schema->table hierarchy by doing fake-db->collection->card
(defn- add-virtual-tables-for-saved-cards [dbs]
  (if-let [virtual-db-metadata (saved-cards-virtual-db-metadata)]
    ;; only add the 'Saved Questions' DB if there are Cards that can be used
    (conj (vec dbs) virtual-db-metadata)
    dbs))

(defn- dbs-list [include-tables? include-cards?]
  (when-let [dbs (seq (filter mi/can-read? (db/select Database {:order-by [:%lower.name]})))]
    (cond-> (add-native-perms-info dbs)
      include-tables? add-tables
      include-cards?  add-virtual-tables-for-saved-cards)))

(api/defendpoint GET "/"
  "Fetch all `Databases`. `include_tables` means we should hydrate the Tables belonging to each DB. `include_cards` here
  means we should also include virtual Table entries for saved Questions, e.g. so we can easily use them as source
  Tables in queries. Default for both is `false`."
  [include_tables include_cards]
  {include_tables (s/maybe su/BooleanString)
   include_cards  (s/maybe su/BooleanString)}
  (or (dbs-list (Boolean/parseBoolean include_tables) (Boolean/parseBoolean include_cards))
      []))


;;; --------------------------------------------- GET /api/database/:id ----------------------------------------------

(def ExpandedSchedulesMap
  "Schema for the `:schedules` key we add to the response containing 'expanded' versions of the CRON schedules.
   This same key is used in reverse to update the schedules."
  (su/with-api-error-message
      (s/named
       {(s/optional-key :cache_field_values) cron-util/ScheduleMap
        (s/optional-key :metadata_sync)      cron-util/ScheduleMap}
       "Map of expanded schedule maps")
    "value must be a valid map of schedule maps for a DB."))

(s/defn ^:private expanded-schedules [db :- DatabaseInstance]
  {:cache_field_values (cron-util/cron-string->schedule-map (:cache_field_values_schedule db))
   :metadata_sync      (cron-util/cron-string->schedule-map (:metadata_sync_schedule db))})

(defn- add-expanded-schedules
  "Add 'expanded' versions of the cron schedules strings for DB in a format that is appropriate for frontend
  consumption."
  [db]
  (assoc db :schedules (expanded-schedules db)))

(api/defendpoint GET "/:id"
  "Get `Database` with ID."
  [id]
  (add-expanded-schedules (api/read-check Database id)))


;;; ----------------------------------------- GET /api/database/:id/metadata -----------------------------------------

;; Since the normal `:id` param in the normal version of the endpoint will never match with negative numbers
;; we'll create another endpoint to specifically match the ID of the 'virtual' database. The `defendpoint` macro
;; requires either strings or vectors for the route so we'll have to use a vector and create a regex to only
;; match the virtual ID (and nothing else).
(api/defendpoint GET ["/:virtual-db/metadata" :virtual-db (re-pattern (str database/virtual-id))]
  "Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database."
  []
  (saved-cards-virtual-db-metadata :include-fields? true))


(defn- db-metadata [id]
  (-> (api/read-check Database id)
      (hydrate [:tables [:fields [:target :has_field_values] :has_field_values] :segments :metrics])
      (update :tables (fn [tables]
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


;;; --------------------------------- GET /api/database/:id/autocomplete_suggestions ---------------------------------

(defn- autocomplete-tables [db-id prefix]
  (db/select [Table :id :db_id :schema :name]
    {:where    [:and [:= :db_id db-id]
                     [:= :active true]
                     [:like :%lower.name (str (str/lower-case prefix) "%")]
                     [:= :visibility_type nil]]
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
        fields (readable-fields-only (autocomplete-fields db-id prefix))]
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


;;; ------------------------------------------ GET /api/database/:id/fields ------------------------------------------

(api/defendpoint GET "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [id]
  (api/read-check Database id)
  (let [fields (filter mi/can-read? (-> (db/select [Field :id :display_name :table_id :base_type :special_type]
                                          :table_id        [:in (db/select-field :id Table, :db_id id)]
                                          :visibility_type [:not-in ["sensitive" "retired"]])
                                        (hydrate :table)))]
    (for [{:keys [id display_name table base_type special_type]} fields]
      {:id           id
       :name         display_name
       :base_type    base_type
       :special_type special_type
       :table_name   (:display_name table)
       :schema       (:schema table)})))


;;; ----------------------------------------- GET /api/database/:id/idfields -----------------------------------------

(api/defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id]
  (api/read-check Database id)
  (sort-by (comp str/lower-case :name :table) (filter mi/can-read? (-> (database/pk-fields {:id id})
                                                                       (hydrate :table)))))


;;; ----------------------------------------------- POST /api/database -----------------------------------------------

(defn- invalid-connection-response [field m]
  ;; work with the new {:field error-message} format but be backwards-compatible with the UI as it exists right now
  {:valid   false
   field    m
   :message m})

(defn test-database-connection
  "Try out the connection details for a database and useful error message if connection fails, returns `nil` if
   connection succeeds."
  [engine {:keys [host port] :as details}, & {:keys [invalid-response-handler]
                                              :or   {invalid-response-handler invalid-connection-response}}]
  ;; This test is disabled for testing so we can save invalid databases, I guess (?) Not sure why this is this way :/
  (when-not config/is-test?
    (let [engine  (keyword engine)
          details (assoc details :engine engine)]
      (try
        (cond
          (driver/can-connect-with-details? engine details :rethrow-exceptions)
          nil

          (and host port (u/host-port-up? host port))
          (invalid-response-handler :dbname (format "Connection to '%s:%d' successful, but could not connect to DB."
                                                    host port))

          (and host (u/host-up? host))
          (invalid-response-handler :port (format "Connection to '%s' successful, but port %d is invalid." port))

          host
          (invalid-response-handler :host (format "'%s' is not reachable" host))

          :else
          (invalid-response-handler :db "Unable to connect to database."))
        (catch Throwable e
          (invalid-response-handler :dbname (.getMessage e)))))))

;; TODO - Just make `:ssl` a `feature`
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [engine]
  {:pre [(driver/is-engine? engine)]}
  (let [driver-props (set (for [field (driver/details-fields (driver/engine->driver engine))]
                            (:name field)))]
    (contains? driver-props "ssl")))

(s/defn ^:private test-connection-details :- su/Map
  "Try a making a connection to database ENGINE with DETAILS.
   Tries twice: once with SSL, and a second time without if the first fails. If either attempt is successful, returns
   the details used to successfully connect.  Otherwise returns a map with the connection error message. (This map
   will also contain the key `:valid` = `false`, which you can use to distinguish an error from valid details.)"
  [engine :- DBEngineString, details :- su/Map]
  (let [details (if (supports-ssl? engine)
                  (assoc details :ssl true)
                  details)]
    ;; this loop tries connecting over ssl and non-ssl to establish a connection
    ;; if it succeeds it returns the `details` that worked, otherwise it returns an error
    (loop [details details]
      (let [error (test-database-connection engine details)]
        (if (and error
                 (true? (:ssl details)))
          (recur (assoc details :ssl false))
          (or error details))))))


(def ^:private CronSchedulesMap
  "Schema with values for a DB's schedules that can be put directly into the DB."
  {(s/optional-key :metadata_sync_schedule)      cron-util/CronScheduleString
   (s/optional-key :cache_field_values_schedule) cron-util/CronScheduleString})

(s/defn schedule-map->cron-strings :- CronSchedulesMap
  "Convert a map of `:schedules` as passed in by the frontend to a map of cron strings with the approriate keys for
   Database. This map can then be merged directly inserted into the DB, or merged with a map of other columns to
   insert/update."
  [{:keys [metadata_sync cache_field_values]} :- ExpandedSchedulesMap]
  (cond-> {}
    metadata_sync      (assoc :metadata_sync_schedule      (cron-util/schedule-map->cron-string metadata_sync))
    cache_field_values (assoc :cache_field_values_schedule (cron-util/schedule-map->cron-string cache_field_values))))


(api/defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync is_on_demand schedules]} :body}]
  {name         su/NonBlankString
   engine       DBEngineString
   details      su/Map
   is_full_sync (s/maybe s/Bool)
   is_on_demand (s/maybe s/Bool)
   schedules    (s/maybe ExpandedSchedulesMap)}
  (api/check-superuser)
  (let [is-full-sync?    (or (nil? is_full_sync)
                             (boolean is_full_sync))
        details-or-error (test-connection-details engine details)]
    (if-not (false? (:valid details-or-error))
      ;; no error, proceed with creation. If record is inserted successfuly, publish a `:database-create` event.
      ;; Throw a 500 if nothing is inserted
      (u/prog1 (api/check-500 (db/insert! Database
                                (merge
                                 {:name         name
                                  :engine       engine
                                  :details      details-or-error
                                  :is_full_sync is-full-sync?
                                  :is_on_demand (boolean is_on_demand)}
                                 (when schedules
                                   (schedule-map->cron-strings schedules)))))
        (events/publish-event! :database-create <>))
      ;; failed to connect, return error
      {:status 400
       :body   details-or-error})))

(api/defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  ;; TODO - why do we pass the DB in under the key `details`?
  [:as {{{:keys [engine details]} :details} :body}]
  {engine  DBEngineString
   details su/Map}
  (api/check-superuser)
  (let [details-or-error (test-connection-details engine details)]
    {:valid (not (false? (:valid details-or-error)))}))


;;; --------------------------------------- POST /api/database/sample_dataset ----------------------------------------

(api/defendpoint POST "/sample_dataset"
  "Add the sample dataset as a new `Database`."
  []
  (api/check-superuser)
  (sample-data/add-sample-dataset!)
  (Database :is_sample true))


;;; --------------------------------------------- PUT /api/database/:id ----------------------------------------------

(api/defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync is_on_demand description caveats points_of_interest schedules]} :body}]
  {name               (s/maybe su/NonBlankString)
   engine             (s/maybe DBEngineString)
   details            (s/maybe su/Map)
   schedules          (s/maybe ExpandedSchedulesMap)
   description        (s/maybe s/Str)                ; s/Str instead of su/NonBlankString because we don't care
   caveats            (s/maybe s/Str)                ; whether someone sets these to blank strings
   points_of_interest (s/maybe s/Str)}
  (api/check-superuser)
  (api/let-404 [database (Database id)]
    (let [details    (if-not (= protected-password (:password details))
                       details
                       (assoc details :password (get-in database [:details :password])))
          conn-error (test-database-connection engine details)
          full-sync? (when-not (nil? is_full_sync)
                       (boolean is_full_sync))]
      (if conn-error
        ;; failed to connect, return error
        {:status 400
         :body   conn-error}
        ;; no error, proceed with update
        (do
          ;; TODO - is there really a reason to let someone change the engine on an existing database?
          ;;       that seems like the kind of thing that will almost never work in any practical way
          ;; TODO - this means one cannot unset the description. Does that matter?
          (api/check-500 (db/update-non-nil-keys! Database id
                           (merge
                            {:name               name
                             :engine             engine
                             :details            details
                             :is_full_sync       full-sync?
                             :is_on_demand       (boolean is_on_demand)
                             :description        description
                             :caveats            caveats
                             :points_of_interest points_of_interest}
                            (when schedules
                              (schedule-map->cron-strings schedules)))))
          (let [db (Database id)]
            (events/publish-event! :database-update db)
            ;; return the DB with the expanded schedules back in place
            (add-expanded-schedules db)))))))


;;; -------------------------------------------- DELETE /api/database/:id --------------------------------------------

(api/defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (api/let-404 [db (Database id)]
    (api/write-check db)
    (db/delete! Database :id id)
    (events/publish-event! :database-delete db))
  api/generic-204-no-content)


;;; ------------------------------------------ POST /api/database/:id/sync -------------------------------------------

;; TODO - Shouldn't we just check for superuser status instead of write checking?
;; NOTE Atte: This becomes maybe obsolete
(api/defendpoint POST "/:id/sync"
  "Update the metadata for this `Database`. This happens asynchronously."
  [id]
  ;; just publish a message and let someone else deal with the logistics
  ;; TODO - does this make any more sense having this extra level of indirection?
  ;; Why not just use a future?
  (events/publish-event! :database-trigger-sync (api/write-check Database id))
  {:status :ok})

;; NOTE Atte Keinänen: If you think that these endpoints could have more descriptive names, please change them.
;; Currently these match the titles of the admin UI buttons that call these endpoints

;; Should somehow trigger sync-database/sync-database!
(api/defendpoint POST "/:id/sync_schema"
  "Trigger a manual update of the schema metadata for this `Database`."
  [id]
  (api/check-superuser)
  ;; just wrap this in a future so it happens async
  (api/let-404 [db (Database id)]
    (future
      (sync-metadata/sync-db-metadata! db)
      (analyze/analyze-db! db)))
  {:status :ok})

;; TODO - do we also want an endpoint to manually trigger analysis. Or separate ones for classification/fingerprinting?

;; Should somehow trigger cached-values/cache-field-values-for-database!
(api/defendpoint POST "/:id/rescan_values"
  "Trigger a manual scan of the field values for this `Database`."
  [id]
  (api/check-superuser)
  ;; just wrap this is a future so it happens async
  (api/let-404 [db (Database id)]
    (future
      (sync-field-values/update-field-values! db)))
  {:status :ok})


;; "Discard saved field values" action in db UI
(defn- database->field-values-ids [database-or-id]
  (map :id (db/query {:select    [[:fv.id :id]]
                      :from      [[FieldValues :fv]]
                      :left-join [[Field :f] [:= :fv.field_id :f.id]
                                  [Table :t] [:= :f.table_id :t.id]]
                      :where     [:= :t.db_id (u/get-id database-or-id)]})))

(defn- delete-all-field-values-for-database! [database-or-id]
  (when-let [field-values-ids (seq (database->field-values-ids database-or-id))]
    (db/execute! {:delete-from FieldValues
                  :where       [:in :id field-values-ids]})))


;; TODO - should this be something like DELETE /api/database/:id/field_values instead?
(api/defendpoint POST "/:id/discard_values"
  "Discards all saved field values for this `Database`."
  [id]
  (api/check-superuser)
  (delete-all-field-values-for-database! id)
  {:status :ok})


;;; ------------------------------------------ GET /api/database/:id/schemas -----------------------------------------

(defn- can-read-schema?
  "Does the current user have permissions to know the schema with `schema-name` exists? (Do they have permissions to see
  at least some of its tables?)"
  [database-id schema-name]
  (perms/set-has-partial-permissions? @api/*current-user-permissions-set*
    (perms/object-path database-id schema-name)))

(api/defendpoint GET "/:id/schemas"
  "Returns a list of all the schemas found for the database `id`"
  [id]
  (api/read-check Database id)
  (->> (db/select-field :schema Table :db_id id)
       (filter (partial can-read-schema? id))
       sort))


;;; ------------------------------------- GET /api/database/:id/schema/:schema ---------------------------------------

(api/defendpoint GET "/:id/schema/:schema"
  "Returns a list of tables for the given database `id` and `schema`"
  [id schema]
  (api/read-check Database id)
  (api/check-403 (can-read-schema? id schema))
  (->> (db/select Table :db_id id, :schema schema, :active true, {:order-by [[:name :asc]]})
       (filter mi/can-read?)
       seq
       api/check-404))


(api/define-routes)
