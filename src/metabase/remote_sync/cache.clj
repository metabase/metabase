(ns metabase.remote-sync.cache
  "The request cache of which rows are read-only, filled on the first check of a model for every row of that model the
  request loaded since."
  (:require
   [metabase.models.cache :as models.cache]
   [metabase.remote-sync.db :as remote-sync.db]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "An atom `{model {:checked #{pk} :read-only #{pk}}}` bound per request, or nil."
  nil)

(defn do-with-cache
  "Calls `thunk` with [[*cache*]] bound and the loaded rows remembered, keeping bindings already in place."
  [thunk]
  (binding [*cache* (or *cache* (atom {}))]
    (models.cache/do-with-loaded-rows thunk)))

(def ^:private max-batch-size
  "How many primary keys one query checks at most."
  1000)

(defn read-only-row?
  "Whether the row of `model` with primary key `pk` is read-only, checked in a request with the unchecked rows of
  `model` it loaded, which in dev must include `pk`."
  [model pk]
  (if-let [cache *cache*]
    (let [{:keys [checked read-only]} (get @cache model)]
      (models.cache/check-loaded! model pk)
      (if (contains? checked pk)
        (contains? read-only pk)
        (let [pks   (into #{pk} (remove #(contains? checked %)) (models.cache/loaded-ids model))
              found (into #{} (mapcat #(remote-sync.db/read-only-pks-among model (vec %))) (partition-all max-batch-size pks))]
          (swap! cache update model #(-> %
                                         (update :checked (fnil into #{}) pks)
                                         (update :read-only (fnil into #{}) found)))
          (contains? found pk))))
    (contains? (remote-sync.db/read-only-pks-among model [pk]) pk)))
