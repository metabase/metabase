(ns metabase-enterprise.data-apps.models.data-app
  (:require
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
  "The data-app permission groups (the `permission_group_id` of every data app). SSO group sync must
   never touch their membership, and newly-synced tables default to `:blocked` for them."
  :feature :none
  []
  (into #{} (t2/select-fn-set :permission_group_id :model/DataApp :permission_group_id [:not= nil])))
