(ns metabase.metabot.models.search-prompt-entity
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SearchPromptEntity [_model] :search_prompt_entities)

(doto :model/SearchPromptEntity
  (derive :metabase/model))

(t2/deftransforms :model/SearchPromptEntity
  {:entities mi/transform-json})
