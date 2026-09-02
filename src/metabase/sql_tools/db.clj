(ns metabase.sql-tools.db
  "Application database queries for the SQL tools module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn active-visible-table-ids-by-lower-name
  "Ids of the active, non-hidden Tables of Database `database-id` whose lower-cased name is in `lower-names`, or nil."
  [database-id lower-names]
  (t2/select-pks-set :model/Table
                     {:where [:and
                              [:= :db_id database-id]
                              ;; `lower()` cannot use an index on the name column, but it still beats fetching every
                              ;; row for the Database.
                              [:in [:lower :name] lower-names]
                              ;; Mirrors the Table filter the MetadataProvider applies to an unfiltered fetch; an
                              ;; `:id` lookup does not apply it, so it has to happen here.
                              [:= :active true]
                              [:or
                               [:= :visibility_type nil]
                               [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]}))
