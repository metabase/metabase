(ns metabase.models.card
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer [realize-json]]))

(defentity Card
  (table :report_card))

(defmethod post-select Card [_ card]
  (-> card
      (realize-json :dataset_query :visualization_settings)))
