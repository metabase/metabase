(ns metabase-enterprise.transform-optimizer.proposal-cache
  "Short-lived in-memory store of proposals emitted by the optimizer
  streaming endpoint, keyed by `(user-id, transform-id, proposal-id)`.

  Lets `/verify` and `/accept` accept just the proposal id from the FE
  (matching the wire shape we documented in SUMMARY.md) without
  requiring the user to re-send the full proposal payload. The proper
  persistent home is `:model/TransformOptimizerProposal` (BE-6); this
  module is a stand-in until that lands so the API contract doesn't
  change when persistence is added.

  Properties:
    - User-isolated: a proposal cached for user A can't be retrieved
      by user B.
    - TTL: entries expire after `ttl-ms` (default 1 hour) so a stale
      proposal can't be accepted after the underlying transform / data
      have moved on.
    - Process-local: a Metabase restart drops the cache. The FE should
      handle `404 proposal_not_found` by re-running `/optimize`."
  (:require
   [clojure.string :as str]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private ttl-ms
  "Cache TTL: how long after `put-all!` a proposal is retrievable. One
  hour balances 'user has time to read & verify before clicking accept'
  against 'don't accept stale advice'."
  (* 60 60 1000))

(def ^:private store
  "{[user-id transform-id proposal-id] {:proposal {…} :stored-at <epoch-ms>}}"
  (atom {}))

(defn- expired? [^long stored-at ^long now]
  (> (- now stored-at) ^long ttl-ms))

(defn evict-expired!
  "Drop entries older than `ttl-ms`. Cheap and idempotent. Called
  opportunistically on each `put-all!` so we don't need a separate
  scheduled job."
  []
  (let [now (System/currentTimeMillis)]
    (swap! store (fn [s]
                   (into {} (remove (fn [[_ {:keys [stored-at]}]]
                                      (expired? stored-at now)))
                         s)))))

(defn put-all!
  "Cache every proposal in `proposals` under `(user-id, transform-id,
  proposal :id)`. Proposals with a nil or blank `:id` are skipped."
  [user-id transform-id proposals]
  (when (seq proposals)
    (evict-expired!)
    (let [now (System/currentTimeMillis)]
      (swap! store
             (fn [s]
               (reduce (fn [s {pid :id :as p}]
                         (if (and pid (not (str/blank? (str pid))))
                           (assoc s [user-id transform-id pid]
                                  {:proposal p :stored-at now})
                           s))
                       s
                       proposals))))
    (log/debugf "transform-optimizer proposal cache: stored %d proposals (user=%s transform=%s)"
                (count proposals) user-id transform-id)))

(defn get-one
  "Return the cached proposal, or `nil` if missing or expired."
  [user-id transform-id proposal-id]
  (let [{:keys [proposal stored-at]} (get @store [user-id transform-id proposal-id])]
    (when (and proposal
               (not (expired? stored-at (System/currentTimeMillis))))
      proposal)))

(defn get-many
  "Return `[proposals missing-ids]` for the requested ids. `proposals`
  preserves input order; `missing-ids` is the subset that wasn't found
  in the cache. Either may be empty."
  [user-id transform-id proposal-ids]
  (reduce (fn [[ps missing] pid]
            (if-let [p (get-one user-id transform-id pid)]
              [(conj ps p) missing]
              [ps (conj missing pid)]))
          [[] []]
          proposal-ids))

;; -- test hook ---------------------------------------------------------------

(defn clear-all!
  "Reset the cache. Test-only — used by `proposal-cache-test`."
  {:test-only? true}
  []
  (reset! store {}))
