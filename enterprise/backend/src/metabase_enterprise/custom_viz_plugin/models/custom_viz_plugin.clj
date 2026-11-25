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
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
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
  (derive :hook/events)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :entity_id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some? api/*current-user-id*))))

;; A bundled plugin on a read-only instance comes from the repository, so it can only change there. Dev-only plugins
;; are never synced (see the remote-sync spec below), so existing ones stay writable, but `can-create?` refuses new
;; ones too: a read-only instance registers no plugins.
(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_write]
  [_model k plugin]
  (assoc plugin k (boolean (and api/*is-superuser?*
                                (or (not (remote-sync/read-only?))
                                    (nil? (if (contains? plugin :bundle_hash)
                                            (:bundle_hash plugin)
                                            (custom-viz-plugin.db/plugin-bundle-hash (:id plugin)))))))))

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

;; A pull deletes a plugin through the model, not the API, so the on-disk bundle cache is evicted here.
(t2/define-before-delete :model/CustomVizPlugin
  [plugin]
  (cache/purge-plugin-cache! plugin))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/CustomVizPlugin
  [_model]
  {:create :event/custom-viz-plugin-create
   :update :event/custom-viz-plugin-update
   :delete :event/custom-viz-plugin-delete})

(defmethod app-db-copy/spec :model/CustomVizPlugin [_model]
  {:skip? false})

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema            ::custom-viz-plugin.schema/external-custom-viz-plugin
   :copy              [:entity_id :identifier]
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
   :before-load       custom-viz-plugin.serialization/before-load
   :after-load        custom-viz-plugin.serialization/after-load})

(defmethod audit/spec :model/CustomVizPlugin [_model]
  {:track          [:identifier :display_name :status :enabled :bundle_hash]
   :track-redacted [:bundle :dev_bundle_url :error_message :icon :manifest :metabase_version]
   :skip           [:entity_id]})

(defmethod remote-sync/spec :model/CustomVizPlugin
  [_model]
  ;; a dev-only plugin has no stored bundle: it is this instance's alone, a push has nothing to write for it, and a
  ;; pull must not remove it
  {:name                 :identifier
   :synced-items         custom-viz-plugin.db/synced-custom-viz-plugin-items
   :synced-filter-clause (fn [alias _opts] [:not= (u/qualified-key alias :bundle_hash) nil])})
