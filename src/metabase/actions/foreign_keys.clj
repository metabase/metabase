(ns metabase.actions.foreign-keys
  (:import
   (clojure.lang PersistentQueue)))

(defn- pop-queue
  [{:keys [queue] :as state}]
  (if-let [nxt (peek queue)]
    [nxt (update state :queue pop)]
    [nil state]))

(defn- queue-items
  [state item-type items]
  (if-not (seq items)
    state
    (let [existing-items (set (for [[t its] (:results state)
                                    :when (= t item-type)
                                    item its]
                                item))
          new-items      (remove existing-items items)]
      (if (seq new-items)
        (-> state
            (update :queue conj [item-type new-items])
            (update :results #(cons [item-type new-items] %)))
        state))))

(defn- step
  [metadata-fn children-fn state]
  (let [[[parent-type items] state'] (pop-queue state)]
    (if-not parent-type
      state'
      (let [type-metadata (metadata-fn parent-type)
            child-keys    (for [relationship type-metadata]
                            (children-fn relationship items))]
        (reduce (fn [state [item-type items]]
                  (queue-items state item-type items))
                state'
                child-keys)))))

(defn- items->count-by-type
  [items]
  (reduce
   (fn [acc [item-type items]]
     (update acc item-type (fnil + 0) (count items)))
   {}
   items))

(defn- state->results
  [{:keys [results queue]}]
  ;; This is not precise; we should check whether there is at least one child for what's in the queue.
  {:complete? (empty? queue)
   :items     results})

(defn- walk*
  [item-type items metadata-fn children-fn {:keys [max-queries]
                                            :or   {max-queries 100}}]
  (reduce
   (fn [state _]
     (step metadata-fn children-fn state))
   {:queue   (conj PersistentQueue/EMPTY [item-type items])
    :results (conj PersistentQueue/EMPTY [item-type items])}
   (range max-queries)))

(defn- walk
  "Given some starting items, return their descendants."
  [item-type items metadata-fn children-fn & {:as opts}]
  (-> (walk* item-type items metadata-fn children-fn opts)
      ;; last is the root rows
      (update :results drop-last)
      state->results))

(defn count-descendants
  "Given some starting items, count the number of descendants they have, according to their types."
  [item-type items metadata-fn children-fn & {:as opts}]
  (let [{:keys [complete? items]} (walk item-type items metadata-fn children-fn opts)]
    {:complete? complete?
     :counts    (items->count-by-type items)}))

(defn delete-recursively
  "Delete the given items, along with all their descendants."
  [item-type items metadata-fn children-fn delete-fn & {:as opts}]
  (let [{:keys [queue results]} (walk* item-type items metadata-fn children-fn opts)]
    (if (seq queue)
      (throw (ex-info "Cannot delete all descendants, as we could not enumerate them" {:queue queue}))
      (do (delete-fn results)
          (items->count-by-type (drop-last results))))))
