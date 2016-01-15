(ns metabase.models.foreign-key
  (:require [metabase.db :refer [sel]]
            [metabase.models.interface :as i]))

(def ^:const relationships
  "Valid values for `ForeginKey.relationship`."
  #{:1t1
    :Mt1
    :MtM})

(i/defentity ForeignKey :metabase_foreignkey)

(defn- post-select [{:keys [origin_id destination_id] :as fk}]
  (assoc fk
         :origin      (delay (sel :one 'Field :id origin_id))
         :destination (delay (sel :one 'Field :id destination_id))))

(extend (class ForeignKey)
  i/IEntity
  (merge i/IEntityDefaults
         {:types        (constantly {:relationship :keyword})
          :timestamped? (constantly true)
          :post-select  post-select}))
