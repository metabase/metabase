(ns metabase.search.appdb.index-state
  "In-memory cache of the active/pending search index table names, synchronized from the database.

  State machine:
    :active  — the table currently serving search queries; must always exist in DB when non-nil
    :pending — a table being built during a reindex; nil when no reindex is in progress
    retired  — previous active tables, dropped after rotation; not tracked in memory

  The pending→active transition is performed under a cluster lock.
  Other nodes observe the new active table on their next [[current-state]] call after TTL
  expiry, or immediately via [[force-refresh!]].

  Two implementations:
    [[DbBackedStateStore]] — production; lazily syncs from DB at most once per TTL window
    [[MockStateStore]]     — tests; pure in-memory, no DB interaction"
  (:import (clojure.lang Atom)))

(set! *warn-on-reflection* true)

(defprotocol IndexStateStore
  (current-state [store]
    "Return {:active table-or-nil, :pending table-or-nil}.
     The result may be up to TTL seconds stale; at most one DB read per TTL window.")
  (force-refresh! [store]
    "Unconditionally re-read from the backing store and return the new state.")
  (set-state! [store new-state]
    "Overwrite the cached :active and :pending values. Call after DDL operations to avoid
     serving stale data. Resets the TTL so the next DB read is deferred by one full window.")
  (db-backed? [store]
    "True if this store reads from the database. False for in-memory mock stores used in tests.
     When false, operations that modify global DB state (e.g. cleanup of obsolete tables) are
     skipped so that tests remain isolated from production index state."))

(def ^:private ttl-ns
  "How long (in nanoseconds) a cached state may be used before re-reading from the DB."
  (* 5 60 1000000000))

(defrecord DbBackedStateStore
           [^Atom state-atom
            sync-fn]

  IndexStateStore

  (current-state [_]
    (let [{:keys [next-sync-at-ns] :as s} @state-atom
          now-ns (System/nanoTime)]
      ;; If the TTL has expired, try to claim the refresh slot via CAS.
      ;; Only the thread whose CAS succeeds performs the DB read; all others return the
      ;; (momentarily stale) cached value, which is an acceptable trade-off for a 5-minute TTL.
      (when (or (nil? next-sync-at-ns) (>= now-ns next-sync-at-ns))
        (when (compare-and-set! state-atom s (assoc s :next-sync-at-ns (+ now-ns ttl-ns)))
          (let [fresh (sync-fn)]
            (swap! state-atom #(assoc % :active (:active fresh) :pending (:pending fresh)
                                      :next-sync-at-ns (+ (System/nanoTime) ttl-ns)))))))
    (select-keys @state-atom [:active :pending]))

  (force-refresh! [_]
    (let [fresh (sync-fn)]
      (swap! state-atom assoc
             :active (:active fresh)
             :pending (:pending fresh)
             :next-sync-at-ns (+ (System/nanoTime) ttl-ns))
      (select-keys @state-atom [:active :pending])))

  (set-state! [_ new-state]
    (swap! state-atom assoc
           :active (:active new-state)
           :pending (:pending new-state)
           :next-sync-at-ns (+ (System/nanoTime) ttl-ns)))

  (db-backed? [_] true))

(defrecord MockStateStore
           [^Atom state-atom]

  IndexStateStore

  (current-state [_]
    @state-atom)

  (force-refresh! [_]
    ;; No backing store to read from — the atom IS the truth in test mode.
    @state-atom)

  (set-state! [_ new-state]
    (swap! state-atom assoc
           :active (:active new-state)
           :pending (:pending new-state)))

  (db-backed? [_] false))

(defn db-backed-store
  "Create a production state store backed by `sync-fn`.
   `sync-fn` is called with no arguments and must return a map with :active and/or :pending keys
   whose values are table-name keywords (or nil when absent)."
  [sync-fn]
  (->DbBackedStateStore (atom {:active nil :pending nil :next-sync-at-ns nil}) sync-fn))

(defn mock-store
  "Create an in-memory state store for use in tests.
   Optionally accepts an initial state map with :active and/or :pending keys."
  ([]
   (mock-store {}))
  ([initial]
   (->MockStateStore (atom {:active (:active initial) :pending (:pending initial)}))))
