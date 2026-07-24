(ns metabase-enterprise.database-isolation.models.database-isolation
  "`:model/DatabaseIsolation` — one provisioned isolation per warehouse database:
   the iso schema, the encrypted confined-principal credentials, and the
   provisioning state machine. Superuser-only; consumers hold an isolation id
   and go through `metabase-enterprise.database-isolation.core`, never the row."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DatabaseIsolation [_model] :database_isolation)

(doto :model/DatabaseIsolation
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/DatabaseIsolation
  {:database_details mi/transform-encrypted-json
   :read_namespaces  mi/transform-json
   :status           mi/transform-keyword
   :status_details   mi/transform-encrypted-text})

(defmethod mi/can-read? :model/DatabaseIsolation
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-write? :model/DatabaseIsolation
  ([_instance] api/*is-superuser?*)
  ([_model _pk] api/*is-superuser?*))

(defmethod mi/can-create? :model/DatabaseIsolation
  [_model _instance]
  api/*is-superuser?*)
