(ns metabase.models.foreign-key
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :refer :all]
            [metabase.models.interface :refer :all]))

(def ^:const relationships
  "Valid values for `ForeginKey.relationship`."
  #{:1t1
    :Mt1
    :MtM})

(defentity ForeignKey
  [(table :metabase_foreignkey)
   (types :relationship :keyword)
   timestamped]

  (post-select [_ {:keys [origin_id destination_id] :as fk}]
    (assoc fk
           :origin      (delay (sel :one 'metabase.models.field/Field :id origin_id))
           :destination (delay (sel :one 'metabase.models.field/Field :id destination_id)))))

(extend-ICanReadWrite ForeignKeyEntity :read :always, :write :superuser)
