(ns metabase.glossary.write
  "The write functions of Glossary entries, through which every writer creates, updates and deletes them."
  (:require
   [metabase.events.core :as events]
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- changed
  "The columns of `changes` whose values differ from those of `entry`."
  [entry changes]
  (into {} (remove (fn [[k v]] (= v (get entry k)))) changes))

(mu/defn create-glossary!
  "Insert `entry`, whose after-insert hook publishes its create event, returning the inserted Glossary entry; for the
  REST API and the MCP tools."
  [entry :- ::glossary.schema/glossary.create]
  (events/with-batched-events
    (glossary.db/insert-glossary-entry! entry)))

(mu/defn update-glossary! :- :int
  "Apply `changes` to `entry-or-id`, a Glossary entry the caller already loaded or the id of one, and publish its
  update event, returning the number of entries updated; for the REST API, remote sync and the SerDes import."
  [entry-or-id :- [:or ms/PositiveInt :map]
   changes     :- ::glossary.schema/glossary.update
   opts        :- ::glossary.schema/write-opts]
  (let [entry   (if (map? entry-or-id) entry-or-id (glossary.db/glossary-entry entry-or-id))
        changes (when entry (changed entry changes))]
    (if (empty? changes)
      0
      (let [changes (cond-> changes
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-event-context (select-keys opts [:revision-message])
          (events/with-batched-events
            (u/prog1 (glossary.db/update-glossary-entry! (:id entry) changes)
              (events/updated! :model/Glossary (merge entry changes) entry))))))))

(mu/defn delete-glossaries! :- :int
  "Delete the Glossary entries with `ids` and publish their delete events, returning the number deleted; for the REST
  API, remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::glossary.schema/write-opts]
  (let [entries (when (seq ids) (glossary.db/glossary-entries-by-ids ids))]
    (if (empty? entries)
      0
      (events/with-batched-events
        (events/deleting! :model/Glossary entries
                          #(glossary.db/delete-glossary-entries! (mapv :id entries)))))))

(mu/defn delete-glossary! :- :int
  "Delete the Glossary entry with `id` and publish its delete event, returning the number deleted."
  [id   :- ms/PositiveInt
   opts :- ::glossary.schema/write-opts]
  (delete-glossaries! [id] opts))

(defmethod mi/write-fns :model/Glossary
  [_model]
  {:update! update-glossary!
   :delete! delete-glossaries!})
