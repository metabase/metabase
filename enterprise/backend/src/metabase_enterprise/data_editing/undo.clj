(ns metabase-enterprise.data-editing.undo
  (:require
   [clojure.edn :as edn]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Undo [_model] :data_edit_undo_chain)

(def transform-edn {:in pr-str, :out edn/read-string})

(t2/deftransforms :model/Card
  {:row_pk           mi/transform-json
   :raw_value_before transform-edn
   :raw_value_after  transform-edn})

(doto :model/Undo
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; invariants
;; for a given field, "undone" is monotonic in change_num (cannot go from true to false)

;; TODO not serialized

(defn- next-undo-batch [user-id table-id]
  ;; For now, we assume all the changes are to the same table.
  ;; In the future, we might want to skip multi-table changes when using cmd-Z.
  ;; We may also want to filter based on the type of interaction that caused the change (e.g., grid, workflow, etc)
  ;;
  ;; select max(change_num) where table_id, user_id, and not undone.
  ;;
  (when-let [change-num nil]
    (t2/select :model/Undo :change_num change-num)))

(defn- track-change! [user-id table-id field-id->old-new-values]
  ;; TODO single insert statement
  (doseq [[field-id [old new]] field-id->old-new-values]
    (t2/insert! :model/Undo
                {:change_num [{}]
                 :table_id table-id
                 :field_id field-id
                 :user_id user-id})))

(defn- has-undo?
  "Return whether we have any saved modifications that could be undone.
  NOTE: this does not check whether there is a conflict preventing us from actually undoing it."
  [user-id table-id]
  (boolean (seq (next-undo-batch user-id table-id))))

(defn- undo! [user-id table-id]
  (let [batch     (next-undo-batch user-id table-id)
        field-ids (map :field_id batch)
        {:keys [change_num]} (:change_num (first batch))]
    (if (not (seq batch))
      :none
      (if (t2/exists? :model/Undo
                      :field_id [:in field-ids]             ;;  table is implicit, plus this is multi-table undo ready
                      :change_num [:> (inc change_num)]
                      :undone false)
        :conflict
        (do
          (doseq [u batch]
            #p (:raw_value_before u))
          (t2/update! :model/Undo {:change_num change_num} {:undone true}))))))

(defn- redo! [user-id table-id])
