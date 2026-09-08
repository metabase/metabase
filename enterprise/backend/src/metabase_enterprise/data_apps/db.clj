(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:model/DataApp :id :name :display_name :description :bundle_path :enabled :allowed_hosts
   :bundle_hash :last_synced_sha :last_synced_at :sync_error
   :created_at :updated_at])

(mu/defn non-blob-data-app :- [:maybe ::data-apps.schema/data-app]
  "The DataApp with `data-app-id` without its bundle, or nil."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one non-blob-columns :id data-app-id))

(mu/defn non-blob-data-app-by-slug :- [:maybe ::data-apps.schema/data-app]
  "The DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-columns :name slug))

(mu/defn enabled-non-blob-data-app-by-slug :- [:maybe ::data-apps.schema/data-app]
  "The enabled DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-columns :name slug :enabled true))

(mu/defn non-blob-data-apps :- [:sequential ::data-apps.schema/data-app]
  "Every DataApp without its bundle, ordered by display name; only the enabled, error-free ones when `available?`."
  [available? :- [:maybe :boolean]]
  (t2/select non-blob-columns
             (cond-> {:order-by [[:display_name :asc]]}
               available? (assoc :where [:and
                                         [:= :enabled true]
                                         [:= :sync_error nil]]))))

(mu/defn data-app-bundle :- [:maybe [:or bytes? :string]]
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/DataApp :id data-app-id))

(mu/defn data-apps-sync-info :- [:sequential (mut/select-keys ::data-apps.schema/data-app [:name :display_name :description :allowed_hosts :bundle_path :bundle_hash :sync_error])]
  "The sync-relevant columns of every DataApp."
  []
  (t2/select [:model/DataApp :name :display_name :description :allowed_hosts :bundle_path :bundle_hash :sync_error]))

(mu/defn data-app-exists? :- :boolean
  "Whether a DataApp named `slug` exists."
  [slug :- :string]
  (t2/exists? :model/DataApp :name slug))

(mu/defn insert-data-app! :- :int
  "Insert the DataApp `row`."
  [row :- ::data-apps.schema/data-app.update]
  (t2/insert! :model/DataApp row))

(mu/defn update-data-app! :- :int
  "Apply `changes` to the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt
   changes     :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :id data-app-id changes))

(mu/defn update-data-app-by-slug! :- :int
  "Apply `changes` to the DataApp named `slug`."
  [slug    :- :string
   changes :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :name slug changes))

(mu/defn delete-data-app-by-slug! :- :int
  "Delete the DataApp named `slug`, returning the number deleted."
  [slug :- :string]
  (t2/delete! :model/DataApp :name slug))

(mu/defn delete-data-apps-not-named! :- :int
  "Delete the DataApps whose name is not one of `slugs`, returning the number deleted."
  [slugs :- [:set :string]]
  (t2/delete! :model/DataApp :name [:not-in slugs]))

(mu/defn delete-all-data-apps! :- :int
  "Delete every DataApp, returning the number deleted."
  []
  (t2/delete! :model/DataApp))
