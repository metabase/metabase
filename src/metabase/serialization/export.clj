(ns metabase.serialization.export
  "Export: the rows the caller selected as entities, a batch at a time, in one snapshot of the app DB."
  (:require
   [metabase.serialization.extract :as serialization.extract]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]
   [metabase.serialization.resolve :as resolve]
   [metabase.serialization.util :as serialization.util]
   [metabase.util.log :as log]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defn- log-failure
  "`entity`, or nil when it is the error of a failed export, logged when it is a reference with no target, which only
  skips its entity, or when `continue-on-error`, and thrown otherwise."
  [continue-on-error entity]
  (if (instance? Exception entity)
    (let [^Exception e entity]
      (when-not (or (resolve/target-not-found? e) continue-on-error)
        (throw e))
      (log/warnf "Skipping %s: %s" (ex-message e) (some-> e ex-cause ex-message)))
    entity))

(defn export
  "A reducible of `rows`, rows of `model` the caller selected, exported as entities a batch at a time from `store`, the
  app DB by default. A row whose reference has no target is left out and logged, and so is any other failing row when
  `continue-on-error`; any other failure throws."
  [model rows & {:keys [store continue-on-error] :or {store protocol.app-db/store}}]
  (eduction (comp (map t2.realize/realize)
                  (partition-all serialization.util/batch-size)
                  (mapcat #(serialization.extract/extract-batch model store (vec %)))
                  (keep #(log-failure continue-on-error %)))
            rows))

(defn export-batch
  "The `rows` of `model` exported as entities from `store`, the app DB by default, with their database ids resolved at
  once: a vector with, for each row, its entity or the error that failed it."
  ([model rows]
   (export-batch model protocol.app-db/store rows))
  ([model store rows]
   (serialization.extract/extract-batch model store (mapv t2.realize/realize rows))))

(defn do-with-export-transaction
  "Calls `thunk`, which should do the whole export, reducing what it exports, in one REPEATABLE READ transaction, so
  the export is a consistent snapshot of the app DB. See [[with-export-transaction]]."
  [thunk]
  (protocol/transact protocol.app-db/store {:isolation :repeatable-read} thunk))

(defmacro with-export-transaction
  "Runs `body`, which should do the whole export, reducing what it exports, in one REPEATABLE READ transaction, so the
  export is a consistent snapshot of the app DB."
  [& body]
  `(do-with-export-transaction (fn [] ~@body)))
