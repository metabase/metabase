(ns metabase-enterprise.transforms-python.schema
  "Malli schemas for the transforms-python module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::python-library
  "A PythonLibrary as selected from the app DB: every column of `:python_library`."
  [:merge
   ::python-library.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::python-library.update
  "What an update (or insert) of a PythonLibrary accepts: every column of `:python_library` except `id`, all optional."
  [:map {:closed true}
   [:path       {:optional true} [:maybe :string]]
   [:source     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id  {:optional true} [:maybe :string]]])

(mr/def ::external-python-library
  "A PythonLibrary as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::python-library [:path :source :entity_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
