(ns metabase.models.card-cache
  (:require
    (metabase [db :as db])
    [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CardCache :report_card_cache)

(u/strict-extend (class CardCache)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped?       (constantly true)
          :types              (constantly {:result :json})
          :can-read?          (constantly true)
          :can-write?         (constantly true)}))
