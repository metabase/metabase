(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase-enterprise.custom-viz-plugin.serialization :as custom-viz-plugin.serialization]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/CustomVizPlugin [_model] :custom_viz_plugin)

(defn- blob->bytes ^bytes [v]
  (cond
    (nil? v)           nil
    (instance? Blob v) (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    :else              v))

(def ^:private transform-bundle
  "Coerce JDBC `Blob` values into plain byte arrays on read."
  {:in  identity
   :out blob->bytes})

(t2/deftransforms :model/CustomVizPlugin
  {:status   mi/transform-keyword
   :manifest mi/transform-json
   :bundle   transform-bundle})

(defn- with-bundle-hash
  "The `row` with `bundle_hash` matching the `bundle` it sets."
  [row]
  (cond-> row
    (contains? row :bundle) (assoc :bundle_hash (some-> ^bytes (:bundle row) cache/bytes-hash))))

(t2/define-before-insert :model/CustomVizPlugin
  [plugin]
  (with-bundle-hash plugin))

(t2/define-before-update :model/CustomVizPlugin
  [plugin]
  (merge plugin (some-> (t2/changes plugin) with-bundle-hash)))

(doto :model/CustomVizPlugin
  (derive :metabase/model)
  (derive :hook/timestamped?))

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some? api/*current-user-id*))))

(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_write]
  [_model k instance]
  (assoc instance k (boolean api/*is-superuser?*)))

(defmethod mi/can-create? :model/CustomVizPlugin
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod mi/to-json :model/CustomVizPlugin
  "Never include the raw bundle bytes in JSON."
  [plugin json-generator]
  (next-method (dissoc plugin :bundle) json-generator))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-custom-viz-plugins! :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin]
  "Insert the CustomVizPlugin `rows`, publishing their create event, and return the inserted plugins."
  [rows :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [plugins (custom-viz-plugin.db/insert-plugins! rows)]
        (events/publish-event! :event/custom-viz-plugin-create (events/create-event plugins))
        plugins))
    []))

(defn- write-custom-viz-plugin-updates!
  "Applies `rows`, each the `:id` of a CustomVizPlugin with the changes it gets, which may differ from row to row, in one
  transaction with one statement for each distinct set of changes, publishing one update event for all of them, and
  returns `rows`."
  [rows]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (let [stored (into {} (map (juxt :id identity)) (custom-viz-plugin.db/non-blob-plugins-by-ids (mapv :id rows)))]
        (doseq [[changes group] (group-by #(dissoc % :id) rows)
                :when (seq changes)]
          (custom-viz-plugin.db/update-plugins! (mapv :id group) changes))
        (events/publish-event! :event/custom-viz-plugin-update
                               (events/update-event stored
                                                    rows
                                                    {:objects (into {}
                                                                    (keep (fn [{:keys [id] :as row}]
                                                                            (when-let [previous (stored id)]
                                                                              [id (merge previous (with-bundle-hash (dissoc row :id)))])))
                                                                    rows)})))))
  (vec rows))

(mu/defn update-custom-viz-plugins! :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.update-row]
  "Apply `changes`, one change to the columns, to each of the CustomVizPlugins with `ids` in one statement, publishing
  their update event. Returns the updated rows."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::custom-viz-plugin.schema/custom-viz-plugin.update]
  (write-custom-viz-plugin-updates! (mapv #(assoc changes :id %) ids)))

(mu/defn update-custom-viz-plugins-for-import!
  "Apply each of `rows`, the id of a CustomVizPlugin and the columns to change, in one pass over all of them, publishing
  one update event, as an import does because every row holds its own values. Returns `rows`."
  [rows :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.update-row]]
  (write-custom-viz-plugin-updates! rows))

(mu/defn delete-custom-viz-plugins!
  "Delete the CustomVizPlugins with `ids`, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/custom-viz-plugin-delete
                             {:changes (u.events/delete-changes (custom-viz-plugin.db/non-blob-plugins-by-ids (vec ids)))
                            :user-id (mi/current-user-id)})
      (custom-viz-plugin.db/delete-plugins! (vec ids))))
  nil)

(mu/defn insert-bundle!
  "Create an enabled CustomVizPlugin with `identifier` from the validated bundle `validated` and return it."
  [identifier :- ::custom-viz-plugin.schema/custom-viz-plugin.identifier
   validated  :- :map]
  (first (create-custom-viz-plugins!
          [(merge {:identifier identifier
                   :enabled    true}
                  (cache/derived-columns validated))])))

(mu/defn save-bundle!
  "Store the validated bundle `validated` on the existing plugin, evict its stale on-disk caches, and return the
  refreshed plugin without its bundle."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   validated    :- :map]
  (update-custom-viz-plugins! [id] (cache/derived-columns validated))
  (cache/purge-plugin-cache! {:id id})
  (custom-viz-plugin.db/non-blob-plugin id))

(mu/defn set-or-clear-dev-bundle!
  "Set the dev bundle URL of the CustomVizPlugin with `id` to `dev-bundle-url`, or clear it when blank."
  [id             :- ms/PositiveInt
   dev-bundle-url :- [:maybe :string]]
  (let [url (not-empty dev-bundle-url)]
    (some-> url (cache/validate-url! "Dev bundle URL"))
    (update-custom-viz-plugins! [id] {:dev_bundle_url url})))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/CustomVizPlugin [_model]
  {:skip? false})

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema        ::custom-viz-plugin.schema/external-custom-viz-plugin
   :identity      [:identifier]
   :copy          [:display_name :identifier :enabled :icon :manifest :metabase_version]
   :skip          [:status :error_message :dev_bundle_url :bundle_hash]
   :defaults      {:enabled true}
   :transform     {:bundle custom-viz-plugin.serialization/bundle-transform}
   :insert!       create-custom-viz-plugins!
   :update!       update-custom-viz-plugins-for-import!
   :delete!       delete-custom-viz-plugins!
   :rows-by-refs  custom-viz-plugin.serialization/rows-by-refs
   :storage-paths custom-viz-plugin.serialization/storage-paths
   :before-load   custom-viz-plugin.serialization/before-load
   :after-load    custom-viz-plugin.serialization/after-load})

(defmethod audit/spec :model/CustomVizPlugin [_model]
  {:track          [:identifier :display_name :status :enabled :bundle_hash]
   :track-redacted [:bundle :dev_bundle_url :error_message :icon :manifest :metabase_version]
   :skip           []})
