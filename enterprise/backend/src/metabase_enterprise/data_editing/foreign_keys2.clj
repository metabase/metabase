(ns metabase-enterprise.data-editing.foreign-keys2
  (:require
   [clojure.java.jdbc :as jdbc]))

(defn pop-queue [{:keys [queue] :as state}]
  (if-let [nxt (first queue)]
    [nxt (update state :queue subvec 1)]
    [nil state]))

(defn matches? [parent fks child]
  (= (map parent (vals fks))
     (map child (keys fks))))

(defn lookup-children [relationship parents]
  [(:table relationship)
   (for [child  (get db (:table relationship))
         parent parents
         :when (matches? parent (:fk relationship) child)]
     (select-keys child (:pk relationship)))])

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
          (update-in [:results item-type] into new-items)))))

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

(defn walk [item-type items metadata & {:keys [max-queries children-fn]
                                        :or   {max-queries 10
                                               children-fn lookup-children}}]
  (:results
   (reduce
    (fn [state _]
      (step metadata children-fn state))
    {:queue [[item-type items]]}
    (range max-queries))))
