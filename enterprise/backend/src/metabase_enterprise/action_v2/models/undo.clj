(ns metabase-enterprise.action-v2.models.undo
  (:require
   [clojure.walk :as walk]
   [metabase.actions.core :as actions]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private retention-total-batches 100)
(def ^:private retention-total-rows 1000)
(def ^:private retention-batches-per-scope 100)
(def ^:private retention-batches-per-user 50)

(methodical/defmethod t2/table-name :model/Undo [_model] :data_edit_undo_chain)

(t2/deftransforms :model/Undo
  {:row_pk     mi/transform-json
   :raw_before mi/transform-json
   :raw_after  mi/transform-json})

(doto :model/Undo
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- nested-sort
  "Sort every map within the data structure."
  [x]
  (walk/postwalk #(if-not (map? %) % (apply sorted-map (apply concat %))) x))

(defn- serialize-scope
  "Convert the scope map or string into a stable string we can do example matches on in the database. Idempotent."
  [scope]
  (if (string? scope)
    scope
    ;; For now :type is ignored for undo scope, but once the FE starts passing it in, we'll probably change that.
    (or (some-> scope actions/normalize-scope (dissoc :type) nested-sort pr-str) "unknown")))

(defn- next-batch [undo? user-id scope]
  ;; For now, we assume all the changes are to the same table.
  ;; In the future, we might want to skip multi-table changes when using cmd-Z.
  ;; We may also want to filter based on the type of interaction that caused the change (e.g., grid, workflow, etc)
  (t2/select :model/Undo
             :batch_num [:in
                         {:select [[[(if undo? :max :min) :batch_num]]]
                          :from   [(t2/table-name :model/Undo)]
                          :where  [:and
                                   [:= :user_id user-id]
                                   [:= :scope (serialize-scope scope)]
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

(defn- next-sequence!
  [seq-name]
  (if-let [batch-num (t2/select-one-fn :next_val [:sequences :next_val] :name seq-name {:for :update})]
    (do
      (t2/update! :sequences {:name seq-name} {:next_val (inc batch-num)})
      batch-num)
    (do
      (t2/insert! :sequences {:name seq-name :next_val 2})
      1)))

(defn track-change!
  "Insert some snapshot data based on edits made to the given table."
  [user-id scope table-id->row-pk->values]
  (let [scope (serialize-scope scope)]
    (t2/with-transaction [_conn]
      (let [next-batch-num (next-sequence! "undo_batch_num")]
        (t2/insert!
         :model/Undo
         (for [[table-id table-updates] table-id->row-pk->values
               [row-pk values] table-updates]
           (merge {:batch_num  next-batch-num
                   :table_id   table-id
                   :user_id    user-id
                   :row_pk     row-pk
                   :scope      scope
                   ;; default value, can be override in values
                   :undoable   true}
                  values)))))

    ;; Delete snapshots that have been undone, as we keep a linear history and will no longer be able to "redo" them.
    (when-let [{:keys [batch_num]} (first (next-batch false user-id scope))]
      (t2/delete! :model/Undo
                  :batch_num [:>= batch_num]
                  :scope scope
                  :undone true))

    ;; Pruning. Fairly naive implementation. Doesn't assume we were fully pruned before this update.
    (prune-from-batch! (max (batch-to-prune-from-for-rows retention-total-rows)
                            (batch-to-prune-from retention-total-batches)))
    (prune-batches! retention-batches-per-scope [:= :scope scope])
    (prune-batches! retention-batches-per-user [:= :user_id user-id])))

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

(def ^:private category->op
  {:create :created
   :update :updated
   :delete :deleted})

(defn- batch->rows
  "Given the undo snapshots for some batch update, return the corresponding row updates."
  [undo? batch]
  (let [k (if undo? :raw_before :raw_after)]
    (for [b batch]
      (merge (:row_pk b) (k b)))))

(defn- update-table-data!
  "Revert the underlying table data."
  [undo-or-redo context batch]
  (let [undo? (= :undo undo-or-redo)]
    ;; Do a single perform-nested-action! call
    (doseq [[[table-id category] sub-batch] (u/group-by (juxt :table_id categorize) batch)
            :let [rows   (batch->rows undo? sub-batch)
                  inputs (map #(array-map :table-id table-id :row (update-keys % u/qualified-name)) rows)]]
      (case (if undo? (invert category) category)
        :create (try (actions/perform-nested-action! :table.row/create context inputs)
                     (catch Exception e
                       ;; Sometimes cols don't support a custom value being provided, e.g., GENERATED ALWAYS AS IDENTITY
                       (throw (ex-info "Failed to un-delete row(s)"
                                       {:error     :undo/cannot-undelete
                                        :batch-num (:batch_num (first batch))
                                        :table-id  table-id
                                        :pks       (map :row_pk batch)}
                                       e))))
        :update (actions/perform-nested-action! :table.row/update context inputs)
        :delete (actions/perform-nested-action! :table.row/delete context inputs)))
    ;; don't leak action outputs, we don't want to accidentally create more coupling to them.
    true))

(defn- undo*! [undo-or-redo context user-id scope]
  (let [undo? (= :undo undo-or-redo)
        batch (next-batch undo? user-id scope)]
    (cond
      (not (seq batch)) (throw (ex-info (if undo?
                                          "No previous versions found"
                                          "No subsequent versions found")
                                        {:error   :undo/none
                                         :user-id user-id
                                         :scope   scope}))
      (some (comp false? :undoable) batch)
      (throw (ex-info "Batch contains changes that are not undoable"
                      {:error     :undo/cannot-undo
                       :user-id   user-id
                       :scope     scope
                       :batch-num (:batch_num (first batch))}))
      (conflict? undo? batch) (throw (ex-info "Blocked by other changes"
                                              ;; It would be nice if we gave the batch_num for the first conflict.
                                              {:error   :undo/conflict
                                               :user-id user-id
                                               :scope   scope}))
      :else
      (do (update-table-data! undo-or-redo context batch)
          (t2/update! :model/Undo
                      {:batch_num (:batch_num (first batch))}
                      {:undone undo?})
          (for [[table-id sub-batch] (u/group-by :table_id batch)
                :let [rows (batch->rows undo? sub-batch)]
                [delta row] (map vector sub-batch rows)
                :let [category ((if undo? invert identity) (categorize delta))]]
            {:op       (category->op category)
             :table-id table-id
             :row      row})))))

(defn undo!
  "Rollback the given user's last change to the given table."
  [context user-id scope]
  (undo*! :undo context user-id scope))

(defn redo!
  "Rollback the given user's last change to the given table."
  [context user-id scope]
  (undo*! :redo context user-id scope))
