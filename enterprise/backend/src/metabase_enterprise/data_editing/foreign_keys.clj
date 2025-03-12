(ns metabase-enterprise.data-editing.foreign-keys
  (:require
   [clojure.java.jdbc :as jdbc]))

(defn- reducible-children-thunks
  "Given multiple rows from some table, return a seq of thunks which enumerate all the child rows in `child-table`
  that reference any of them via the columns given in `fk->pks`. Only select the primary keys of these child rows.
  To keep the size of the query itself down, it will query for the children of at most `parent-chunks` distinct parent
  records at once."
  [{:keys [child-table fk->pks child-pks]}
   parents
   & {:keys [parent-chunks] :or {parent-chunks 50}}]
  (for [batch (partition-all parent-chunks parents)]
    #(eduction (map (fn [child] {:table child-table, :row child}))
               (jdbc/reducible-query
                'db
                {:select child-pks
                 :from   [child-table]
                 :where  (into [:or] (for [parent batch]
                                       (into [:and] (for [[fk pk] fk->pks]
                                                      [:= fk (get parent pk)]))))}))))

(comment
  ;; example of the fk metadata used above
  [{:child-table :b, :fk->pks {:parent_id :id}, :child-pks [:id]}
   {:child-table :c, :fk->pks {:dad_id    :id}, :child-pks [:id]}
   {:child-table :c, :fk->pks {:mum_id    :id}, :child-pks [:id]}])

(defn descendants->table-counts
  "Count the number of descendant records in each table."
  [reducible]
  (reduce
   (fn [acc item]
     (if (keyword? item)
       (assoc acc :complete? false)
       (update-in acc [:tables (:table item)] (fnil inc 0))))
   {:tables    {}
    :complete? true}
   reducible))

(defn reducible-process [process-item-fn next-thunk-fn skip-fn state]
  (reify clojure.core.protocols/CollReduce
    (coll-reduce [_ reducing-fn init]
      (loop [acc   init
             state state]
        (let [[next-thunk state] (next-thunk-fn state)]
          (if-not next-thunk
            acc
            (let [[acc state] (reduce
                               (fn [[acc state :as unchanged] item]
                                 (if (skip-fn state item)
                                   unchanged
                                   (let [acc (reducing-fn acc item)]
                                     (if (reduced? acc)
                                       (reduced [acc state])
                                       (let [state (process-item-fn state item)]
                                         [acc state])))))
                               [acc state]
                               (next-thunk))]
              (if (reduced? acc)
                (unreduced acc)
                (recur acc state)))))))))

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

(defn reducible-batch-bfs
  [items->thunks items
   & {:keys [max-results max-results-sentinel max-chunk-size max-thunk-executions max-thunks-sentinel]
      :or   {max-results          10000
             max-results-sentinel :bfs/too-many-results
             max-chunk-size       50
             max-thunk-executions 50
             max-thunks-sentinel  :bfs/too-many-look-ups}}]
  (assert (pos? max-results))
  (assert (pos? max-chunk-size))
  (assert (pos? max-thunk-executions))

  (eduction
   (take-with-sentinel max-results max-results-sentinel)
   (reducible-process
    (fn process-item [state item]
      (if (= max-thunks-sentinel item)
        state
        (-> state
            (update :visited conj item)
            (update :pending-descent conj item)
            ((fn [{:keys [pending-descent] :as state}]
               (if (> (count pending-descent) max-chunk-size)
                 (let [new-thunks (some-> (take max-chunk-size pending-descent) seq items->thunks)]
                   (-> state
                       (update :pending-descent subvec max-chunk-size)
                       (update :thunks concat new-thunks)))
                 state))))))
    (fn next-thunk-fn [state]
      (let [hit-limit? (>= (:executed-thunks state) max-thunk-executions)]
        (if (and hit-limit? (seq (:thunks state)))
          [(fn [] [max-thunks-sentinel])
           (assoc state :thunks [] :pending-descent [])]
          (let [next-thunks (some-> state :pending-descent seq items->thunks)
                thunks      (concat (:thunks state) next-thunks)]
            (if (and hit-limit? (seq thunks))
              [(fn [] [max-thunks-sentinel])
               (assoc state :thunks [] :pending-descent [])]
              [(first thunks)
               (-> state
                   (assoc :pending-descent [])
                   ;; we assume that the next thunk gets executed before this function is called again.
                   (update :executed-thunks inc)
                   (assoc :thunks (rest thunks)))])))))
    (fn skip-fn [state item]
      (contains? (:visited state) item))
    {:visited         (set items)
     :thunks          (items->thunks items)
     :executed-thunks 0
     :pending-descent []})))
