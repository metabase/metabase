(ns metabase-enterprise.data-editing.data-editing
  (:require
   [clojure.set :as set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.data-editing.coerce :as data-editing.coerce]
   [metabase-enterprise.data-editing.models.undo :as undo]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(defn select-table-pk-fields
  "Given a table-id, return the :model/Field instances corresponding to its PK columns. Do not assume any ordering."
  [table-id]
  (u/prog1 (api/check-404 (t2/select :model/Field :table_id table-id :semantic_type :type/PK :active true))
    (api/check-500 (pos? (count <>)))))

(defn get-row-pks
  "Given a row, strip it down to just its primary keys."
  [pk-fields row]
  (->> (map :name pk-fields)
       (select-keys (update-keys row u/qualified-name))
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
  (assert (seq pk-fields) "Table must have at least one primary key column")
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
        coerce      (fn [k v] (some-> v ((coerce-fn (keyword k) identity))))]
    (for [row input-rows]
      (m/map-kv-vals coerce row))))

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
        diff->pk-diff    (u/for-map [{:keys [table-id before after] :as diff} diffs
                                     :when (or before after)]
                           [diff {:pk     (get-row-pks (table->pk-fields table-id) (or after before))
                                  :before before
                                  :after  after}])]
    ;; undo snapshots, but only if we're not executing an undo
    ;; TODO fix tests that execute actions without a user scope
    (when user-id
      (when-not (some (comp #{:data-editing/undo :data-editing/redo} first) invocation-stack)
        (undo/track-change!
         user-id
         scope
         (u/for-map [[table-id diffs] (group-by :table-id diffs)]
           [table-id (u/for-map [{:keys [before after deleted-children] :as diff} diffs
                                 :when (or before after)
                                 :let [{:keys [pk before after]} (diff->pk-diff diff)]]
                       [pk {:raw_before before
                            :raw_after  after
                            :undoable   (empty? deleted-children)}])]))))
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
                                        :scope      (u/snake-keys (actions/hydrate-scope scope))
                                        :args       {:table_id  table-id
                                                     :db_id     db-id
                                                     :timestamp (t/zoned-date-time (t/zone-id "UTC"))}}))))))

(defn- invalidate-field-values! [table-id rows]
  ;; Be conservative with respect to case sensitivity, invalidate every field when there is ambiguity.
  (let [ln->values  (u/group-by first second (for [row rows [k v] row] [(u/lower-case-en (name k)) v]))
        lower-names (keys ln->values)
        ln->ids     (when (seq lower-names)
                      (u/group-by
                       :lower_name :id
                       (t2/query {:select [:id [[:lower :name] :lower_name]]
                                  :from   [(t2/table-name :model/Field)]
                                  :where  [:and
                                           [:= :table_id table-id]
                                           [:in [:lower :name] lower-names]
                                           [:in :has_field_values ["list" "auto-list"]]
                                           [:= :semantic_type "type/Category"]]})))
        stale-fields (->> (for [[lower-name field-ids] ln->ids
                                :let [new-values (into #{} (filter some?) (ln->values lower-name))
                                      old-values (into #{} cat (t2/select-fn-vec :values :model/FieldValues
                                                                                 :field_id [:in field-ids]))]]
                            (when (seq (set/difference new-values old-values))
                              field-ids))
                          (apply concat))]
    ;; Note that for now we only rescan field values when values are *added* and not when they are *removed*.
    (when (seq stale-fields)
      ;; Using a future is not ideal, it would be better to use a queue and a single worker, to avoid tying up threads.
      (future
        (->> (t2/select :model/Field :id [:in stale-fields])
             (run! field-values/create-or-update-full-field-values!))))))

(defn invalidate-and-present!
  "We invalidate the field-values, in case any new category values were added.
  The FE also expects data to be formatted according to PQ logic, e.g. considering semantic types.
  Actions, however, return raw values, since lossy coercions would limit composition.
  So, we apply the coercions here."
  [table-id rows]
  ;; We could optimize this significantly:
  ;; 1. Skip if no category fields were changes on update.
  ;; 2. Check whether all corresponding categorical field values are already in the database.
  (invalidate-field-values! table-id rows)
  ;; right now the FE works off qp outputs, which coerce output row data
  ;; still feels messy, revisit this
  (let [pk-fields (select-table-pk-fields table-id)]
    (query-db-rows table-id pk-fields rows)))
