(ns metabase.models.foreign-key
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.util :as util]))

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
  (table :metabase_foreignkey))


(defmethod post-select ForeignKey [_ {:keys [origin_id destination_id] :as fk}]
  (util/assoc* fk
    :origin         (delay (sel :one 'metabase.models.field/Field :id origin_id))
    :destination    (delay (sel :one 'metabase.models.field/Field :id destination_id))))


(defmethod pre-insert ForeignKey [_ {:keys [relationship] :as fk}]
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)}]
    (merge defaults fk
           {:relationship (name relationship)})))

(defmethod pre-update ForeignKey [_ {:keys [relationship] :as fk}]
  (cond-> (assoc fk :updated_at (util/new-sql-timestamp))
    relationship (assoc :relationship (name relationship))))
