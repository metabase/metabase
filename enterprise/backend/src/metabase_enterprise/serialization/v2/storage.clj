(ns metabase-enterprise.serialization.v2.storage
  (:require
   [metabase-enterprise.serialization.v2.protocols :as protocols]))

(set! *warn-on-reflection* true)

(defn store!
  "Consume the entity `stream` and store each entity via the given `backend`.
  `backend-or-dir` can be a StorageBackend instance or a path (for backward compatibility
  with tests and CLI — creates a files backend automatically).
  Returns a report map with `:seen` and `:errors` vectors."
  [stream backend-or-dir]
  (let [backend  (if (satisfies? protocols/StorageBackend backend-or-dir)
                   backend-or-dir
                   ;; backward compat: treat as directory path, create files backend
                   (do (require 'metabase-enterprise.serialization.v2.storage.files)
                       ((resolve 'metabase-enterprise.serialization.v2.storage.files/make-backend)
                        backend-or-dir)))
        settings (atom [])
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
