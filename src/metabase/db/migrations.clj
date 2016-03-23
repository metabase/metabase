(ns metabase.db.migrations
  "Clojure-land data migration definitions and fns for running them."
  (:require [clojure.tools.logging :as log]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.events.activity-feed :refer [activity-feed-topics]]
            (metabase.models [activity :refer [Activity]]
                             [card :refer [Card]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]]
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
                           :timestamp (u/new-sql-timestamp)}))
      (log/info "[ok]"))))

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
    (doseq [{id :id {:keys [type] :as dataset-query} :dataset_query} (db/sel :many [Card :id :dataset_query])]
      (when type
        ;; simply resave the card with the dataset query which will automatically set the database, table, and type
        (db/upd Card id :dataset_query dataset-query)))))


;; Set the `:ssl` key in `details` to `false` for all existing MongoDB `Databases`.
;; UI was automatically setting `:ssl` to `true` for every database added as part of the auto-SSL detection.
;; Since Mongo did *not* support SSL, all existing Mongo DBs should actually have this key set to `false`.
(defmigration set-mongodb-databases-ssl-false
  (doseq [{:keys [id details]} (db/sel :many :fields [Database :id :details] :engine "mongo")]
    (db/upd Database id, :details (assoc details :ssl false))))


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
    (when-let [email (db/sel :one :field ['User :email] (k/where {:is_superuser true :is_active true}))]
      (setting/set :admin-email email))))


;; Remove old `database-sync` activity feed entries
(defmigration remove-database-sync-activity-entries
  (when-not (contains? activity-feed-topics :database-sync-begin)
    (k/delete Activity
      (k/where {:topic "database-sync"}))))


;; Clean up duplicate FK entries
(defmigration remove-duplicate-fk-entries
  (let [existing-fks (db/sel :many ForeignKey)
        grouped-fks  (group-by #(str (:origin_id %) "_" (:destination_id %)) existing-fks)]
    (doseq [[k fks] grouped-fks]
      (when (< 1 (count fks))
        (log/debug "Removing duplicate FK entries for" k)
        (doseq [duplicate-fk (drop-last fks)]
          (db/del ForeignKey :id (:id duplicate-fk)))))))


;; Migrate dashboards to the new grid
;; NOTE: this scales the dashboards by 4x in the Y-scale and 3x in the X-scale
(defmigration update-dashboards-to-new-grid
  (doseq [{:keys [id row col sizeX sizeY]} (db/sel :many DashboardCard)]
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
