(ns metabase-enterprise.data-editing.foreign-keys2
  (:require    [clojure.java.jdbc :as jdbc]))

(def hop-bound       10)
(def per-table-bound 99)

;; state
{:orders {:delete-queue [{:id 42}]}
 :order-items {:will-delete #{{:id 1337} {:id 1338}}}}

;; metadata
(def orders-metadata {:orders [{:table :order-items, :fk {:order-id :id}, :pk [:id]}]})

{:people      [{:table :people, :fk {:father :id},   :pk [:id]}
               {:table :people, :fk {:mother :id},   :pk [:id]}]}

(def db
  {:orders [{:id 42}
            {:id 43}]
   :order-items [{:id 1337, :order-id 42}
                 {:id 1338, :order-id 42}
                 {:id 1339, :order-id 43}]})

(def init-state
  {:orders {:delete-queue [{:id 42}]}})

(defn pop-delete-queue [state]
  (if-some [table (some (fn [[table {:keys [delete-queue]}]] (when (seq delete-queue) table)) state)]
    (let [{:keys [delete-queue] :as table-state} (get state table)
          table-state (-> table-state (dissoc :delete-queue) (update :will-delete (fnil into #{}) delete-queue))]
      [[table delete-queue] (assoc state table table-state)])
    [nil state]))

(defn matches [parent fks child]
  (= (map parent (vals fks))
     (map child (keys fks))))

(defn lookup-child-keys [foreign-key parents]
  (for [child (get db (:table foreign-key))
        parent parents
        :when (matches parent (:fk foreign-key) child)]
    (select-keys child (:pk foreign-key)))

  #_(jdbc/query
     'db
     {:select (:pk foreign-key)
      :from   [(:table foreign-key)]
       ;; use :in for 1-1 keys
      :where  (into [:or] (for [parent-key parent-keys]
                            (into [:and] (for [[fk pk] (:fk foreign-key)]
                                           [:= fk (get parent-key pk)]))))
      :limit 501}))

(defn- push-into-delete-queue [state table pks]
  (update-in state [table :delete-queue] (fnil into #{}) (remove (-> state (get table) :will-delete set)) pks))

(defn step [state metadata]
  (let [[[parent-table delete-queue] state'] (pop-delete-queue state)]
    (if-not parent-table
      state'
      (let [foreign-keys (get metadata parent-table)
            child-keys   (for [{:keys [table] :as foreign-key} foreign-keys]
                           [table (lookup-child-keys foreign-key delete-queue)])]
        (reduce (fn [state [table pks]]
                  (push-into-delete-queue state table pks))
                state'
                child-keys)))))

(step (step (step init-state orders-metadata) orders-metadata) orders-metadata)


