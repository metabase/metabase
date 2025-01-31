(ns metabase.eid-translation.count
  (:require
   [metabase.eid-translation.stuff]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]))

(defsetting entity-id-translation-counter
  (deferred-tru "A counter for tracking the number of entity_id -> id translations. Whenever we call [[model->entity-ids->ids]], we increment this counter by the number of translations.")
  :encryption :no
  :visibility :internal
  :export?    false
  :audit      :never
  :type       :json
  :default    metabase.eid-translation.stuff/default-counter
  :doc        false)

(mu/defn update-translation-count!
  "Update the entity-id translation counter with the results of a batch of entity-id translations."
  [results :- [:sequential metabase.eid-translation.stuff/Status]]
  (let [processed-result (frequencies results)]
    (entity-id-translation-counter!
     (merge-with + processed-result (entity-id-translation-counter)))))

(mu/defn get-translation-count
  :- [:map [:ok :int] [:not-found :int] [:invalid-format :int] [:total :int]]
  "Get and clear the entity-id translation counter. This is meant to be called during the daily stats collection process."
  []
  (let [counter (setting/get-value-of-type :json :entity-id-translation-counter)]
    (merge counter {:total (apply + (vals counter))})))

(mu/defn clear-translation-count!
  "We want to reset the eid translation count on every stat ping, so we do it here."
  []
  (u/prog1 metabase.eid-translation.stuff/default-counter
    (setting/set-value-of-type! :json :entity-id-translation-counter <>)))
