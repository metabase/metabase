(ns metabase.change-log.models
  "The change log's hooks. A model that derives `:hook/change-log` logs each insert, update and delete of its rows in
  `change_log`, in the write's transaction, while [[enabled?]]. A delete of any model also logs the rows of logged
  tables that the database changes through foreign keys ([[change-log.cascade/changes]]). `metabase.change-log.core`
  says what an entry means, how to read the log and how to log a model.

  The hooks rely on these Toucan internals:

  - `:around` on `transduce-query` running before before-update and before-delete;
  - the after-insert and after-update re-dispatch, with the same `parsed-args`;
  - before-update's `doing-before-update?` key.

  After a Toucan upgrade, run test/metabase/change_log on H2, Postgres and MySQL."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.db :as change-log.db]
   [metabase.change-log.settings :as change-log.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.before-update :as t2.before-update]
   [toucan2.types :as t2.types]))

(set! *warn-on-reflection* true)

;; Whether this process logged changes when it last checked, or nil before its first check.
(defonce ^:private logging? (atom nil))

(defn- set-active!
  "Records `active?`: now outside a transaction, and once the caller's transaction commits inside one. Never inside it:
  the caller may hold the `setting` rows a setting write updates, and a write on another connection would wait on it for
  ever. A transaction schedules at most one write per value, which runs in a future, as [[mdb/do-after-commit]] asks. A
  rollback drops the write: a lost `false` is written again at the next check that finds the change log off, and a lost
  `true` costs an extra marker at the next start."
  [active?]
  (if-let [state (mdb/transaction-state)]
    (let [[old] (swap-vals! state update ::active-writes (fnil conj #{}) active?)]
      (when-not (contains? (::active-writes old) active?)
        (mdb/do-after-commit #(future (change-log.settings/change-log-active! active?)))))
    (change-log.settings/change-log-active! active?)))

(defn enabled?
  "Whether Metabase logs its changes now: `change-log-enabled` is on, and Metabase is hosted or its licence has
  `:audit-app`. A check can also write a start marker, on its own connection, and record the state in
  `change-log-active`, after the commit when it runs in a transaction ([[set-active!]]):

  | this process's last check | now | `change-log-active` | the check                          |
  |---------------------------|-----|---------------------|------------------------------------|
  | none                      | on  | true                | does nothing                       |
  | none                      | on  | false               | writes a marker, then records true |
  | off                       | on  | any                 | writes a marker, then records true |
  | on                        | on  | any                 | does nothing                       |
  | any                       | off | true                | records false                      |
  | any                       | off | false               | does nothing                       |

  Nodes share `change-log-active` and may race on it, so each case errs toward an extra marker. A crash between the
  marker and `true` costs a second marker, not a missing one. A node that finds the change log off records `false`, also
  over another node's `true`, so its unlogged writes get a marker when the next process starts. Each node checks through
  its own settings cache, which looks for changes at most once a minute. After a turn-on, each node that found the
  change log off writes its own marker at its first check after its cache shows the turn-on. A node that stops before
  then leaves its unlogged writes unmarked."
  []
  ;; TODO (Filipe 2026-10-29) -- the audit log's licence check stands in until the change log has a feature of its own.
  (let [on?     (boolean (and (change-log.settings/change-log-enabled) (premium-features/log-enabled?)))
        active? (change-log.settings/change-log-active)
        was-on? (if (nil? @logging?) active? @logging?)]
    (cond
      (and on? (not was-on?))   (do (change-log.db/log-start!)
                                    (set-active! true))
      (and (not on?) active?)   (set-active! false))
    (reset! logging? on?)
    on?))

(defn turn-on!
  "Turns the change log on, unless `MB_CHANGE_LOG_ENABLED` sets it, and returns whether Metabase logs its changes now
  ([[enabled?]]). A reader of the log calls it at each run. It writes `change-log-enabled` only while the setting is
  off, because each setting write makes every node reload its settings. Never turn the change log off: other readers may
  follow it. Only `MB_CHANGE_LOG_ENABLED=false` turns it off."
  []
  (when-not (or (change-log.settings/change-log-enabled)
                (= :env (setting/get-raw-value-source :change-log-enabled)))
    (change-log.settings/change-log-enabled! true))
  (enabled?))

(defn log-rows!
  "Logs `action` (`insert`, `update` or `delete`) on the rows of `table-name` whose keys `(row-ids-fn)` returns, for a
  write that bypasses the models. Call it in the write's transaction: before an update or a delete, while the rows still
  match the write's WHERE, and after an insert, once the keys exist. It calls `row-ids-fn` only while the change log is
  on, so the write runs no extra query while it is off. It does not log what a delete cascades to."
  [table-name action row-ids-fn]
  (when (enabled?)
    (when-let [ids (seq (row-ids-fn))]
      (change-log.db/log-rows! (name table-name) ids action))))

(defn- identity-set
  "A set, safe to share between threads, that compares its members by identity."
  ^java.util.Set []
  (java.util.Collections/synchronizedSet (java.util.Collections/newSetFromMap (java.util.IdentityHashMap.))))

(def ^:private ^java.util.Set writing
  "The `parsed-args` of the inserts and updates whose rows are being logged, by identity. Toucan's after-insert and
  after-update run the call again as one returning instances, with the same `parsed-args`, and that run passes through."
  (identity-set))

(defn- with-member!
  "Runs `thunk` while `x` is in the identity set `s`."
  [^java.util.Set s x thunk]
  (.add s x)
  (try
    (thunk)
    (finally
      (.remove s x))))

(defn- table [model]
  (name (t2/table-name model)))

(defn- pk-of [model]
  (let [pk (first (t2/primary-keys model))]
    #(if (map? %) (get % pk) %)))

(defn- insert!
  "Runs the INSERT and logs the keys it returns. An INSERT that returns an update count runs as one that returns keys,
  which costs no other query."
  [next-method rf query-type model parsed-args resolved-query]
  (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
    (with-member! writing parsed-args
      (fn []
        (if (isa? query-type :toucan.result-type/update-count)
          (let [pks-type (t2.types/similar-query-type-returning query-type :toucan.result-type/pks)
                pks      (t2.pipeline/transduce-query conj pks-type model parsed-args resolved-query)]
            (change-log.db/log-rows! (table model) pks "insert")
            (rf (rf (rf) (count pks))))
          (let [pk  (pk-of model)
                ids (volatile! [])]
            (u/prog1 (next-method ((map (fn [row] (vswap! ids conj (pk row)) row)) rf)
                                  query-type model parsed-args resolved-query)
              (change-log.db/log-rows! (table model) @ids "insert"))))))))

(defn- delete!
  "Reads the rows the DELETE will remove, logs them when `logged?`, logs what the database cascades to, and runs it. It
  runs before the model's own before-delete, which can delete children first."
  [next-method rf query-type model parsed-args resolved-query logged?]
  (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
    (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances parsed-args resolved-query
                                             (cons (first (t2/primary-keys model))
                                                   (change-log.cascade/referenced-columns (table model))))]
      (when logged?
        (change-log.db/log-rows! (table model) (map (pk-of model) rows) "delete"))
      (doseq [[table-name row-ids action] (change-log.cascade/changes (table model) rows)]
        (change-log.db/log-rows! table-name row-ids action))
      (next-method rf query-type model parsed-args resolved-query))))

;; The hooks check [[enabled?]] before they run a query: while the change log is off, a model runs the queries it ran
;; before the change log existed. All three run before Toucan builds the query.

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/insert.* :hook/change-log :default]
  [rf query-type model parsed-args resolved-query]
  (if (and (enabled?) (not (.contains writing parsed-args)))
    (insert! next-method rf query-type model parsed-args resolved-query)
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* :hook/change-log :default]
  "Reads the keys of the rows the update matches, logs them, and runs it, in one transaction. A row it leaves as it was
  is logged too: a reader reads it again. It logs once per call. A model's after-update runs the call again, as one
  returning instances, and that run passes through. Its `parsed-args` are the ones before-update marks
  `doing-before-update?`, or the call's own on a model without a before-update."
  [rf query-type model parsed-args resolved-query]
  (if (and (seq (:changes parsed-args))
           (not (::t2.before-update/doing-before-update? parsed-args))
           (enabled?)
           (not (.contains writing parsed-args)))
    (t2/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
      (let [rows (change-log.db/rows-to-change model :toucan.query-type/select.instances.from-update parsed-args
                                               resolved-query (t2/primary-keys model))]
        (change-log.db/log-rows! (table model) (map (pk-of model) rows) "update")
        (with-member! writing parsed-args #(next-method rf query-type model parsed-args resolved-query))))
    (next-method rf query-type model parsed-args resolved-query)))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/delete.* :metabase/model :default]
  [rf query-type model parsed-args resolved-query]
  (let [logged? (isa? model :hook/change-log)]
    (if (and (enabled?) (or logged? (seq (change-log.cascade/referenced-columns (table model)))))
      (delete! next-method rf query-type model parsed-args resolved-query logged?)
      (next-method rf query-type model parsed-args resolved-query))))
