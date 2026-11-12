(ns metabase.eid-translation.settings
  (:require
   [metabase.eid-translation.impl :as eid-translation]
   [metabase.settings.core :refer [defsetting]]))

(defsetting entity-id-translation-counter
  "A counter for tracking the number of entity_id -> id translations. Whenever we call [[model->entity-ids->ids]], we increment this counter by the number of translations."
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :type       :json
  :default    eid-translation/default-counter
  :doc        false)
