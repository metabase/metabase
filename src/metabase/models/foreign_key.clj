(ns ^:deprecated metabase.models.foreign-key
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

;; This namespace is no longer used. We need to keep it around for the time being because some data migrations still refere

(i/defentity ^:deprecated ForeignKey :metabase_foreignkey)

(u/strict-extend (class ForeignKey)
  i/IEntity
  (merge i/IEntityDefaults
         {:types        (constantly {:relationship :keyword})
          :timestamped? (constantly true)
          :can-read?    (constantly true)
          :can-write?   i/superuser?}))
