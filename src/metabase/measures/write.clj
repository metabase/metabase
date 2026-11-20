(ns metabase.measures.write
  "The write functions of Measures, through which every writer creates, updates and deletes them."
  (:require
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.measures.db :as measures.db]
   [metabase.measures.schema :as measures.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn definition-table-id
  "The id of the Table `definition`, a full query, is built on."
  [definition]
  (lib/primary-source-table-id (lib-be/normalize-query definition)))

(defn check-definition
  "Throws unless `definition` is a full query that fits a Measure."
  [definition]
  (when-not (and (seq definition)
                 (#{:mbql-version/mbql5 :mbql-version/legacy} (lib/normalized-mbql-version definition)))
    (throw (ex-info (tru "Measure definition must be a full query with a source table.") {:status-code 400})))
  (mu/validate-throw ::lib.schema.measure/definition (lib-be/normalize-query definition)))

(defn- changed
  "The columns of `changes` whose values differ from those of `measure`."
  [measure changes]
  (into {} (remove (fn [[k v]] (= v (get measure k)))) changes))

(defn- check-changes
  "Throws unless `changes`, the changed columns of the Measure with `id`, are an update a Measure allows."
  [id changes]
  (when (contains? changes :creator_id)
    (throw (ex-info (tru "You cannot change the creator of a Measure.") {:status-code 400})))
  (when (and (contains? changes :table_id) (not (contains? changes :definition)))
    (throw (ex-info (tru "The table of a Measure follows its definition; change the definition instead.") {:status-code 400})))
  (when (contains? changes :definition)
    (check-definition (:definition changes))
    (lib/check-measure-overwrite id (lib-be/normalize-query (:definition changes)))))

(defn- with-derived-columns
  "`changes` with the normalized new definition, the table that follows it and the time of the update."
  [changes]
  (cond-> changes
    (contains? changes :definition)       (-> (update :definition lib-be/normalize-query)
                                              (assoc :table_id (definition-table-id (:definition changes))))
    (not (contains? changes :updated_at)) (assoc :updated_at (mi/now))))

(mu/defn create-measure!
  "Insert `measure`, whose after-insert hook publishes its create event, returning the inserted Measure."
  [{:keys [creator_id name description definition]} :- ::measures.schema/measure.create]
  (events/with-batched-events
    (measures.db/insert-measure! creator_id name description definition)))

(mu/defn update-measure! :- :int
  "Apply `changes` to `measure-or-id`, a Measure the caller already loaded or the id of one, and publish its update
  event, returning the number of Measures updated; for the REST API, the MCP tools, dimension sync, revision revert,
  replacement and the SerDes import."
  [measure-or-id :- [:or ::lib.schema.id/measure :map]
   changes       :- ::measures.schema/measure.input
   opts          :- ::measures.schema/write-opts]
  (let [measure (if (map? measure-or-id) measure-or-id (measures.db/measure measure-or-id))
        id      (:id measure)
        changes (when measure (changed measure changes))]
    (if (empty? changes)
      0
      (do
        (check-changes id changes)
        (let [changes (with-derived-columns changes)]
          (events/with-event-context (select-keys opts [:revision-message])
            (events/with-batched-events
              (u/prog1 (measures.db/update-measure! id changes)
                (events/updated! :model/Measure (merge measure changes) measure)))))))))

(mu/defn delete-measures! :- :int
  "Delete the Measures with `ids` and publish their delete events, returning the number deleted; for remote sync and
  the SerDes import."
  [ids   :- [:maybe [:sequential ::lib.schema.id/measure]]
   _opts :- ::measures.schema/write-opts]
  (let [measures (when (seq ids) (measures.db/measures ids))]
    (if (empty? measures)
      0
      (events/with-batched-events
        (events/deleting! :model/Measure measures
                          #(measures.db/delete-measures! (mapv :id measures)))))))

(mu/defn delete-measure! :- :int
  "Delete the Measure with `id` and publish its delete event, returning the number deleted."
  [id   :- ::lib.schema.id/measure
   opts :- ::measures.schema/write-opts]
  (delete-measures! [id] opts))

(defmethod mi/write-fns :model/Measure
  [_model]
  {:update! update-measure!
   :delete! delete-measures!})
