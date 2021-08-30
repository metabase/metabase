(ns metabase.models.secret
  (:require [cheshire.generate :refer [add-encoder encode-map]]
            [metabase.models.interface :as i]
            [metabase.util :as u]
            [toucan.db :as db]
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

(def
  ^{:doc "The attributes of a secret which, if changed, will result in a version bump" :private true}
  bump-version-keys
  [:kind :source :value])

(defn latest-for-id
  "Returns the latest Secret instance for the given `id` (meaning the one with the highest `version`)."
  {:added "0.41.0"}
  [id]
  (db/select-one Secret :id id {:order-by [[:version :desc]]}))

(defn upsert-secret-value!
  "Inserts a new secret value, or updates an existing one, for the given parameters.
   * if there is no existing Secret instance, inserts with the given field values
   * if there is an existing latest Secret instance, and the value (or any of the supporting fields, like kind or
       source) has changed, then inserts a new version with the given parameters.
   * if there is an existing latest Secret instance, but none of the aforementioned fields changed, then update it"
  {:added "0.41.0"}
  [existing-id nm kind source value]
  (let [insert-new     (fn [id v]
                         (let [inserted (db/insert! Secret (cond-> {:version  v
                                                                    :name    nm
                                                                    :kind    kind
                                                                    :source  source
                                                                    :value   value}
                                                             id
                                                             (assoc :id id)))]
                           ;; Toucan doesn't support composite primary keys, so adding a new record with incremented
                           ;; version for an existing ID won't return a result from db/insert!, hence we may need to
                           ;; manually select it here
                           (or inserted (db/select-one Secret :id id :version v))))
        latest-version (when existing-id (latest-for-id existing-id))]
    (if latest-version
      (if (= (select-keys latest-version bump-version-keys) [kind source value])
        (db/update-where! Secret {:id existing-id :version (:version latest-version)}
                                 :name nm)
        (insert-new (u/the-id latest-version) (inc (:version latest-version))))
      (insert-new nil 1))))

;;; -------------------------------------------------- JSON Encoder --------------------------------------------------

(add-encoder SecretInstance (fn [secret json-generator]
                              (encode-map
                               (dissoc secret :value) ; never include the secret value in JSON
                               json-generator)))
