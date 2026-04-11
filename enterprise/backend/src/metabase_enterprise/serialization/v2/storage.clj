(ns metabase-enterprise.serialization.v2.storage
  (:require
   [metabase-enterprise.serialization.v2.protocols :as protocols]))

(set! *warn-on-reflection* true)

(defn store!
  "Consume the entity `stream` and store each entity via the given `backend`.
  Returns a report map with `:seen` and `:errors` vectors."
  [stream backend]
  (let [settings (atom [])
        report   (atom {:seen [] :errors []})]
    (doseq [entity stream]
      (cond
        (instance? Exception entity)
        (swap! report update :errors conj entity)

        (-> entity :serdes/meta last :model (= "Setting"))
        (swap! settings conj entity)

        :else
        (swap! report update :seen conj (protocols/store-entity! backend entity))))
    (when (seq @settings)
      (protocols/store-settings! backend @settings)
      (swap! report update :seen conj [{:model "Setting"}]))
    @report))
