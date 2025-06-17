(ns metabase.sync.sync-metadata.fks
  "Logic for updating FK properties of Fields from metadata fetched from a physical DB."
  (:require
   [honey.sql :as sql]
   [metabase.app-db.core :as mdb]
   [metabase.driver.util :as driver.u]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.sync.interface :as i]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.table :as table]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- normalize-fk-metadata
  [{:keys [fk-table-schema fk-table-name fk-column-name
           pk-table-schema pk-table-name pk-column-name] :as metadata}]
  (assoc metadata
         :fk-table-schema (some-> fk-table-schema u/lower-case-en)
         :fk-table-name (u/lower-case-en fk-table-name)
         :fk-column-name (u/lower-case-en fk-column-name)
         :pk-table-schema (some-> pk-table-schema u/lower-case-en)
         :pk-table-name (u/lower-case-en pk-table-name)
         :pk-column-name (u/lower-case-en pk-column-name)))

(defn ^:private mark-fk-sql
  "Returns [sql & params] for [[mark-fk!]] according to the application DB's dialect."
  [db-id {:keys [fk-table-name
                 fk-table-schema
                 fk-column-name
                 pk-table-name
                 pk-table-schema
                 pk-column-name]}]
  (let [field-id-query (fn [db-id table-schema table-name column-name]
                         {:select [[[:min :f.id] :id]]
                          ;; Cal 2024-03-04: We use `min` to limit this subquery to one result (limit 1 isn't allowed
                          ;; in subqueries in MySQL) because it's possible for schema, table, or column names to be
                          ;; non-unique when lower-cased for some DBs. We have been doing case-insensitive matching
                          ;; since #5510 so this preserves behaviour to avoid possible regressions.
                          ;; It's possible this is to avoid
                          :from   [[:metabase_field :f]]
                          :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                          :left-join [[:metabase_field_user_settings :u] [:= :f.id :u.field_id]]
                          :where  [:and
                                   ;; ensure we are not overriding user-set fks
                                   [:= :u.fk_target_field_id nil]
                                   [:= :u.semantic_type nil]

                                   [:= :t.db_id db-id]
                                   [:= [:lower :f.name] column-name]
                                   [:= [:lower :t.name] table-name]
                                   [:= [:lower :t.schema] table-schema]
                                   [:= :f.active true]
                                   [:not= :f.visibility_type "retired"]
                                   [:= :t.active true]
                                   [:= :t.visibility_type nil]]})
        fk-field-id-query (field-id-query db-id fk-table-schema fk-table-name fk-column-name)
        pk-field-id-query (field-id-query db-id pk-table-schema pk-table-name pk-column-name)

        ;; Only update if either:
        ;; - fk_target_field_id is NULL and the new target is not NULL
        ;; - fk_target_field_id is not NULL but the new target is different and not NULL
        valid-condition
        (fn [k]
          [:or
           [:= :f.fk_target_field_id nil]
           [:not= :f.fk_target_field_id k]])

        q (case (mdb/db-type)
            :mysql
            {:update [:metabase_field :f]
             :join   [[fk-field-id-query :fk] [:= :fk.id :f.id]
                      [pk-field-id-query :pk]
                      (valid-condition :pk.id)]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}}
            :postgres
            {:update [:metabase_field :f]
             :from   [[fk-field-id-query :fk]]
             :join   [[pk-field-id-query :pk] true]
             :set    {:fk_target_field_id :pk.id
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :fk.id :f.id]
                      (valid-condition :pk.id)]}
            :h2
            {:update [:metabase_field :f]
             :set    {:fk_target_field_id pk-field-id-query
                      ;; We need to reset has_field_values when it is auto-list as FKs should not be marked as such
                      :has_field_values   [:case [:= :has_field_values "auto-list"] nil :else :has_field_values]
                      :semantic_type      "type/FK"}
             :where  [:and
                      [:= :f.id fk-field-id-query]
                      [:not= pk-field-id-query nil]
                      (valid-condition pk-field-id-query)]})]
    (sql/format q :dialect (mdb/quoting-style (mdb/db-type)))))

(defn ^:private retire-obsolete-fks-sql
  [db-id table-id current-fks]
  (let [exclude-conditions
        (mapv (fn [{:keys [fk-table-name fk-table-schema fk-column-name pk-table-name pk-table-schema pk-column-name]}]
                [:and
                 [:= [:lower :fk_t.schema] fk-table-schema]
                 [:= [:lower :fk_t.name] fk-table-name]
                 [:= [:lower :fk_f.name] fk-column-name]
                 [:= [:lower :pk_t.schema] pk-table-schema]
                 [:= [:lower :pk_t.name] pk-table-name]
                 [:= [:lower :pk_f.name] pk-column-name]])
              current-fks)

        where-clause
        [:and
         [:= :fk_t.db_id db-id]
         [:= :fk_t.id table-id]
         [:not= :fk_f.fk_target_field_id nil]
         [:= :fk_f.semantic_type "type/FK"]
         [:= :fk_f.active true]
         [:not= :fk_f.visibility_type "retired"]
         [:= :fk_t.active true]
         [:= :fk_t.visibility_type nil]
         [:= :pk_f.active true]
         [:not= :pk_f.visibility_type "retired"]
         [:= :pk_t.active true]
         [:= :pk_t.visibility_type nil]
         ;; Only retire system-managed FKs, not user-set ones
         [:not-exists {:select [1]
                       :from   [[:metabase_field_user_settings :u]]
                       :where  [:and
                                [:= :u.field_id :fk_f.id]
                                [:or
                                 [:not= :u.fk_target_field_id nil]
                                 [:not= :u.semantic_type nil]]]}]
         (when (seq exclude-conditions)
           [:not (into [:or] exclude-conditions)])]

        q (case (mdb/db-type)
            :h2
            {:update [:metabase_field]
             :set    {:fk_target_field_id nil
                      :semantic_type      nil}
             :where  [:in :id {:select [:fk_f.id]
                               :from   [[:metabase_field :fk_f]]
                               :join   [[:metabase_table :fk_t] [:= :fk_f.table_id :fk_t.id]
                                        [:metabase_field :pk_f] [:= :fk_f.fk_target_field_id :pk_f.id]
                                        [:metabase_table :pk_t] [:= :pk_f.table_id :pk_t.id]]
                               :where  where-clause}]}

            :mysql
            {:update [:metabase_field :fk_f]
             :join   [[:metabase_table :fk_t] [:= :fk_f.table_id :fk_t.id]
                      [:metabase_field :pk_f] [:= :fk_f.fk_target_field_id :pk_f.id]
                      [:metabase_table :pk_t] [:= :pk_f.table_id :pk_t.id]]
             :set {:fk_f.fk_target_field_id nil
                   :fk_f.semantic_type      nil}
             :where  where-clause}

            :postgres
            {:update [:metabase_field :fk_f]
             :set    {:fk_target_field_id nil
                      :semantic_type      nil}
             :from   [[:metabase_table :fk_t]
                      [:metabase_field :pk_f]
                      [:metabase_table :pk_t]]
             :where  [:and
                      [:= :fk_f.table_id :fk_t.id]
                      [:= :fk_f.fk_target_field_id :pk_f.id]
                      [:= :pk_f.table_id :pk_t.id]
                      where-clause]})]

    (sql/format q :dialect (mdb/quoting-style (mdb/db-type)))))

(defn- retire-obsolete-fks-for-table
  "Retire FK relationships for a specific table that are not in the current FKs set."
  [database table-id current-fks]
  (try
    (t2/query-one (retire-obsolete-fks-sql (:id database) table-id current-fks))
    (catch Exception e
      (log/error e "Error retiring obsolete FK relationships for table" table-id)
      0)))

(mu/defn- mark-fk!
  "Updates the `fk_target_field_id` of a Field. Returns 1 if the Field was successfully updated, 0 otherwise."
  [database :- i/DatabaseInstance
   metadata :- i/FKMetadataEntry]
  (u/prog1 (t2/query-one (mark-fk-sql (:id database) metadata))
    (when (= <> 1)
      (log/info (u/format-color 'cyan "Marking foreign key from %s %s -> %s %s"
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:fk-column-name metadata))
                                (sync-util/table-name-for-logging :name (:fk-table-name metadata)
                                                                  :schema (:fk-table-schema metadata))
                                (sync-util/field-name-for-logging :name (:pk-column-name metadata)))))))

(defmacro ^:private try-with-err-count
  [& body]
  `(try
     [(do ~@body) 0]
     (catch Exception e#
       (log/error e#)
       [0 1])))

(mu/defn sync-fks-for-table!
  "Sync the foreign keys for a specific `table`."
  ([table :- i/TableInstance]
   (sync-fks-for-table! (table/database table) table))

  ([database :- i/DatabaseInstance
    table    :- i/TableInstance]
   (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging table))
     (let [schema-names (when (driver.u/supports? (driver.u/database->driver database) :schemas database)
                          [(:schema table)])
           fk-metadata  (into []
                              (map normalize-fk-metadata)
                              (fetch-metadata/fk-metadata database :schema-names schema-names :table-names [(:name table)]))
           stats (transduce (map (fn [fk-meta]
                                   (let [[updated failed] (try-with-err-count (mark-fk! database fk-meta))]
                                     {:total-fks    1
                                      :updated-fks  updated
                                      :total-failed failed})))
                            (partial merge-with +)
                            {:total-fks 0 :updated-fks 0 :total-failed 0}
                            fk-metadata)

           [retired failed] (try-with-err-count (retire-obsolete-fks-for-table database (:id table) fk-metadata))]
       (-> stats
           (assoc :retired-fks retired)
           (update :total-failed + failed))))))

(mu/defn sync-fks!
  "Sync the foreign keys in a `database`. This sets appropriate values for relevant Fields in the Metabase application
  DB based on values returned by [[metabase.driver/describe-table-fks]].

  If the driver supports the `:describe-fks` feature, [[metabase.driver/describe-fks]] is used to fetch the FK metadata.

  This function also sets all the tables that should be synced to have `initial-sync-status=complete` once the sync is done."
  [database :- i/DatabaseInstance]
  (u/prog1 (sync-util/with-error-handling (format "Error syncing FKs for %s" (sync-util/name-for-logging database))
             (transduce (map #(sync-fks-for-table! database %))
                        (partial merge-with +)
                        {:total-fks 0 :updated-fks 0 :total-failed 0 :retired-fks 0}
                        (sync-util/reducible-sync-tables database)))
    ;; Mark the table as done with its initial sync once this step is done even if it failed, because only
    ;; sync-aborting errors should be surfaced to the UI (see
    ;; `:metabase.sync.util/exception-classes-not-to-retry`).
    (sync-util/set-initial-table-sync-complete-for-db! database)))
