(ns metabase-enterprise.data-editing.undo
  (:require
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Undo [_model] :data_edit_undo_chain)

(t2/deftransforms :model/Undo
  {:row_pk     mi/transform-json
   :raw_before mi/transform-json
   :raw_after  mi/transform-json})

(doto :model/Undo
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; We enforce and rely on the following invariants for the data in the Undo table:

;; - `undone` is monotonic in `batch_num`, for each table_id, row_pk combination.
;;      i.e., it can only change from `false` to `true`, as `batch_num` increases.
;; - at most one of `row_before` and `row_after` are `nil`

;; invariants
;; for a given field, "undone" is monotonic in batch_num (cannot go from true to false)

;; TODO not serialized (yaml)

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

(defn- track-change! [user-id table-id->row-pk->old-new-values]
  (t2/insert!
   :model/Undo
   (for [[table-id stuff] table-id->row-pk->old-new-values
         [row-pk [old new]] stuff]
     {:batch_num  [:+ [:inline 1] [:coalesce {:from [:data_edit_undo_chain] :select [[[:max :batch_num]]]} 0]]
      :table_id   table-id
      :user_id    user-id
      :row_pk     row-pk
      :raw_before old
      :raw_after  new}
     ;; TODO delete any orphaned or conflicting "undone" changes
     )))

(defn- has-undo?
  "Return whether we have any saved modifications that could be undone.
  NOTE: this does not check whether there is a conflict preventing us from actually undoing it."
  [user-id table-id]
  (boolean (seq (next-batch true user-id table-id))))

(defn- has-redo?
  "Return whether we have any saved modifications that could be undone.
  NOTE: this does not check whether there is a conflict preventing us from actually undoing it."
  [user-id table-id]
  (boolean (seq (next-batch false user-id table-id))))

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
    ;; TODO fix false positive conflicts when different columns were changed
    ;; Idea: Select all potential conflicting undos, check for any whose changed keys overlap with ours.
    ;; Can store a precalculated [[diff-keys]] on each :model/Undo row, or even normalize into its own table and do
    ;; conflict detection completely in SQL.
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

(defn- batch->rows [undo? batch]
  (let [k (if undo? :raw_before :raw_after)]
    (for [b batch]
      (when-let [body (k b)]
        (merge (:row_pk b) body)))))

(defn undo*!
  "Revert the underlying table data."
  [undo? batch]
  (doseq [[[table-id category] sub-batch] (u/group-by (juxt :table_id categorize) batch)
          :let [rows (batch->rows undo? sub-batch)]]
    #p [category rows]
    #_(case (if redo? (invert category) category)
        :create (data-editing/perform-bulk-action! :bulk/create table-id rows)
        :update (data-editing/perform-bulk-action! :bulk/update table-id rows)
        :delete (data-editing/perform-bulk-action! :bulk/delete table-id rows))))

(defn- undo! [user-id table-id]
  (let [undo? true
        batch (next-batch undo? user-id table-id)]
    (cond
      (not (seq batch)) (throw (ex-info "No previous versions found"
                                        {:error    :undo/none
                                         :user-id  user-id
                                         :table-id table-id}))
      (conflict? undo? batch) (throw (ex-info "Conflicting versions found"
                                              {:error    :undo/conflict
                                               :user-id  user-id
                                               :table-id table-id}))
      :else
      (do (undo*! undo? batch)
          (t2/update! :model/Undo
                      {:batch_num (:batch_num (first batch))}
                      {:undone true})
          (batch->rows undo? batch)))))

(defn- redo! [user-id table-id]
  (let [undo? false
        batch (next-batch undo? user-id table-id)]
    (cond
      (not (seq batch)) (throw (ex-info "No subsequent versions found"
                                        {:error    :undo/none
                                         :user-id  user-id
                                         :table-id table-id}))
      (conflict? undo? batch) (throw (ex-info "Conflicting versions found"
                                              {:error    :undo/conflict
                                               :user-id  user-id
                                               :table-id table-id}))
      :else
      (do (undo*! undo? batch)
          (t2/update! :model/Undo
                      {:batch_num (:batch_num (first batch))}
                      {:undone false})
          (batch->rows undo? batch)))))

;-> table batch edit action (inv id 1) -> bulk action -> row/update (inv id 1)
;                                                        row/update (inv id 3)
;                                                               |
;                                                               -> action.success -> audit log
;                                                               -> undo snapshots (row level)

; (open problem: how to atomically give them all the same batch number)
;
; do an undo -> bulk action -> row/update -> DO NOT create snapshot
;
;              {:skip-undo-snapshot true} -> use that option
;
; change 1 (not undone)
; change 2 (not undone)
; change 3 (undone)
; change 4 - same entity
; change 5 (not undone)

;; undo until nothing to undo.
;; redo until nothing to redo.
;; conflict when the same field and row.
;; no conflict for a different field.
;; no conflict for a different row.

(comment
  (t2/delete! :model/Undo)
  (do
    (track-change! 1 {1 {{:id 1} [nil {:name "Chris"}]}})
    (track-change! 1 {1 {{:id 1} [{:name "Chris"} {:name "Ngoc"}]}})
    (track-change! 1 {1 {{:id 1} [{:name "Ngoc"} nil]}})

    (track-change! 2 {2 {{:id 1} [nil {:name "Chris" :age 2}]}})
    (track-change! 2 {2 {{:id 1} [{:name "Chris" :age 2} {:name "Ngoc" :age 9000}]}})
    (track-change! 3 {2 {{:id 1} [{:name "Ngoc" :age 9000} {:name "Ngoc" :age 9001}]}})
    (track-change! 2 {2 {{:id 1} [{:name "Ngoc" :age 9001} nil]}}))

  (undo! 1 1)
  (redo! 1 1)

  (undo! 2 2)
  (undo! 3 2)
  (redo! 2 2)
  (redo! 3 2)

  (t2/select :model/Undo))
