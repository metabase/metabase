(ns metabase.jev.apps.intent.store
  "Per-user activity trail + derived aggregates for intent prediction.

  This is the DETERMINISTIC half of intent prediction: we record a compact event per user action
  (view, query-run, edit) and derive counts — recency, frequency, and transitions (what action tends to
  follow what). No judgment happens here; it is bookkeeping. The SELECTION half (which candidate matches
  the current intent) lives in [[metabase.jev.apps.intent]] and only calls Jev when the counts can't decide.

  The store is a protocol so the backing can swap: an in-memory atom now (fast to play with, lost on
  restart), a local sqlite file later (both drivers already ship on the classpath). Nothing else in the
  codebase depends on where the trail lives."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defprotocol IntentStore
  "Records a user's action trail and answers aggregate questions over it."
  (record! [store user-id event]
    "Append `event` (a map with at least `:action` and `:target`) to `user-id`'s trail, stamped `:at`.")
  (recent [store user-id n]
    "The `user-id`'s last `n` events, most recent first.")
  (transitions [store user-id from-target]
    "Map of {next-target count} — targets that have followed `from-target` in this user's trail. The
    deterministic candidate generator: what usually comes next after where they are now.")
  (frequencies-of [store user-id]
    "Map of {target count} over the whole trail — the person's habitual targets.")
  (observe-facts! [store user-id facts]
    "Increment the preference counters for a seq of `[facet value]` pairs (from
    [[metabase.jev.apps.intent.features/query-facts]]). This is the transfer-learning half: counts are kept
    per-facet so preferences at general levels (`:filter-type`, `:agg`) survive a table change.")
  (prefs [store user-id facet]
    "Map of {value count} for one `facet` (e.g. `:filter-type` → {:temporal 12 :number 3}). The person's
    learned preference at that level of abstraction."))

;;; ---------------------------------------------------------------------------------------------------
;;; In-memory atom implementation
;;; ---------------------------------------------------------------------------------------------------

(def ^:private max-trail
  "Cap per-user trail length so the atom can't grow without bound while we play."
  500)

(defn- append-event [trail event]
  (let [trail' (conj (or trail []) event)]
    (if (> (count trail') max-trail)
      (subvec trail' (- (count trail') max-trail))
      trail')))

(defn- transitions* [trail from-target]
  (->> (partition 2 1 trail)
       (keep (fn [[a b]] (when (= (:target a) from-target) (:target b))))
       frequencies))

(defrecord AtomStore [trails pref-counts now-fn]
  IntentStore
  (record! [_ user-id event]
    (let [stamped (assoc event :at (now-fn))]
      (swap! trails update user-id append-event stamped)
      stamped))
  (recent [_ user-id n]
    (->> (get @trails user-id []) reverse (take n) vec))
  (transitions [_ user-id from-target]
    (transitions* (get @trails user-id []) from-target))
  (frequencies-of [_ user-id]
    (frequencies (map :target (get @trails user-id []))))
  (observe-facts! [_ user-id facts]
    (swap! pref-counts update user-id
           (fn [user-prefs]
             (reduce (fn [acc [facet value]]
                       (update-in acc [facet value] (fnil inc 0)))
                     (or user-prefs {})
                     facts))))
  (prefs [_ user-id facet]
    (get-in @pref-counts [user-id facet] {})))

(defn atom-store
  "An in-memory [[IntentStore]]. `now-fn` defaults to millis-since-epoch (injectable for tests)."
  ([] (atom-store #(System/currentTimeMillis)))
  ([now-fn] (->AtomStore (atom {}) (atom {}) now-fn)))

;;; The process-wide store we tap the event bus into. Swap `deref`'d value for a sqlite-backed store
;;; later without touching callers.
(defonce ^{:doc "The active intent store for this process."} the-store
  (atom (atom-store)))

(defn current [] @the-store)

(defn target-key
  "Canonical target id for an entity, e.g. \"card:42\" or \"table:211\". Keeps the trail model-agnostic."
  [model id]
  (str (u/lower-case-en (name model)) ":" id))
