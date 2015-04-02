(ns metabase.models.foreign-key
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]))

(def relationships
  "Valid values for `ForeginKey.relationship`."
  #{:1t1
    :Mt1
    :MtM})

(def relationship->name
  {:1t1 "One to One"
   :Mt1 "Many to One"
   :MtM "Many to Many"})

(defentity ForeignKey
  (table :metabase_foreignkey)
  timestamped
  (types {:relationship :keyword}))


(defmethod post-select ForeignKey [_ {:keys [origin_id destination_id] :as fk}]
  (assoc fk
         :origin      (delay (sel :one 'metabase.models.field/Field :id origin_id))
         :destination (delay (sel :one 'metabase.models.field/Field :id destination_id))))
