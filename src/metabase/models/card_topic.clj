(ns metabase.models.card-topic
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CardTopic :card_topic)

(u/strict-extend (class CardTopic)
  i/IEntity
  (merge i/IEntityDefaults
         {:can-read?  (constantly true)
          :can-write? (constantly true)}))
