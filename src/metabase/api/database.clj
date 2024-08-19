(ns metabase.api.database
  "/api/database endpoints."
  (:require
   [clojure.string :as str]
   [compojure.core :refer [DELETE GET POST PUT]]
   [medley.core :as m]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.table :as api.table]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.h2 :as h2]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database
    :as database
    :refer [Database protected-password]]
   [metabase.models.field :refer [Field readable-fields-only]]
   [metabase.models.interface :as mi]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.secret :as secret]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.table :refer [Table]]
   [metabase.plugins.classloader :as classloader]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.sample-data :as sample-data]
   [metabase.server.middleware.session :as mw.session]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as field-values]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.util :as sync-util]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.upload :as upload]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def DBEngineString
  "Schema for a valid database engine name, e.g. `h2` or `postgres`."
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn
     {:error/message "Valid database engine"}
     #(u/ignore-exceptions (driver/the-driver %))]]
   (deferred-tru "value must be a valid database engine.")))


;;; ----------------------------------------------- GET /api/database ------------------------------------------------

(defn- add-tables [dbs]
  (let [db-id->tables (group-by :db_id (filter mi/can-read? (t2/select Table
                                                              :active          true
                                                              :db_id           [:in (map :id dbs)]
                                                              :visibility_type nil
                                                              {:order-by [[:%lower.schema :asc]
                                                                          [:%lower.display_name :asc]]})))]
    (for [db dbs]
      (assoc db :tables (get db-id->tables (:id db) [])))))

(mu/defn- add-native-perms-info :- [:maybe
                                             [:sequential
                                              [:map
                                               [:native_permissions [:enum :write :none]]]]]
  "For each database in DBS add a `:native_permissions` field describing the current user's permissions for running
  native (e.g. SQL) queries. Will be either `:write` or `:none`. `:write` means you can run ad-hoc native queries,
  and save new Cards with native queries; `:none` means you can do neither.

  For the curious: the use of `:write` and `:none` is mainly for legacy purposes, when we had data-access-based
  permissions; there was a specific option where you could give a Perms Group permissions to run existing Cards with
  native queries, but not to create new ones. With the advent of what is currently being called 'Space-Age
  Permissions', all Cards' permissions are based on their parent Collection, removing the need for native read perms."
  [dbs :- [:maybe [:sequential :map]]]
  (for [db dbs]
    (assoc db
           :native_permissions
           (if (= :query-builder-and-native
                  (data-perms/full-db-permission-for-user
                   api/*current-user-id*
                   :perms/create-queries
                   (u/the-id db)))
             :write
             :none))))

(defn- card-database-supports-nested-queries? [{{database-id :database, :as database} :dataset_query, :as _card}]
  (when database-id
    (when-let [driver (driver.u/database->driver database-id)]
      (driver.u/supports? driver :nested-queries database))))

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
  (lib.util.match/match aggregations #{:cum-count :cum-sum}))

(defn card-can-be-used-as-source-query?
  "Does `card`'s query meet the conditions required for it to be used as a source query for another query?"
  [card]
  (and (card-database-supports-nested-queries? card)
       (not (or (card-uses-unnestable-aggregation? card)
                (card-has-ambiguous-columns? card)))))

(defn- ids-of-dbs-that-support-source-queries []
  (set (filter (fn [db-id]
                 (try
                   (when-let [db (t2/select-one Database :id db-id)]
                     (driver.u/supports? (:engine db) :nested-queries db))
                   (catch Throwable e
                     (log/error e "Error determining whether Database supports nested queries"))))
               (t2/select-pks-set Database))))

(mu/defn- source-query-cards
  "Fetch the Cards that can be used as source queries (e.g. presented as virtual tables)."
  [card-type :- ::card/type
   & {:keys [additional-constraints xform], :or {xform identity}}]
  (when-let [ids-of-dbs-that-support-source-queries (not-empty (ids-of-dbs-that-support-source-queries))]
    (transduce
     (comp (map (partial mi/do-after-select Card))
           (filter card-can-be-used-as-source-query?)
           xform)
     (completing conj #(t2/hydrate % :collection :metrics))
     []
     (t2/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id
                                     :result_metadata :type :source_card_id
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
                                           ;; always return metrics for now
                                           [:in :type [(u/qualified-name card-type) "metric"]]
                                           [:in :database_id ids-of-dbs-that-support-source-queries]
                                           (collection/visible-collection-ids->honeysql-filter-clause
                                            (collection/permissions-set->visible-collection-ids
                                             @api/*current-user-permissions-set*))]
                                          additional-constraints)
                          :order-by [[:%lower.name :asc]]}))))

(mu/defn- source-query-cards-exist?
  "Truthy if a single Card that can be used as a source query exists."
  [card-type :- ::card/type]
  (seq (source-query-cards card-type :xform (take 1))))

(mu/defn- cards-virtual-tables
  "Return a sequence of 'virtual' Table metadata for eligible Cards.
   (This takes the Cards from `source-query-cards` and returns them in a format suitable for consumption by the Query
   Builder.)"
  [card-type :- ::card/type
   & {:keys [include-fields?]}]
  (for [card (source-query-cards card-type)]
    (api.table/card->virtual-table card :include-fields? include-fields?)))

(mu/defn- saved-cards-virtual-db-metadata
  [card-type :- ::card/type
   & {:keys [include-tables? include-fields?]}]
  (when (public-settings/enable-nested-queries)
    (cond-> {:name               (trs "Saved Questions")
             :id                 lib.schema.id/saved-questions-virtual-database-id
             :features           #{:basic-aggregations}
             :is_saved_questions true}
      include-tables? (assoc :tables (cards-virtual-tables card-type
                                                           :include-fields? include-fields?)))))

;; "Virtual" tables for saved cards simulate the db->schema->table hierarchy by doing fake-db->collection->card
(defn- add-saved-questions-virtual-database [dbs & options]
  (let [virtual-db-metadata (apply saved-cards-virtual-db-metadata :question options)]
    ;; only add the 'Saved Questions' DB if there are Cards that can be used
    (cond-> dbs
      (and (source-query-cards-exist? :question) virtual-db-metadata) (concat [virtual-db-metadata]))))

(defn- filter-databases-by-data-model-perms
  "Filters the provided list of databases by data model perms, returning only the databases for which the current user
  can fully or partially edit the data model. If the user does not have data access for any databases, returns only the
  name and ID of these databases, removing all other fields."
  [dbs]
  (let [filtered-dbs
        (if-let [f (when config/ee-available?
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
  "Given a DB, checks that *current-user* has any data model editing perms for the DB. If yes, returns the DB,
  with its tables also filtered by data model editing perms. If it does not, throws a permissions exception."
  [db]
  (let [filtered-dbs (filter-databases-by-data-model-perms [db])]
    (api/check-403 (first filtered-dbs))))

(defn- uploadable-db?
  "Are uploads supported for this database?"
  [db]
  (driver.u/supports? (driver.u/database->driver db) :uploads db))

(defn- add-can-upload
  "Adds :can_upload boolean, which is true if the user can create a new upload to this DB."
  [db]
  (assoc db :can_upload (upload/can-create-upload? db (:uploads_schema_name db))))

(defn- add-can-upload-to-dbs
  "Add an entry to each DB about whether the user can upload to it."
  [dbs]
  (for [db dbs]
    (add-can-upload db)))

(defn- dbs-list
  [& {:keys [include-tables?
             include-saved-questions-db?
             include-saved-questions-tables?
             include-editable-data-model?
             include-analytics?
             exclude-uneditable-details?
             include-only-uploadable?]}]
  (let [dbs (t2/select Database (merge {:order-by [:%lower.name :%lower.engine]}
                                       (when-not include-analytics?
                                         {:where [:= :is_audit false]})))
        filter-by-data-access? (not (or include-editable-data-model? exclude-uneditable-details?))]
    (cond-> (add-native-perms-info dbs)
      include-tables?              add-tables
      true                         add-can-upload-to-dbs
      include-editable-data-model? filter-databases-by-data-model-perms
      exclude-uneditable-details?  (#(filter mi/can-write? %))
      filter-by-data-access?       (#(filter mi/can-read? %))
      include-saved-questions-db?  (add-saved-questions-virtual-database :include-tables? include-saved-questions-tables?)
      ;; Perms checks for uploadable DBs are handled by exclude-uneditable-details? (see below)
      include-only-uploadable?     (#(filter uploadable-db? %)))))

(api/defendpoint GET "/"
  "Fetch all `Databases`.

  * `include=tables` means we should hydrate the Tables belonging to each DB. Default: `false`.

  * `saved` means we should include the saved questions virtual database. Default: `false`.

  * `include_editable_data_model` will only include DBs for which the current user has data model editing
    permissions. (If `include=tables`, this also applies to the list of tables in each DB). Should only be used if
    Enterprise Edition code is available the advanced-permissions feature is enabled.

  * `exclude_uneditable_details` will only include DBs for which the current user can edit the DB details. Has no
    effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled.

  * `include_only_uploadable` will only include DBs into which Metabase can insert new data."
  [include saved include_editable_data_model exclude_uneditable_details include_only_uploadable include_analytics]
  {include                       (mu/with-api-error-message
                                   [:maybe [:= "tables"]]
                                   (deferred-tru "include must be either empty or the value 'tables'"))
   include_analytics             [:maybe :boolean]
   saved                         [:maybe :boolean]
   include_editable_data_model   [:maybe :boolean]
   exclude_uneditable_details    [:maybe :boolean]
   include_only_uploadable       [:maybe :boolean]}
  (let [include-tables?                 (= include "tables")
        include-saved-questions-tables? (and saved include-tables?)
        only-editable?                  (or include_only_uploadable exclude_uneditable_details)
        db-list-res                     (or (dbs-list :include-tables?                 include-tables?
                                                      :include-saved-questions-db?     saved
                                                      :include-saved-questions-tables? include-saved-questions-tables?
                                                      :include-editable-data-model?    include_editable_data_model
                                                      :exclude-uneditable-details?     only-editable?
                                                      :include-analytics?              include_analytics
                                                      :include-only-uploadable?        include_only_uploadable)
                                            [])]
   {:data  db-list-res
    :total (count db-list-res)}))

;;; --------------------------------------------- GET /api/database/:id ----------------------------------------------

(mu/defn- expanded-schedules [db :- (ms/InstanceOf Database)]
  {:metadata_sync      (u.cron/cron-string->schedule-map (:metadata_sync_schedule db))
   :cache_field_values (some-> (:cache_field_values_schedule db) u.cron/cron-string->schedule-map)})

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
    (-> (t2/hydrate db (case include
                         "tables"        :tables
                         "tables.fields" [:tables [:fields [:target :has_field_values] :has_field_values]]))
        (update :tables (fn [tables]
                          (cond->> tables
                            ; filter hidden tables
                            true                        (filter (every-pred (complement :visibility_type) mi/can-read?))
                            true                        (map (fn [table] (update table :schema str)))
                            ; filter hidden fields
                            (= include "tables.fields") (map #(update % :fields filter-sensitive-fields))))))))

(defn get-database
  "Get a single Database with `id`."
  [id {:keys [include include-editable-data-model? exclude-uneditable-details?]}]
  (let [filter-by-data-access?       (not (or include-editable-data-model? exclude-uneditable-details?))
        database                     (api/check-404 (t2/select-one Database :id id))]
    (cond-> database
      filter-by-data-access?       api/read-check
      exclude-uneditable-details?  api/write-check
      true                         add-expanded-schedules
      true                         (get-database-hydrate-include include)
      true                         add-can-upload
      include-editable-data-model? check-db-data-model-perms
      (mi/can-write? database)     (->
                                     secret/expand-db-details-inferred-secret-values
                                     (assoc :can-manage true)))))

(api/defendpoint GET "/:id"
  "Get a single Database with `id`. Optionally pass `?include=tables` or `?include=tables.fields` to include the Tables
   belonging to this database, or the Tables and Fields, respectively.  If the requestor has write permissions for the DB
   (i.e. is an admin or has data model permissions), then certain inferred secret values will also be included in the
   returned details (see [[metabase.models.secret/expand-db-details-inferred-secret-values]] for full details).

   Passing include_editable_data_model will only return tables for which the current user has data model editing
   permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
   In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
   and tables, with no additional metadata."
  [id include include_editable_data_model exclude_uneditable_details]
  {id      ms/PositiveInt
   include [:maybe [:enum "tables" "tables.fields"]]}
  (get-database id {:include include
                    :include-editable-data-model? (Boolean/parseBoolean include_editable_data_model)
                    :exclude-uneditable-details? (Boolean/parseBoolean exclude_uneditable_details)}))

(def ^:private database-usage-models
  "List of models that are used to report usage on a database."
  [:question :dataset :metric :segment]) ; TODO -- rename `:dataset` to `:model`?

(def ^:private always-false-hsql-expr
  "A Honey SQL expression that is never true.

    1 = 2"
  [:= [:inline 1] [:inline 2]])

(defmulti ^:private database-usage-query
  "Query that will returns the number of `model` that use the database with id `database-id`.
  The query must returns a scalar, and the method could return `nil` in case no query is available."
  {:arglists '([model database-id table-ids])}
  (fn [model _database-id _table-ids] (keyword model)))

(defn- card-query
  [db-id model type-str]
  {:select [[:%count.* model]]
   :from   [:report_card]
   :where  [:and
            [:= :database_id db-id]
            [:= :type type-str]]})

(defmethod database-usage-query :question
  [_ db-id _table-ids]
  (card-query db-id :question "question"))

(defmethod database-usage-query :dataset
  [_model db-id _table-ids]
  (card-query db-id :dataset "model"))

(defmethod database-usage-query :metric
  [_ db-id _table-ids]
  (card-query db-id :metric "metric"))

(defmethod database-usage-query :segment
  [_ _db-id table-ids]
  {:select [[:%count.* :segment]]
   :from   [:segment]
   :where  (if table-ids
             [:in :table_id table-ids]
             always-false-hsql-expr)})

(api/defendpoint GET "/:id/usage_info"
  "Get usage info for a database.
  Returns a map with keys are models and values are the number of entities that use this database."
  [id]
  {id ms/PositiveInt}
  (api/check-superuser)
  (api/check-404 (t2/exists? Database :id id))
  (let [table-ids (t2/select-pks-set Table :db_id id)]
    (first (mdb.query/query
             {:select [:*]
              :from   (for [model database-usage-models
                            :let [query (database-usage-query model id table-ids)]
                            :when query]
                        [query model])}))))


;;; ----------------------------------------- GET /api/database/:id/metadata -----------------------------------------

;; Since the normal `:id` param in the normal version of the endpoint will never match with negative numbers
;; we'll create another endpoint to specifically match the ID of the 'virtual' database. The `defendpoint` macro
;; requires either strings or vectors for the route so we'll have to use a vector and create a regex to only
;; match the virtual ID (and nothing else).
(api/defendpoint GET ["/:virtual-db/metadata" :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database."
  []
  (saved-cards-virtual-db-metadata :question :include-tables? true, :include-fields? true))

(defn- db-metadata [id include-hidden? include-editable-data-model? remove_inactive? skip-fields?]
  (let [db (-> (if include-editable-data-model?
                 (api/check-404 (t2/select-one Database :id id))
                 (api/read-check Database id))
               (t2/hydrate
                (if skip-fields?
                  [:tables :segments :metrics]
                  [:tables [:fields :has_field_values [:target :has_field_values]] :segments :metrics])))
        db (if include-editable-data-model?
             ;; We need to check data model perms after hydrating tables, since this will also filter out tables for
             ;; which the *current-user* does not have data model perms
             (check-db-data-model-perms db)
             db)]
    (-> db
        (update :tables (if include-hidden?
                          identity
                          (fn [tables]
                            (->> tables
                                 (remove :visibility_type)
                                 (map #(update % :fields filter-sensitive-fields))))))
        (update :tables (fn [tables]
                          (if-not include-editable-data-model?
                            ;; If we're filtering by data model perms, table perm checks were already done by
                            ;; check-db-data-model-perms
                            (filter mi/can-read? tables)
                            tables)))
        (update :tables (fn [tables]
                          (for [table tables]
                            (-> table
                                (update :segments (partial filter mi/can-read?))
                                (update :metrics  (partial filter mi/can-read?))))))
        (update :tables (if remove_inactive?
                          (fn [tables]
                            (filter :active tables))
                          identity)))))

(api/defendpoint GET "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`. Returns DB, fields, and field values.
  By default only non-hidden tables and fields are returned. Passing include_hidden=true includes them.

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata."
  [id include_hidden include_editable_data_model remove_inactive skip_fields]
  {id                          ms/PositiveInt
   include_hidden              [:maybe ms/BooleanValue]
   include_editable_data_model [:maybe ms/BooleanValue]
   remove_inactive             [:maybe ms/BooleanValue]
   skip_fields                 [:maybe ms/BooleanValue]}
  (db-metadata id
               include_hidden
               include_editable_data_model
               remove_inactive
               skip_fields))


;;; --------------------------------- GET /api/database/:id/autocomplete_suggestions ---------------------------------

(defn- autocomplete-tables [db-id search-string limit]
  (t2/select [Table :id :db_id :schema :name]
    {:where    [:and [:= :db_id db-id]
                     [:= :active true]
                     [:like :%lower.name (u/lower-case-en search-string)]
                     [:= :visibility_type nil]]
     :order-by [[:%lower.name :asc]]
     :limit    limit}))

(defn- autocomplete-cards
  "Returns cards that match the search string in the given database, ordered by id.
  `search-card-slug` should be in a format like '123-foo-bar' or '123' or 'foo-bar', where 123 is the card ID
   and foo-bar is a prefix of the card name converted into a slug.

   If the search string contains a number like '123' we match that as a prefix against the card IDs.
   If the search string contains a number at the start AND text like '123-foo' we match do an exact match on card ID, and a substring match on the card name.
   If the search string does not start with a number, and is text like 'foo' we match that as a substring on the card name."
  [database-id search-card-slug]
  (let [search-id   (re-find #"\d*" search-card-slug)
        search-name (-> (re-matches #"\d*-?(.*)" search-card-slug)
                        second
                        (str/replace #"-" " ")
                        u/lower-case-en)]
    (t2/select [Card :id :type :database_id :name :collection_id [:collection.name :collection_name]]
               {:where    [:and
                           [:= :report_card.database_id database-id]
                           [:= :report_card.archived false]
                           (cond
                             ;; e.g. search-string = "123"
                             (and (not-empty search-id) (empty? search-name))
                             [:like
                              (h2x/cast (if (= (mdb/db-type) :mysql) :char :text) :report_card.id)
                              (str search-id "%")]

                             ;; e.g. search-string = "123-foo"
                             (and (not-empty search-id) (not-empty search-name))
                             [:and
                              [:= :report_card.id (Integer/parseInt search-id)]
                              ;; this is a prefix match to be consistent with substring matches on the entire slug
                              [:like [:lower :report_card.name] (str search-name "%")]]

                             ;; e.g. search-string = "foo"
                             (and (empty? search-id) (not-empty search-name))
                             [:like [:lower :report_card.name] (str "%" search-name "%")])]
                :left-join [[:collection :collection] [:= :collection.id :report_card.collection_id]]
                ;; prioritize models. This relies of `model` coming before `question` alphabetically, and Tamas pointed
                ;; out this is a little brittle. He's right -- once we put v2 Metrics in then we can replace this with a
                ;; fancy `CASE` expression or something so we can sort things exactly how we like.
                :order-by [[:type :asc]
                           [:report_card.id :desc]] ; sort by most recently created after sorting by type
                :limit    50})))

(defn- autocomplete-fields [db-id search-string limit]
  ;; NOTE: measuring showed that this query performance is improved ~4x when adding trgm index in pgsql and ~10x when
  ;; adding a index on `lower(metabase_field.name)` for ordering (trgm index having on impact on queries with index).
  ;; Pgsql now has an index on that (see migration `v49.2023-01-24T12:00:00`) as other dbms do not support indexes on
  ;; expressions.
  (t2/select [Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
             :metabase_field.active          true
             :%lower.metabase_field/name     [:like (u/lower-case-en search-string)]
             :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
             :table.db_id                    db-id
             {:order-by   [[[:lower :metabase_field.name] :asc]
                           [[:lower :table.name] :asc]]
              ;; checking for table.active in join makes query faster when there are a lot of inactive tables
              :inner-join [[:metabase_table :table] [:and :table.active
                                                     [:= :table.id :metabase_field.table_id]]]
              :limit      limit}))

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

(def ^:private autocomplete-matching-options
  "Valid options for the autocomplete types. Can match on a substring (\"%input%\"), on a prefix (\"input%\"), or reject
  autocompletions. Large instances with lots of fields might want to use prefix matching or turn off the feature if it
  causes too many problems."
  #{:substring :prefix :off})

(defsetting native-query-autocomplete-match-style
  (deferred-tru
    (str "Matching style for native query editor's autocomplete. Can be \"substring\", \"prefix\", or \"off\". "
         "Larger instances can have performance issues matching using substring, so can use prefix matching, "
         " or turn autocompletions off."))
  :visibility :public
  :export?    true
  :type       :keyword
  :default    :substring
  :audit      :raw-value
  :setter     (fn [v]
                (let [v (cond-> v (string? v) keyword)]
                  (if (autocomplete-matching-options v)
                    (setting/set-value-of-type! :keyword :native-query-autocomplete-match-style v)
                    (throw (ex-info (tru "Invalid `native-query-autocomplete-match-style` option")
                                    {:option v
                                     :valid-options autocomplete-matching-options}))))))

(api/defendpoint GET "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given `prefix`, or `substring`. Should only specify one, but
  `substring` will have priority if both are present.

  This is intended for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching `Tables`
  and `Fields` in this `Database`.

  Tables are returned in the format `[table_name \"Table\"]`;
  When Fields have a semantic_type, they are returned in the format `[field_name \"table_name base_type semantic_type\"]`
  When Fields lack a semantic_type, they are returned in the format `[field_name \"table_name base_type\"]`"
  [id prefix substring]
  {id        ms/PositiveInt
   prefix    [:maybe ms/NonBlankString]
   substring [:maybe ms/NonBlankString]}
  (api/read-check Database id)
  (when (and (str/blank? prefix) (str/blank? substring))
    (throw (ex-info (tru "Must include prefix or search") {:status-code 400})))
  (try
    {:status  200
     ;; Presumably user will repeat same prefixes many times writing the query,
     ;; so let them cache response to make autocomplete feel fast. 60 seconds
     ;; is not enough to be a nuisance when schema or permissions change. Cache
     ;; is user-specific since we're checking for permissions.
     :headers {"Cache-Control" "public, max-age=60"
               "Vary"          "Cookie"}
     :body    (cond
                substring (autocomplete-suggestions id (str "%" substring "%"))
                prefix    (autocomplete-suggestions id (str prefix "%")))}
    (catch Throwable e
      (log/warnf e "Error with autocomplete: %s" (ex-message e)))))

(api/defendpoint GET "/:id/card_autocomplete_suggestions"
  "Return a list of `Card` autocomplete suggestions for a given `query` in a given `Database`.

  This is intended for use with the ACE Editor when the User is typing in a template tag for a `Card`, e.g. {{#...}}."
  [id query]
  {id    ms/PositiveInt
   query ms/NonBlankString}
  (api/read-check Database id)
  (try
    (->> (autocomplete-cards id query)
         (filter mi/can-read?)
         (map #(select-keys % [:id :name :type :collection_name])))
    (catch Throwable e
      (log/warnf e "Error with autocomplete: %s" (ex-message e)))))


;;; ------------------------------------------ GET /api/database/:id/fields ------------------------------------------

(api/defendpoint GET "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [id]
  {id ms/PositiveInt}
  (api/read-check Database id)
  (let [fields (filter mi/can-read? (-> (t2/select [Field :id :name :display_name :table_id :base_type :semantic_type]
                                          :table_id        [:in (t2/select-fn-set :id Table, :db_id id)]
                                          :visibility_type [:not-in ["sensitive" "retired"]])
                                        (t2/hydrate :table)))]
    (for [{:keys [id name display_name table base_type semantic_type]} fields]
      {:id            id
       :name          name
       :display_name  display_name
       :base_type     base_type
       :semantic_type semantic_type
       :table_name    (:name table)
       :schema        (:schema table "")})))


;;; ----------------------------------------- GET /api/database/:id/idfields -----------------------------------------

(api/defendpoint GET "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [id include_editable_data_model]
  {id ms/PositiveInt}
  (let [[db-perm-check field-perm-check] (if (Boolean/parseBoolean include_editable_data_model)
                                           [check-db-data-model-perms mi/can-write?]
                                           [api/read-check mi/can-read?])]
    (db-perm-check (t2/select-one Database :id id))
    (sort-by (comp u/lower-case-en :name :table)
             (filter field-perm-check (-> (database/pk-fields {:id id})
                                          (t2/hydrate :table))))))


;;; ----------------------------------------------- POST /api/database -----------------------------------------------

(defn test-database-connection
  "Try out the connection details for a database and useful error message if connection fails, returns `nil` if
   connection succeeds."
  [engine {:keys [host port] :as details}, & {:keys [log-exception]
                                              :or   {log-exception true}}]
  {:pre [(some? engine)]}
  (let [engine  (keyword engine)
        details (assoc details :engine engine)]
    (try
      (cond
        (driver.u/can-connect-with-details? engine details :throw-exceptions)
        nil

        (and host port (u/host-port-up? host port))
        {:message (tru "Connection to ''{0}:{1}'' successful, but could not connect to DB."
                       host port)}

        (and host (u/host-up? host))
        {:message (tru "Connection to host ''{0}'' successful, but port {1} is invalid."
                       host port)
         :errors  {:port (deferred-tru "check your port settings")}}

        host
        {:message (tru "Host ''{0}'' is not reachable" host)
         :errors  {:host (deferred-tru "check your host settings")}}

        :else
        {:message (tru "Unable to connect to database.")})
      (catch Throwable e
        (when (and log-exception (not (some->> e ex-cause ex-data ::driver/can-connect-message?)))
          (log/error e "Cannot connect to Database"))
        (if (-> e ex-data :message)
          (ex-data e)
          {:message (.getMessage e)})))))

;; TODO - Just make `:ssl` a `feature`
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [driver]
  {:pre [(driver/available? driver)]}
  (let [driver-props (set (for [field (driver/connection-properties driver)]
                            (:name field)))]
    (contains? driver-props "ssl")))

(mu/defn- test-connection-details :- :map
  "Try a making a connection to database `engine` with `details`.

  If the `details` has SSL explicitly enabled, go with that and do not accept plaintext connections. If it is disabled,
  try twice: once with SSL, and a second time without if the first fails. If either attempt is successful, returns
  the details used to successfully connect. Otherwise returns a map with the connection error message. (This map will
  also contain the key `:valid` = `false`, which you can use to distinguish an error from valid details.)"
  [engine  :- DBEngineString
   details :- :map]
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
      (some-> (test-database-connection engine details)
              (assoc :valid false))
      details)))

(api/defendpoint POST "/"
  "Add a new `Database`."
  [:as {{:keys [name engine details is_full_sync is_on_demand schedules auto_run_queries cache_ttl connection_source]} :body}]
  {name              ms/NonBlankString
   engine            DBEngineString
   details           ms/Map
   is_full_sync      [:maybe {:default true} ms/BooleanValue]
   is_on_demand      [:maybe {:default false} ms/BooleanValue]
   schedules         [:maybe sync.schedules/ExpandedSchedulesMap]
   auto_run_queries  [:maybe :boolean]
   cache_ttl         [:maybe ms/PositiveInt]
   connection_source [:maybe {:default :admin} [:enum :admin :setup]]}
  (api/check-superuser)
  (when cache_ttl
    (api/check (premium-features/enable-cache-granular-controls?)
               [402 (tru (str "The cache TTL database setting is only enabled if you have a premium token with the "
                              "cache granular controls feature."))]))
  (let [details-or-error (test-connection-details engine details)
        valid?           (not= (:valid details-or-error) false)]
    (if valid?
      ;; no error, proceed with creation. If record is inserted successfuly, publish a `:database-create` event.
      ;; Throw a 500 if nothing is inserted
      (u/prog1 (api/check-500 (first (t2/insert-returning-instances!
                                      Database
                                      (merge
                                       {:name         name
                                        :engine       engine
                                        :details      details-or-error
                                        :is_full_sync is_full_sync
                                        :is_on_demand is_on_demand
                                        :cache_ttl    cache_ttl
                                        :creator_id   api/*current-user-id*}
                                       (when schedules
                                         (sync.schedules/schedule-map->cron-strings schedules))
                                       (when (some? auto_run_queries)
                                         {:auto_run_queries auto_run_queries})))))
        (events/publish-event! :event/database-create {:object <> :user-id api/*current-user-id*})
        (snowplow/track-event! ::snowplow/database-connection-successful
                               api/*current-user-id*
                               {:database     engine
                                :database-id  (u/the-id <>)
                                :source       connection_source
                                :dbms-version (:version (driver/dbms-version (keyword engine) <>))}))
      ;; failed to connect, return error
      (do
        (snowplow/track-event! ::snowplow/database-connection-failed
                               api/*current-user-id*
                               {:database engine :source connection_source})
        {:status 400
         :body   (dissoc details-or-error :valid)}))))

(api/defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  ;; TODO - why do we pass the DB in under the key `details`?
  [:as {{{:keys [engine details]} :details} :body}]
  {engine  DBEngineString
   details :map}
  (api/check-superuser)
  (let [details-or-error (test-connection-details engine details)]
    ;; details that come back without a `:valid` key at all are... valid!
    (update details-or-error :valid (comp not false?))))

;;; --------------------------------------- POST /api/database/sample_database ----------------------------------------

(api/defendpoint POST "/sample_database"
  "Add the sample database as a new `Database`."
  []
  (api/check-superuser)
  (sample-data/extract-and-sync-sample-database!)
  (t2/select-one Database :is_sample true))


;;; --------------------------------------------- PUT /api/database/:id ----------------------------------------------

(defn- upsert-sensitive-fields
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

(api/defendpoint POST "/:id/persist"
  "Attempt to enable model persistence for a database. If already enabled returns a generic 204."
  [id]
  {id ms/PositiveInt}
  (api/check (public-settings/persisted-models-enabled)
             400
             (tru "Persisting models is not enabled."))
  (api/let-404 [database (t2/select-one Database :id id)]
    (api/write-check database)
    (if (-> database :settings :persist-models-enabled)
      ;; todo: some other response if already persisted?
      api/generic-204-no-content
      (let [[success? error] (ddl.i/check-can-persist database)
            schema           (ddl.i/schema-name database (public-settings/site-uuid))]
        (if success?
          ;; do secrets require special handling to not clobber them or mess up encryption?
          (do (t2/update! Database id {:settings (assoc (:settings database) :persist-models-enabled true)})
              (task.persist-refresh/schedule-persistence-for-database!
                database
                (public-settings/persisted-model-refresh-cron-schedule))
              api/generic-204-no-content)
          (throw (ex-info (ddl.i/error->message error schema)
                          {:error error
                           :database (:name database)})))))))

(api/defendpoint POST "/:id/unpersist"
  "Attempt to disable model persistence for a database. If already not enabled, just returns a generic 204."
  [id]
  {id ms/PositiveInt}
  (api/let-404 [database (t2/select-one Database :id id)]
    (api/write-check database)
    (if (-> database :settings :persist-models-enabled)
      (do (t2/update! Database id {:settings (dissoc (:settings database) :persist-models-enabled)})
          (persisted-info/mark-for-pruning! {:database_id id})
          (task.persist-refresh/unschedule-persistence-for-database! database)
          api/generic-204-no-content)
      ;; todo: a response saying this was a no-op? an error? same on the post to persist
      api/generic-204-no-content)))

(api/defendpoint PUT "/:id"
  "Update a `Database`."
  [id :as {{:keys [name engine details is_full_sync is_on_demand description caveats points_of_interest schedules
                   auto_run_queries refingerprint cache_ttl settings]} :body}]
  {id                 ms/PositiveInt
   name               [:maybe ms/NonBlankString]
   engine             [:maybe DBEngineString]
   refingerprint      [:maybe :boolean]
   details            [:maybe ms/Map]
   schedules          [:maybe sync.schedules/ExpandedSchedulesMap]
   description        [:maybe :string]   ; :string instead of ms/NonBlankString because we don't care
   caveats            [:maybe :string]   ; whether someone sets these to blank strings
   points_of_interest [:maybe :string]
   auto_run_queries   [:maybe :boolean]
   cache_ttl          [:maybe ms/PositiveInt]
   settings           [:maybe ms/Map]}
  ;; TODO - ensure that custom schedules and let-user-control-scheduling go in lockstep
  (let [existing-database (api/write-check (t2/select-one Database :id id))
        details           (some->> details
                                   (driver.u/db-details-client->server (or engine (:engine existing-database)))
                                   (upsert-sensitive-fields existing-database))
        ;; verify that we can connect to the database if `:details` OR `:engine` have changed.
        details-changed?  (some-> details (not= (:details existing-database)))
        engine-changed?   (some-> engine keyword (not= (:engine existing-database)))
        conn-error        (when (or details-changed? engine-changed?)
                            (test-database-connection (or engine (:engine existing-database))
                                                      (or details (:details existing-database))))
        full-sync?        (some-> is_full_sync boolean)
        on-demand?        (boolean is_on_demand)]
    (if conn-error
      ;; failed to connect, return error
      {:status 400
       :body   conn-error}
      ;; no error, proceed with update
      (do
       ;; TODO - is there really a reason to let someone change the engine on an existing database?
       ;;       that seems like the kind of thing that will almost never work in any practical way
       ;; TODO - this means one cannot unset the description. Does that matter?
       (t2/update! Database id
                   (merge
                    (m/remove-vals
                     nil?
                     (merge
                      {:name               name
                       :engine             engine
                       :details            details
                       :refingerprint      refingerprint
                       :is_full_sync       full-sync?
                       :is_on_demand       on-demand?
                       :description        description
                       :caveats            caveats
                       :points_of_interest points_of_interest
                       :auto_run_queries   auto_run_queries}
                      ;; upsert settings with a PATCH-style update. `nil` key means unset the Setting.
                      (when (seq settings)
                        {:settings (into {}
                                         (remove (fn [[_k v]] (nil? v)))
                                         (merge (:settings existing-database) settings))})))
                    ;; cache_field_values_schedule can be nil
                    (when schedules
                      (sync.schedules/schedule-map->cron-strings schedules))))
       ;; unlike the other fields, folks might want to nil out cache_ttl. it should also only be settable on EE
       ;; with the advanced-config feature enabled.
       (when (premium-features/enable-cache-granular-controls?)
         (t2/update! Database id {:cache_ttl cache_ttl}))

       (let [db (t2/select-one Database :id id)]
         (events/publish-event! :event/database-update {:object db
                                                        :user-id api/*current-user-id*
                                                        :previous-object existing-database})
         ;; return the DB with the expanded schedules back in place
         (add-expanded-schedules db))))))


;;; -------------------------------------------- DELETE /api/database/:id --------------------------------------------

(api/defendpoint DELETE "/:id"
  "Delete a `Database`."
  [id]
  {id ms/PositiveInt}
  (api/check-superuser)
  (api/let-404 [db (t2/select-one Database :id id)]
    (api/check-403 (mi/can-write? db))
    (t2/delete! Database :id id)
    (events/publish-event! :event/database-delete {:object db :user-id api/*current-user-id*}))
  api/generic-204-no-content)

;;; ------------------------------------------ POST /api/database/:id/sync_schema -------------------------------------------

;; Should somehow trigger sync-database/sync-database!
(api/defendpoint POST "/:id/sync_schema"
  "Trigger a manual update of the schema metadata for this `Database`."
  [id]
  {id ms/PositiveInt}
  ;; just wrap this in a future so it happens async
  (let [db (api/write-check (t2/select-one Database :id id))]
    (events/publish-event! :event/database-manual-sync {:object db :user-id api/*current-user-id*})
    (if-let [ex (try
                  ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
                  ;; purposes of creating a new H2 database.
                  (binding [h2/*allow-testing-h2-connections* true]
                    (driver.u/can-connect-with-details? (:engine db) (:details db) :throw-exceptions))
                  nil
                  (catch Throwable e
                    e))]
      (throw (ex-info (ex-message ex) {:status-code 422}))
      (do
        (future
          (sync-metadata/sync-db-metadata! db)
          (analyze/analyze-db! db))
        {:status :ok}))))

(api/defendpoint POST "/:id/dismiss_spinner"
  "Manually set the initial sync status of the `Database` and corresponding
  tables to be `complete` (see #20863)"
  [id]
  {id ms/PositiveInt}
  ;; manual full sync needs to be async, but this is a simple update of `Database`
  (let [db     (api/write-check (t2/select-one Database :id id))
        tables (map api/write-check (:tables (first (add-tables [db]))))]
    (sync-util/set-initial-database-sync-complete! db)
    ;; avoid n+1
    (when-let [table-ids (seq (map :id tables))]
      (t2/update! Table {:id [:in table-ids]} {:initial_sync_status "complete"})))
  {:status :ok})

;;; ------------------------------------------ POST /api/database/:id/rescan_values -------------------------------------------

;; TODO - do we also want an endpoint to manually trigger analysis. Or separate ones for classification/fingerprinting?

(def ^:dynamic *rescan-values-async*
  "Boolean indicating whether the rescan_values job should be done async or not. Defaults to `true`. Should only be rebound
  in tests to force the scan to block."
  true)

;; Should somehow trigger cached-values/cache-field-values-for-database!
(api/defendpoint POST "/:id/rescan_values"
  "Trigger a manual scan of the field values for this `Database`."
  [id]
  {id ms/PositiveInt}
  ;; just wrap this is a future so it happens async
  (let [db (api/write-check (t2/select-one Database :id id))]
    (events/publish-event! :event/database-manual-scan {:object db :user-id api/*current-user-id*})
    ;; Grant full permissions so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (mw.session/as-admin
      (if *rescan-values-async*
        (future (field-values/update-field-values! db))
        (field-values/update-field-values! db))))
  {:status :ok})

;; "Discard saved field values" action in db UI
(defn- database->field-values-ids [database-or-id]
  (map :id (mdb.query/query {:select    [[:fv.id :id]]
                             :from      [[:metabase_fieldvalues :fv]]
                             :left-join [[:metabase_field :f] [:= :fv.field_id :f.id]
                                         [:metabase_table :t] [:= :f.table_id :t.id]]
                             :where     [:= :t.db_id (u/the-id database-or-id)]})))

(defn- delete-all-field-values-for-database! [database-or-id]
  (when-let [field-values-ids (seq (database->field-values-ids database-or-id))]
    (t2/query-one {:delete-from :metabase_fieldvalues
                   :where       [:in :id field-values-ids]})))


;; TODO - should this be something like DELETE /api/database/:id/field_values instead?
(api/defendpoint POST "/:id/discard_values"
  "Discards all saved field values for this `Database`."
  [id]
  {id ms/PositiveInt}
  (let [db (api/write-check (t2/select-one Database :id id))]
    (events/publish-event! :event/database-discard-field-values {:object db :user-id api/*current-user-id*})
    (delete-all-field-values-for-database! db))
  {:status :ok})


;;; ------------------------------------------ GET /api/database/:id/schemas -----------------------------------------

(defenterprise current-user-can-manage-schema-metadata?
  "Returns a boolean whether the current user has permission to edit table metadata for any tables in the schema.
  On OSS, this is only available to admins."
  metabase-enterprise.advanced-permissions.common
  [_db-id _schema-name]
  (mi/superuser?))

(defn- can-read-schema?
  "Does the current user have permissions to know the schema with `schema-name` exists? (Do they have permissions to see
  at least some of its tables?)"
  [database-id schema-name]
  (or
   (contains? #{:query-builder :query-builder-and-native}
              (data-perms/schema-permission-for-user api/*current-user-id*
                                                     :perms/create-queries
                                                     database-id
                                                     schema-name))
   (current-user-can-manage-schema-metadata? database-id schema-name)))

(api/defendpoint GET "/:id/syncable_schemas"
  "Returns a list of all syncable schemas found for the database `id`."
  [id]
  {id ms/PositiveInt}
  (let [db (api/check-404 (t2/select-one Database id))]
    (api/check-403 (mi/can-write? db))
    (->> db
         (driver/syncable-schemas (:engine db))
         (vec)
         (sort))))

(defn database-schemas
  "Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables."
  [id {:keys [include-editable-data-model? include-hidden?]}]
  (let [filter-schemas (fn [schemas]
                         (if include-editable-data-model?
                           (if-let [f (u/ignore-exceptions
                                        (classloader/require 'metabase-enterprise.advanced-permissions.common)
                                        (resolve 'metabase-enterprise.advanced-permissions.common/filter-schema-by-data-model-perms))]
                             (map :schema (f (map (fn [s] {:db_id id :schema s}) schemas)))
                             schemas)
                           (filter (partial can-read-schema? id) schemas)))]
    (if include-editable-data-model?
      (api/check-404 (t2/select-one Database id))
      (api/read-check Database id))
    (->> (t2/select-fn-set :schema Table
                           :db_id id :active true
                           (merge
                             {:order-by [[:%lower.schema :asc]]}
                             (when-not include-hidden?
                               ;; a non-nil value means Table is hidden -- see [[metabase.models.table/visibility-types]]
                               {:where [:= :visibility_type nil]})))
         filter-schemas
         ;; for `nil` schemas return the empty string
         (map #(if (nil? %) "" %))
         distinct
         sort)))

(api/defendpoint GET "/:id/schemas"
  "Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables."
  [id include_editable_data_model include_hidden]
  {id                          ms/PositiveInt
   include_editable_data_model [:maybe ms/BooleanValue]
   include_hidden              [:maybe ms/BooleanValue]}
  (database-schemas id {:include-editable-data-model? include_editable_data_model
                        :include-hidden? include_hidden}))

(api/defendpoint GET ["/:virtual-db/schemas"
                      :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of all the schemas found for the saved questions virtual database."
  []
  (when (public-settings/enable-nested-queries)
    (->> (cards-virtual-tables :question)
         (map :schema)
         distinct
         (sort-by u/lower-case-en))))

(api/defendpoint GET ["/:virtual-db/datasets"
                      :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of all the datasets found for the saved questions virtual database."
  []
  (when (public-settings/enable-nested-queries)
    (->> (cards-virtual-tables :model)
         (map :schema)
         distinct
         (sort-by u/lower-case-en))))


;;; ------------------------------------- GET /api/database/:id/schema/:schema ---------------------------------------

(defn- schema-tables-list
  ([db-id schema]
   (schema-tables-list db-id schema nil nil))
  ([db-id schema include_hidden include_editable_data_model]
   (when-not include_editable_data_model
     (api/read-check Database db-id)
     (api/check-403 (can-read-schema? db-id schema)))
   (let [tables (if include_hidden
                  (t2/select Table
                             :db_id db-id
                             :schema schema
                             :active true
                             {:order-by [[:display_name :asc]]})
                  (t2/select Table
                             :db_id db-id
                             :schema schema
                             :active true
                             :visibility_type nil
                             {:order-by [[:display_name :asc]]}))]
     (if include_editable_data_model
       (if-let [f (when config/ee-available?
                    (classloader/require 'metabase-enterprise.advanced-permissions.common)
                    (resolve 'metabase-enterprise.advanced-permissions.common/filter-tables-by-data-model-perms))]
         (f tables)
         tables)
       (filter mi/can-read? tables)))))

(api/defendpoint GET "/:id/schema/:schema"
  "Returns a list of Tables for the given Database `id` and `schema`"
  [id include_hidden include_editable_data_model schema]
  {id                          ms/PositiveInt
   include_hidden              [:maybe ms/BooleanValue]
   include_editable_data_model [:maybe ms/BooleanValue]}
  (api/check-404 (seq (schema-tables-list
                       id
                       schema
                       include_hidden
                       include_editable_data_model))))

(api/defendpoint GET "/:id/schema/"
  "Return a list of Tables for a Database whose `schema` is `nil` or an empty string."
  [id include_hidden include_editable_data_model]
  {id                          ms/PositiveInt
   include_hidden              [:maybe ms/BooleanValue]
   include_editable_data_model [:maybe ms/BooleanValue]}
  (api/check-404 (seq (concat (schema-tables-list id nil include_hidden include_editable_data_model)
                              (schema-tables-list id "" include_hidden include_editable_data_model)))))

(api/defendpoint GET ["/:virtual-db/schema/:schema"
                      :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the saved questions virtual database."
  [schema]
  (when (public-settings/enable-nested-queries)
    (->> (source-query-cards
          :question
          :additional-constraints [(if (= schema (api.table/root-collection-schema-name))
                                     [:= :collection_id nil]
                                     [:in :collection_id (api/check-404 (not-empty (t2/select-pks-set Collection :name schema)))])])
         (map api.table/card->virtual-table))))

(api/defendpoint GET ["/:virtual-db/datasets/:schema"
                      :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the datasets virtual database."
  [schema]
  (when (public-settings/enable-nested-queries)
    (->> (source-query-cards
          :model
          :additional-constraints [(if (= schema (api.table/root-collection-schema-name))
                                     [:= :collection_id nil]
                                     [:in :collection_id (api/check-404 (not-empty (t2/select-pks-set Collection :name schema)))])])
         (map api.table/card->virtual-table))))

(api/define-routes)
