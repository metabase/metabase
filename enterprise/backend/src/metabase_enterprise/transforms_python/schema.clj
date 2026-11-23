(ns metabase-enterprise.transforms-python.schema
  "Malli schemas for the transforms-python module."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::python-library.request-path
  (mu/with-api-error-message
   [:enum "common" "common.py"]
   (deferred-tru "Invalid library path. Only ''common'' is currently supported.")))

(mr/def ::python-library.update
  "What an update of a PythonLibrary takes: its `:id` and the columns to change, every column of `:python_library`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:path       {:optional true} [:maybe :string]]
   [:source     {:optional true} [:maybe [:string {:decode/normalize lib.schema.common/normalize-string-key}]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id  {:optional true} [:maybe :string]]
   [:is_default {:optional true} [:maybe :boolean]]])

(mr/def ::python-library
  "A PythonLibrary as selected from the app DB: every column of `:python_library`."
  ::python-library.update)

(mr/def ::python-library.create
  "What creating a PythonLibrary takes: its path and source, and the entity id and default flag of a built-in one."
  [:map {:closed true}
   [:path       :string]
   [:source     [:string {:decode/normalize lib.schema.common/normalize-string-key}]]
   [:entity_id  {:optional true} [:maybe :string]]
   [:is_default {:optional true} [:maybe :boolean]]])

(mr/def ::external-python-library
  "A PythonLibrary as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::python-library [:path :source :entity_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
