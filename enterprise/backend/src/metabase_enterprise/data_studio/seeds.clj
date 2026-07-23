(ns metabase-enterprise.data-studio.seeds
  "Seeds: admin-curated CSVs materialized as plain, stably-named warehouse tables.
  The app-db `seed` row owns the CSV; the warehouse table is derived from it."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [metabase-enterprise.data-studio.models.seed :as seed.model]
   [metabase.api.common :as api]
   [metabase.collections.core :as collection]
   [metabase.events.core :as events]
   [metabase.upload.core :as upload]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:private seed-name-pattern #"^[a-z][a-z0-9_]*$")

(defn- check-seed-name [seed-name]
  (api/check-400 (re-matches seed-name-pattern (or seed-name ""))
                 (tru "Seed names must use lowercase letters, numbers, and underscores, starting with a letter.")))

(defn- uploads-target []
  (let [settings (upload/uploads-settings)]
    (or (:db_id settings)
        (throw (ex-info (tru "The uploads database is not configured.") {:status-code 422})))
    settings))

(defn- library-data-collection []
  (when-let [lib-id (:id (collection/library-collection))]
    (t2/select-one :model/Collection
                   :type     collection/library-data-collection-type
                   :location (str "/" lib-id "/"))))

(defn- publish-seed-table!
  "Move a freshly-materialized seed table into the Library and mark it published."
  [table]
  (let [target (api/check-404 (library-data-collection))]
    (t2/update! :model/Table (:id table) {:collection_id (:id target)
                                          :is_published  true})
    (let [published (t2/select-one :model/Table (:id table))]
      (events/publish-event! :event/table-publish {:object  published
                                                   :user-id api/*current-user-id*})
      published)))

(defn- csv-hash ^String [^String csv]
  (codecs/bytes->hex (buddy-hash/sha256 csv)))

(defn list-seeds
  "All seeds, CSV payload excluded, ordered by name."
  []
  (t2/select (into [:model/Seed] seed.model/non-csv-columns) {:order-by [[:name :asc]]}))

(defn create-seed!
  "Materialize `file` as a stably-named plain table and record the seed row that owns the CSV."
  [{:keys [seed-name filename ^java.io.File file]}]
  (check-seed-name seed-name)
  (api/check-400 (not (t2/exists? :model/Seed :name seed-name))
                 (tru "A seed named {0} already exists." seed-name))
  (let [{:keys [db_id schema_name]} (uploads-target)
        csv   (slurp file)
        table (upload/create-csv-table! {:filename    filename
                                         :file        file
                                         :db-id       db_id
                                         :schema-name schema_name
                                         :table-name  seed-name
                                         :data-source :seed})
        published (publish-seed-table! table)]
    (try
      (let [seed-id (t2/insert-returning-pk! :model/Seed
                                             {:name          seed-name
                                              :csv           csv
                                              :csv_hash      (csv-hash csv)
                                              :table_id      (:id table)
                                              :collection_id (:collection_id published)})]
        (t2/select-one (into [:model/Seed] seed.model/non-csv-columns) :id seed-id))
      (catch Exception e
        (upload/delete-upload! table :archive-cards? false)
        (throw e)))))

(defn- seed-by-id [seed-id]
  (api/check-404 (t2/select-one :model/Seed :id seed-id)))

(defn replace-seed!
  "Full-refresh the seed's table from a new CSV and update the stored payload."
  [seed-id filename ^java.io.File file]
  (let [seed  (seed-by-id seed-id)
        table (api/check-404 (t2/select-one :model/Table :id (:table_id seed)))
        csv   (slurp file)]
    (upload/replace-csv-table! {:table table :filename filename :file file})
    (t2/update! :model/Seed seed-id {:csv csv :csv_hash (csv-hash csv) :sync_error nil})
    (t2/select-one (into [:model/Seed] seed.model/non-csv-columns) :id seed-id)))

(defn delete-seed!
  "Drop the materialized table (if any) and delete the seed."
  [seed-id]
  (let [seed (seed-by-id seed-id)]
    (when-let [table (some->> (:table_id seed) (t2/select-one :model/Table :id))]
      (upload/delete-upload! table :archive-cards? false))
    (t2/delete! :model/Seed :id seed-id)
    nil))

(defn seed-csv
  "The stored CSV payload, for download."
  [seed-id]
  (let [seed (api/check-404 (t2/select-one [:model/Seed :name :csv] :id seed-id))]
    {:name (:name seed) :csv (:csv seed)}))

;;; +-----------------------------
;;; |  remote sync
;;; +-----------------------------
;;;
;;; Seeds ride the remote-sync git repo as raw `seeds/<name>.csv` files (outside
;;; the serdes allow-list, like data apps). Push stages every seed's CSV; pull
;;; re-materializes each file into a table. The CSV is the source of truth; hashes
;;; and table ids are instance-local derived state.

(defn sync-export-rows
  "The `{:name :csv}` rows to stage into the git repo, one per seed."
  []
  (t2/select [:model/Seed :name :csv] {:order-by [[:name :asc]]}))

(defn- superuser-id []
  (t2/select-one-pk :model/User :is_superuser true :is_active true))

(defn- with-temp-csv
  "Write `csv` to a temp .csv file, call `(f file)`, and clean up."
  [^String csv f]
  (let [file (File/createTempFile "seed-sync" ".csv")]
    (try
      (spit file csv)
      (f file)
      (finally
        (.delete file)))))

(defn- materialize-one!
  "Upsert the seed named `seed-name` from `csv` and (re)materialize its table.
  Runs bound as a superuser so the upload engine's permission checks pass during a
  background pull. Returns true if anything changed, false if the CSV was identical."
  [seed-name ^String csv sha]
  (let [existing (t2/select-one :model/Seed :name seed-name)
        hash     (csv-hash csv)]
    (if (= hash (:csv_hash existing))
      false
      (let [{:keys [db_id schema_name]} (uploads-target)]
        (with-temp-csv csv
          (fn [file]
            (let [table (if-let [t (and (:table_id existing)
                                        (t2/select-one :model/Table :id (:table_id existing) :active true))]
                          (do (upload/replace-csv-table! {:table t :filename (str seed-name ".csv") :file file})
                              t)
                          (publish-seed-table!
                           (upload/create-csv-table! {:filename    (str seed-name ".csv")
                                                      :file        file
                                                      :db-id       db_id
                                                      :schema-name schema_name
                                                      :table-name  seed-name
                                                      :data-source :seed})))
                  row   {:name          seed-name
                         :csv           csv
                         :csv_hash      hash
                         :table_id      (:id table)
                         :collection_id (:collection_id table)
                         :last_synced_sha sha
                         :sync_error    nil}]
              (if existing
                (t2/update! :model/Seed (:id existing) row)
                (t2/insert! :model/Seed row))
              true)))))))

(def ^:private seed-file-re #"^seeds/([a-z][a-z0-9_]*)\.csv$")

(defn materialize-from-sync!
  "Pull hook: discover `seeds/<name>.csv` files via the reader fns and materialize
  each into a table. Upsert-only (mirrors data apps): seeds absent from the repo are
  left untouched. Never throws; per-seed failures are recorded on the seed row.
  Returns `{:changed n}`."
  [{:keys [read-file list-files sha]}]
  (binding [api/*current-user-id* (superuser-id)
            api/*is-superuser?*   true]
    (let [files   (filter #(re-matches seed-file-re %) (list-files))
          changed (reduce
                   (fn [n path]
                     (let [seed-name (second (re-matches seed-file-re path))]
                       (try
                         (if (materialize-one! seed-name (read-file path) sha)
                           (inc n)
                           n)
                         (catch Throwable e
                           (log/errorf e "Failed to materialize seed %s from remote sync" seed-name)
                           (t2/update! :model/Seed :name seed-name {:sync_error (ex-message e)})
                           n))))
                   0
                   files)]
      {:changed changed})))
