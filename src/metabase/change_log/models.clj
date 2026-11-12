(ns metabase.change-log.models
  "The hooks that write the change log (see `metabase.change-log.core`). They are `:around` methods on Toucan's
  `transduce-query`, like the `:hook/dependencies` one in `metabase.models.interface`. Toucan's own before-update,
  before-delete and after-insert hooks would select the rows on every write, also while the log is off.

  Toucan calls `transduce-query` again from inside a write (after-insert, after-update, and before-update's one UPDATE
  per row). The insert and update hooks add `::logged` to the `parsed-args` of a call they log and skip a call that
  has it. `metabase.change-log.models-test` fails if a Toucan upgrade changes this."
  (:require
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.db :as change-log.db]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.types :as t2.types]))

(set! *warn-on-reflection* true)

(defn- table [model]
  (name (t2/table-name model)))

(defn- log!
  "Logs `changes`, a seq of `[table-name row-ids action]`. A row key that is not an integer gets a warning instead of
  an entry, so that the write goes ahead."
  [changes]
  (doseq [[table-name row-ids action] changes
          :let  [n (count (remove integer? row-ids))]
          :when (pos? n)]
    (log/warnf "Not logging %d %s on %s to the change log: row key missing or not an integer. See %s."
               n action table-name "metabase.change-log.core"))
  (change-log.db/log-changes! (for [[table-name row-ids action] changes]
                                [table-name (filter integer? row-ids) action])))

(mu/defn log-rows!
  "Logs `action` on the rows of `model` that match `conditions`, for a write that skips the model. `conditions` are
  what `t2/select` takes after the model, usually the write's own. Call it in the write's transaction, before an
  update or a delete and after an insert:

    (t2/with-transaction [_conn]
      (change-log/log-rows! :model/PulseChannelRecipient :delete :pulse_channel_id channel-id)
      (t2/delete! :pulse_channel_recipient :pulse_channel_id channel-id))

  It does nothing while the log is off, and only warns if `model` is not logged. It does not log what a delete
  cascades to: those rows need their own call."
  [model  :- :keyword
   action :- [:enum :insert :update :delete]
   & conditions :- [:* [:schema {::mr/deliberately-open true, :description "what `t2/select` takes after the model"}
                        :any]]]
  (when (premium-features/enable-change-log?)
    (if (isa? (t2/resolve-model model) :hook/change-log)
      (log! [[(table model) (apply t2/select-pks-vec model conditions) (name action)]])
      (log/warnf "Not logging %s on %s to the change log: the model does not derive :hook/change-log."
                 (name action) model))))

(defn- pk-of [model]
  (let [pk (first (t2/primary-keys model))]
    #(if (map? %) (get % pk) %)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/insert.* :hook/change-log :default]
  "Logs the keys of the inserted rows. An INSERT that returns a count runs as one that returns keys, and the caller
  still gets the count."
  [rf query-type model parsed-args resolved-query]
  (if (and (not (::logged parsed-args)) (premium-features/enable-change-log?))
    (let [parsed-args (assoc parsed-args ::logged true)]
      (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
        (if (isa? query-type :toucan.result-type/update-count)
          (let [pks-type (t2.types/similar-query-type-returning query-type :toucan.result-type/pks)
                pks      (t2.pipeline/transduce-query conj pks-type model parsed-args resolved-query)]
            (log! [[(table model) pks "insert"]])
            (rf (rf (rf) (count pks))))
          (let [pk  (pk-of model)
                ids (volatile! [])]
            (u/prog1 (next-method ((map (fn [row] (vswap! ids conj (pk row)) row)) rf)
                                  query-type model parsed-args resolved-query)
              (log! [[(table model) @ids "insert"]]))))))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* :hook/change-log :default]
  "Logs the keys of the rows the UPDATE matches, changed or not."
  [rf query-type model parsed-args resolved-query]
  (if (and (seq (:changes parsed-args))
           (not (::logged parsed-args))
           (premium-features/enable-change-log?))
    (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
      (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances.from-update parsed-args
                                               resolved-query (t2/primary-keys model))]
        (log! [[(table model) (map (pk-of model) rows) "update"]])
        (next-method rf query-type model (assoc parsed-args ::logged true) resolved-query)))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/delete.* :metabase/model :default]
  "Logs the rows the DELETE removes, and the rows of logged tables that the database deletes or updates with them. It
  is on every model, because a delete of a model that is not logged can cascade to a logged table: removing a
  dashboard card deletes a subscription's `pulse_card`. While the log is off, it only checks the feature. It runs
  before the model's before-delete, while the child rows still exist."
  [rf query-type model parsed-args resolved-query]
  (let [logged?      (isa? model :hook/change-log)
        foreign-keys (when (premium-features/enable-change-log?) (change-log.cascade/foreign-keys))
        referenced   (when foreign-keys (change-log.cascade/referenced-columns foreign-keys (table model)))]
    (if (and foreign-keys (or logged? (seq referenced)))
      (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
        (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances parsed-args resolved-query
                                                 (cons (first (t2/primary-keys model)) referenced))]
          (log! (concat (when logged? [[(table model) (map (pk-of model) rows) "delete"]])
                        (change-log.cascade/changes foreign-keys (table model) rows)))
          (next-method rf query-type model parsed-args resolved-query)))
      (next-method rf query-type model parsed-args resolved-query))))
