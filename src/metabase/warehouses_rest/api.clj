(ns metabase.warehouses-rest.api
  "/api/database endpoints."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.queries.schema :as queries.schema]
   [metabase.request.core :as request]
   [metabase.sample-data.core :as sample-data]
   [metabase.secrets.core :as secret]
   [metabase.settings.core :as setting]
   [metabase.sync.core :as sync]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.sync.util :as sync-util]
   [metabase.upload.core :as upload]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [deferred-tru trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.field :refer [readable-fields-only]]
   [metabase.warehouse-schema.table :as schema.table]
   [metabase.warehouses.core :as warehouses]
   [metabase.warehouses.models.database :as database]
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

(defn- add-tables
  "Hydrate tables for each database. Optional `can-query?` and `can-write-metadata?` filters
   can be applied to filter tables by permission level."
  [dbs & {:keys [can-query? can-write-metadata?]}]
  (let [all-tables (t2/select :model/Table
                              :active          true
                              :db_id           [:in (map :id dbs)]
                              :visibility_type nil
                              {:order-by [[:%lower.schema :asc]
                                          [:%lower.display_name :asc]]})
        filtered-tables (cond->> (filter mi/can-read? all-tables)
                          can-query?          (filter mi/can-query?)
                          can-write-metadata? (filter mi/can-write?))
        db-id->tables (group-by :db_id filtered-tables)]
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
  (perms/prime-db-cache (map :id dbs))
  (for [db dbs]
    (assoc db
           :native_permissions
           (if (= :query-builder-and-native
                  (perms/full-db-permission-for-user
                   api/*current-user-id*
                   :perms/create-queries
                   (u/the-id db)))
             :write
             :none))))

(mu/defn- add-transforms-perms-info :- [:maybe
                                        [:sequential
                                         [:map
                                          [:transforms_permissions [:enum :write :none]]]]]
  "For each database in DBS add a `:transforms_permissions` field describing the current user's permissions for
  creating/running Transforms. Will be either `:write` or `:none`."
  [dbs :- [:maybe [:sequential :map]]]
  (for [db dbs]
    (assoc db
           :transforms_permissions
           (if (perms/user-has-permission-for-database?
                api/*current-user-id*
                :perms/transforms
                :yes
                (u/the-id db))
             :write
             :none))))

(defn- card-database-supports-nested-queries? [{{database-id :database, :as query} :dataset_query, :as _card}]
  (when database-id
    (when-let [driver (driver.u/database->driver database-id)]
      (when-let [database (some-> query not-empty lib.metadata/database)]
        (driver.u/supports? driver :nested-queries database)))))

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
  [{result-metadata :result_metadata, query :dataset_query, :as _card}]
  (and (lib/native-only-query? query)
       (some (partial re-find #"_2$")
             (map (comp name :name) result-metadata))))

(mu/defn- card-uses-unnestable-aggregation?
  "Since cumulative count and cumulative sum aggregations are done in Clojure-land we can't use Cards that use queries
  with those aggregations as source queries. This function determines whether `card` is using one of those queries so
  we can filter it out in Clojure-land."
  [{query :dataset_query, :as _card} :- [:map
                                         [:dataset_query ::queries.schema/query]]]
  (lib.util.match/match (lib/aggregations query) #{:cum-count :cum-sum}))

(defn card-can-be-used-as-source-query?
  "Does `card`'s query meet the conditions required for it to be used as a source query for another query?"
  [card]
  (and (card-database-supports-nested-queries? card)
       (not (or (card-uses-unnestable-aggregation? card)
                (card-has-ambiguous-columns? card)))))

(defn- ids-of-dbs-that-support-source-queries []
  (set (filter (fn [db-id]
                 (try
                   (when-let [db (t2/select-one :model/Database :id db-id)]
                     (driver.u/supports? (driver.u/database->driver db) :nested-queries db))
                   (catch Throwable e
                     (log/error e "Error determining whether Database supports nested queries"))))
               (t2/select-pks-set :model/Database))))

(mu/defn- source-query-cards
  "Fetch the Cards that can be used as source queries (e.g. presented as virtual tables)."
  [card-type :- ::queries.schema/card-type
   & {:keys [additional-constraints xform], :or {xform identity}}]
  (when-let [ids-of-dbs-that-support-source-queries (not-empty (ids-of-dbs-that-support-source-queries))]
    (transduce
     (comp (map (partial mi/do-after-select :model/Card))
           (filter card-can-be-used-as-source-query?)
           xform)
     (completing conj #(t2/hydrate % :collection :metrics))
     []
     (t2/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id
                                     :result_metadata :type :source_card_id :card_schema
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
                                           (collection/visible-collection-filter-clause)]
                                          additional-constraints)
                          :order-by [[:%lower.name :asc]]}))))

(mu/defn- source-query-cards-exist?
  "Truthy if a single Card that can be used as a source query exists."
  [card-type :- ::queries.schema/card-type]
  (seq (source-query-cards card-type :xform (take 1))))

(mu/defn- cards-virtual-tables
  "Return a sequence of 'virtual' Table metadata for eligible Cards.
   (This takes the Cards from `source-query-cards` and returns them in a format suitable for consumption by the Query
   Builder.)"
  [card-type :- ::queries.schema/card-type
   & {:keys [include-fields?]}]
  (for [card (source-query-cards card-type)]
    (schema.table/card->virtual-table card :include-fields? include-fields?)))

(mu/defn- saved-cards-virtual-db-metadata
  [card-type :- ::queries.schema/card-type
   & {:keys [include-tables? include-fields?]}]
  (when (lib-be/enable-nested-queries)
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
             include-only-uploadable?
             router-database-id
             can-query?
             can-write-metadata?]}]
  (let [filter-on-router-database-id (when (some->> router-database-id
                                                    (perms/user-has-permission-for-database? api/*current-user-id* :perms/manage-database :yes))
                                       router-database-id)
        filter-by-data-access? (not (or include-editable-data-model?
                                        exclude-uneditable-details?
                                        filter-on-router-database-id))
        user-info {:user-id api/*current-user-id*
                   :is-superuser? (mi/superuser?)
                   :is-data-analyst? api/*is-data-analyst?*}
        base-where [:and
                    (when-not include-analytics?
                      [:= :is_audit false])
                    (if filter-on-router-database-id
                      [:= :router_database_id router-database-id]
                      [:= :router_database_id nil])]
        where-clause (if filter-by-data-access?
                       [:and base-where [:or (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/create-queries :query-builder}))
                                         (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-database :yes}))
                                         (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-table-metadata :yes}))]]
                       base-where)
        dbs (t2/select :model/Database {:order-by [:%lower.name :%lower.engine]
                                        :where where-clause})]
    (cond-> (-> dbs add-native-perms-info add-transforms-perms-info)
      include-tables?              (add-tables :can-query? can-query? :can-write-metadata? can-write-metadata?)
      can-query?                   (#(filter mi/can-query? %))
      true                         add-can-upload-to-dbs
      true                         (t2/hydrate :router_user_attribute)
      include-editable-data-model? filter-databases-by-data-model-perms
      exclude-uneditable-details?  (#(filter (some-fn :is_attached_dwh mi/can-write?) %))
      include-saved-questions-db?  (add-saved-questions-virtual-database :include-tables? include-saved-questions-tables?)
      ;; Perms checks for uploadable DBs are handled by exclude-uneditable-details? (see below)
      include-only-uploadable?     (#(filter uploadable-db? %)))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all `Databases`.

  * `include=tables` means we should hydrate the Tables belonging to each DB. Default: `false`.

  * `saved` means we should include the saved questions virtual database. Default: `false`.

  * `include_editable_data_model` will only include DBs for which the current user has data model editing
    permissions. (If `include=tables`, this also applies to the list of tables in each DB). Should only be used if
    Enterprise Edition code is available the advanced-permissions feature is enabled.

  * `exclude_uneditable_details` will only include DBs for which the current user can edit the DB details. Has no
    effect unless Enterprise Edition code is available and the advanced-permissions feature is enabled.

  * `include_only_uploadable` will only include DBs into which Metabase can insert new data.

  * `can-query` will only include DBs for which the current user has query permissions. Default: `false`.

  * `can-write-metadata` will only include DBs for which the current user has data model editing permissions
    for at least one table in the database. Default: `false`.

  Independently of these flags, the implementation of [[metabase.models.interface/to-json]] for `:model/Database` in
  [[metabase.warehouses.models.database]] uses the implementation of [[metabase.models.interface/can-write?]] for
  `:model/Database` in [[metabase.warehouses.models.database]] to exclude the `details` field, if the requesting user
  lacks permission to change the database details."
  [_route-params
   {:keys [include saved include_editable_data_model exclude_uneditable_details include_only_uploadable include_analytics
           router_database_id can-query can-write-metadata]}
   :- [:map
       [:include                     {:optional true} (mu/with-api-error-message
                                                       [:maybe [:= "tables"]]
                                                       (deferred-tru "include must be either empty or the value ''tables''"))]
       [:include_analytics           {:default false} [:maybe :boolean]]
       [:saved                       {:default false} [:maybe :boolean]]
       [:include_editable_data_model {:default false} [:maybe :boolean]]
       [:exclude_uneditable_details  {:default false} [:maybe :boolean]]
       [:include_only_uploadable     {:default false} [:maybe :boolean]]
       [:router_database_id          {:optional true} [:maybe ms/PositiveInt]]
       [:can-query                   {:optional true} [:maybe :boolean]]
       [:can-write-metadata          {:optional true} [:maybe :boolean]]]]
  (let [include-tables?                 (= include "tables")
        include-saved-questions-tables? (and saved include-tables?)
        only-editable?                  (or include_only_uploadable exclude_uneditable_details)
        has-table-metadata-perms?       (fn [{db-id :id}]
                                          (= :yes (perms/most-permissive-database-permission-for-user
                                                   api/*current-user-id*
                                                   :perms/manage-table-metadata
                                                   db-id)))
        db-list-res                     (cond->> (or (dbs-list :include-tables?                 include-tables?
                                                               :include-saved-questions-db?     saved
                                                               :include-saved-questions-tables? include-saved-questions-tables?
                                                               :include-editable-data-model?    include_editable_data_model
                                                               :exclude-uneditable-details?     only-editable?
                                                               :include-analytics?              include_analytics
                                                               :include-only-uploadable?        include_only_uploadable
                                                               :router-database-id              router_database_id
                                                               :can-query?                      can-query
                                                               :can-write-metadata?             can-write-metadata)
                                                     [])
                                          can-write-metadata (filter has-table-metadata-perms?))]
    {:data  db-list-res
     :total (count db-list-res)}))

;;; --------------------------------------------- GET /api/database/:id ----------------------------------------------

(mu/defn- expanded-schedules [db :- (ms/InstanceOf :model/Database)]
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

(mu/defn- check-database-exists
  ([id] (check-database-exists id {}))
  ([id :- ms/PositiveInt
    {:keys [include-destination-databases?]}
    :- [:map
        [:include-destination-databases? {:optional true :default false} ms/MaybeBooleanValue]]]
   (api/check-404 (if (and include-destination-databases? api/*is-superuser?*)
                    (t2/exists? :model/Database :id id)
                    (t2/exists? :model/Database :id id :router_database_id nil)))))

(defn- present-database
  "Get a single Database with `id`."
  [db {:keys [include include-editable-data-model?]}]
  (cond-> db
    true                         (t2/hydrate :router_user_attribute)
    true                         add-expanded-schedules
    true                         (get-database-hydrate-include include)
    true                         add-can-upload
    include-editable-data-model? check-db-data-model-perms
    (mi/can-write? db)           (assoc :can-manage true)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a single Database with `id`. Optionally pass `?include=tables` or `?include=tables.fields` to include the Tables
  belonging to this database, or the Tables and Fields, respectively. If the requestor has write permissions for the
  DB
   (i.e. is an admin or has data model permissions), then certain inferred secret values will also be included in the
   returned details (see [[metabase.secrets.models.secret/expand-db-details-inferred-secret-values]] for full details).

   Passing include_editable_data_model will only return tables for which the current user has data model editing
   permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
   In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
   and tables, with no additional metadata.

   Independently of these flags, the implementation of [[metabase.models.interface/to-json]] for `:model/Database` in
   [[metabase.warehouses.models.database]] uses the implementation of [[metabase.models.interface/can-write?]] for `:model/Database`
   in [[metabase.warehouses.models.database]] to exclude the `details` field, if the requesting user lacks permission to change the
   database details."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include include_editable_data_model exclude_uneditable_details]}
   :- [:map
       [:include {:optional true} [:maybe [:enum "tables" "tables.fields"]]]
       [:include_editable_data_model {:optional true} ms/MaybeBooleanValue]
       [:exclude_uneditable_details {:optional true} ms/MaybeBooleanValue]]]
  (present-database
   (warehouses/get-database id {:include include
                                :include-editable-data-model? include_editable_data_model
                                :exclude-uneditable-details? exclude_uneditable_details
                                :include-destination-databases? true})
   {:include include
    :include-editable-data-model? include_editable_data_model
    :exclude-uneditable-details? exclude_uneditable_details}))

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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/usage_info"
  "Get usage info for a database.
  Returns a map with keys are models and values are the number of entities that use this database."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (check-database-exists id)
  (let [table-ids (t2/select-pks-set :model/Table :db_id id)]
    (first (mdb/query
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
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:virtual-db/metadata" :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Endpoint that provides metadata for the Saved Questions 'virtual' database. Used for fooling the frontend
   and allowing it to treat the Saved Questions virtual DB just like any other database."
  []
  (saved-cards-virtual-db-metadata :question :include-tables? true, :include-fields? true))

(defn- db-metadata [id include-hidden? include-editable-data-model? remove_inactive? skip-fields?]
  (let [db (-> (warehouses/get-database id {:include-editable-data-model? include-editable-data-model?})
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
                            (update table :segments (partial filter mi/can-read?)))))
        (update :tables (fn [tables]
                          (for [table tables]
                            (update table :schema str))))
        (update :tables (if remove_inactive?
                          (fn [tables]
                            (filter :active tables))
                          identity)))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/metadata"
  "Get metadata about a `Database`, including all of its `Tables` and `Fields`. Returns DB, fields, and field values.
  By default only non-hidden tables and fields are returned. Passing include_hidden=true includes them.

  Passing include_editable_data_model will only return tables for which the current user has data model editing
  permissions, if Enterprise Edition code is available and a token with the advanced-permissions feature is present.
  In addition, if the user has no data access for the DB (aka block permissions), it will return only the DB name, ID
  and tables, with no additional metadata."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_hidden include_editable_data_model remove_inactive skip_fields]}
   :- [:map
       [:include_hidden              {:default false} [:maybe ms/BooleanValue]]
       [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]
       [:remove_inactive             {:default false} [:maybe ms/BooleanValue]]
       [:skip_fields                 {:default false} [:maybe ms/BooleanValue]]]]
  (db-metadata id
               include_hidden
               include_editable_data_model
               remove_inactive
               skip_fields))

;;; --------------------------------- GET /api/database/:id/autocomplete_suggestions ---------------------------------

(defn- autocomplete-tables [db-id search-string limit]
  (t2/select [:model/Table :id :db_id :schema :name]
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
  [database-id search-card-slug include-dashboard-questions?]
  (let [search-id   (re-find #"\d*" search-card-slug)
        search-name (-> (re-matches #"\d*-?(.*)" search-card-slug)
                        second
                        (str/replace #"-" " ")
                        u/lower-case-en)]
    (t2/select [:model/Card :id :type :database_id :name :collection_id
                [:collection.name :collection_name] :card_schema]
               {:where    [:and
                           [:= :report_card.database_id database-id]
                           [:= :report_card.archived false]
                           (when-not include-dashboard-questions?
                             [:= :report_card.dashboard_id nil])
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
  (t2/select [:model/Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/autocomplete_suggestions"
  "Return a list of autocomplete suggestions for a given `prefix`, or `substring`. Should only specify one, but
  `substring` will have priority if both are present.

  This is intended for use with the ACE Editor when the User is typing raw SQL. Suggestions include matching `Tables`
  and `Fields` in this `Database`.

  Tables are returned in the format `[table_name \"Table\"]`;
  When Fields have a semantic_type, they are returned in the format `[field_name \"table_name base_type semantic_type\"]`
  When Fields lack a semantic_type, they are returned in the format `[field_name \"table_name base_type\"]`"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [prefix substring]} :- [:map
                                  [:prefix    {:optional true} [:maybe ms/NonBlankString]]
                                  [:substring {:optional true} [:maybe ms/NonBlankString]]]]
  (api/read-check (warehouses/get-database id))
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

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/card_autocomplete_suggestions"
  "Return a list of `Card` autocomplete suggestions for a given `query` in a given `Database`.

  This is intended for use with the ACE Editor when the User is typing in a template tag for a `Card`, e.g. {{#...}}."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [query include_dashboard_questions]} :- [:map
                                                   [:query                       ms/NonBlankString]
                                                   [:include_dashboard_questions {:optional true} ms/BooleanValue]]]
  (api/read-check (warehouses/get-database id))
  (try
    (->> (autocomplete-cards id query include_dashboard_questions)
         (filter mi/can-read?)
         (map #(select-keys % [:id :name :type :collection_name])))
    (catch Throwable e
      (log/warnf e "Error with autocomplete: %s" (ex-message e)))))

;;; ------------------------------------------ GET /api/database/:id/fields ------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/fields"
  "Get a list of all `Fields` in `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (warehouses/get-database id)
  (let [fields (filter mi/can-read? (-> (t2/select [:model/Field :id :name :display_name :table_id :base_type :semantic_type]
                                                   :table_id        [:in (t2/select-fn-set :id :model/Table, :db_id id)]
                                                   :visibility_type [:not-in ["sensitive" "retired"]])
                                        (t2/hydrate :table)))]
    (for [{:keys [id name display_name table table_id base_type semantic_type]} fields]
      {:id            id
       :name          name
       :display_name  display_name
       :base_type     base_type
       :semantic_type semantic_type
       :table_name    (:name table)
       :table_id      table_id
       :schema        (:schema table "")})))

;;; ----------------------------------------- GET /api/database/:id/idfields -----------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/idfields"
  "Get a list of all primary key `Fields` for `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_editable_data_model]}]
  (let [[db-perm-check field-perm-check] (if (Boolean/parseBoolean include_editable_data_model)
                                           [check-db-data-model-perms mi/can-write?]
                                           [api/read-check mi/can-read?])]
    (db-perm-check (warehouses/get-database id {:include-editable-data-model? true}))
    (sort-by (comp u/lower-case-en :name :table)
             (filter field-perm-check (-> (database/pk-fields {:id id})
                                          (t2/hydrate :table))))))

;;; ----------------------------------------------- POST /api/database -----------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Add a new `Database`."
  [_route-params
   _query-params
   {:keys [name engine details is_full_sync is_on_demand schedules auto_run_queries cache_ttl connection_source provider_name]}
   :- [:map
       [:name              ms/NonBlankString]
       [:engine            DBEngineString]
       [:details           ms/Map]
       [:is_full_sync      {:default true}   [:maybe ms/BooleanValue]]
       [:is_on_demand      {:default false}  [:maybe ms/BooleanValue]]
       [:schedules         {:optional true}  [:maybe sync.schedules/ExpandedSchedulesMap]]
       [:auto_run_queries  {:optional true}  [:maybe :boolean]]
       [:cache_ttl         {:optional true}  [:maybe ms/PositiveInt]]
       [:connection_source {:default :admin} [:maybe [:enum :admin :setup]]]
       [:provider_name     {:optional true}  [:maybe :string]]]]
  (api/check-superuser)
  (when cache_ttl
    (api/check (premium-features/enable-cache-granular-controls?)
               [402 (tru (str "The cache TTL database setting is only enabled if you have a premium token with the "
                              "cache granular controls feature."))]))
  (let [details-or-error (warehouses/test-connection-details engine details)
        valid?           (not= (:valid details-or-error) false)]
    (if valid?
      ;; no error, proceed with creation. If record is inserted successfully, publish a `:database-create` event.
      ;; Throw a 500 if nothing is inserted
      (u/prog1 (api/check-500 (first (t2/insert-returning-instances!
                                      :model/Database
                                      (merge
                                       {:name         name
                                        :engine       engine
                                        :details      details-or-error
                                        :is_full_sync is_full_sync
                                        :is_on_demand is_on_demand
                                        :cache_ttl    cache_ttl
                                        :provider_name provider_name
                                        :creator_id   api/*current-user-id*}
                                       (when schedules
                                         (sync.schedules/schedule-map->cron-strings schedules))
                                       (when (some? auto_run_queries)
                                         {:auto_run_queries auto_run_queries})))))
        (events/publish-event! :event/database-create {:object <> :user-id api/*current-user-id*})
        (analytics/track-event! :snowplow/database
                                {:event        :database-connection-successful
                                 :database     engine
                                 :database-id  (u/the-id <>)
                                 :source       connection_source
                                 :dbms-version (:version (driver/dbms-version (keyword engine) <>))}))
      ;; failed to connect, return error
      (do
        (analytics/track-event! :snowplow/database
                                {:event    :database-connection-failed
                                 :database engine
                                 :source   connection_source})
        {:status 400
         :body   (dissoc details-or-error :valid)}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/validate"
  "Validate that we can connect to a database given a set of details."
  ;; TODO - why do we pass the DB in under the key `details`?
  [_route-params
   _query-params
   {{:keys [engine details]} :details} :- [:map
                                           [:details [:map
                                                      [:engine  DBEngineString]
                                                      [:details :map]]]]]
  (api/check-superuser)
  (let [details-or-error (warehouses/test-connection-details engine details)]
    ;; details that come back without a `:valid` key at all are... valid!
    (update details-or-error :valid (comp not false?))))

;;; --------------------------------------- POST /api/database/sample_database ----------------------------------------

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/sample_database"
  "Add the sample database as a new `Database`."
  []
  (api/check-superuser)
  (sample-data/extract-and-sync-sample-database!)
  (t2/select-one :model/Database :is_sample true))

;;; --------------------------------------------- PUT /api/database/:id ----------------------------------------------

(defn- upsert-sensitive-fields
  "Replace any sensitive values not overridden in the PUT with the original values.
  `details-key` is the key in the database map to use (e.g., :details or :write_data_details)."
  ([database details]
   (upsert-sensitive-fields database details :details))
  ([database details details-key]
   (when details
     (merge (get database details-key)
            (reduce
             (fn [details k]
               (if (= secret/protected-password (get details k))
                 (m/update-existing details k (constantly (get-in database [details-key k])))
                 details))
             details
             (database/sensitive-fields-for-db database))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [name engine details write_data_details is_full_sync is_on_demand description caveats points_of_interest
           schedules auto_run_queries refingerprint cache_ttl settings provider_name]}
   :- [:map
       [:name               {:optional true} [:maybe ms/NonBlankString]]
       [:engine             {:optional true} [:maybe DBEngineString]]
       [:refingerprint      {:optional true} [:maybe :boolean]]
       [:details            {:optional true} [:maybe ms/Map]]
       [:write_data_details {:optional true} [:maybe ms/Map]]
       [:schedules          {:optional true} [:maybe sync.schedules/ExpandedSchedulesMap]]
       [:description        {:optional true} [:maybe :string]]
       [:caveats            {:optional true} [:maybe :string]]
       [:points_of_interest {:optional true} [:maybe :string]]
       [:auto_run_queries   {:optional true} [:maybe :boolean]]
       [:cache_ttl          {:optional true} [:maybe ms/PositiveInt]]
       [:provider_name      {:optional true} [:maybe :string]]
       [:settings           {:optional true} [:maybe ms/Map]]]]
  ;; TODO - ensure that custom schedules and let-user-control-scheduling go in lockstep
  (when (some? write_data_details)
    (premium-features/assert-has-feature :advanced-permissions (tru "Advanced Permissions")))
  (let [existing-database           (api/write-check (t2/select-one :model/Database :id id))
        incoming-details            details
        incoming-write-data-details write_data_details
        details                     (some->> details
                                             (upsert-sensitive-fields existing-database))
        write_data_details          (when write_data_details
                                      (upsert-sensitive-fields existing-database write_data_details :write_data_details))
        ;; verify that we can connect to the database if `:details` OR `:engine` have changed.
        details-changed?            (some-> details (not= (:details existing-database)))
        engine-changed?             (some-> engine keyword (not= (:engine existing-database)))
        conn-error                  (when (or details-changed? engine-changed?)
                                      (warehouses/test-database-connection (or engine (:engine existing-database))
                                                                           (or details (:details existing-database))))
        full-sync?                  (some-> is_full_sync boolean)
        on-demand?                  (boolean is_on_demand)]
    (if conn-error
      ;; failed to connect, return error
      {:status 400
       :body   conn-error}
      ;; no error, proceed with update
      (let [existing-settings (:settings existing-database)
            pending-settings  (into {}
                                    ;; upsert settings with a PATCH-style update. `nil` key means unset the Setting.
                                    (remove (fn [[_k v]] (nil? v)))
                                    (merge existing-settings settings))
            updates           (merge
                               ;; TODO - is there really a reason to let someone change the engine on an existing database?
                               ;;       that seems like the kind of thing that will almost never work in any practical way
                               ;; TODO - this means one cannot unset the description. Does that matter?
                               (u/select-keys-when
                                {:name               name
                                 :engine             engine
                                 :details            details
                                 :write_data_details write_data_details
                                 :refingerprint      refingerprint
                                 :is_full_sync       full-sync?
                                 :is_on_demand       on-demand?
                                 :description        description
                                 :caveats            caveats
                                 :points_of_interest points_of_interest
                                 :auto_run_queries   auto_run_queries
                                 :settings           (when (seq settings) pending-settings)
                                 :provider_name      provider_name}
                                :non-nil #{:name :engine :details :refingerprint :is_full_sync :is_on_demand
                                           :description :caveats :points_of_interest :auto_run_queries :settings}
                                ;; write_data_details can be set to nil to clear it, so we include it when present
                                :present #{:provider_name :write_data_details})
                               ;; cache_field_values_schedule can be nil
                               (when schedules
                                 (sync.schedules/schedule-map->cron-strings schedules)))
            pending-db        (merge existing-database updates)]
        ;; pass in this predicate to break circular dependency
        (let [driver-supports? (fn [db feature] (driver.u/supports? (driver.u/database->driver db) feature db))]
          ;; ensure we're not trying to set anything we should not be able to.
          ;; Note: it's also possible for existing settings to become invalid when changing things like the engine.
          ;; We skip validation for: unchanged values and nil values (resetting to default is always allowed).
          (doseq [[setting-kw new-value] settings
                  :when                  (and (some? new-value)
                             ;; Allow explicit default value as well (typically this is what FE will actually do)
                             ;; Should we translate this into setting it to NULL? That seems too opinionated.
                                              (not= new-value (try (setting/default-value setting-kw)
                                                  ;; fallback to a redundant nil check
                                                                   (catch Exception _)))
                                              (not= new-value (get existing-settings setting-kw)))]
            (try
              (setting/validate-settable-for-db! setting-kw pending-db driver-supports?)
              (catch Exception e
                (throw (ex-info (ex-message e) (assoc (ex-data e) :status-code 400) e))))))
        (t2/update! :model/Database id updates)
        ;; unlike the other fields, folks might want to nil out cache_ttl. it should also only be settable on EE
        ;; with the advanced-config feature enabled.
        (when (premium-features/enable-cache-granular-controls?)
          (t2/update! :model/Database id {:cache_ttl cache_ttl}))

        (let [db (t2/select-one :model/Database :id id)]
          ;; the details in db and existing-database have been normalized so they are the same here
          ;; we need to pass through details-changed? which is calculated before detail normalization
          ;; to ensure the pool is invalidated and [[driver-api/secret-value-as-file!]] memoization is cleared
          (events/publish-event! :event/database-update {:object           db
                                                         :user-id          api/*current-user-id*
                                                         :previous-object  existing-database
                                                         :details-changed? details-changed?})
          (-> db
              ;; return the DB with the expanded schedules back in place
              add-expanded-schedules
              ;; return the DB with the passed in details in place
              (m/update-existing :details #(merge incoming-details %))
              (m/update-existing :write_data_details #(merge incoming-write-data-details %))))))))

;;; -------------------------------------------- DELETE /api/database/:id --------------------------------------------

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (api/let-404 [db (t2/select-one :model/Database :id id)]
      (api/check-403 (mi/can-write? db))
      (t2/delete! :model/Database :router_database_id id)
      (database-routing/delete-associated-database-router! id)
      (t2/delete! :model/Database :id id)
      (events/publish-event! :event/database-delete {:object db :user-id api/*current-user-id*})))
  api/generic-204-no-content)

;;; ------------------------------------------ POST /api/database/:id/sync_schema -------------------------------------------

;; Should somehow trigger sync-database/sync-database!
;;
;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/sync_schema"
  "Trigger a manual update of the schema metadata for this `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; just wrap this in a future so it happens async
  (let [db (api/write-check (warehouses/get-database id {:exclude-uneditable-details? true}))]
    (events/publish-event! :event/database-manual-sync {:object db :user-id api/*current-user-id*})
    (if-let [ex (try
                  ;; it's okay to allow testing H2 connections during sync. We only want to disallow you from testing them for the
                  ;; purposes of creating a new H2 database.
                  (binding [driver.settings/*allow-testing-h2-connections* true]
                    (driver.u/can-connect-with-details? (:engine db) (:details db) :throw-exceptions))
                  nil
                  (catch Throwable e
                    e))]
      (throw (ex-info (ex-message ex) {:status-code 422}))
      (do
        (analytics/track-event! :snowplow/simple_event {:event "database_manual_sync" :target_id id})
        (quick-task/submit-task!
         (fn []
           (database-routing/with-database-routing-off
             (sync/sync-db-metadata! db)
             (sync/analyze-db! db))))
        {:status :ok}))))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/dismiss_spinner"
  "Manually set the initial sync status of the `Database` and corresponding
  tables to be `complete` (see #20863)"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; manual full sync needs to be async, but this is a simple update of `Database`
  (let [db     (api/write-check (warehouses/get-database id {:exclude-uneditable-details? true}))
        tables (map api/write-check (:tables (first (add-tables [db]))))]
    (sync-util/set-initial-database-sync-complete! db)
    ;; avoid n+1
    (when-let [table-ids (seq (map :id tables))]
      (t2/update! :model/Table {:id [:in table-ids]} {:initial_sync_status "complete"})))
  {:status :ok})

;;; ------------------------------------------ POST /api/database/:id/rescan_values -------------------------------------------

;; TODO - do we also want an endpoint to manually trigger analysis. Or separate ones for classification/fingerprinting?

(def ^:dynamic *rescan-values-async*
  "Boolean indicating whether the rescan_values job should be done async or not. Defaults to `true`. Should only be rebound
  in tests to force the scan to block."
  true)

;; Should somehow trigger cached-values/cache-field-values-for-database!
;;
;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/rescan_values"
  "Trigger a manual scan of the field values for this `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  ;; just wrap this is a future so it happens async
  (let [db (api/write-check (warehouses/get-database id {:exclude-uneditable-details? true}))]
    (events/publish-event! :event/database-manual-scan {:object db :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/simple_event {:event "database_manual_scan" :target_id id})
    ;; Grant full permissions so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (request/as-admin
      (database-routing/with-database-routing-off
        (if *rescan-values-async*
          (quick-task/submit-task!
           (fn []
             (sync/update-field-values! db)))
          (sync/update-field-values! db)))))
  {:status :ok})

(defn- delete-all-field-values-for-database! [database-or-id]
  (t2/query-one {:delete-from :metabase_fieldvalues
                 :where      [:in :field_id
                              {:select     [:f.id]
                               :from       [[:metabase_field :f]]
                               :right-join [[:metabase_table :t] [:= :f.table_id :t.id]]
                               :where      [:= :t.db_id (u/the-id database-or-id)]}]}))

;; TODO - should this be something like DELETE /api/database/:id/field_values instead?
;;
;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/discard_values"
  "Discards all saved field values for this `Database`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [db (api/write-check (warehouses/get-database id {:exclude-uneditable-details? true}))]
    (events/publish-event! :event/database-discard-field-values {:object db :user-id api/*current-user-id*})
    (analytics/track-event! :snowplow/simple_event {:event "database_discard_field_values" :target_id id})
    (delete-all-field-values-for-database! db))
  {:status :ok})

(api.macros/defendpoint :post "/:id/permission/workspace/check"
  :- [:map
      [:status :string]
      [:checked_at :string]
      [:error {:optional true} :string]]
  "Check if database's connection has the required permissions to manage workspaces.
  By default it'll return the cached permission check."
  [{:keys [id cached]} :- [:map [:id ms/PositiveInt]
                           [:cached {:optional true
                                     :default true} :boolean]]]
  (api/check-superuser)
  (let [db (api/check-404 (t2/select-one :model/Database id))
        _  (api/check-400 (driver.u/supports? (:engine db) :workspace db)
                          "Database does not support workspaces")]
    (or (when cached
          (t2/select-one-fn :workspace_permissions_status :model/Database id))
        (database/check-and-cache-workspace-permissions! db))))

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
              (perms/schema-permission-for-user api/*current-user-id*
                                                :perms/create-queries
                                                database-id
                                                schema-name))
   (current-user-can-manage-schema-metadata? database-id schema-name)))

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/syncable_schemas"
  "Returns a list of all syncable schemas found for the database `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [db (warehouses/get-database id)]
    (api/check-403 (or (:is_attached_dwh db)
                       (perms/has-db-transforms-permission? api/*current-user-id* (:id db))
                       (and (mi/can-write? db)
                            (mi/can-read? db))))
    (->> db
         (driver/syncable-schemas (:engine db))
         (vec)
         (sort))))

(defn database-schemas
  "Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables."
  [id {:keys [include-editable-data-model? include-hidden? can-query? can-write-metadata? include-workspace?]}]
  (let [filter-schemas (fn [schemas]
                         (if include-editable-data-model?
                           (if-let [f (u/ignore-exceptions
                                        (classloader/require 'metabase-enterprise.advanced-permissions.common)
                                        (resolve 'metabase-enterprise.advanced-permissions.common/filter-schema-by-data-model-perms))]
                             (map :schema (f (map (fn [s] {:db_id id :schema s}) schemas)))
                             schemas)
                           (filter (partial can-read-schema? id) schemas)))
        clauses         (cond-> []
                          ;; a non-nil value means Table is hidden --
                          ;; see [[metabase.warehouse-schema.models.table/visibility-types]]
                          (not include-hidden?) (conj [:= :visibility_type nil])
                          (not include-workspace?) (conj [:or
                                                          [:= :schema nil]
                                                          [:not
                                                          ;; TODO (Chris 2025-12-09) -- dislike coupling to a constant, at least until we have an e2e test
                                                           [:like :schema "mb__isolation_%"]
                                                          ;; TODO (Chris 2025-12-09) -- this might behave terribly without an index when there are lots of workspaces
                                                           #_[:exists {:select [1]
                                                                       :from   [[(t2/table-name :model/Workspace) :w]]
                                                                       :where  [:and
                                                                                [:= :w.database_id id]
                                                                                [:= :w.schema :metabase_table.schema]
                                                                                [:= :w.archived_at nil]]}]]]))
        ;; For can-query? and can-write-metadata?, we need to filter based on tables in each schema
        filter-schemas-by-tables (fn [schemas]
                                   (if (or can-query? can-write-metadata?)
                                     (let [tables (t2/select :model/Table :db_id id :active true)
                                           filtered-tables (cond->> tables
                                                             can-query?          (filter mi/can-query?)
                                                             can-write-metadata? (filter mi/can-write?))
                                           allowed-schemas (set (map :schema filtered-tables))]
                                       (filter #(contains? allowed-schemas %) schemas))
                                     schemas))]
    (warehouses/get-database id {:include-editable-data-model? include-editable-data-model?})
    (->> (t2/select-fn-set :schema :model/Table
                           :db_id id :active true
                           (merge
                            {:order-by [[:%lower.schema :asc]]}
                            (when clauses
                              {:where (into [:and] clauses)})))
         filter-schemas
         filter-schemas-by-tables
         ;; for `nil` schemas return the empty string
         (map #(if (nil? %) "" %))
         distinct
         sort)))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/:id/schemas" :- [:sequential :string]
  "Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables.

  Optional filters:
  - `can-query=true` - filter to only schemas containing tables the user can query
  - `can-write-metadata=true` - filter to only schemas containing tables the user can edit metadata for"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_editable_data_model
           include_hidden
           can-query
           can-write-metadata
           include_workspace]} :- [:map
                                   [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]
                                   [:include_hidden              {:default false} [:maybe ms/BooleanValue]]
                                   [:can-query                   {:optional true} [:maybe :boolean]]
                                   [:can-write-metadata          {:optional true} [:maybe :boolean]]
                                   [:include_workspace           {:default false} [:maybe ms/BooleanValue]]]]
  (database-schemas id {:include-editable-data-model? include_editable_data_model
                        :include-hidden? include_hidden
                        :can-query?                   can-query
                        :can-write-metadata?          can-write-metadata
                        ;; TODO (Chris 2025-12-09) -- filtering out workspace schemas has a weird FE consequence - if you type one of those
                        ;;       schemas out manually in the targets, it will offer to create it for you.
                        ;;       this ends up being a no-op, so i guess it's harmless for now?
                        ;;       it will look very weird when we add validation to refuse saving that target.
                        :include-workspace? include_workspace}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:virtual-db/schemas"
                              :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of all the schemas found for the saved questions virtual database."
  []
  (when (lib-be/enable-nested-queries)
    (->> (cards-virtual-tables :question)
         (map :schema)
         distinct
         (sort-by u/lower-case-en))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:virtual-db/datasets"
                              :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of all the datasets found for the saved questions virtual database."
  []
  (when (lib-be/enable-nested-queries)
    (->> (cards-virtual-tables :model)
         (map :schema)
         distinct
         (sort-by u/lower-case-en))))

;;; ------------------------------------- GET /api/database/:id/schema/:schema ---------------------------------------

(defn- schema-tables-list
  ([db-id schema]
   (schema-tables-list db-id schema {}))
  ([db-id schema {:keys [include-hidden? include-editable-data-model? can-query? can-write-metadata?]}]
   (when-not include-editable-data-model?
     (api/read-check :model/Database db-id)
     (api/check-403 (can-read-schema? db-id schema)))
   (let [candidate-tables (if include-hidden?
                            (t2/select :model/Table
                                       :db_id db-id
                                       :schema schema
                                       :active true
                                       {:order-by [[:display_name :asc]]})
                            (t2/select :model/Table
                                       :db_id db-id
                                       :schema schema
                                       :active true
                                       :visibility_type nil
                                       {:order-by [[:display_name :asc]]}))
         filtered-tables  (cond->> (if include-editable-data-model?
                                     (if-let [f (when config/ee-available?
                                                  (classloader/require 'metabase-enterprise.advanced-permissions.common)
                                                  (resolve 'metabase-enterprise.advanced-permissions.common/filter-tables-by-data-model-perms))]
                                       (f candidate-tables)
                                       candidate-tables)
                                     (filter mi/can-read? candidate-tables))
                            can-query?          (filter mi/can-query?)
                            can-write-metadata? (filter mi/can-write?))
         hydration-keys   (cond-> []
                            (premium-features/has-feature? :transforms)   (conj :transform))]
     (if (seq hydration-keys)
       (apply t2/hydrate filtered-tables hydration-keys)
       filtered-tables))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/schema/:schema"
  "Returns a list of Tables for the given Database `id` and `schema`.

  Optional filters:
  - `can-query=true` - filter to only tables the user can query
  - `can-write-metadata=true` - filter to only tables the user can edit metadata for"
  [{:keys [id schema]} :- [:map
                           [:id ms/PositiveInt]
                           [:schema ms/NonBlankString]]
   {:keys [include_hidden include_editable_data_model can-query can-write-metadata]} :- [:map
                                                                                         [:include_hidden              {:default false} [:maybe ms/BooleanValue]]
                                                                                         [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]
                                                                                         [:can-query                   {:optional true} [:maybe :boolean]]
                                                                                         [:can-write-metadata          {:optional true} [:maybe :boolean]]]]
  (api/check-404 (seq (schema-tables-list
                       id
                       schema
                       {:include-hidden?              include_hidden
                        :include-editable-data-model? include_editable_data_model
                        :can-query?                   can-query
                        :can-write-metadata?          can-write-metadata}))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/schema/"
  "Return a list of Tables for a Database whose `schema` is `nil` or an empty string.

  Optional filters:
  - `can-query=true` - filter to only tables the user can query
  - `can-write-metadata=true` - filter to only tables the user can edit metadata for"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   {:keys [include_hidden include_editable_data_model can-query can-write-metadata]} :- [:map
                                                                                         [:include_hidden              {:default false} [:maybe ms/BooleanValue]]
                                                                                         [:include_editable_data_model {:default false} [:maybe ms/BooleanValue]]
                                                                                         [:can-query                   {:optional true} [:maybe :boolean]]
                                                                                         [:can-write-metadata          {:optional true} [:maybe :boolean]]]]
  (let [opts {:include-hidden?              include_hidden
              :include-editable-data-model? include_editable_data_model
              :can-query?                   can-query
              :can-write-metadata?          can-write-metadata}]
    (api/check-404 (seq (concat (schema-tables-list id nil opts)
                                (schema-tables-list id "" opts))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:virtual-db/schema/:schema"
                              :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the saved questions virtual database."
  [{:keys [schema]}]
  (when (lib-be/enable-nested-queries)
    (->> (source-query-cards
          :question
          :additional-constraints [(if (= schema (schema.table/root-collection-schema-name))
                                     [:= :collection_id nil]
                                     [:in :collection_id (api/check-404 (not-empty (t2/select-pks-set :model/Collection :name schema)))])])
         (map schema.table/card->virtual-table))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id/healthcheck"
  "Reports whether the database can currently connect"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [connection-type]} :- [:map [:connection-type {:optional true} ::driver.conn/connection-type]]]
  (let [{:as database :keys [engine]} (t2/select-one :model/Database :id id)
        connection-type               (or connection-type :default)
        connection-details            (driver.conn/details-for-exact-type database connection-type)]
    (api/check-400 connection-details (tru "No {0} connection configured for this database" (name connection-type)))
    ;; we only want to prevent creating new H2 databases. Testing the existing database is fine.
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (if-let [err-map (warehouses/test-database-connection engine connection-details)]
        (merge err-map {:status "error"})
        {:status "ok"}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/:virtual-db/datasets/:schema"
                              :virtual-db (re-pattern (str lib.schema.id/saved-questions-virtual-database-id))]
  "Returns a list of Tables for the datasets virtual database."
  [{:keys [schema]}]
  (when (lib-be/enable-nested-queries)
    (->> (source-query-cards
          :model
          :additional-constraints [(if (= schema (schema.table/root-collection-schema-name))
                                     [:= :collection_id nil]
                                     [:in :collection_id (api/check-404 (not-empty (t2/select-pks-set :model/Collection :name schema)))])])
         (map schema.table/card->virtual-table))))

;;; -------------------------------- GET /api/database/:id/settings-available ------------------------------------

(defn- database-local-settings
  "Return a sorted map of all database-local settings with their enabled status for the given database.
   Settings that require unavailable premium features are omitted entirely."
  [database]
  (let [settings         @setting/registered-settings
        driver           (driver.u/database->driver database)
        driver-supports? (fn [feature] (driver.u/supports? driver feature database))]
    (into (sorted-map)
          (for [[setting-name {:keys [feature database-local driver-feature enabled?] :as setting-def}] settings
                :when (and  (not= :never database-local)
                            (or (nil? feature) (premium-features/has-feature? feature)))]
            [setting-name
             (let [reasons (cond-> []
                             (and enabled? (not (enabled?)))
                             (conj {:key     :setting-disabled
                                    :type    :error
                                    :message "This setting is disabled for all databases."})

                             (and driver-feature (not (driver-supports? driver-feature)))
                             (conj {:key     :driver-feature-missing
                                    :type    :error
                                    :message (format "The %s driver does not support the `%s` feature"
                                                     (driver/display-name driver)
                                                     (name driver-feature))})

                             true
                             (into (setting/disabled-for-db-reasons setting-def database)))
                   enabled? (every? (comp #{:warning} :type) reasons)]
               (if (empty? reasons)
                 {:enabled enabled?}
                 {:enabled enabled?, :reasons reasons}))]))))

(mr/def ::available-settings
  [:map-of
   :keyword
   [:map
    [:enabled :boolean]
    [:reasons {:optional true}
     [:sequential [:map
                   [:key :keyword]
                   [:type [:enum :error :warning]]
                   [:message [:or :string [:fn i18n/localized-string?]]]]]]]])

(api.macros/defendpoint :get "/:id/settings-available" :- [:map [:settings ::available-settings]]
  "Get all database-local settings and their availability for the given database."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [database (api/read-check (warehouses/get-database id))]
    {:settings (database-local-settings database)}))
