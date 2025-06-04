(ns metabase.actions.foreign-keys
  (:require
   [clojure.set :as set]
   [metabase.util :as u])
  (:import
   (clojure.lang PersistentQueue)))

#_(defn lookup-children-in-db [{:keys [table fk pk]} parents]
    (jdbc/query
     'db
     {:select pk
      :from   [table]
      :where  (if (= 1 (count fk))
                [:in (key (first fk)) (map (val (first fk)) parents)]
                (into [:or] (for [p parents]
                              (into [:and] (for [[fk-col pk-col] fk]
                                             [:= fk-col (get p pk-col)])))))
      :limit  501}))

(defn- pop-queue
  [{:keys [queue] :as state}]
  (if-let [nxt (peek queue)]
    [nxt (update state :queue pop)]
    [nil state]))

(defn- queue-items
  [state item-type items]
  (if-not (seq items)
    state
    (let [new-items (remove (set (get-in state [:results item-type])) items)]
      (-> state
          (update :queue conj [item-type new-items])
          (update-in [:results item-type] (fnil into #{}) new-items)))))

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
   {:queue  (conj PersistentQueue/EMPTY [item-type items])
    :results {item-type (set items)}}
   (range max-queries)))

(defn walk
  "Given some starting items, return their descendants."
  [item-type items metadata-fn children-fn & {:as opts}]
  (-> (walk* item-type items metadata-fn children-fn opts)
      (update :results (fn [results]
                         (u/remove-nils
                          (update results item-type (comp not-empty set/difference) items))))
      (state->results)))

(defn count-descendants
  "Given some starting items, count the number of descendants they have, according to their types."
  [item-type items metadata-fn children-fn & {:as opts}]
  (let [{:keys [complete? items]} (walk item-type items metadata-fn children-fn opts)]
    {:complete? complete?
     :counts    (update-vals items count)}))

(defn delete-recursively
  "Delete the given items, along with all their descendants."
  [item-type items metadata-fn children-fn delete-fn & {:as opts}]
  (let [{:keys [queue results]} (walk* item-type items metadata-fn children-fn opts)]
    (if (seq queue)
      (throw (ex-info "Cannot delete all descendants, as we could not enumerate them" {:queue queue}))
      (do (delete-fn results)
          (update-vals results count)))))
