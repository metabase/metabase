(ns metabase.sql-tools.db
  "Application database queries for the SQL tools module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn active-visible-table-ids-by-name
  "Ids of the active, non-hidden Tables of Database `database-id` whose name case-insensitively matches one of
  `table-names`, or nil."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential :string]]
  (t2/select-pks-set :model/Table
                     {:where [:and
                              [:= :db_id database-id]
                              ;; `lower()` cannot use an index on the name column, but it still beats fetching every
                              ;; row for the Database.
                              [:in [:lower :name] (into #{:from [(warehouse-schema-overlay/table-query)]} (map u/lower-case-en) table-names)]
                              ;; Mirrors the Table filter the MetadataProvider applies to an unfiltered fetch; an
                              ;; `:id` lookup does not apply it, so it has to happen here.
                              [:= :active true]
                              [:or
                               [:= :visibility_type nil]
                               [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]}))
