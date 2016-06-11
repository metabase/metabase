(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them."
  (:require [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            (metabase [db :as db]
                      [driver :as driver])
            [metabase.events.activity-feed :refer [activity-feed-topics]]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [raw-column :refer [RawColumn]]
                             [raw-table :refer [RawTable]]
                             [table :refer [Table] :as table]
                             [setting :as setting])
            [metabase.util :as u]))

;;; # Migration Helpers

(defn- migration-ran? [migration-name]
  (-> (k/select :data_migrations
                (k/aggregate (count :*) :count)
                (k/where {:id (name migration-name)}))
      first :count (> 0)))

(defn- run-migration-if-needed
  "Run migration defined by MIGRATION-VAR if needed.

     (run-migration-if-needed #'set-card-database-and-table-ids)"
  [migration-var]
  (let [migration-name (name (:name (meta migration-var)))]
    (when-not (migration-ran? migration-name)
      (log/info (format "Running data migration '%s'..." migration-name))
      (@migration-var)
      (k/insert "data_migrations"
                (k/values {:id        migration-name
                           :timestamp (u/new-sql-timestamp)})))))

(def ^:private data-migrations (atom []))

(defmacro ^:private defmigration
  "Define a new data migration. This is just a simple wrapper around `defn-` that adds the resulting var to that `data-migrations` atom."
  [migration-name & body]
  `(do (defn- ~migration-name [] ~@body)
       (swap! data-migrations conj #'~migration-name)))

(defn run-all
  "Run all data migrations defined by `defmigration`."
  []
  (log/info "Running all necessary data migrations, this may take a minute.")
  (dorun (map run-migration-if-needed @data-migrations))
  (log/info "Finished running data migrations."))


;;; # Migration Definitions

;; Upgrade for the `Card` model when `:database_id`, `:table_id`, and `:query_type` were added and needed populating.
;;
;; This reads through all saved cards, extracts the JSON from the `:dataset_query`, and tries to populate
;; the values for `:database_id`, `:table_id`, and `:query_type` if possible.
(defmigration set-card-database-and-table-ids
  ;; only execute when `:database_id` column on all cards is `nil`
  (when (= 0 (:cnt (first (k/select Card (k/aggregate (count :*) :cnt) (k/where (not= :database_id nil))))))
    (doseq [{id :id {:keys [type] :as dataset-query} :dataset_query} (db/select [Card :id :dataset_query])]
      (when type
        ;; simply resave the card with the dataset query which will automatically set the database, table, and type
        (db/update! Card id, :dataset_query dataset-query)))))


;; Set the `:ssl` key in `details` to `false` for all existing MongoDB `Databases`.
;; UI was automatically setting `:ssl` to `true` for every database added as part of the auto-SSL detection.
;; Since Mongo did *not* support SSL, all existing Mongo DBs should actually have this key set to `false`.
(defmigration set-mongodb-databases-ssl-false
  (doseq [{:keys [id details]} (db/select [Database :id :details], :engine "mongo")]
    (db/update! Database id, :details (assoc details :ssl false))))


;; Set default values for :schema in existing tables now that we've added the column
;; That way sync won't get confused next time around
(defmigration set-default-schemas
  (doseq [[engine default-schema] [["postgres" "public"]
                                   ["h2"       "PUBLIC"]]]
    (k/update Table
              (k/set-fields {:schema default-schema})
              (k/where      {:schema nil
                             :db_id  [in (k/subselect Database
                                                      (k/fields :id)
                                                      (k/where {:engine engine}))]}))))


;; Populate the initial value for the `:admin-email` setting for anyone who hasn't done it yet
(defmigration set-admin-email
  (when-not (setting/get :admin-email)
    (when-let [email (db/select-one-field :email 'User
                       :is_superuser true
                       :is_active    true)]
      (setting/set :admin-email email))))


;; Remove old `database-sync` activity feed entries
(defmigration remove-database-sync-activity-entries
  (when-not (contains? activity-feed-topics :database-sync-begin)
    (k/delete Activity
      (k/where {:topic "database-sync"}))))


;; Clean up duplicate FK entries
(defmigration remove-duplicate-fk-entries
  (let [existing-fks (db/select ForeignKey)
        grouped-fks  (group-by #(str (:origin_id %) "_" (:destination_id %)) existing-fks)]
    (doseq [[k fks] grouped-fks]
      (when (< 1 (count fks))
        (log/debug "Removing duplicate FK entries for" k)
        (doseq [duplicate-fk (drop-last fks)]
          (db/delete! ForeignKey, :id (:id duplicate-fk)))))))


;; Migrate dashboards to the new grid
;; NOTE: this scales the dashboards by 4x in the Y-scale and 3x in the X-scale
(defmigration update-dashboards-to-new-grid
  (doseq [{:keys [id row col sizeX sizeY]} (db/select DashboardCard)]
    (k/update DashboardCard
      (k/set-fields {:row   (when row (* row 4))
                     :col   (when col (* col 3))
                     :sizeX (when sizeX (* sizeX 3))
                     :sizeY (when sizeY (* sizeY 4))})
      (k/where {:id id}))))


;; migrate data to new visibility_type column on field
(defmigration migrate-field-visibility-type
  (when (< 0 (:cnt (first (k/select Field (k/aggregate (count :*) :cnt) (k/where (= :visibility_type "unset"))))))
    ;; start by marking all inactive fields as :retired
    (k/update Field
      (k/set-fields {:visibility_type "retired"})
      (k/where      {:visibility_type "unset"
                     :active          false}))
    ;; anything that is active with field_type = :sensitive gets visibility_type :sensitive
    (k/update Field
      (k/set-fields {:visibility_type "sensitive"})
      (k/where      {:visibility_type "unset"
                     :active          true
                     :field_type      "sensitive"}))
    ;; if field is active but preview_display = false then it becomes :details-only
    (k/update Field
      (k/set-fields {:visibility_type "details-only"})
      (k/where      {:visibility_type "unset"
                     :active          true
                     :preview_display false}))
    ;; everything else should end up as a :normal field
    (k/update Field
      (k/set-fields {:visibility_type "normal"})
      (k/where      {:visibility_type "unset"
                     :active          true}))))


;; deal with dashboard cards which have NULL `:row` or `:col` values
(defmigration fix-dashboard-cards-without-positions
  (when-let [bad-dashboards (not-empty (k/select DashboardCard (k/fields [:dashboard_id]) (k/modifier "DISTINCT") (k/where (or (= :row nil) (= :col nil)))))]
    (log/info "Looks like we need to fix unpositioned cards in these dashboards:" (mapv :dashboard_id bad-dashboards))
    ;; we are going to take the easy way out, which is to put bad-cards at the bottom of the dashboard
    (doseq [{dash-to-fix :dashboard_id} bad-dashboards]
      (let [max-row   (or (:row (first (k/select DashboardCard (k/aggregate (max :row) :row) (k/where {:dashboard_id dash-to-fix})))) 0)
            max-size  (or (:size (first (k/select DashboardCard (k/aggregate (max :sizeY) :size) (k/where {:dashboard_id dash-to-fix, :row max-row})))) 0)
            max-y     (+ max-row max-size)
            bad-cards (k/select DashboardCard (k/fields :id :sizeY) (k/where {:dashboard_id dash-to-fix}) (k/where (or (= :row nil) (= :col nil))))]
        (loop [[bad-card & more] bad-cards
               row-target        max-y]
          (k/update DashboardCard
            (k/set-fields {:row row-target
                           :col 0})
            (k/where      {:id  (:id bad-card)}))
          (when more
            (recur more (+ row-target (:sizeY bad-card)))))))))


;; migrate FK information from old ForeignKey model to Field.fk_target_field_id
(defmigration migrate-fk-metadata
  (when (> 1 (:cnt (first (k/select Field (k/aggregate (count :*) :cnt) (k/where (not= :fk_target_field_id nil))))))
    (when-let [fks (not-empty (db/select ForeignKey))]
      (doseq [{:keys [origin_id destination_id]} fks]
        (k/update Field
          (k/set-fields {:fk_target_field_id destination_id})
          (k/where      {:id                 origin_id}))))))


;; populate RawTable and RawColumn information
;; NOTE: we only handle active Tables/Fields and we skip any FK relationships (they can safely populate later)
(defmigration create-raw-tables
  (when (= 0 (:cnt (first (k/select RawTable (k/aggregate (count :*) :cnt)))))
    (binding [db/*disable-db-logging* true]
      (kdb/transaction
        (doseq [{database-id :id, :keys [name engine]} (db/select Database)]
          (when-let [tables (not-empty (db/select Table, :db_id database-id, :active true))]
            (log/info (format "Migrating raw schema information for %s database '%s'" engine name))
            (let [processed-tables (atom #{})]
              (doseq [{table-id :id, table-schema :schema, table-name :name} tables]
                ;; this check gaurds against any table that appears in the schema multiple times
                (if (contains? @processed-tables {:schema table-schema, :name table-name})
                  ;; this is a dupe of this table, retire it and it's fields
                  (table/retire-tables! #{table-id})
                  ;; this is the first time we are encountering this table, so migrate it
                  (do
                    ;; add this table to the set of tables we've processed
                    (swap! processed-tables conj {:schema table-schema, :name table-name})
                    ;; create the RawTable
                    (let [{raw-table-id :id} (db/insert! RawTable
                                               :database_id database-id
                                               :schema      table-schema
                                               :name        table-name
                                               :details     {}
                                               :active      true)]
                      ;; update the Table and link it with the RawTable
                      (k/update Table
                        (k/set-fields {:raw_table_id raw-table-id})
                        (k/where      {:id table-id}))
                      ;; migrate all Fields in the Table (skipping :dynamic-schema dbs)
                      (when-not (driver/driver-supports? (driver/engine->driver engine) :dynamic-schema)
                        (let [processed-fields (atom #{})]
                          (doseq [{field-id :id, column-name :name, :as field} (db/select Field, :table_id table-id, :visibility_type [:not= "retired"])]
                            ;; guard against duplicate fields with the same name
                            (if (contains? @processed-fields column-name)
                              ;; this is a dupe, disable it
                              (k/update Field
                                (k/set-fields {:visibility_type "retired"})
                                (k/where      {:id field-id}))
                              ;; normal unmigrated field, so lets use it
                              (let [{raw-column-id :id} (db/insert! RawColumn
                                                          :raw_table_id raw-table-id
                                                          :name         column-name
                                                          :is_pk        (= :id (:special_type field))
                                                          :details      {:base-type (:base_type field)}
                                                          :active       true)]
                                ;; update the Field and link it with the RawColumn
                                (k/update Field
                                  (k/set-fields {:raw_column_id raw-column-id
                                                 :last_analyzed (u/new-sql-timestamp)})
                                  (k/where      {:id field-id}))
                                ;; add this column to the set we've processed already
                                (swap! processed-fields conj column-name)))))))))))))))))
