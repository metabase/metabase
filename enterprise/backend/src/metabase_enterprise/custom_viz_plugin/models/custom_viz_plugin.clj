(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase-enterprise.custom-viz-plugin.serialization :as custom-viz-plugin.serialization]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
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

;; A bundled plugin on a read-only instance comes from the repository, so it can only change there. Dev-only plugins
;; are never synced (see the remote-sync spec below), so existing ones stay writable, but `can-create?` refuses new
;; ones too: a read-only instance registers no plugins.
(methodical/defmethod t2/batched-hydrate [:model/CustomVizPlugin :can_write]
  "Whether the current user can write each of `plugins`, the bundle hashes of those read without one loaded once."
  [_model k plugins]
  (let [read-only? (remote-sync/read-only?)
        id->hash   (when (and api/*is-superuser?* read-only?)
                     (some->> plugins
                              (keep #(when (and % (not (contains? % :bundle_hash))) (:id %)))
                              not-empty
                              vec
                              custom-viz-plugin.db/plugin-bundle-hashes))]
    (for [plugin plugins]
      (when plugin
        (assoc plugin k (boolean (and api/*is-superuser?*
                                      (or (not read-only?)
                                          (nil? (if (contains? plugin :bundle_hash)
                                                  (:bundle_hash plugin)
                                                  (get id->hash (:id plugin))))))))))))

(defmethod mi/can-create? :model/CustomVizPlugin
  [_model _plugin]
  (and api/*is-superuser?*
       (not (remote-sync/read-only?))))

(defmethod mi/can-update? :model/CustomVizPlugin
  [plugin changes]
  (and api/*is-superuser?*
       (or (not (remote-sync/synced-changes? :model/CustomVizPlugin plugin changes))
           (not (remote-sync/read-only?)))))

(methodical/defmethod mi/to-json :model/CustomVizPlugin
  "Never include the raw bundle bytes in JSON."
  [plugin json-generator]
  (next-method (dissoc plugin :bundle) json-generator))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-custom-viz-plugins! :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin]
  "Insert the CustomVizPlugin `rows`, publishing their create event, and return the inserted plugins."
  [rows :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.create]]
  (app-db/create-batched! :model/CustomVizPlugin rows
                          {:after-create #(events/publish-event! :event/custom-viz-plugin-create (events/create-event %))}))

(defn- update-custom-viz-plugin-batch!
  "Write the `updates` of one batch and return them with the plugins, without their bundles, as stored before and after."
  [updates]
  (let [id->stored (custom-viz-plugin.db/non-blob-plugins-by-ids (mapv :id updates))]
    (custom-viz-plugin.db/update-plugins! updates)
    {:updates     updates
     :id->stored  id->stored
     :id->updated (when (seq id->stored)
                    (custom-viz-plugin.db/non-blob-plugins-by-ids (vec (keys id->stored))))}))

(mu/defn update-custom-viz-plugins! :- :nil
  "Apply `updates`, each the `:id` of a CustomVizPlugin with the columns to give it, in one transaction, publishing
  their update event, with the plugins read without their bundles."
  [updates :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.update]]
  (t2/with-transaction [_conn]
    (let [batches    (mapv #(update-custom-viz-plugin-batch! (vec %))
                           (partition-all app-db/update-partition-size updates))
          id->stored (into {} (map :id->stored) batches)]
      (when (seq id->stored)
        (events/publish-event! :event/custom-viz-plugin-update
                               (events/update-event id->stored
                                                    (into [] (mapcat :updates) batches)
                                                    {:objects (into {} (map :id->updated) batches)})))))
  nil)

(mu/defn delete-custom-viz-plugins! :- :nil
  "Delete the CustomVizPlugins with `ids` in one transaction, publishing their delete event right before the first
  statement, with the plugins read without their bundles, and evict their on-disk bundle caches."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/with-transaction [_conn]
    (let [batches (mapv vec (partition-all app-db/delete-partition-size ids))
          plugins (into [] (mapcat (comp vals custom-viz-plugin.db/non-blob-plugins-by-ids)) batches)]
      (when (seq plugins)
        (events/publish-event! :event/custom-viz-plugin-delete (events/delete-event plugins))
        (run! custom-viz-plugin.db/delete-plugins! batches)
        ;; a pull deletes through here too, not only the API, so the on-disk bundle caches are evicted here
        (run! cache/purge-plugin-cache! plugins))))
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
  (update-custom-viz-plugins! [(assoc (cache/derived-columns validated) :id id)])
  (cache/purge-plugin-cache! {:id id})
  (custom-viz-plugin.db/non-blob-plugin id))

(mu/defn set-or-clear-dev-bundle!
  "Set the dev bundle URL of the CustomVizPlugin with `id` to `dev-bundle-url`, or clear it when blank."
  [id             :- ms/PositiveInt
   dev-bundle-url :- [:maybe :string]]
  (let [url (not-empty dev-bundle-url)]
    (some-> url (cache/validate-url! "Dev bundle URL"))
    (update-custom-viz-plugins! [{:id id :dev_bundle_url url}])))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/CustomVizPlugin [_model]
  {:skip? false})

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema            ::custom-viz-plugin.schema/external-custom-viz-plugin
   :identity          [:identifier]
   :copy              [:identifier]
   :skip              [;; derived from the bundle at import time, exactly as on upload
                       :display_name :icon :manifest :metabase_version :bundle_hash :status :error_message
                       ;; admin-owned state of this instance
                       :enabled
                       ;; dev-only plugins are never served from another instance
                       :dev_bundle_url]
   :transform         {:bundle custom-viz-plugin.serialization/bundle-transform}
   :after-export      custom-viz-plugin.serialization/after-export
   :after-export-keys [:files]
   :storage-paths     custom-viz-plugin.serialization/storage-paths
   :resource-paths    custom-viz-plugin.serialization/resource-paths
   :entity-ref        custom-viz-plugin.serialization/entity-ref
   :rows-by-refs      custom-viz-plugin.serialization/rows-by-refs
   :before-load       custom-viz-plugin.serialization/before-load
   :after-load        custom-viz-plugin.serialization/after-load
   :insert!           create-custom-viz-plugins!
   :update!           #(do (update-custom-viz-plugins! %) %)
   :delete!           delete-custom-viz-plugins!})

(defmethod audit/spec :model/CustomVizPlugin [_model]
  {:track          [:identifier :display_name :status :enabled :bundle_hash]
   :track-redacted [:bundle :dev_bundle_url :error_message :icon :manifest :metabase_version]
   :skip           []})

(defmethod remote-sync/spec :model/CustomVizPlugin
  [_model]
  ;; a dev-only plugin has no stored bundle: it is this instance's alone, a push has nothing to write for it, and a
  ;; pull must not remove it
  {:name                 :identifier
   :synced-items         custom-viz-plugin.db/synced-custom-viz-plugin-items
   :synced-filter-clause (fn [alias _opts] [:not= (u/qualified-key alias :bundle_hash) nil])})
