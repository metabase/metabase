(ns metabase-enterprise.data-editing.data-editing
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.data-editing.coerce :as data-editing.coerce]
   [metabase-enterprise.data-editing.scope :as data-editing.scope]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(defn select-table-pk-fields
  "Given a table-id, return the :model/Field instances corresponding to its PK columns. Do not assume any ordering."
  [table-id]
  (u/prog1 (api/check-404 (t2/select :model/Field :table_id table-id :semantic_type :type/PK :active true))
    (api/check-500 (pos? (count <>)))))

(defn get-row-pks
  "Given a row, strip it down to just its primary keys."
  [pk-fields row]
  (->> (map (comp keyword :name) pk-fields)
       ;; Hideous workaround for QP and direct JDBC disagreeing on case
       (select-keys (merge (update-keys row (comp keyword u/upper-case-en name))
                           (u/lower-case-map-keys row)
                           row))
       ;; Hack for now, pending discussion of the ideal fix
       ;; https://linear.app/metabase/issue/WRK-281/undo-deletes-a-record-instead-of-reverting-the-edits
       ;; See https://metaboat.slack.com/archives/C0641E4PB9B/p1744978660610899
       (m/map-vals #(if (uuid? %) (str %) %))))

(defn- valid-pks [pks]
  (every? some? (vals pks)))

(defn- apply*
  "Work around the fact that the lib logical operators don't have a 0 or 1 arity."
  [f clauses]
  (if (<= (count clauses) 1)
    (first clauses)
    (apply f clauses)))

(defn- qp-result->row-map
  [{:keys [rows cols]}]
  ;; rows from the request are keywordized
  (let [col-names (map (comp keyword :name) cols)]
    (map #(zipmap col-names %) rows)))

(defn query-db-rows
  "Return the current representation of the given rows that we would return to the frontend, indexed by their pks."
  [table-id pk-fields rows]
  (assert (seq pk-fields) "Table must have at least on primary key column")
  ;; TODO pass in the db-id from above rather
  (let [{:keys [db_id]} (api/check-404 (t2/select-one :model/Table table-id))
        row-pks (seq (map (partial get-row-pks pk-fields) rows))]
    (assert (every? valid-pks row-pks) "All rows must have valid primary keys")
    (when row-pks
      (qp.store/with-metadata-provider db_id
        (let [mp    (qp.store/metadata-provider)
              query (lib/query mp (lib.metadata/table mp table-id))
              query (lib/filter
                     query
                     ;; We can optimize the most common case considerably.
                     (if (= 1 (count pk-fields))
                       (apply lib/in
                              (lib.metadata/field mp (:id (first pk-fields)))
                              (map (comp first vals) row-pks))
                       ;; Optimizing this could be done in many cases, but it would be complex.
                       (apply* lib/or
                               (for [row-pk row-pks]
                                 (apply* lib/and
                                         (for [field pk-fields]
                                           (lib/= (lib.metadata/field mp (:id field))
                                                  (get row-pk (keyword (:name field))))))))))]
          (->> query
               qp/userland-query-with-default-constraints
               qp/process-query
               :data
               qp-result->row-map))))))

(defn apply-coercions
  "For fields that have a coercion_strategy, apply the coercion function (defined in data-editing.coerce) to the corresponding value in each row.
  Intentionally does not coerce primary key values (behaviour for pks with coercion strategies is undefined)."
  [table-id input-rows]
  (let [input-keys  (into #{} (mapcat keys) input-rows)
        field-names (map name input-keys)
        fields      (t2/select :model/Field :table_id table-id :name [:in field-names])
        coerce-fn   (->> (for [{field-name :name, :keys [coercion_strategy, semantic_type]} fields
                               :when (not (isa? semantic_type :type/PK))]
                           [(keyword field-name)
                            (or (when (nil? coercion_strategy) identity)
                                (:in (data-editing.coerce/coercion-fns coercion_strategy))
                                (throw (ex-info "Coercion strategy has no defined coercion function"
                                                {:status 400
                                                 :field field-name
                                                 :coercion_strategy coercion_strategy})))])
                         (into {}))
        coerce      (fn [k v] (some-> v ((coerce-fn k identity))))]
    (for [row input-rows]
      (m/map-kv-vals coerce row))))

(defn perform-bulk-action!
  "Operates on rows in the database, supply an action-kw: :table.row/create, :table.row/update, :table.row/delete.
  The input `rows` is given different semantics depending on the action type, see actions/perform-action!."
  [action-kw user-id scope table-id rows & {:keys [existing-context]}]
  ;; TODO make this work for multi instances by using the metabase_cluster_lock table, or something similar
  ;; https://github.com/metabase/metabase/pull/56173/files
  (locking #'perform-bulk-action!
    (let [db-id (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))]
      (->> (actions/perform-action!
            action-kw
            scope
            (for [row rows]
              {:database db-id, :table-id table-id, :row row})
            {:policy           :data-editing
             :existing-context (if existing-context
                                 (assoc existing-context :user-id user-id)
                                 (let [iid (nano-id/nano-id)]
                                   {:invocation-id    iid
                                    :invocation-stack [[:grid/edit iid]]
                                    :user-id          user-id
                                    :scope            scope}))})
           :effects
           (filter (comp #{:effect/row.modified} first))
           (map second)))))

(defn insert!
  "Inserts rows into the table, recording their creation as an event. Returns the inserted records.
  Expects rows that are acceptable directly by [[actions/perform-action!]]. If casts or reversing coercion strategy
  are required, that work must be done before calling this function."
  [user-id scope table-id rows]
  (api/check-500 user-id)
  (let [res (perform-bulk-action! :table.row/create user-id scope table-id rows)]
    {:created-rows (map :after res)}))

(defn- row-update-event
  "Given a :effect/row.modified diff, figure out what kind of mutation it was."
  [{:keys [before after]}]
  (case [(some? before) (some? after)]
    [false true]  :event/row.created
    [true  true]  :event/row.updated
    [true  false] :event/row.deleted
    ;; should not happen
    [false false] ::no-op))

(defmethod actions/handle-effects!* :effect/row.modified
  [_ {:keys [user-id invocation-stack scope]} diffs]
  (let [table-ids        (distinct (map :table-id diffs))
        table->pk-fields (u/group-by identity select-table-pk-fields concat table-ids)
        table->keymap    (u/for-map [table-id table-ids
                                     :let [fields (t2/select-fn-vec :name [:model/Field :name] :table_id table-id)]]
                           [table-id (merge (u/for-map [f fields]
                                              [(keyword (u/lower-case-en f)) (keyword f)])
                                            (u/for-map [f fields]
                                              [(keyword (u/upper-case-en f)) (keyword f)])
                                            (let [kws (map keyword fields)]
                                              (zipmap kws kws)))])
        diff->pk-diff    (u/for-map [{:keys [table-id before after] :as diff} diffs
                                     :when (or before after)
                                     :let [keymap (table->keymap table-id)]]
                           [diff {:pk     (get-row-pks (table->pk-fields table-id) (or after before))
                                  :before (when before (update-keys before keymap))
                                  :after  (when after (update-keys after keymap))}])]
    ;; undo snapshots, but only if we're not executing an undo
    ;; TODO fix tests that execute actions without a user scope
    (when user-id
      (when-not (some (comp #{"undo"} namespace first) invocation-stack)
        ((requiring-resolve 'metabase-enterprise.data-editing.undo/track-change!)
         user-id
         scope
         (u/for-map [[table-id diffs] (group-by :table-id diffs)]
           [table-id (u/for-map [{:keys [before after] :as diff} diffs
                                 :when (or before after)
                                 :let [{:keys [pk before after]} (diff->pk-diff diff)]]
                       [pk [before after]])]))))
    ;; table notification system events
    (doseq [[event payloads] (->> diffs
                                  (group-by row-update-event)
                                  (remove (comp #{::no-op} key)))]
      (doseq [[table-id payloads] (group-by :table-id payloads)
              :let [db-id       (:db-id (first payloads))
                    row-changes (for [diff payloads]
                                  (diff->pk-diff diff))]]
        (doseq [row-change row-changes]
          (events/publish-event! event {:actor_id   user-id
                                        :row_change row-change
                                        :scope      (u/snake-keys (data-editing.scope/hydrate scope))
                                        :args       {:table_id  table-id
                                                     :db_id     db-id
                                                     :timestamp (t/zoned-date-time (t/zone-id "UTC"))}}))))))
