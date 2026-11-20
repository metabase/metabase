(ns metabase.change-log.log
  "The writes to the change log (see `metabase.change-log.core`)."
  (:require
   [metabase.change-log.db :as change-log.db]
   [metabase.change-log.numbering :as change-log.numbering]
   [metabase.change-log.spec :as change-log.spec]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn table-of
  "The name of the table of `model`."
  [model]
  (name (t2/table-name model)))

(defn- throw-or-log
  "Reports a mistake in calling code by throwing in dev and test, so that a test catches it, and only by logging a
  warning in production, so that the write goes ahead."
  [message]
  (if config/is-prod?
    (log/warn message)
    (throw (ex-info message {}))))

(defn log!
  "Logs `changes`, a seq of `[table-name row-ids action]`, and wakes the numbering, sending a row key that is not an
  integer to [[throw-or-log]] and giving it no entry."
  [changes]
  (doseq [[table-name row-ids action] changes
          :let  [n (count (remove integer? row-ids))]
          :when (pos? n)]
    (throw-or-log (format "Not logging %d %s on %s to the change log: row key missing or not an integer. See %s."
                          n action table-name "metabase.change-log.core")))
  (run! change-log.db/insert-entries!
        (partition-all 1000 (for [[table-name row-ids action] changes
                                  id                          row-ids
                                  :when                       (integer? id)]
                              {:table_name table-name, :row_id id, :action action})))
  (when-not config/is-test?
    (change-log.numbering/stay-awake!)))

(mu/defn log-rows!
  "Logs `action` on the rows of `model` that match `conditions`, what `t2/select` takes after the model and usually the
  write's own, for a write that skips the model, called in the write's transaction before an update or a delete and
  after an insert, doing nothing while the log is off, sending a model that is not tracked to [[throw-or-log]] while it
  is on, and not logging what a delete cascades to."
  [model  :- :keyword
   action :- [:enum :insert :update :delete]
   & conditions :- [:* [:maybe [:fn {:description "what `t2/select` takes after the model"} some?]]]]
  (when (premium-features/enable-change-log?)
    (if (change-log.spec/tracked? model)
      (log! [[(table-of model) (change-log.db/matching-pks model (vec conditions)) (name action)]])
      (throw-or-log (format "Not logging %s on %s to the change log: the model has no `metabase.change-log.core/spec`."
                            (name action) model)))))
