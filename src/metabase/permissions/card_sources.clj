(ns metabase.permissions.card-sources
  "Database access conferred by *models* and *metrics* the current user can read.

  When a query's primary source is a card, the query processor's required permissions are only that
  card's collection read perms — the underlying tables' `view-data` / `create-queries` are never
  consulted. See [[metabase.query-permissions.impl/legacy-mbql-required-perms]].

  That means a user whose only access to a database is collection read access to a model (or metric)
  on it is already authorized to run ad-hoc queries sourced from that card. For the query builder to
  actually work for such a user, the *database* must be visible to them — present in `GET
  /api/database` and hydrated as `:db` on card query metadata — even though none of its tables are.
  These helpers answer \"does the user have collection read access to at least one non-archived model
  or metric on this database?\" so the visibility checks can take that access into account. They
  confer no table-level access: table visibility and raw-table query permissions are unchanged.

  This is the OSS analogue of the collection-based access branch that
  [[metabase.permissions.published-tables]] provides for the EE published-tables feature.

  Plain saved questions can also be used as a query source and get the same query-processor
  treatment, but are deliberately *not* counted here: models and metrics are the curated types that
  the product positions as data sources, and counting every readable question would make nearly any
  collection grant confer database visibility."
  (:require
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- visible-collection-clause
  "HoneySQL clause matching rows whose `collection-id-field` is a collection the current user can
  read (at the default `:read` level, excluding archived collections)."
  [collection-id-field]
  ;; requiring-resolve to avoid a circular dependency: [[metabase.collections.models.collection]]
  ;; requires [[metabase.permissions.core]], which requires this namespace. Same workaround as
  ;; [[metabase.permissions.user/user-permissions-set]].
  ((requiring-resolve 'metabase.collections.models.collection/visible-collection-filter-clause)
   collection-id-field))

(defn- readable-card-source-where
  [& extra-clauses]
  (into [:and
         [:in :type [:inline ["model" "metric"]]]
         [:= :archived false]
         (visible-collection-clause :collection_id)]
        extra-clauses))

(defn user-has-card-source-permission-for-database?
  "Whether the current user can read at least one non-archived model or metric on the Database with
  `database-id`, and can therefore already run ad-hoc queries sourced from it."
  [database-id]
  (boolean
   (when api/*current-user-id*
     (t2/exists? :model/Card {:where (readable-card-source-where [:= :database_id database-id])}))))

(defn user-has-any-card-source-permission?
  "Whether the current user can read at least one non-archived model or metric on any database. Used
  when computing `:can-create-queries`."
  []
  (boolean
   (when api/*current-user-id*
     (t2/exists? :model/Card {:where (readable-card-source-where)}))))

(defn card-source-databases-clause
  "HoneySQL clause matching Databases with at least one non-archived model or metric in a collection
  the current user can read, or `nil` outside a user context. `database-id-field` is the Database ID
  column to match against, e.g. `:id`."
  [database-id-field]
  (when api/*current-user-id*
    [:in database-id-field
     {:select [:rc.database_id]
      :from   [[(t2/table-name :model/Card) :rc]]
      :where  [:and
               [:in :rc.type [:inline ["model" "metric"]]]
               [:= :rc.archived false]
               (visible-collection-clause :rc.collection_id)]}]))
