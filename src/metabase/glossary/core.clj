(ns metabase.glossary.core
  "API namespace for the glossary module. Every glossary write goes through here, whatever the caller (REST API, MCP tools, and so on)."
  (:require
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

(mu/defn entries :- [:sequential ::glossary.schema/glossary]
  "Every glossary entry, in term order."
  []
  (glossary.db/glossary-entries nil))

(mu/defn create-entry! :- ::glossary.schema/glossary
  "Insert a glossary entry created by `user-id`, returning the new entry."
  [user-id                   :- ::lib.schema.id/user
   {:keys [term definition]} :- ::entry-fields]
  (glossary.db/insert-glossary-entry! {:term       term
                                       :definition definition
                                       :creator_id user-id}))

(mu/defn update-entry! :- [:maybe ::glossary.schema/glossary]
  "Set the term and definition of the glossary entry with `id`, returning the updated entry, or nil when no entry has
  `id`."
  [id                        :- ms/PositiveInt
   {:keys [term definition]} :- ::entry-fields]
  (when (glossary.db/glossary-entry id)
    (glossary.db/update-glossary-entry! id term definition)
    (glossary.db/glossary-entry id)))

(mu/defn delete-entry! :- [:maybe ::glossary.schema/glossary]
  "Delete the glossary entry with `id`, returning the deleted entry, or nil when no entry has `id`."
  [id :- ms/PositiveInt]
  (when-let [entry (glossary.db/glossary-entry id)]
    (glossary.db/delete-glossary-entry! id)
    entry))
