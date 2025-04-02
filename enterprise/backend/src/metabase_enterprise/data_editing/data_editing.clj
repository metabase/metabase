(ns metabase-enterprise.data-editing.data-editing
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-editing.coerce :as data-editing.coerce]
   [metabase.actions.core :as actions]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [toucan2.core :as t2]))

(defn apply-coercions
  "For fields that have a coercion_strategy, apply the coercion function (defined in data-editing.coerce) to the corresponding value in each row.
  Intentionally does not coerce primary key values (behaviour for pks with coercion strategies is undefined)."
  [table-id input-rows]
  (let [input-keys  (into #{} (mapcat keys) input-rows)
        field-names (map name input-keys)
        ;; TODO not sure how to do an :in clause with toucan2
        fields      (mapv #(t2/select-one :model/Field :table_id table-id :name %) field-names)
        coerce-fn   (->> (for [{field-name :name, :keys [coercion_strategy, semantic_type]} fields
                               :when (not (isa? semantic_type :type/PK))]
                           [(keyword field-name)
                            (or (when (nil? coercion_strategy) identity)
                                (data-editing.coerce/input-coercion-fn coercion_strategy)
                                (throw (ex-info "Coercion strategy has no defined coercion function"
                                                {:status 400
                                                 :field field-name
                                                 :coercion_strategy coercion_strategy})))])
                         (into {}))
        coerce      (fn [k v] (some-> v ((coerce-fn k identity))))]
    (for [row input-rows]
      (m/map-kv-vals coerce row))))

(defn perform-bulk-action!
  "Operates on rows in the database, supply an action-kw: :bulk/create, :bulk/update, :bulk/delete.
  The input `rows` is given different semantics depending on the action type, see actions/perform-action!."
  [action-kw table-id rows]
  (actions/perform-action! action-kw
                           {:database (api/check-404 (t2/select-one-fn :db_id [:model/Table :db_id] table-id))
                            :table-id table-id
                            :arg      rows}
                           :policy   :data-editing))

(defn insert!
  "Inserts rows into the table, recording their creation as an event. Returns the inserted records.
  Expects rows that are acceptable directly by [[actions/perform-action!]]. If casts or reversing coercion strategy
  are required, that work must be done before calling this function."
  [table-id rows]
  (let [res (perform-bulk-action! :bulk/create table-id rows)]
    ;; TODO if we are inserting via webhook endpoint, we have no user id - but schema requires it.
    (when-some [user-id api/*current-user-id*]
      (doseq [row (:created-rows res)]
        (events/publish-event! :event/data-editing-row-create
                               {:table_id    table-id
                                :created_row row
                                :actor_id    user-id})))
    res))
