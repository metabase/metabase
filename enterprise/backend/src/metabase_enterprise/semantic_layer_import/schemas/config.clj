(ns metabase-enterprise.semantic-layer-import.schemas.config
  "The import's configuration: what a semantic layer cannot supply, and how its content is written. A source's own
  options (dbt's `:entity-models`, say) are the source's, not part of this."
  (:require
   [metabase.driver :as driver]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn- loadable-driver? :- :boolean
  "Whether `driver` names a driver the instance can load: drivers register when their namespace loads, which
  [[driver/the-initialized-driver]] does on first use, so an unloaded `:mysql` is as good as a loaded one and only a
  name no driver answers to fails."
  [driver :- :keyword]
  (boolean (try
             (driver/the-initialized-driver driver)
             (catch Throwable _
               false))))

(mu/defn jdbc-driver? :- :boolean
  "Whether `driver`, once loaded, is a JDBC driver: one derived from `:sql-jdbc`. Only a JDBC driver has the
  [[metabase.driver.sql-jdbc.sync/database-type->base-type]] mapping the import types the project's columns with,
  so `:mongo` or `:bigquery-cloud-sdk` cannot be imported for."
  [driver :- :keyword]
  (isa? driver/hierarchy driver :sql-jdbc))

(mr/def ::driver
  "A Metabase driver by name, `:postgres`: one the instance can load (see [[loadable-driver?]]) and a JDBC one (see
  [[jdbc-driver?]]). Column base types come from the driver's own
  [[metabase.driver.sql-jdbc.sync/database-type->base-type]]; a warehouse type the driver does not map is reported,
  and the fix is a mapping in the driver, which is meant to have one for every type its warehouse has."
  [:and
   :keyword
   [:fn {:error/fn (fn [{:keys [value]} _]
                     (if (loadable-driver? value)
                       "not a JDBC driver: the import types columns through the driver's sql-jdbc type mapping"
                       "not a driver the instance can load"))}
    (fn [driver]
      (and (loadable-driver? driver) (jdbc-driver? driver)))]])

(mr/def ::identifier-case
  "How a warehouse stores an identifier written without quotes, which is how sync sees it: `:upper` (Snowflake,
  Oracle, H2), `:lower` (Postgres, Redshift, the Trino family) or `:as-is`, the spelling kept (MySQL, SQL Server,
  SQLite, BigQuery). See [[metabase-enterprise.semantic-layer-import.metadata/identifier-case]] for how the import
  picks one."
  [:enum :upper :lower :as-is])

(mr/def ::config
  "The import's configuration: what the semantic layer cannot supply, and how its content is written."
  [:map {:closed true}
   ;; `:databases` maps the warehouse database as the source names it (`database` of a `::ir/relation`) to the name
   ;; of the Metabase Database it is connected as, as typed, letter case included. This is the one thing a semantic
   ;; layer cannot supply. The key is nil for a source that names no database (dbt-mysql writes `database: null`,
   ;; its MySQL database being the schema).
   [:databases       [:map-of [:maybe :string] :string]]
   ;; `:driver` is the Metabase driver those databases use.
   [:driver          ::driver]
   ;; `:identifier-case` overrides what the driver says about an identifier the project wrote without quotes (see
   ;; [[metabase-enterprise.semantic-layer-import.metadata/identifier-case]]); a part it quoted is never folded.
   [:identifier-case {:optional true} ::identifier-case]
   ;; `:schema-mapping` maps a schema as the source names it to the schema the instance has the table under, nil for
   ;; none, overriding the default (the schema as the driver stores it, or nil for a driver without schemas) for that
   ;; schema only.
   [:schema-mapping  {:optional true} [:map-of :string [:maybe :string]]]
   ;; `:creator-email` is the user the cards are created as. Serdes resolves it by email and synthesizes an inactive
   ;; user when none exists, but a card cannot be imported without one.
   [:creator-email   :string]
   ;; `:collection-name` names the collection the content is written to; `<tool> metrics` (`dbt metrics`) when it is
   ;; not given.
   [:collection-name {:optional true} :string]])
