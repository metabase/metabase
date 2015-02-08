(ns metabase.api.card
  (:require [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.card :refer :all]
            [metabase.models.hydrate :refer [hydrate]]))

(defapi by-id [id]
  (or-404-> (sel :one Card :id (Integer/parseInt id))))
