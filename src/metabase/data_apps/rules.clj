(ns metabase.data-apps.rules
  "The Library-only rules the data-app route guards hold a data app's requests to, which refuse every request without
  the data-apps feature."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- unavailable
  "The error refusing a data-app request where data apps aren't available."
  []
  (ex-info (tru "Data apps aren''t available on this instance.") {:status-code 403}))

(defenterprise check-query!
  "Throws a 403 unless a data app may run `query`, a legacy or MBQL 5 query map."
  metabase-enterprise.data-apps.rules
  [_query]
  (throw (unavailable)))

(defenterprise check-card!
  "Throws a 403 unless a data app may read the card with `card-id`, an ID or an entity ID, when such a card exists."
  metabase-enterprise.data-apps.rules
  [_card-id]
  (throw (unavailable)))

(defenterprise check-table!
  "Throws a 403 unless a data app may read the table with `table-id`, when such a table exists."
  metabase-enterprise.data-apps.rules
  [_table-id]
  (throw (unavailable)))

(defenterprise filter-table-metadata
  "The table or card `metadata` with the references a data app may not follow dropped from its fields."
  metabase-enterprise.data-apps.rules
  [_metadata]
  (throw (unavailable)))

(defenterprise filter-foreign-keys
  "The foreign keys into a table, as `GET /api/table/:id/fks` returns them, that a data app may see."
  metabase-enterprise.data-apps.rules
  [_foreign-keys]
  (throw (unavailable)))

(defenterprise filter-query-metadata
  "The metadata of a query or a card, as the query metadata endpoints return it, that a data app may see."
  metabase-enterprise.data-apps.rules
  [_metadata]
  (throw (unavailable)))

(defenterprise check-field!
  "Throws a 403 unless a data app may read the metadata of the field with `field-id`."
  metabase-enterprise.data-apps.rules
  [_field-id]
  (throw (unavailable)))

(defenterprise check-field-values!
  "Throws a 403 unless a data app may read the values of the field with `field-id`, wherever they are read from."
  metabase-enterprise.data-apps.rules
  [_field-id]
  (throw (unavailable)))

(defenterprise filter-related
  "The entities related to a field, as `GET /api/field/:id/related` returns them, that a data app may see."
  metabase-enterprise.data-apps.rules
  [_related]
  (throw (unavailable)))

(defenterprise check-parameter!
  "Throws a 403 unless a data app may read the values of `parameter` and of the fields with `field-ids`."
  metabase-enterprise.data-apps.rules
  [_parameter _field-ids]
  (throw (unavailable)))

(defenterprise check-card-parameter!
  "Throws a 403 unless a data app may read the values of the parameter with `param-key` of the card with `card-id`."
  metabase-enterprise.data-apps.rules
  [_card-id _param-key]
  (throw (unavailable)))

(defenterprise check-dashboard!
  "Throws a 403 unless a data app may use the dashboard with `dashboard-id`."
  metabase-enterprise.data-apps.rules
  [_dashboard-id]
  (throw (unavailable)))

(defenterprise check-database!
  "Throws a 403 unless a data app may read the database with `database-id`, when such a database exists."
  metabase-enterprise.data-apps.rules
  [_database-id]
  (throw (unavailable)))

(defenterprise check-schema!
  "Throws a 403 unless a data app may read the schema named `schema` of the database with `database-id`."
  metabase-enterprise.data-apps.rules
  [_database-id _schema]
  (throw (unavailable)))

(defenterprise filter-databases
  "The databases, as `GET /api/database` returns them, that a data app may see, with only the tables it may see."
  metabase-enterprise.data-apps.rules
  [_databases]
  (throw (unavailable)))

(defenterprise filter-database
  "The `database` with only the tables, and their fields' references, that a data app may see."
  metabase-enterprise.data-apps.rules
  [_database]
  (throw (unavailable)))

(defenterprise filter-schemas
  "The `schemas` of the database with `database-id` in which a data app may see a table."
  metabase-enterprise.data-apps.rules
  [_database-id _schemas]
  (throw (unavailable)))

(defenterprise filter-tables
  "The `tables` a data app may see."
  metabase-enterprise.data-apps.rules
  [_tables]
  (throw (unavailable)))

(defenterprise filter-autocomplete-suggestions
  "The autocomplete `suggestions` of the database with `database-id` that a data app may see."
  metabase-enterprise.data-apps.rules
  [_database-id _suggestions]
  (throw (unavailable)))

(defenterprise filter-cards
  "The `cards` a data app may read."
  metabase-enterprise.data-apps.rules
  [_cards]
  (throw (unavailable)))
