(ns metabase.models.card-label
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CardLabel :card_label)

(u/strict-extend (class CardLabel)
  i/IEntity
  (merge i/IEntityDefaults
         {:can-read?  (constantly true)
          :can-write? (constantly true)}))
