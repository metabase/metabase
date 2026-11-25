(ns metabase.explorations.models.exploration-page
  "A page within a block: the bundle of queries that appear together on one page
   (currently, those that share a card, dimension, and query_type)."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationPage [_model] :exploration_page)

(doto :model/ExplorationPage
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationPage :can_read]
  "Add whether the current user can read each ExplorationPage, which is whether they can read its parent."
  [_model k instances]
  (exploration/hydrate-can-read-from-parents k instances :exploration_block_id :model/ExplorationBlock))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationPage :can_write]
  "Add whether the current user can write each ExplorationPage, which is whether they can write its parent."
  [_model k instances]
  (exploration/hydrate-can-write-from-parents k instances :exploration_block_id :model/ExplorationBlock))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-pages! :- [:sequential (ms/InstanceOf :model/ExplorationPage)]
  "Insert the ExplorationPage `rows` and return the new instances, in the order of `rows`."
  [rows :- [:sequential ::explorations.schema/exploration-page.create]]
  (app-db/create-batched! :model/ExplorationPage rows {}))

(mu/defn update-pages! :- :nil
  "Apply `updates`, each the `:id` of an ExplorationPage with the columns to give it, in one transaction."
  [updates :- [:sequential ::explorations.schema/exploration-page.update]]
  (app-db/update-batched! :model/ExplorationPage updates {}))

(mu/defn delete-pages! :- :nil
  "Delete the ExplorationPages with `page-ids` in one transaction."
  [page-ids :- [:sequential ms/PositiveInt]]
  (app-db/delete-batched! :model/ExplorationPage page-ids {}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ExplorationPage [_model]
  {:skip? false})
