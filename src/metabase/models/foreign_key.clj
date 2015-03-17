(ns metabase.models.foreign-key
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.util :as util]))

(defentity ForeignKey
  (table :metabase_foreignkey))


(defmethod post-select ForeignKey [_ {:keys [origin_id destination_id] :as fk}]
  (util/assoc* fk
    :origin         (delay (sel :one 'metabase.models.field/Field :id origin_id))
    :destination    (delay (sel :one 'metabase.models.field/Field :id destination_id))))


(defmethod pre-insert ForeignKey [_ fk]
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)}]
    (merge defaults fk)))
