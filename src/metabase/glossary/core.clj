(ns metabase.glossary.core
  "API namespace for the glossary module. Every glossary write goes through here so that each one publishes its
  `:event/glossary-*` event regardless of the caller (REST API, MCP tools, and so on)."
  (:require
   [metabase.events.core :as events]
   [metabase.glossary.db :as glossary.db]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::entry-fields
  [:map {:closed true}
   [:term       ms/NonBlankString]
   [:definition ms/NonBlankString]])

(mu/defn create-entry! :- ::glossary.schema/glossary
  "Insert a glossary entry created by `user-id` and publish `:event/glossary-create`. Returns the new entry."
  [user-id                   :- ::lib.schema.id/user
   {:keys [term definition]} :- ::entry-fields]
  (let [entry (glossary.db/insert-glossary-entry! {:term       term
                                                   :definition definition
                                                   :creator_id user-id})]
    (events/publish-event! :event/glossary-create {:object entry :user-id user-id})
    entry))

(mu/defn update-entry! :- [:maybe ::glossary.schema/glossary]
  "Set the term and definition of the glossary entry with `id` on behalf of `user-id` and publish
  `:event/glossary-update`. Returns the updated entry, or nil when no entry has `id`."
  [user-id                   :- ::lib.schema.id/user
   id                        :- ms/PositiveInt
   {:keys [term definition]} :- ::entry-fields]
  (when-let [previous (glossary.db/glossary-entry id)]
    (glossary.db/update-glossary-entry! id term definition)
    (let [entry (glossary.db/glossary-entry id)]
      (events/publish-event! :event/glossary-update {:object          entry
                                                     :previous-object previous
                                                     :user-id         user-id})
      entry)))

(mu/defn delete-entry! :- [:maybe ::glossary.schema/glossary]
  "Delete the glossary entry with `id` on behalf of `user-id` and publish `:event/glossary-delete`. Returns the
  deleted entry, or nil when no entry has `id`."
  [user-id :- ::lib.schema.id/user
   id      :- ms/PositiveInt]
  (when-let [entry (glossary.db/glossary-entry id)]
    (glossary.db/delete-glossary-entry! id)
    (events/publish-event! :event/glossary-delete {:object entry :user-id user-id})
    entry))
