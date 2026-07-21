(ns metabase-enterprise.data-apps.models.data-app
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
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
   :allowed_hosts mi/transform-json})

(doto :model/DataApp
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; Reads always see `allowed_hosts` as a vector, never nil — a row synced before
;; the column existed has NULL until it's re-synced. Guard on `contains?` so
;; selects that don't fetch the column (e.g. `select-one-fn :bundle`) are left
;; untouched rather than gaining a spurious `:allowed_hosts` key.
(t2/define-after-select :model/DataApp
  [app]
  (cond-> app
    (contains? app :allowed_hosts) (update :allowed_hosts #(or % []))))

(def non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:id :name :display_name :bundle_path :enabled :allowed_hosts
   :bundle_hash :last_synced_sha :last_synced_at :sync_error
   :created_at :updated_at])

(defn select-one-non-blob
  "Like `t2/select-one` on `:model/DataApp`, but excludes the bundle blob."
  [& conditions]
  (apply t2/select-one (into [:model/DataApp] non-blob-columns) conditions))

(defn select-non-blob
  "Like `t2/select` on `:model/DataApp`, but excludes the bundle blob."
  [& conditions]
  (apply t2/select (into [:model/DataApp] non-blob-columns) conditions))

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

(methodical/defmethod mi/to-json :model/DataApp
  "Never include the raw bundle bytes in JSON."
  [data-app json-generator]
  (next-method (dissoc data-app :bundle) json-generator))
