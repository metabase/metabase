(ns ^:deprecated metabase.models.card-label
  (:require [toucan.models :as models]
            [metabase.models.interface :as i]
            [metabase.util :as u]))

(models/defmodel ^:deprecated CardLabel :card_label)

(u/strict-extend (class CardLabel)
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  (constantly true)
          :can-write? (constantly true)}))
