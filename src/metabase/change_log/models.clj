(ns metabase.change-log.models
  "The change log's hooks, which log the writes of logged models (see `metabase.change-log.core`). They are `:around`
  methods on `transduce-query`, because Toucan's own before-update, before-delete and after-insert select rows on every
  write, also while the change log is off.

  The hooks rely on these Toucan internals:

  - the `:around` runs before Toucan's before-update and before-delete;
  - Toucan's re-dispatches (after-insert, after-update, before-update's split) pass on the `parsed-args` they were
    given. The insert and the update hook add `::logged` to the `parsed-args` of a call they log, and pass a call that
    has it through, so each call is logged once.

  `metabase.change-log.models-test` pins both, and its `call-count-test` pins the queries each write runs."
  (:require
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.db :as change-log.db]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.types :as t2.types]))

(set! *warn-on-reflection* true)

(defn- table [model]
  (name (t2/table-name model)))

(mu/defn log-rows!
  "Logs `action` on the rows of the logged `model` that `conditions` match, for a write that bypasses the model.
  `conditions` are what `t2/select` takes after the model, usually the write's own. Call it in the write's
  transaction: before an update or a delete, while the rows still match, and after an insert, once they exist. While
  the change log is off, it does nothing, and runs no query. It does not log what a delete cascades to: log those rows
  with their own call.

    (t2/with-transaction [_conn]
      (change-log/log-rows! :model/PulseChannelRecipient :delete :pulse_channel_id channel-id)
      (t2/delete! :pulse_channel_recipient :pulse_channel_id channel-id))"
  [model  :- :keyword
   action :- [:enum :insert :update :delete]
   & conditions :- [:* [:schema {::mr/deliberately-open true, :description "what `t2/select` takes after the model"}
                        :any]]]
  (when (premium-features/enable-change-log?)
    (when-not (isa? (t2/resolve-model model) :hook/change-log)
      (throw (ex-info (str model " is not logged") {:model model})))
    (change-log.db/log-changes! [[(table model) (apply t2/select-pks-vec model conditions) (name action)]])))

(defn- pk-of [model]
  (let [pk (first (t2/primary-keys model))]
    #(if (map? %) (get % pk) %)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/insert.* :hook/change-log :default]
  "Runs the INSERT and logs the keys it returns, in one transaction. An INSERT that returns an update count runs as one
  that returns keys, which costs no other query."
  [rf query-type model parsed-args resolved-query]
  (if (and (not (::logged parsed-args)) (premium-features/enable-change-log?))
    (let [parsed-args (assoc parsed-args ::logged true)]
      (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
        (if (isa? query-type :toucan.result-type/update-count)
          (let [pks-type (t2.types/similar-query-type-returning query-type :toucan.result-type/pks)
                pks      (t2.pipeline/transduce-query conj pks-type model parsed-args resolved-query)]
            (change-log.db/log-changes! [[(table model) pks "insert"]])
            (rf (rf (rf) (count pks))))
          (let [pk  (pk-of model)
                ids (volatile! [])]
            (u/prog1 (next-method ((map (fn [row] (vswap! ids conj (pk row)) row)) rf)
                                  query-type model parsed-args resolved-query)
              (change-log.db/log-changes! [[(table model) @ids "insert"]]))))))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* :hook/change-log :default]
  "Reads the keys of the rows the UPDATE matches, logs them, and runs it, in one transaction. A row it leaves as it was
  is logged too, which is harmless: a reader reads the row again."
  [rf query-type model parsed-args resolved-query]
  (if (and (seq (:changes parsed-args))
           (not (::logged parsed-args))
           (premium-features/enable-change-log?))
    (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
      (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances.from-update parsed-args
                                               resolved-query (t2/primary-keys model))]
        (change-log.db/log-changes! [[(table model) (map (pk-of model) rows) "update"]])
        (next-method rf query-type model (assoc parsed-args ::logged true) resolved-query)))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/delete.* :metabase/model :default]
  "Reads the rows the DELETE will remove, logs them if the model is logged, logs what the database cascades to, and
  runs it, in one transaction. It dispatches on `:metabase/model`, because a delete of any model can cascade to logged
  tables. While the change log is off, it only checks the feature. It runs before the model's own before-delete, which
  can delete children first."
  [rf query-type model parsed-args resolved-query]
  (let [logged?      (isa? model :hook/change-log)
        foreign-keys (when (premium-features/enable-change-log?) (change-log.cascade/foreign-keys))
        referenced   (when foreign-keys (change-log.cascade/referenced-columns foreign-keys (table model)))]
    (if (and foreign-keys (or logged? (seq referenced)))
      (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
        (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances parsed-args resolved-query
                                                 (cons (first (t2/primary-keys model)) referenced))]
          (change-log.db/log-changes! (concat (when logged? [[(table model) (map (pk-of model) rows) "delete"]])
                                              (change-log.cascade/changes foreign-keys (table model) rows)))
          (next-method rf query-type model parsed-args resolved-query)))
      (next-method rf query-type model parsed-args resolved-query))))
