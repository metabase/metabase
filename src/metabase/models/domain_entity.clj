(ns metabase.models.domain-entity
  (:require [medley.core :as m]
            [metabase.models
             [field :refer [Field]]
             [interface :as i]
             [permissions :as perms]
             [table :refer [Table]]]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel DomainEntity :domain_entity)

(defn- serialize-dimensions
  [de]
  (update de :dimensions (partial m/map-vals u/get-id)))

(defn- deserialize-dimensions
  [de]
  (update de :dimensions (partial m/map-vals Field)))

(defn- perms-objects-set [{:keys [source-table]} _]
  (let [table (Table source-table)]
    #{(perms/object-path (:db_id table) (:schema table) (:id table))}))

(u/strict-extend (class DomainEntity)
  models/IModel
  (merge models/IModelDefaults
         {:hydration-keys (constantly [:domain-entity])
          :types          (constantly {:metrics             :json
                                       :segments            :json
                                       :breakout_dimensions :json
                                       :dimensions          :json
                                       :type                :keyword})
          :properties     (constantly {:timestamped? true})
          :pre-update     serialize-dimensions
          :pre-insert     serialize-dimensions
          :post-select    deserialize-dimensions})

  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?         (partial i/current-user-has-full-permissions? :read)
          :can-write?        i/superuser?
          :perms-objects-set perms-objects-set}))
