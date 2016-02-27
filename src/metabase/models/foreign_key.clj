(ns metabase.models.foreign-key
  (:require [metabase.models.interface :as i]))

(def ^:const relationships
  "Valid values for `ForeginKey.relationship`."
  #{:1t1 :Mt1 :MtM})

(i/defentity ForeignKey :metabase_foreignkey)

(extend (class ForeignKey)
  i/IEntity
  (merge i/IEntityDefaults
         {:types        (constantly {:relationship :keyword})
          :timestamped? (constantly true)
          :can-read?    (constantly true)
          :can-write?   i/superuser?}))
