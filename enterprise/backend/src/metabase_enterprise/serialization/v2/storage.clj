(ns metabase-enterprise.serialization.v2.storage
  (:require
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn store!
  "Consume the entity `stream` and store each entity via the given `writer`.
  Returns a report map with `:entity-counts`, a map of model name to the count of stored
  entities, and an `:errors` vector.

  Uses `run!` to make elements reach the writer as they are produced and
  not materialize the entire upstream before the loop body."
  [stream writer]
  (let [settings (atom [])
        report   (atom {:entity-counts {} :errors []})]
    (run! (fn [entity]
            (cond
              (instance? Exception entity)
              (swap! report update :errors conj entity)

              (-> entity :serdes/meta last :model (= "Setting"))
              (swap! settings conj entity)

              :else
              (let [path (protocols/store-entity! writer entity)]
                (swap! report update-in [:entity-counts (-> path last :model)] u/safe-inc))))
          stream)
    (when (seq @settings)
      (protocols/store-settings! writer @settings)
      (swap! report update-in [:entity-counts "Setting"] u/safe-inc))
    @report))
