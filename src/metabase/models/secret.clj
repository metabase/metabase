(ns metabase.models.secret
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.models :as models]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel Secret :secret)

(u/strict-extend (class Secret)
  models/IModel
  (merge models/IModelDefaults
         {;:hydration-keys (constantly [:database :db]) ; don't think there's any hydration going on since other models
                                                        ; won't have a direct secret-id column
          :types          (constantly {:value  :secret-value
                                       :kind   :keyword
                                       :source :keyword})
          :properties     (constantly {:timestamped? true})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         i/superuser?
          :can-write?        i/superuser?}))

;;; ---------------------------------------------- Hydration / Util Fns ----------------------------------------------
;; none yet

;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

(add-encoder SecretInstance (fn [secret json-generator]
                              (encode-map
                               (dissoc secret :value) ; never include the secret value in JSON
                               json-generator)))
