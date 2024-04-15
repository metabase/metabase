(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *update-used-cards-async*
  "Whether to update used cards asynchronously.
  It's true by default and should only be changed for testing purposes"
  true)

(defn- update-used-cards!*
  [used-cards]
  (when (seq used-cards)
    (let [f (fn []
              (try
                (log/debugf "%d cards were used during query execution: %s" (count used-cards) (str/join ";" (map :name used-cards)))
                (t2/update! :model/Card :id [:in (map :id used-cards)] {:last_used_at :%now})
                (catch Throwable e
                  (log/error e "Error updating used cards"))))]
      (if *update-used-cards-async*
        (.submit clojure.lang.Agent/pooledExecutor ^Runnable f)
        (f)))))

(defn update-used-cards!
  "Update last_used_at of all cards that were used during a query execution.

  Including but not limited to cards used as:
  - the source card for other queries
  - definition for sandbox rules
  - card references in native query
  - dashcard on dashboard
  - alert/pulses"
  [qp]
  (fn [query rff]
    (letfn [(rff* [metadata]
              ;; doing this async so it doesn't block execution
              (update-used-cards!* (lib.metadata/cached-metadata (qp.store/metadata-provider) :metadata/card))
              (rff metadata))]
      (qp query rff*))))
