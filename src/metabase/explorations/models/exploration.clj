(ns metabase.explorations.models.exploration
  (:require
   [clojure.string :as str]
   [metabase.models.interface :as mi]
   [metabase.search.spec :as search.spec]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ExplorationName
  "Validations for the name of an exploration. Mirrors `DocumentName`: non-blank, capped at 254
  characters."
  (mu/with-api-error-message
   [:and
    {:error/message "invalid exploration name"
     :json-schema   {:type "string" :minLength 1 :maxLength 254}}
    [:string {:min 1 :max 254}]
    [:fn
     {:error/message "invalid exploration name"}
     (complement str/blank?)]]
   (deferred-tru "value must be a non-blank string between 1 and 254 characters.")))

(methodical/defmethod t2/table-name :model/Exploration [_model] :exploration)

(doto :model/Exploration
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :creator]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                      :id (keep :creator_id explorations))
   :creator_id
   {:default {}}))

(methodical/defmethod t2/batched-hydrate [:model/Exploration :threads]
  [_model k explorations]
  (mi/instances-with-hydrated-data
   explorations k
   #(group-by :exploration_id
              (t2/select :model/ExplorationThread
                         :exploration_id [:in (map :id explorations)]
                         {:order-by [[:position :asc] [:id :asc]]}))
   :id
   {:default []}))

;;; ----------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "exploration"
  {:model :model/Exploration
   :attrs {:archived :archived
           :collection-id :collection_id
           :creator-id :creator_id
           :created-at :created_at
           :updated-at :updated_at
           :pinned [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]}
   :search-terms [:name :description]
   :joins {:collection [:model/Collection [:= :collection.id :this.collection_id]]}
   :render-terms {:exploration-name :name
                  :exploration-id :id
                  :collection-authority_level :collection.authority_level
                  :collection-location        :collection.location
                  :collection-name            :collection.name
                  :collection-position        true
                  :collection-type            :collection.type
                  :archived-directly          true}})
