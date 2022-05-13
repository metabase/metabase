(ns metabase.api.database
  "/api/database endpoints."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [medley.core :as m]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.api.common :as api]
            [metabase.api.table :as table-api]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.events :as events]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.database :as database :refer [Database protected-password]]
            [metabase.models.field :refer [Field readable-fields-only]]
            [metabase.models.field-values :refer [FieldValues]]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.secret :as secret]
            [metabase.models.table :refer [Table]]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.sample-data :as sample-data]
            [metabase.sync.analyze :as analyze]
            [metabase.sync.field-values :as sync-field-values]
            [metabase.sync.schedules :as sync.schedules]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.util :as u]
            [metabase.util.cron :as cron-util]
            [metabase.util.i18n :refer [deferred-tru trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models])
  (:import metabase.models.database.DatabaseInstance))

(def DBEngineString
  "Schema for a valid database engine name, e.g. `h2` or `postgres`."
  (su/with-api-error-message (s/constrained
                              su/NonBlankString
                              #(u/ignore-exceptions (driver/the-driver %))
                              "Valid database engine")
    (deferred-tru "value must be a valid database engine.")))


;;; ----------------------------------------------- GET /api/database ------------------------------------------------

(defn- add-tables [dbs]
  (let [db-id->tables (group-by :db_id (filter mi/can-read? (db/select Table
                                                              :active          true
                                                              :db_id           [:in (map :id dbs)]
                                                              :visibility_type nil
                                                              {:order-by [[:%lower.schema :asc]
                                                                          [:%lower.display_name :asc]]})))]
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
                                        (perms/adhoc-native-query-path (u/the-id db)))
                                    :write
                                    :none))))

(defn- card-database-supports-nested-queries? [{{database-id :database} :dataset_query, :as _card}]
  (when database-id
    (when-let [driver (driver.u/database->driver database-id)]
      (driver/supports? driver :nested-queries))))

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
  [{result-metadata :result_metadata, dataset-query :dataset_query}]
  (and (= (:type dataset-query) :native)
       (some (partial re-find #"_2$")
             (map (comp name :name) result-metadata))))

(defn- card-uses-unnestable-aggregation?
  "Since cumulative count and cumulative sum aggregations are done in Clojure-land we can't use Cards that use queries
  with those aggregations as source queries. This function determines whether `card` is using one of those queries so
  we can filter it out in Clojure-land."
  [{{{aggregations :aggregation} :query} :dataset_query}]
  (mbql.u/match aggregations #{:cum-count :cum-sum}))

(defn card-can-be-used-as-source-query?
  "Does `card`'s query meet the conditions required for it to be used as a source query for another query?"
  [card]
  (and (card-database-supports-nested-queries? card)
       (not (or (card-uses-unnestable-aggregation? card)
                (card-has-ambiguous-columns? card)))))

(defn- ids-of-dbs-that-support-source-queries []
  (set (filter (fn [db-id]
                 (try
                   (some-> (driver.u/database->driver db-id) (driver/supports? :nested-queries))
                   (catch Throwable e
                     (log/error e (tru "Error determining whether Database supports nested queries")))))
               (db/select-ids Database))))

(defn- source-query-cards
  "Fetch the Cards that can be used as source queries (e.g. presented as virtual tables). Since Cards can be either `dataset` or `card`, pass in the `question-type` of `:dataset` or `:card`"
  [question-type & {:keys [additional-constraints xform], :or {xform identity}}]
  {:pre [(#{:card :dataset} question-type)]}
  (when-let [ids-of-dbs-that-support-source-queries (not-empty (ids-of-dbs-that-support-source-queries))]
    (transduce
     (comp (map (partial models/do-post-select Card))
           (filter card-can-be-used-as-source-query?)
           xform)
     (completing conj #(hydrate % :collection))
     []
     (db/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id :result_metadata
                                     [{:select   [:status]
                                       :from     [:moderation_review]
                                       :where    [:and
                                                  [:= :moderated_item_type "card"]
                                                  [:= :moderated_item_id :report_card.id]
                                                  [:= :most_recent true]]
                                       :order-by [[:id :desc]]
                                       :limit    1}
                                      :moderated_status]]
                          :from     [:report_card]
                          :where    (into [:and
                                           [:not= :result_metadata nil]
                                           [:= :archived false]
                                           [:= :dataset (= question-type :dataset)]
                                           [:in :database_id ids-of-dbs-that-support-source-queries]
                                           (collection/visible-collection-ids->honeysql-filter-clause
                                            (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
                                          additional-constraints)
                          :order-by [[:%lower.name :asc]]}))))

(defn- source-query-cards-exist?
  "Truthy if a single Card that can be used as a source query exists."
  [question-type]
  (seq (source-query-cards question-type :xform (take 1))))

(defn- cards-virtual-tables
  "Return a sequence of 'virtual' Table metadata for eligible Cards.
   (This takes the Cards from `source-query-cards` and returns them in a format suitable for consumption by the Query
   Builder.)"
  [question-type & {:keys [include-fields?]}]
  (for [card (source-query-cards question-type)]
    (table-api/card->virtual-table card :include-fields? include-fields?)))

(defn- saved-cards-virtual-db-metadata [question-type & {:keys [include-tables? include-fields?]}]
  (when (public-settings/enable-nested-queries)
    (cond-> {:name               (trs "Saved Questions")
             :id                 mbql.s/saved-questions-virtual-database-id
             :features           #{:basic-aggregations}
             :is_saved_questions true}
      include-tables? (assoc :tables (cards-virtual-tables question-type
                                                           :include-fields? include-fields?)))))

;; "Virtual" tables for saved cards simulate the db->schema->table hierarchy by doing fake-db->collection->card
(defn- add-saved-questions-virtual-database [dbs & options]
  (let [virtual-db-metadata (apply saved-cards-virtual-db-metadata :card options)]
    ;; only add the 'Saved Questions' DB if there are Cards that can be used
    (cond-> dbs
      (and (source-query-cards-exist? :card) virtual-db-metadata) (concat [virtual-db-metadata]))))

(defn- filter-databases-by-data-model-perms
  "Filters the provided list of databases by data model perms, returning only the databases for which the current user
  can fully or partially edit the data model. If the user also has block permissions for any databases, returns only the
  name and ID of these databases, removing all other fields."
  [dbs]
  (let [filtered-dbs
        (if-let [f (u/ignore-exceptions
                    (classloader/require 'metabase-enterprise.advanced-permissions.common)
                    (resolve 'metabase-enterprise.advanced-permissions.common/filter-databases-by-data-model-perms))]
          (f dbs)
          dbs)]
    (map
     (fn [db] (if (mi/can-read? db)
                db
                (select-keys db [:id :name :tables])))
     filtered-dbs)))

(defn- check-db-data-model-perms
  [db include-editable-data-model?]
  (if include-editable-data-model?
    (let [filtered-dbs (filter-databases-by-data-model-perms [db])]
      (when (seq filtered-dbs)
        (first filtered-dbs)))
    db))

(defn- dbs-list [& {:keys [include-tables?
                           include-saved-questions-db?
                           include-saved-questions-tables?
                           include-editable-data-model?
                           exclude-uneditable-details?]}]
  (let [dbs (db/select Database {:order-by [:%lower.name :%lower.engine]})
        dbs (if include-editable-data-model?
              ;; Since users can have *data model* perms even if they have no *data* perms for a DB, we don't filter by
              ;; read permissions here if `include-editable-data-model?` is true. Instead, we only return ID, name
              ;; and tables for DBs for which the user has no data perms, to avoid exposing unecessary DB metadata.
              dbs
              (filter mi/can-read? dbs))
        dbs (if exclude-uneditable-details? (filter mi/can-write? dbs) dbs)]
    (cond-> (add-native-perms-info dbs)
      include-tables?              add-tables
      include-editable-data-model? filter-databases-by-data-model-perms
      include-saved-questions-db?  (add-saved-questions-virtual-database :include-tables? include-saved-questions-tables?))))

(def FetchAllIncludeValues
  "Schema for matching the include parameter of the GET / endpoint"
  (su/with-api-error-message
    (s/maybe (s/eq "tables"))
    (deferred-tru "include must be either empty or the value 'tables'")))

(api/defendpoint GET "/"
  "Fetch all `Databases`.

  * `include=tables` means we should hydrate the Tables belonging to each DB. Default: `false`.

  * `saved` means we should include the saved questions virtual database. Default: `false`.

  * `include_tables` is a legacy alias for `include=tables`, but should be considered deprecated as of 0.35.0, and will
    be removed in a future release.

  * `include_cards` here means we should also include virtual Table entries for saved Questions, e.g. so we can easily
    use them as source Tables in queries. This is a deprecated alias for `saved=true` + `include=tables` (for the saved
    questions virtual DB). Prefer using `include` and `saved` instead.

  * `include_editable_data_model` will only include DBs for which the current user has data model editing
    permissions. (If `include=tables`, this also applies to the list of tables in each DB). Has no effect unless
    Enterprise Edition code is available the advanced-permissions feature is enabled.

  * `exclude_uneditable_details` will only include DBs for which the current user can edit the DB details. Has no
    effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled."
  [include_tables include_cards include saved include_editable_data_model exclude_uneditable_details]
  {include_tables                (s/maybe su/BooleanString)
   include_cards                 (s/maybe su/BooleanString)
   include                       FetchAllIncludeValues
   saved                         (s/maybe su/BooleanString)
   include_editable_data_model   (s/maybe su/BooleanString)
   exclude_uneditable_details    (s/maybe su/BooleanString)}
  (when (and config/is-dev?
             (or include_tables include_cards))
    ;; don't need to i18n since this is dev-facing only
    (log/warn "GET /api/database?include_tables and ?include_cards are deprecated."
              "Prefer using ?include=tables and ?saved=true instead."))
  (let [include-tables?                 (cond
                                          (seq include)        (= include "tables")
                                          (seq include_tables) (Boolean/parseBoolean include_tables))
        include-saved-questions-db?     (cond
                                          (seq saved)         (Boolean/parseBoolean saved)
                                          (seq include_cards) (Boolean/parseBoolean include_cards))
        include-saved-questions-tables? (when include-saved-questions-db?
                                          (if (seq include_cards)
                                            true
                                            include-tables?))
        db-list-res                     (or (dbs-list :include-tables?                 include-tables?
                                                      :include-saved-questions-db?     include-saved-questions-db?
                                                      :include-saved-questions-tables? include-saved-questions-tables?
                                                      :include-editable-data-model?    (Boolean/parseBoolean include_editable_data_model)
                                                      :exclude-uneditable-details?     (Boolean/parseBoolean exclude_uneditable_details))
                                            [])]
    {:data  db-list-res
     :total (count db-list-res)}))


;;; --------------------------------------------- GET /api/database/:id ----------------------------------------------

(s/defn ^:private expanded-schedules [db :- DatabaseInstance]
  {:cache_field_values (cron-util/cron-string->schedule-map (:cache_field_values_schedule db))
   :metadata_sync      (cron-util/cron-string->schedule-map (:metadata_sync_schedule db))})

(defn- add-expanded-schedules
  "Add 'expanded' versions of the cron schedules strings for DB in a format that is appropriate for frontend
  consumption."
  [db]
  (assoc db :schedules (expanded-schedules db)))

(defn- filter-sensitive-fields
  [fields]
  (remove #(= :sensitive (:visibility_type %)) fields))

(defn- get-database-hydrate-include
  "If URL param `?include=` was passed to `GET /api/database/:id`, hydrate the Database appropriately."
  [db include]
  (if-not include
    db
    (-> (hydrate db (case include
                      "tables"        :tables
                      "tables.fields" [:tables [:fields [:target :has_field_values] :has_field_values]]))
        (update :tables (fn [tables]
                          (cond->> tables
                            ; filter hidden tables
                            true                        (filter (every-pred (complement :visibility_type) mi/can-read?))
                            ; filter hidden fields
                            (= include "tables.fields") (map #(update % :fields filter-sensitive-fields))))))))

(api/defendpoint GET "/:id"
  "Get a single Database with `id`. Optionally pass `?include=tables` or `?include=tables.fields` to include the Tables
  belonging to this database, or the Tables and Fields, respectively.  If the requestor has write permissions for the DB
  (i.e. is an admin or has data model permissions), then certain inferred secret values will also be included in the
  returned details (see [[metabase.models.secret/expand-db-details-inferred-secret-values]] for full details).

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata."
  [id include include_editable_data_model]
  {include (s/maybe (s/enum "tables" "tables.fields"))}
  (let [include-editable-data-model? (Boolean/parseBoolean include_editable_data_model)]
    (cond-> (api/check-404 (Database id))
      (not include-editable-data-model?) api/read-check
      true                               add-expanded-schedules
      true                               (get-database-hydrate-include include)
      mi/can-write?                      secret/expand-db-details-inferred-secret-values
      include-editable-data-model?       (check-db-data-model-perms include-editable-data-model?))))


;;; ----------------------------------------- GET /api/database/:id/metadata -----------------------------------------

;; Since the normal `:id` param in the normal version of the endpoint will never match with negative numbers
;; we'll create another endpoint to specifically match the ID of the 'virtual' database. The `defendpoint` macro
;; requires either strings or vectors for the route so we'll have to use a vector and create a regex to only
;; match the virtual ID (and nothing else).
(api/defendpoint GET ["/:virtual-db/metadata" :virtual-db (re-pattern (str mbql.s/saved-questions-virtual-database-id))]
  "Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database."
  []
  (saved-cards-virtual-db-metadata :card :include-tables? true, :include-fields? true))

(defn- filter-tables-by-data-model-perms
  [tables]
  (if-let [f (u/ignore-exceptions
              (classloader/require 'metabase-enterprise.advanced-permissions.common)
              (resolve 'metabase-enterprise.advanced-permissions.common/filter-tables-by-data-model-perms))]
    (f tables)
    tables))

(defn- db-metadata [id include-hidden? include-editable-data-model?]
  (-> (if include-editable-data-model?
        (api/check-404 (Database id))
        (api/read-check Database id))
      (hydrate [:tables [:fields [:target :has_field_values] :has_field_values] :segments :metrics])
      (update :tables (if include-hidden?
                        identity
                        (fn [tables]
                          (->> tables
                               (remove :visibility_type)
                               (map #(update % :fields filter-sensitive-fields))))))
      (update :tables (fn [tables]
                        (for [table tables
                              :when (mi/can-read? table)]
                          (-> table
                              (update :segments (partial filter mi/can-read?))
                              (update :metrics  (partial filter mi/can-read?))))))
      (update :tables (fn [tables]
                        (if include-editable-data-model?
                          (filter-tables-by-data-model-perms tables)
                          tables)))
      (check-db-data-model-perms include-editable-data-model?)))

(api/defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`. Returns DB, fields, and field values.
  By default only non-hidden tables and fields are returned. Passing include_hidden=true includes them.

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata."
  [id include_hidden include_editable_data_model]
  {include_hidden              (s/maybe su/BooleanString)
   include_editable_data_model (s/maybe su/BooleanString)}
  (db-metadata id
               (Boolean/parseBoolean include_hidden)
               (Boolean/parseBoolean include_editable_data_model)))


;;; --------------------------------- GET /api/database/:id/autocomplete_suggestions ---------------------------------

(defn- autocomplete-tables [db-id search-string limit]
  (db/select [Table :id :db_id :schema :name]
    {:where    [:and [:= :db_id db-id]
                     [:= :active true]
                     [:like :%lower.name (str/lower-case search-string)]
                     [:= :visibility_type nil]]
     :order-by [[:%lower.name :asc]]
     :limit    limit}))

(defn- autocomplete-fields [db-id search-string limit]
  (db/select [Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
    :metabase_field.active          true
    :%lower.metabase_field.name     [:like (str/lower-case search-string)]
    :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
    :table.db_id                    db-id
    {:order-by  [[:%lower.metabase_field.name :asc]
                 [:%lower.table.name :asc]]
     :left-join [[:metabase_table :table] [:= :table.id :metabase_field.table_id]]
     :limit     limit}))

(defn- autocomplete-results [tables fields limit]
  (let [tbl-count   (count tables)
        fld-count   (count fields)
        take-tables (min tbl-count (- limit (/ fld-count 2)))
        take-fields (- limit take-tables)]
    (concat (for [{table-name :name} (take take-tables tables)]
              [table-name "Table"])
            (for [{:keys [table_name base_type semantic_type name]} (take take-fields fields)]
              [name (str table_name
                         " "
                         base_type
                         (when semantic_type
                           (str " " semantic_type)))]))))

(defn- autocomplete-suggestions
  "match-string is a string that will be used with ilike. The it will be lowercased by autocomplete-{tables,fields}. "
  [db-id match-string]
  (let [limit  50
        tables (filter mi/can-read? (autocomplete-tables db-id match-string limit))
        fields (readable-fields-only (autocomplete-fields db-id match-string limit))]
    (autocomplete-results tables fields limit)))

(api/defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given `prefix`.

  This is intened for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching `Tables`
  and `Fields` in this `Database`.

  Tables are returned in the format `[table_name \"Table\"]`;
  When Fields have a semantic_type, they are returned in the format `[field_name \"table_name base_type semantic_type\"]`
  When Fields lack a semantic_type, they are returned in the format `[field_name \"table_name base_type\"]`"
  [id prefix search]
  (api/read-check Database id)
  (try
    (cond
      search
      (autocomplete-suggestions id (str "%" search "%"))
      prefix
      (autocomplete-suggestions id (str prefix "%"))
      :else
      (ex-info "must include prefix or search" {}))
    (catch Throwable t
      (log/warn "Error with autocomplete: " (.getMessage t)))))


;;; ------------------------------------------ GET /api/database/:id/fields ------------------------------------------

(api/defendpoint GET "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [id]
  (api/read-check Database id)
  (let [fields (filter mi/can-read? (-> (db/select [Field :id :display_name :table_id :base_type :semantic_type]
                                          :table_id        [:in (db/select-field :id Table, :db_id id)]
                                          :visibility_type [:not-in ["sensitive" "retired"]])
                                        (hydrate :table)))]
    (for [{:keys [id display_name table base_type semantic_type]} fields]
      {:id            id
       :name          display_name
       :base_type     base_type
       :semantic_type semantic_type
       :table_name    (:display_name table)
       :schema        (:schema table)})))


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
  [engine {:keys [host port] :as details}, & {:keys [invalid-response-handler log-exception]
                                              :or   {invalid-response-handler invalid-connection-response
                                                     log-exception            true}}]
  {:pre [(some? engine)]}
  (let [engine  (keyword engine)
        details (assoc details :engine engine)]
    (try
      (cond
        (driver.u/can-connect-with-details? engine details :throw-exceptions)
        nil

        (and host port (u/host-port-up? host port))
        (invalid-response-handler :dbname (tru "Connection to ''{0}:{1}'' successful, but could not connect to DB."
                                               host port))

        (and host (u/host-up? host))
        (invalid-response-handler :port (tru "Connection to host ''{0}'' successful, but port {1} is invalid."
                                             host port))

        host
        (invalid-response-handler :host (tru "Host ''{0}'' is not reachable" host))

        :else
        (invalid-response-handler :db (tru "Unable to connect to database.")))
      (catch Throwable e
        (when (and log-exception (not (some->> e ex-cause ex-data ::driver/can-connect-message?)))
          (log/error e (trs "Cannot connect to Database")))
        (invalid-response-handler :dbname (.getMessage e))))))

;; TODO - Just make `:ssl` a `feature`
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [driver]
  {:pre [(driver/available? driver)]}
  (let [driver-props (set (for [field (driver/connection-properties driver)]
                            (:name field)))]
    (contains? driver-props "ssl")))

(s/defn ^:private test-connection-details :- su/Map
  "Try a making a connection to database `engine` with `details`.

  If the `details` has SSL explicitly enabled, go with that and do not accept plaintext connections. If it is disabled,
  try twice: once with SSL, and a second time without if the first fails. If either attempt is successful, returns
  the details used to successfully connect. Otherwise returns a map with the connection error message. (This map will
  also contain the key `:valid` = `false`, which you can use to distinguish an error from valid details.)"
  [engine :- DBEngineString, details :- su/Map]
  (let [;; Try SSL first if SSL is supported and not already enabled
        ;; If not successful or not applicable, details-with-ssl will be nil
        details-with-ssl (assoc details :ssl true)
        details-with-ssl (when (and (supports-ssl? (keyword engine))
                                    (not (true? (:ssl details)))
                                    (nil? (test-database-connection engine details-with-ssl :log-exception false)))
                           details-with-ssl)]
    (or
      ;; Opportunistic SSL
      details-with-ssl
      ;; Try with original parameters
      (test-database-connection engine details)
      details)))

(api/defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync is_on_demand schedules auto_run_queries cache_ttl]} :body}]
  {name             su/NonBlankString
   engine           DBEngineString
   details          su/Map
   is_full_sync     (s/maybe s/Bool)
   is_on_demand     (s/maybe s/Bool)
   schedules        (s/maybe sync.schedules/ExpandedSchedulesMap)
   auto_run_queries (s/maybe s/Bool)
   cache_ttl        (s/maybe su/IntGreaterThanZero)}
  (api/check-superuser)
  (let [is-full-sync?    (or (nil? is_full_sync)
                             (boolean is_full_sync))
        details-or-error (test-connection-details engine details)
        valid?           (not= (:valid details-or-error) false)]
    (if valid?
      ;; no error, proceed with creation. If record is inserted successfuly, publish a `:database-create` event.
      ;; Throw a 500 if nothing is inserted
      (u/prog1 (api/check-500 (db/insert! Database
                                (merge
                                  {:name         name
                                   :engine       engine
                                   :details      details-or-error
                                   :is_full_sync is-full-sync?
                                   :is_on_demand (boolean is_on_demand)
                                   :cache_ttl    cache_ttl
                                   :creator_id   api/*current-user-id*}
                                  (sync.schedules/schedule-map->cron-strings
                                    (if (:let-user-control-scheduling details)
                                      (sync.schedules/scheduling schedules)
                                      (sync.schedules/default-randomized-schedule)))
                                  (when (some? auto_run_queries)
                                    {:auto_run_queries auto_run_queries}))))
        (events/publish-event! :database-create <>)
        (snowplow/track-event! ::snowplow/database-connection-successful
                               api/*current-user-id*
                               {:database engine, :database-id (u/the-id <>), :source :admin}))
      ;; failed to connect, return error
      (do
        (snowplow/track-event! ::snowplow/database-connection-failed
                               api/*current-user-id*
                               {:database engine, :source :setup})
        {:status 400
         :body   details-or-error}))))

(api/defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  ;; TODO - why do we pass the DB in under the key `details`?
  [:as {{{:keys [engine details]} :details} :body}]
  {engine  DBEngineString
   details su/Map}
  (api/check-superuser)
  (let [details-or-error (test-connection-details engine details)]
    {:valid (not (false? (:valid details-or-error)))}))


;;; --------------------------------------- POST /api/database/sample_database ----------------------------------------

(api/defendpoint POST "/sample_database"
  "Add the sample database as a new `Database`."
  []
  (api/check-superuser)
  (sample-data/add-sample-database!)
  (Database :is_sample true))


;;; --------------------------------------------- PUT /api/database/:id ----------------------------------------------

(defn upsert-sensitive-fields
  "Replace any sensitive values not overriden in the PUT with the original values"
  [database details]
  (when details
    (merge (:details database)
           (reduce
            (fn [details k]
              (if (= protected-password (get details k))
                (m/update-existing details k (constantly (get-in database [:details k])))
                details))
            details
            (database/sensitive-fields-for-db database)))))

(api/defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync is_on_demand description caveats points_of_interest schedules
                   auto_run_queries refingerprint cache_ttl]} :body}]
  {name               (s/maybe su/NonBlankString)
   engine             (s/maybe DBEngineString)
   refingerprint      (s/maybe s/Bool)
   details            (s/maybe su/Map)
   schedules          (s/maybe sync.schedules/ExpandedSchedulesMap)
   description        (s/maybe s/Str)                ; s/Str instead of su/NonBlankString because we don't care
   caveats            (s/maybe s/Str)                ; whether someone sets these to blank strings
   points_of_interest (s/maybe s/Str)
   auto_run_queries   (s/maybe s/Bool)
   cache_ttl          (s/maybe su/IntGreaterThanZero)}
  ;; TODO - ensure that custom schedules and let-user-control-scheduling go in lockstep
  (let [existing-database (api/write-check (Database id))
        details           (driver.u/db-details-client->server engine details)
        details           (upsert-sensitive-fields existing-database details)
        conn-error        (when (some? details)
                            (assert (some? engine))
                            (test-database-connection engine details))
        full-sync?        (when-not (nil? is_full_sync)
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
                                                  :refingerprint      refingerprint
                                                  :is_full_sync       full-sync?
                                                  :is_on_demand       (boolean is_on_demand)
                                                  :description        description
                                                  :caveats            caveats
                                                  :points_of_interest points_of_interest
                                                  :auto_run_queries   auto_run_queries}
                                                 (cond
                                                   ;; transition back to metabase managed schedules. the schedule
                                                   ;; details, even if provided, are ignored. database is the
                                                   ;; current stored value and check against the incoming details
                                                   (and (get-in existing-database [:details :let-user-control-scheduling])
                                                        (not (:let-user-control-scheduling details)))

                                                   (sync.schedules/schedule-map->cron-strings (sync.schedules/default-randomized-schedule))

                                                   ;; if user is controlling schedules
                                                   (:let-user-control-scheduling details)
                                                   (sync.schedules/schedule-map->cron-strings (sync.schedules/scheduling schedules))))))
        ;; do nothing in the case that user is not in control of
        ;; scheduling. leave them as they are in the db

        ;; unlike the other fields, folks might want to nil out cache_ttl
        (api/check-500 (db/update! Database id {:cache_ttl cache_ttl}))

        (let [db (Database id)]
          (events/publish-event! :database-update db)
          ;; return the DB with the expanded schedules back in place
          (add-expanded-schedules db))))))


;;; -------------------------------------------- DELETE /api/database/:id --------------------------------------------

(api/defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  (api/check-superuser)
  (api/let-404 [db (Database id)]
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
  ;; just wrap this in a future so it happens async
  (let [db (api/write-check (Database id))]
    (future
      (sync-metadata/sync-db-metadata! db)
      (analyze/analyze-db! db)))
  {:status :ok})

;; TODO - do we also want an endpoint to manually trigger analysis. Or separate ones for classification/fingerprinting?

(def ^:dynamic *rescan-values-async*
  "Boolean indicating whether the rescan_values job should be done async or not. Defaults to `true`. Should only be rebound
  in tests to force the scan to block."
  true)

;; Should somehow trigger cached-values/cache-field-values-for-database!
(api/defendpoint POST "/:id/rescan_values"
  "Trigger a manual scan of the field values for this `Database`."
  [id]
  ;; just wrap this is a future so it happens async
  (let [db (api/write-check (Database id))]
    ;; Override *current-user-permissions-set* so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      (if *rescan-values-async*
        (future (sync-field-values/update-field-values! db))
        (sync-field-values/update-field-values! db))))
  {:status :ok})

;; "Discard saved field values" action in db UI
(defn- database->field-values-ids [database-or-id]
  (map :id (db/query {:select    [[:fv.id :id]]
                      :from      [[FieldValues :fv]]
                      :left-join [[Field :f] [:= :fv.field_id :f.id]
                                  [Table :t] [:= :f.table_id :t.id]]
                      :where     [:= :t.db_id (u/the-id database-or-id)]})))

(defn- delete-all-field-values-for-database! [database-or-id]
  (when-let [field-values-ids (seq (database->field-values-ids database-or-id))]
    (db/execute! {:delete-from FieldValues
                  :where       [:in :id field-values-ids]})))


;; TODO - should this be something like DELETE /api/database/:id/field_values instead?
(api/defendpoint POST "/:id/discard_values"
  "Discards all saved field values for this `Database`."
  [id]
  (delete-all-field-values-for-database! (api/write-check (Database id)))
  {:status :ok})


;;; ------------------------------------------ GET /api/database/:id/schemas -----------------------------------------

(defn- can-read-schema?
  "Does the current user have permissions to know the schema with `schema-name` exists? (Do they have permissions to see
  at least some of its tables?)"
  [database-id schema-name]
  (or
   (perms/set-has-partial-permissions? @api/*current-user-permissions-set*
                                       (perms/data-perms-path database-id schema-name))
   (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                    (perms/data-model-write-perms-path database-id schema-name))))

(api/defendpoint GET "/:id/schemas"
  "Returns a list of all the schemas found for the database `id`"
  [id]
  (api/read-check Database id)
  (->> (db/select-field :schema Table
         :db_id id :active true
         ;; a non-nil value means Table is hidden -- see [[metabase.models.table/visibility-types]]
         :visibility_type nil
         {:order-by [[:%lower.schema :asc]]})
       (filter (partial can-read-schema? id))
       ;; for `nil` schemas return the empty string
       (map #(if (nil? %) "" %))
       distinct
       sort))

(api/defendpoint GET ["/:virtual-db/schemas"
                      :virtual-db (re-pattern (str mbql.s/saved-questions-virtual-database-id))]
  "Returns a list of all the schemas found for the saved questions virtual database."
  []
  (when (public-settings/enable-nested-queries)
    (->> (cards-virtual-tables :card)
         (map :schema)
         distinct
         (sort-by str/lower-case))))

(api/defendpoint GET ["/:virtual-db/datasets"
                      :virtual-db (re-pattern (str mbql.s/saved-questions-virtual-database-id))]
  "Returns a list of all the datasets found for the saved questions virtual database."
  []
  (when (public-settings/enable-nested-queries)
    (->> (cards-virtual-tables :dataset)
         (map :schema)
         distinct
         (sort-by str/lower-case))))


;;; ------------------------------------- GET /api/database/:id/schema/:schema ---------------------------------------

(defn- schema-tables-list [db-id schema]
  (api/read-check Database db-id)
  (api/check-403 (can-read-schema? db-id schema))
  (filter mi/can-read? (db/select Table
                         :db_id           db-id
                         :schema          schema
                         :active          true
                         ;; a non-nil value means Table is hidden -- see [[metabase.models.table/visibility-types]]
                         :visibility_type nil
                         {:order-by [[:display_name :asc]]})))

(api/defendpoint GET "/:id/schema/:schema"
  "Returns a list of Tables for the given Database `id` and `schema`"
  [id schema]
  (api/check-404 (seq (schema-tables-list id schema))))

(api/defendpoint GET "/:id/schema/"
  "Return a list of Tables for a Database whose `schema` is `nil` or an empty string."
  [id]
  (api/check-404 (seq (concat (schema-tables-list id nil)
                              (schema-tables-list id "")))))

(api/defendpoint GET ["/:virtual-db/schema/:schema"
                      :virtual-db (re-pattern (str mbql.s/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the saved questions virtual database."
  [schema]
  (when (public-settings/enable-nested-queries)
    (->> (source-query-cards
          :card
          :additional-constraints [(if (= schema (table-api/root-collection-schema-name))
                                      [:= :collection_id nil]
                                      [:in :collection_id (api/check-404 (seq (db/select-ids Collection :name schema)))])])
         (map table-api/card->virtual-table))))

(api/defendpoint GET ["/:virtual-db/datasets/:schema"
                      :virtual-db (re-pattern (str mbql.s/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the datasets virtual database."
  [schema]
  (when (public-settings/enable-nested-queries)
    (->> (source-query-cards
          :dataset
          :additional-constraints [(if (= schema (table-api/root-collection-schema-name))
                                      [:= :collection_id nil]
                                      [:in :collection_id (api/check-404 (seq (db/select-ids Collection :name schema)))])])
         (map table-api/card->virtual-table))))

(api/defendpoint GET "/db-ids-with-deprecated-drivers"
  "Return a list of database IDs using currently deprecated drivers."
  []
  (map
    u/the-id
    (filter
      (fn [database]
        (let [info (driver.u/available-drivers-info)
              d    (driver.u/database->driver database)]
          (some? (:superseded-by (d info)))))
      (db/select-ids Database))))

(api/define-routes)
