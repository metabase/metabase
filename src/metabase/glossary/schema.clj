(ns metabase.glossary.schema
  "Malli schemas for the glossary module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::glossary
  "A Glossary as selected from the app DB: every column of `:glossary`."
  [:merge
   ::glossary.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::glossary.partial
  "A Glossary row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::glossary [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::glossary.update
  "What an update (or insert) of a Glossary accepts: every column of `:glossary` except `id`, all optional."
  [:map {:closed true}
   [:entity_id  {:optional true} [:maybe ms/NonBlankString]]
   [:term       {:optional true} [:maybe :string]]
   [:definition {:optional true} [:maybe :string]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:creator_id {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::glossary.column
  "A column of `glossary`, for the `:columns` option of the queries in [[metabase.glossary.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::glossary.update))))
