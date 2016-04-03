(ns metabase.models.raw-column
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))


(i/defentity RawColumn :raw_column)

(defn- pre-insert [table]
  (let [defaults {:active  true
                  :is_pk   false
                  :details {}}]
    (merge defaults table)))


(u/strict-extend (class RawColumn)
  i/IEntity (merge i/IEntityDefaults
                   {:hydration-keys     (constantly [:columns])
                    :types              (constantly {:base_type :keyword, :details :json})
                    :timestamped?       (constantly true)
                    :pre-insert         pre-insert}))
