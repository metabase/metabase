(ns metabase.change-log.models
  "The change log's hooks. The delete hook dispatches on `:metabase/model`, because a delete of any model can change
  rows of logged tables.

  The hooks rely on these Toucan internals:

  - the `:around` on `transduce-query` runs before Toucan's before-update and before-delete;
  - Toucan's re-dispatches (after-insert, after-update, before-update's split) pass on the `parsed-args` they were
    given.

  After a Toucan upgrade, run test/metabase/change_log on H2, Postgres and MySQL."
  (:require
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.db :as change-log.db]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.types :as t2.types]))

(set! *warn-on-reflection* true)

(defn enabled?
  "Whether Metabase logs its changes: the license has the `:change-log` feature."
  []
  (premium-features/enable-change-log?))

(defn- table [model]
  (name (t2/table-name model)))

(mu/defn log-write!
  "Runs `write!`, a write to the table of `model` that bypasses the model, and logs `action` on the rows whose keys
  `(row-ids)` returns, in one transaction. It logs an update or a delete before the write, while the rows still match
  the write's WHERE, and an insert after it, once the keys exist. It calls `row-ids` only while [[enabled?]], so while
  the change log is off the write runs no extra query. It returns what `write!` returns. It does not log what a delete
  cascades to.

    (log-write! :model/PulseChannelRecipient :delete
                #(t2/select-pks-vec :model/PulseChannelRecipient :pulse_channel_id channel-id)
                #(t2/delete! :pulse_channel_recipient :pulse_channel_id channel-id))"
  [model   :- [:fn #(isa? (t2/resolve-model %) :hook/change-log)]
   action  :- [:enum :insert :update :delete]
   row-ids :- fn?
   write!  :- fn?]
  (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
    (let [log! #(when (enabled?)
                  (change-log.db/log-rows! (table model) (row-ids) (name action)))]
      (if (= :insert action)
        (u/prog1 (write!) (log!))
        (do (log!) (write!))))))

(defn- pk-of [model]
  (let [pk (first (t2/primary-keys model))]
    #(if (map? %) (get % pk) %)))

(defn- insert!
  "Runs the INSERT and logs the keys it returns. An INSERT that returns an update count runs as one that returns keys,
  which costs no other query."
  [next-method rf query-type model parsed-args resolved-query]
  (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
    (if (isa? query-type :toucan.result-type/update-count)
      (let [pks-type (t2.types/similar-query-type-returning query-type :toucan.result-type/pks)
            pks      (t2.pipeline/transduce-query conj pks-type model parsed-args resolved-query)]
        (change-log.db/log-rows! (table model) pks "insert")
        (rf (rf (rf) (count pks))))
      (let [pk  (pk-of model)
            ids (volatile! [])]
        (u/prog1 (next-method ((map (fn [row] (vswap! ids conj (pk row)) row)) rf)
                              query-type model parsed-args resolved-query)
          (change-log.db/log-rows! (table model) @ids "insert"))))))

(defn- delete!
  "Reads the rows the DELETE will remove, logs them when `logged?`, logs what the database cascades to, and runs it. It
  runs before the model's own before-delete, which can delete children first."
  [next-method rf query-type model parsed-args resolved-query logged? foreign-keys]
  (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
    (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances parsed-args resolved-query
                                             (cons (first (t2/primary-keys model))
                                                   (change-log.cascade/referenced-columns foreign-keys (table model))))]
      (change-log.db/log-changes! (concat (when logged? [[(table model) (map (pk-of model) rows) "delete"]])
                                          (change-log.cascade/changes foreign-keys (table model) rows)))
      (next-method rf query-type model parsed-args resolved-query))))

;; Toucan's own before-update and before-delete select the rows a write matches, and its after-insert selects the rows
;; it inserted, on every write, so the hooks are :around methods (call-count-test checks it). When the insert or the
;; update hook logs a call, it marks the call's `parsed-args` `::logged`. Toucan's re-dispatches carry the mark, and the
;; hooks pass them through.

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/insert.* :hook/change-log :default]
  [rf query-type model parsed-args resolved-query]
  (if (and (not (::logged parsed-args)) (enabled?))
    (insert! next-method rf query-type model (assoc parsed-args ::logged true) resolved-query)
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* :hook/change-log :default]
  "Reads the keys of the rows the update matches, logs them, and runs it, in one transaction. A row it leaves as it was
  is logged too: a reader reads it again. It logs once per call."
  [rf query-type model parsed-args resolved-query]
  (if (and (seq (:changes parsed-args))
           (not (::logged parsed-args))
           (enabled?))
    (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
      (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances.from-update parsed-args
                                               resolved-query (t2/primary-keys model))]
        (change-log.db/log-rows! (table model) (map (pk-of model) rows) "update")
        (next-method rf query-type model (assoc parsed-args ::logged true) resolved-query)))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/delete.* :metabase/model :default]
  [rf query-type model parsed-args resolved-query]
  (let [logged?      (isa? model :hook/change-log)
        foreign-keys (when (enabled?) (change-log.cascade/foreign-keys))]
    (if (and foreign-keys (or logged? (seq (change-log.cascade/referenced-columns foreign-keys (table model)))))
      (delete! next-method rf query-type model parsed-args resolved-query logged? foreign-keys)
      (next-method rf query-type model parsed-args resolved-query))))
