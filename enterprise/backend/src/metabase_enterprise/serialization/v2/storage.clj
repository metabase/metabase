(ns metabase-enterprise.serialization.v2.storage
  (:require
   [metabase-enterprise.serialization.v2.protocols :as protocols]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn store!
  "Consume the entity `stream` and store each entity via the given `writer`.
  Returns a report map with `:entity-counts`, a map of model name to the count of stored
  entities, and an `:errors` vector.

  Uses `run!` to make elements reach the writer as they are produced, a batch at a time, without materializing the
  entire upstream."
  [stream writer]
  (let [settings (atom [])
        report   (atom {:entity-counts {} :errors []})
        namer    (storage.util/file-namer)]
    (run! (fn [batch]
            (let [{errors true entities false} (group-by #(instance? Exception %) batch)
                  {setting-entities true entities false}
                  (group-by #(= "Setting" (-> % :serdes/meta last :model)) entities)]
              (swap! report update :errors into errors)
              (swap! settings into setting-entities)
              (protocols/store-entities! writer (map vector (storage.util/resolve-storage-paths namer entities) entities))
              (doseq [entity entities]
                (swap! report update-in [:entity-counts (-> entity :serdes/meta last :model)] u/safe-inc))))
          (eduction (partition-all serialization/batch-size) stream))
    (when (seq @settings)
      (protocols/store-settings! writer @settings)
      (swap! report update-in [:entity-counts "Setting"] u/safe-inc))
    @report))
