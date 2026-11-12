(ns metabase.remote-sync.cache
  "The request cache of which rows are read-only, filled on the first check of a model for every row of it the request
  loaded since."
  (:require
   [metabase.remote-sync.db :as remote-sync.db]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "An atom `{model {:pending #{pk} :checked #{pk} :read-only #{pk}}}` bound per request, or nil."
  nil)

(defn do-with-cache
  "Calls `thunk` with [[*cache*]] bound, keeping a cache already in place."
  [thunk]
  (binding [*cache* (or *cache* (atom {}))]
    (thunk)))

(defn register-loaded!
  "Remembers the row of `model` with primary key `pk` as loaded in this request, unless it was checked already."
  [model pk]
  (when-let [cache (and pk *cache*)]
    (when-not (contains? (get-in @cache [model :checked]) pk)
      (swap! cache update-in [model :pending] (fnil conj #{}) pk))))

(defn read-only-row?
  "Whether the row of `model` with primary key `pk` is read-only, checked with the pending rows of `model` in a request."
  [model pk]
  (if-let [cache *cache*]
    (let [{:keys [pending checked read-only]} (get @cache model)]
      (if (contains? checked pk)
        (contains? read-only pk)
        (let [pks   (conj (or pending #{}) pk)
              found (into #{} (mapcat #(remote-sync.db/read-only-pks-among model (vec %))) (partition-all 1000 pks))]
          (swap! cache update model #(-> %
                                         (update :pending (fnil (fn [p] (reduce disj p pks)) #{}))
                                         (update :checked (fnil into #{}) pks)
                                         (update :read-only (fnil into #{}) found)))
          (contains? found pk))))
    (contains? (remote-sync.db/read-only-pks-among model [pk]) pk)))
