(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:model/DataApp :id :name :display_name :description :bundle_path :enabled :allowed_hosts
   :bundle_hash :last_synced_sha :last_synced_at :sync_error
   :created_at :updated_at])

(defn non-blob-data-app
  "The DataApp with `data-app-id` without its bundle, or nil."
  [data-app-id]
  (t2/select-one non-blob-columns :id data-app-id))

(defn non-blob-data-app-by-slug
  "The DataApp named `slug` without its bundle, or nil."
  [slug]
  (t2/select-one non-blob-columns :name slug))

(defn enabled-non-blob-data-app-by-slug
  "The enabled DataApp named `slug` without its bundle, or nil."
  [slug]
  (t2/select-one non-blob-columns :name slug :enabled true))

(defn non-blob-data-apps
  "Every DataApp without its bundle, ordered by display name; only the enabled, error-free ones when `available?`."
  [available?]
  (t2/select non-blob-columns
             (cond-> {:order-by [[:display_name :asc]]}
               available? (assoc :where [:and
                                         [:= :enabled true]
                                         [:= :sync_error nil]]))))

(defn data-app-bundle
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id]
  (t2/select-one-fn :bundle :model/DataApp :id data-app-id))

(defn data-app-sync-rows
  "The sync-relevant columns of every DataApp."
  []
  (t2/select [:model/DataApp :name :display_name :description :allowed_hosts :bundle_path :bundle_hash :sync_error]))

(defn data-app-exists?
  "Whether a DataApp named `slug` exists."
  [slug]
  (t2/exists? :model/DataApp :name slug))

(defn insert-data-app!
  "Insert the DataApp `row`."
  [row]
  (t2/insert! :model/DataApp row))

(defn update-data-app!
  "Apply `changes` to the DataApp with `data-app-id`."
  [data-app-id changes]
  (t2/update! :model/DataApp :id data-app-id changes))

(defn update-data-app-by-slug!
  "Apply `changes` to the DataApp named `slug`."
  [slug changes]
  (t2/update! :model/DataApp :name slug changes))

(defn delete-data-app-by-slug!
  "Delete the DataApp named `slug`, returning the number deleted."
  [slug]
  (t2/delete! :model/DataApp :name slug))

(defn delete-data-apps-not-named!
  "Delete the DataApps whose name is not one of `slugs`, returning the number deleted."
  [slugs]
  (t2/delete! :model/DataApp :name [:not-in slugs]))

(defn delete-all-data-apps!
  "Delete every DataApp, returning the number deleted."
  []
  (t2/delete! :model/DataApp))
