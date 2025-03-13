(ns metabase-enterprise.data-editing.foreign-keys
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [metabase.util :as u]))

(defn take-with-sentinel
  "Similar to the [[take]] transducer, but emits a final sentinel if there were remaining items."
  ([n sentinel]
   (fn [rf]
     (let [nv (volatile! n)]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result input]
          (let [n      @nv
                nn     (vswap! nv dec)
                result (if (pos? n)
                         (rf result input)
                         result)]
            (if (>= nn 0)
              result
              (ensure-reduced (rf result sentinel))))))))))

(defn pop-queue [{:keys [queue] :as state}]
  (if-let [nxt (first queue)]
    [nxt (update state :queue subvec 1)]
    [nil state]))

(defn lookup-children-in-db [{:keys [table fk pk]} parents]
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

(defn- queue-items [state item-type items]
  (if-not (seq items)
    state
    (let [new-items (remove (set (get-in state [:results item-type])) items)]
      (-> state
          (update :queue conj [item-type new-items])
          (update-in [:results item-type] (fnil into #{}) new-items)))))

(defn step [metadata children-fn state]
  (let [[[parent-type items] state'] (pop-queue state)]
    (if-not parent-type
      state'
      (let [type-metadata (get metadata parent-type)
            child-keys    (for [relationship type-metadata]
                            (children-fn relationship items))]
        (reduce (fn [state [item-type items]]
                  (queue-items state item-type items))
                state'
                child-keys)))))

(defn state->results [{:keys [results queue]}]
  ;; This is not precise; we should check whether there is at least one child for what's in the queue.
  {:complete? (empty? queue)
   :items     results})

(defn- walk* [item-type items metadata children-fn {:keys [max-queries]
                                                    :or   {max-queries 100}}]
  (reduce
   (fn [state _]
     (step metadata children-fn state))
   {:queue   [[item-type items]]
    :results {item-type (set items)}}
   (range max-queries)))

(defn walk [item-type items metadata children-fn & {:as opts}]
  (state->results (update (walk* item-type items metadata children-fn opts)
                          :results
                          (fn [results]
                            (u/remove-nils
                             (update results item-type (comp not-empty set/difference) items))))))

(defn count-descendants [item-type items metadata children-fn & {:as opts}]
  (let [{:keys [complete? items]} (walk item-type items metadata children-fn opts)]
    {:complete? complete?
     :counts    (update-vals items count)}))

(defn delete-recursively [item-type items metadata children-fn delete-fn & {:as opts}]
  (let [{:keys [queue results]} (walk* item-type items metadata children-fn opts)]
    (if (seq queue)
      (throw (ex-info "Cannot delete all descendants, as we could not enumerate them" {:queue queue}))
      (delete-fn results))))
