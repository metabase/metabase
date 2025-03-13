(ns metabase-enterprise.data-editing.foreign-keys
  (:require
   [clojure.java.jdbc :as jdbc]))

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

(defn walk [item-type items metadata children-fn & {:keys [max-queries]
                                                    :or   {max-queries 100}}]
  (:results
   (reduce
    (fn [state _]
      (step metadata children-fn state))
    {:queue [[item-type items]]}
    (range max-queries))))
