(ns metabase-enterprise.transforms-python.schema
  "Malli schemas for the transforms-python module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::python-library
  "A PythonLibrary as selected from the app DB: every column of `:python_library`."
  [:merge
   ::python-library.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::python-library.columns
  "Every column of `:python_library` except `id`, all optional."
  [:map {:closed true}
   [:path       {:optional true} [:maybe :string]]
   [:source     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:entity_id  {:optional true} [:maybe :string]]])

(mr/def ::python-library.create
  "What an insert of a PythonLibrary accepts."
  (mut/select-keys (mr/schema ::python-library.columns) [:path :source :created_at :updated_at :entity_id]))

(mr/def ::python-library.update
  "What an update of a PythonLibrary accepts: no immutable columns."
  (mut/select-keys (mr/schema ::python-library.columns) [:path :source :updated_at]))

(mr/def ::python-library.partial
  "A PythonLibrary row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::python-library [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::python-library.column
  "A column of `python_library`, for the `:columns` option of the queries in [[metabase-enterprise.transforms-python.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::python-library.columns))))
