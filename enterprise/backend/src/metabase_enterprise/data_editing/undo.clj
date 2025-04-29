(ns metabase-enterprise.data-editing.undo
  (:require
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(def ^:private retention-total-batches 100)
(def ^:private retention-total-rows 1000)
(def ^:private retention-batches-per-table 100)
(def ^:private retention-batches-per-user 50)

(methodical/defmethod t2/table-name :model/Undo [_model] :data_edit_undo_chain)

(t2/deftransforms :model/Undo
  {:row_pk     mi/transform-json
   :raw_before mi/transform-json
   :raw_after  mi/transform-json})

(doto :model/Undo
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; We must enforce the following invariant for the data in the Undo table:
;;
;; undone` is monotonic in `batch_num`, for each `table_id`, `row_pk` combination.
;;  i.e., it can only change from `false` to `true` for any logical "cell", as `batch_num` increases.

(defn- next-batch [undo? user-id table-id]
  ;; For now, we assume all the changes are to the same table.
  ;; In the future, we might want to skip multi-table changes when using cmd-Z.
  ;; We may also want to filter based on the type of interaction that caused the change (e.g., grid, workflow, etc)
  (t2/select :model/Undo
             :batch_num [:in
                         {:select [[[(if undo? :max :min) :batch_num]]]
                          :from   [(t2/table-name :model/Undo)]
                          :where  [:and
                                   [:= user-id :user_id]
                                   [:= table-id :table_id]
                                   (if undo?
                                     [:not :undone]
                                     :undone)]}]))

(defn- batch-to-prune-from
  "Return the largest batch_num that we should no longer retain, if we only want to keep a certain number of batches
  matching the given where clause. Returns 0 if we do not need to prune anything."
  [batches-to-keep & [where]]
  (-> {:select   [:batch_num]
       :from     [(t2/table-name :model/Undo)]
       :where    (or where true)
       :group-by :batch_num
       :order-by [[:batch_num :desc]]
       :limit    1
       :offset   batches-to-keep}
      t2/query
      first
      :batch_num
      (or 0)))

(defn- batch-to-prune-from-for-rows
  "This is like [[batch-to-prune-from], except that we're enforcing a max on the row count."
  [rows-to-keep & [where]]
  (-> {:select   [:batch_num]
       :from     [(t2/table-name :model/Undo)]
       :where    (or where true)
       :order-by [[:id :desc]]
       :limit    1
       :offset   rows-to-keep}
      t2/query
      first
      :batch_num
      (or 0)))

(defn- prune-from-batch! [batch-num & [where]]
  (t2/delete! :model/Undo
              :batch_num [:<= batch-num]
              {:where (or where true)}))

(defn- prune-batches! [batches-to-keep & [where]]
  (prune-from-batch! (batch-to-prune-from batches-to-keep where) where))

(defn track-change!
  "Insert some snapshot data based on edits made to the given table."
  [user-id table-id->row-pk->old-new-values]
  (t2/with-transaction [_conn]
    (let [seq-name       "undo_batch_num"
          next-batch-num (or (t2/select-one-fn :next_val [:sequences :next_val] :name seq-name {:for :update}) 1)]
      (t2/update! :sequences {:name seq-name} {:next_val (inc next-batch-num)})
      (t2/insert!
       :model/Undo
       (for [[table-id table-updates] table-id->row-pk->old-new-values
             [row-pk [old new]] table-updates]
         {:batch_num  next-batch-num
          :table_id   table-id
          :user_id    user-id
          :row_pk     row-pk
          :scope     "{\"pew\": true}"
          :raw_before old
          :raw_after  new}))))
  ;; We do this in multiple statements because:
  ;; - it's much simpler
  ;; - typically there is only one table, and this is more efficient in that case
  (doseq [[table-id table-updates] table-id->row-pk->old-new-values
          :let [_row-pks (keys table-updates)]]
    ;; TODO This is the wrong batch number
    ;; - we need to scope ourselves just to these row-pks
    ;; - we want to look across all users
    ;; - we can't rely on `undone` being monotonic if we're searching across multiple row-pks
    (when-let [{:keys [batch_num]} (first (next-batch false user-id table-id))]
      (t2/delete! :model/Undo
                  :table_id table-id
                  ;; Note: we intentionally also orphan changes to other rows.
                  ;:row_pk [:in row-pks]
                  :batch_num [:>= batch_num]
                  :undone true)))

  ;; Pruning. Fairly naive implementation. Doesn't assume we were fully pruned before this update.

  (prune-from-batch! (max (batch-to-prune-from-for-rows retention-total-rows)
                          (batch-to-prune-from retention-total-batches)))

  (doseq [table-id (keys table-id->row-pk->old-new-values)]
    (let [where-table [:= :table_id table-id]]
      (prune-batches! retention-batches-per-table where-table)))

  (let [where-user [:= :user_id user-id]]
    (prune-batches! retention-batches-per-user where-user)))

(defn next-batch-num
  "Return the batch number of the new change that we would (un-)revert.
  NOTE: this does not check whether there is a conflict preventing us from actually performing it."
  [undo? user-id table-id]
  (:batch_num (first (next-batch undo? user-id table-id))))

;; This will be used to fix conflict false positives
#_{:clj-kondo/ignore [:unused-private-var]}
(defn- diff-keys
  "Give the sorted list of keys on which m1 and m2 differ."
  [m1 m2]
  (->> (into (apply sorted-set (keys m1)) (keys m2))
       (filter #(not= (get m1 %) (get m2 %)))))

(defn- conflict?
  "Has another change superseded this batch, making it non-undoable? Typically, will mean someone else has edited it."
  [undo? batch]
  (let [row-pks   (into #{} (map :row_pk) batch)
        table-ids (into #{} (map :table_id) batch)
        {:keys [batch_num]} (first batch)]
    ;; TODO fix false positives in multi-table case where row-pks are ambiguous
    ;; PRODUCT: We probably also want to fix false positive conflicts when different columns were changed
    ;; Idea: Select all potential conflicting undos, check for any whose changed keys overlap with ours.
    ;; Can store a precalculated [[diff-keys]] on each :model/Undo row, or even normalize into its own table and do
    ;; conflict detection completely in SQL.
    ;; This normal form may make maintenance of the history a bit too expensive however.
    (t2/exists? :model/Undo
                :table_id [:in table-ids]
                :row_pk [:in row-pks]
                :batch_num [(if undo? :> :<) batch_num]
                :undone (not undo?))))

(defn- categorize [{:keys [raw_before raw_after]}]
  (cond
    (nil? raw_before) :create
    (nil? raw_after)  :delete
    :else             :update))

(def ^:private invert
  {:create :delete
   :update :update
   :delete :create})

(defn- batch->rows
  "Given the undo snapshots for some batch update, return the corresponding row updates."
  [undo? batch]
  (let [k (if undo? :raw_before :raw_after)]
    (for [b batch]
      (merge (:row_pk b) (k b)))))

(defn- update-table-data!
  "Revert the underlying table data."
  [undo? user-id batch]
  (doseq [[[table-id category] sub-batch] (u/group-by (juxt :table_id categorize) batch)
          :let [rows (batch->rows undo? sub-batch)
                iid  (nano-id/nano-id)
                opts {:existing-context {:invocation_id iid
                                         :invocation-stack [[(if undo? :undo/undo :undo/redo) iid]]}}]]
    (case (if undo? (invert category) category)
      :create (try (data-editing/perform-bulk-action! :bulk/create user-id table-id rows opts)
                   (catch Exception e
                     ;; Sometimes cols don't support a custom value being provided, e.g., GENERATED ALWAYS AS IDENTITY
                     (throw (ex-info "Failed to un-delete row(s)"
                                     {:error     :undo/cannot-undelete
                                      :batch-num (:batch_num (first batch))
                                      :table-id  table-id
                                      :pks       (map :row_pk batch)}
                                     e))))
      :update (data-editing/perform-bulk-action! :bulk/update user-id table-id rows opts)
      :delete (data-editing/perform-bulk-action! :bulk/delete user-id table-id rows opts))))

(defn- undo*! [undo? user-id table-id]
  (let [batch (next-batch undo? user-id table-id)]
    (cond
      (not (seq batch)) (throw (ex-info (if undo?
                                          "No previous versions found"
                                          "No subsequent versions found")
                                        {:error    :undo/none
                                         :user-id  user-id
                                         :table-id table-id}))
      (conflict? undo? batch) (throw (ex-info "Blocked by other changes"
                                              ;; It would be nice if we gave the batch_num for the first conflict.
                                              {:error    :undo/conflict
                                               :user-id  user-id
                                               :table-id table-id}))
      :else
      (do (update-table-data! undo? user-id batch)
          (t2/update! :model/Undo
                      {:batch_num (:batch_num (first batch))}
                      {:undone undo?})
          (->> (for [[table-id sub-batch] (u/group-by :table_id batch)]
                 [table-id (map vector
                                (map (comp (if undo? invert identity) categorize) sub-batch)
                                (batch->rows undo? sub-batch))])
               (into {}))))))

(defn undo!
  "Rollback the given user's last change to the given table."
  [user-id table-id]
  (undo*! true user-id table-id))

(defn redo!
  "Rollback the given user's last change to the given table."
  [user-id table-id]
  (undo*! false user-id table-id))
