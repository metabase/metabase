(ns metabase.transforms.execute
  (:require
   [metabase.indexes.models.table-index :as table-index]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.interface :as transforms.i]
   ;; loaded for its `transforms.i/execute!` defmethod registrations
   [metabase.transforms.query-impl]))

(set! *warn-on-reflection* true)

(defn- resolve-target
  "Hydrate the declared indexes and their request ids onto the target so the base reads them off
  `(:indexes target)` and `(:index-request-ids target)` at every table-creation seam, and stash
  `:full-incremental-run?` so that (DB-backed) decision is made once and stays stable for the whole run."
  [transform]
  (let [requests (table-index/select-applicable-for-transform (:id transform))]
    (-> transform
        (assoc-in [:target :indexes] (mapv :structured requests))
        (assoc-in [:target :index-request-ids] (into [] (keep :id) requests))
        (assoc :full-incremental-run? (transforms-base.u/full-incremental-run? transform)))))

(defn execute!
  "Run `transform` and sync its target table.

  Executes synchronously, but the start is observable: once the run row is booked in the database,
  `:on-start` is called with the transform run id and `:start-promise` (if any) is delivered
  `[:started run-id]`. A throw before that point delivers the throwable to the promise instead, so
  callers awaiting the start never hang."
  ([transform]
   (execute! transform nil))
  ([transform {:keys [start-promise on-start] :as opts}]
   (let [opts (merge opts
                     {:on-start (fn [run-id]
                                  (when start-promise
                                    (deliver start-promise [:started run-id]))
                                  (when on-start
                                    (on-start run-id)))})]
     (try
       (transforms.i/execute! (resolve-target transform) opts)
       (catch Throwable t
         ;; so a caller awaiting the start isn't left hanging on a pre-start failure;
         ;; a no-op when the run had already started and the promise was delivered
         (when start-promise (deliver start-promise t))
         (throw t))))))
