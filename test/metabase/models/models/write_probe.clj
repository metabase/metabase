(ns metabase.models.models.write-probe
  "A model over the `setting` table whose hooks record when they run, for the tests of the write transaction."
  (:require
   [metabase.app-db.core :as mdb]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name ::probe [_model] :setting)

(methodical/defmethod t2/primary-keys ::probe [_model] [:key])

(derive ::probe :metabase/model)

(def log
  "What the hooks of the probe recorded, in order."
  (atom []))

(t2/define-before-update ::probe
  [row]
  (swap! log conj [:before-update (:key row) (some? (mdb/transaction-state))])
  (mdb/do-after-commit #(swap! log conj [:after-commit (:key row)]))
  (when (= "probe-refused" (:key row))
    (throw (ex-info "Refused" {:status-code 400})))
  row)

(t2/define-after-update ::probe
  [row]
  (swap! log conj [:after-update (:key row)])
  row)
