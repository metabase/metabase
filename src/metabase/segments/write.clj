(ns metabase.segments.write
  "The write functions of Segments, through which every writer creates, updates and deletes them."
  (:require
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.segments.db :as segments.db]
   [metabase.segments.schema :as segments.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn definition-table-id
  "The id of the Table `definition`, a full query, is built on."
  [definition]
  (lib/primary-source-table-id (lib-be/normalize-query definition)))

(defn check-definition
  "Throws unless `definition` is a full query that fits a Segment."
  [definition]
  (when-not (and (seq definition)
                 (#{:mbql-version/mbql5 :mbql-version/legacy} (lib/normalized-mbql-version definition)))
    (throw (ex-info (tru "Segment definition must be a full query with a source table.") {:status-code 400})))
  (mu/validate-throw ::segments.schema/definition (lib-be/normalize-query definition)))

(defenterprise delete-segment-tests!
  "Delete the tests of the segment `segment-id` through Toucan, so that each test's delete hook runs. No-op in OSS."
  metabase-enterprise.data-testing.models.segment-test
  [_segment-id]
  nil)

(defn- changed
  "The columns of `changes` whose values differ from those of `segment`."
  [segment changes]
  (into {} (remove (fn [[k v]] (= v (get segment k)))) changes))

(defn- check-changes
  "Throws unless `changes`, the changed columns of the Segment with `id`, are an update a Segment allows."
  [id changes]
  (when (contains? changes :creator_id)
    (throw (ex-info (tru "You cannot change the creator of a Segment.") {:status-code 400})))
  (when (and (contains? changes :table_id) (not (contains? changes :definition)))
    (throw (ex-info (tru "The table of a Segment follows its definition; change the definition instead.") {:status-code 400})))
  (when (contains? changes :definition)
    (check-definition (:definition changes))
    (lib/check-segment-overwrite id (lib-be/normalize-query (:definition changes)))))

(defn- with-derived-columns
  "`changes` with the table that follows a new definition and the time of the update."
  [changes]
  (cond-> changes
    (contains? changes :definition)       (assoc :table_id (definition-table-id (:definition changes)))
    (not (contains? changes :updated_at)) (assoc :updated_at (mi/now))))

(mu/defn create-segment!
  "Insert `segment`, whose after-insert hook publishes its create event, returning the inserted Segment."
  [{:keys [creator_id name description definition]} :- ::segments.schema/segment.create]
  (events/with-batched-events
    (segments.db/insert-segment! creator_id name description definition)))

(mu/defn update-segment! :- :int
  "Apply `changes` to `segment-or-id`, a Segment the caller already loaded or the id of one, and publish its update
  event, returning the number of Segments updated; for the REST API, revision revert, replacement and the SerDes
  import, whose `:import?` changes nothing, as master's hooks checked imports too."
  [segment-or-id :- [:or ::lib.schema.id/segment :map]
   changes       :- ::segments.schema/segment.input
   opts          :- ::segments.schema/write-opts]
  (let [segment (if (map? segment-or-id) segment-or-id (segments.db/segment segment-or-id))
        id      (:id segment)
        changes (when segment (changed segment changes))]
    (if (empty? changes)
      0
      (do
        (check-changes id changes)
        (let [changes (with-derived-columns changes)]
          (events/with-event-context (select-keys opts [:revision-message])
            (events/with-batched-events
              (u/prog1 (segments.db/update-segment! id changes)
                (events/updated! :model/Segment (merge segment changes) segment)))))))))

(mu/defn delete-segments! :- :int
  "Delete the Segments with `ids` and their tests and publish their delete events, returning the number deleted; for
  remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ::lib.schema.id/segment]]
   _opts :- ::segments.schema/write-opts]
  (let [segments (when (seq ids) (segments.db/segments ids))]
    (if (empty? segments)
      0
      (events/with-batched-events
        (events/deleting! :model/Segment segments
                          (fn []
                            (run! (comp delete-segment-tests! :id) segments)
                            (segments.db/delete-segments! (mapv :id segments))))))))

(mu/defn delete-segment! :- :int
  "Delete the Segment with `id` and its tests and publish its delete event, returning the number deleted."
  [id   :- ::lib.schema.id/segment
   opts :- ::segments.schema/write-opts]
  (delete-segments! [id] opts))

(defmethod mi/write-fns :model/Segment
  [_model]
  {:update! update-segment!
   :delete! delete-segments!})
