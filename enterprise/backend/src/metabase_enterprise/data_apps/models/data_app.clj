(ns metabase-enterprise.data-apps.models.data-app
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/DataApp [_model] :data_app)

(defn- blob->bytes ^bytes [v]
  (cond
    (nil? v)           nil
    (instance? Blob v) (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    :else              v))

(def ^:private transform-bundle
  "Coerce JDBC `Blob` values into plain byte arrays on read."
  {:in  identity
   :out blob->bytes})

(t2/deftransforms :model/DataApp
  {:bundle        transform-bundle
   ;; JSON array of origins the sandboxed bundle may fetch/XHR (see config.clj).
   :allowed_hosts mi/transform-json
   :table_ids     mi/transform-json})

(doto :model/DataApp
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- default-last-synced-at
  "A sync that records `last_synced_sha` happened now unless it says otherwise."
  [row]
  (cond-> row
    (and (contains? row :last_synced_sha) (not (contains? row :last_synced_at)))
    (assoc :last_synced_at (mi/now))))

(t2/define-before-insert :model/DataApp
  [data-app]
  (default-last-synced-at data-app))

(t2/define-before-update :model/DataApp
  [data-app]
  (let [changes (t2/changes data-app)]
    (cond-> data-app
      (and (contains? changes :last_synced_sha) (not (contains? changes :last_synced_at)))
      (assoc :last_synced_at (mi/now)))))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))
    (contains? app :table_ids)     (update :table_ids #(or % []))))

;; Deliberately ungated: any signed-in user may view a data app, and the `+auth`
;; endpoints mean reaching a read check already implies authentication. See the
;; README's permissions section for why this is safe.
(defmethod mi/can-read? :model/DataApp
  ([_instance]   true)
  ([_model _pk]  true))

(defmethod mi/can-write? :model/DataApp
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-create? :model/DataApp
  [_model _instance]
  api/*is-superuser?*)

(t2/define-before-delete :model/DataApp
  [app]
  (data-app.resources/delete-resources! app))

(methodical/defmethod mi/to-json :model/DataApp
  "Never include the raw bundle bytes in JSON."
  [data-app json-generator]
  (next-method (dissoc data-app :bundle) json-generator))

(defenterprise data-app-group-ids
  "The data-app permission groups (those flagged `is_data_app_group`). SSO group sync must never touch
   their membership."
  :feature :none
  []
  (data-apps.db/data-app-group-ids))
