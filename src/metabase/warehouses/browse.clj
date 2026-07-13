(ns metabase.warehouses.browse
  "The domain functions behind browsing the data hierarchy: which databases the current user may see,
   which schemas a database shows them, and which tables a schema shows them. `GET /api/database`,
   `GET /api/database/:id/schemas`, and `GET /api/database/:id/schema/:schema` are thin wrappers over
   these, and the agent-api `browse_data` tool calls the same functions — one implementation of each
   permission filter, shared by every surface."
  (:require
   [metabase.api.common :as api]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.warehouses.util :as warehouses.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ─────────────────────────────────────────── Databases ───────────────────────────────────────────

(defn database-visibility-clause
  "The HoneySQL `where` clause selecting the databases the current user may see: query access, database
   management, or table-metadata management on at least one table."
  []
  (let [user-info {:user-id          api/*current-user-id*
                   :is-superuser?    (mi/superuser?)
                   :is-data-analyst? api/*is-data-analyst?*}]
    [:or
     (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/create-queries :query-builder}))
     (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-database :yes}))
     (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-table-metadata :yes}))]))

(defn visible-databases
  "The non-stub, non-audit, non-router-destination databases the current user may see, ordered by name —
   the default selection `GET /api/database` serves (before that endpoint's per-row hydrations, which
   its option flags control)."
  []
  (t2/select :model/Database
             {:order-by [:%lower.name :%lower.engine]
              :where    [:and
                         [:= :is_stub false]
                         [:= :is_audit false]
                         [:= :router_database_id nil]
                         (database-visibility-clause)]}))

;;; ──────────────────────────────────────────── Schemas ────────────────────────────────────────────

(defenterprise current-user-can-manage-schema-metadata?
  "Returns a boolean whether the current user has permission to edit table metadata for any tables in the schema.
  On OSS, this is only available to admins."
  metabase-enterprise.advanced-permissions.common
  [_db-id _schema-name]
  (mi/superuser?))

(defn can-read-schema?
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

(defn database-schemas
  "Returns a list of all the schemas with tables found for the database `id`. Excludes schemas with no tables."
  [id {:keys [include-editable-data-model? include-hidden? can-query? can-write-metadata?]}]
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
                          (not include-hidden?) (conj [:= :visibility_type nil]))
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
    (warehouses.util/get-database id {:include-editable-data-model? include-editable-data-model?})
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

;;; ──────────────────────────────────────── Tables in a schema ─────────────────────────────────────

(defn schema-tables-list
  "The Tables in `schema` of the Database `db-id` the current user may see — the domain function behind
   `GET /api/database/:id/schema/:schema` (and, for a `nil`/empty `schema`, `GET /api/database/:id/schema/`).
   Read-checks the database and the schema unless `include-editable-data-model?` selects the
   data-model-permission filter instead."
  ([db-id schema]
   (schema-tables-list db-id schema {}))
  ([db-id schema {:keys [include-hidden? include-editable-data-model? can-query? can-write-metadata? include-measures?]}]
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
                            (premium-features/any-transforms-enabled?)   (conj :transform)
                            include-measures? (conj :measures))]
     (if (seq hydration-keys)
       (apply t2/hydrate filtered-tables hydration-keys)
       filtered-tables))))
