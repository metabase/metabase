(ns metabase.sql-tools.db
  "Application database queries for the SQL tools module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn active-visible-table-ids-by-name
  "Ids of the active, non-hidden Tables of Database `database-id` whose name case-insensitively matches one of
  `table-names`, or nil."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential :string]]
  (t2/select-pks-set :model/Table
                     {:from  [(t2/table-name :model/Table)]
                      :where [:and
                              [:= :db_id database-id]
                              ;; `lower()` cannot use an index on the name column, but it still beats fetching every
                              ;; row for the Database.
                              [:in [:lower :name] (into #{} (map u/lower-case-en) table-names)]
                              ;; Mirrors the Table filter the MetadataProvider applies to an unfiltered fetch; an
                              ;; `:id` lookup does not apply it, so it has to happen here.
                              [:= :active true]
                              [:or
                               [:= :visibility_type nil]
                               [:not-in :visibility_type ["hidden" "technical" "cruft"]]]]}))

(def ^:private ShadowDifferenceChanges
  [:map {:closed true}
   [:outcome        :string]
   [:primary_result [:maybe :string]]
   [:shadow_result  [:maybe :string]]])

(def ^:private ShadowDifferenceRow
  [:map {:closed true}
   [:input_hash      :string]
   [:method          :string]
   [:dialect         [:maybe :string]]
   [:primary_backend :string]
   [:shadow_backend  :string]
   [:outcome         :string]
   [:sql             [:maybe :string]]
   [:arguments       [:maybe :string]]
   [:primary_result  [:maybe :string]]
   [:shadow_result   [:maybe :string]]])

(mu/defn shadow-difference-seen-again! :- :int
  "Count one more sighting of the shadow difference with `input-hash`, and keep the newest `changes` (outcome and
  results). Returns the number of rows updated."
  [input-hash :- :string
   changes    :- ShadowDifferenceChanges]
  (t2/update! :model/SqlParsingShadowDifference
              {:input_hash [:auto/param input-hash]}
              (assoc changes
                     :seen_count   [:+ :seen_count 1]
                     :last_seen_at :%now)))

(mu/defn insert-shadow-difference! :- pos-int?
  "Insert a shadow difference `row`. Returns its id."
  [row :- ShadowDifferenceRow]
  (t2/insert-returning-pk! :model/SqlParsingShadowDifference row))

(mu/defn delete-shadow-differences-up-to! :- :int
  "Delete the shadow differences whose id is at most `id`. Returns the number of rows deleted."
  [id :- :int]
  (t2/delete! :model/SqlParsingShadowDifference :id [:<= [:auto/param id]]))
