(ns metabase.models.newmetric
  (:require [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel Newmetric :newmetric)

(u/strict-extend (class Newmetric)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:measure    :json
                                   :dimensions :json})
          ;; todo: pre-insert/pre-update with verifications: should
          ;; check that metrics/dimensions seem to be in the metadata
          ;; of the source card_id

          ;; todo: serialization
          :properties (constantly {:timestamped? true})})

  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
