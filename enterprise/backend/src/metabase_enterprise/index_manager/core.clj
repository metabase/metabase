(ns metabase-enterprise.index-manager.core
  "Service layer for managed index requests: create / update / delete / read, with the GDGT-2602 ownership rule that
  a request may only target a Metabase-owned transform output (enforced by requiring an existing `:transform_id`).

  HTTP concerns (auth, request shape) live in [[metabase-enterprise.index-manager.api]]; this namespace is the
  testable surface and the seam the run-path will read from later."
  (:require
   [metabase-enterprise.index-manager.models :as models]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-transform-exists!
  "A managed hint may only target a transform-owned table, so its `transform-id` must reference a real transform."
  [transform-id]
  (when-not (t2/exists? :model/Transform :id transform-id)
    (throw (ex-info (tru "Transform {0} does not exist." transform-id)
                    {:status-code 404, :transform-id transform-id}))))

(defn- index-name
  "Physical index name for a structured index. Named kinds carry their own `:name`; inline kinds without one
  (sortkey, order-by, distkey) get a stable per-transform name from their `:kind`, so a table holds at most one of
  each (enforced by the unique `(transform_id, index_name)` constraint)."
  [structured]
  (or (:name structured) (name (:kind structured))))

(defn create-request!
  "Create a `:pending` index request binding `structured` to `transform-id`. Returns the inserted instance."
  [transform-id structured & {:keys [created-by]}]
  (check-transform-exists! transform-id)
  (let [structured (models/validate-structured! structured)]
    (t2/insert-returning-instance! :model/IndexRequest
                                   {:transform_id transform-id
                                    :index_name   (index-name structured)
                                    :structured   structured
                                    :status       :pending
                                    :created_by   created-by})))

(defn update-request!
  "Replace the `structured` definition of an existing request, resetting it to `:pending`. Returns the updated
  instance, or nil if no such request."
  [id structured]
  (when (t2/exists? :model/IndexRequest :id id)
    (let [structured (models/validate-structured! structured)]
      (t2/update! :model/IndexRequest id {:structured    structured
                                          :index_name    (index-name structured)
                                          :status        :pending
                                          :error_message nil})
      (t2/select-one :model/IndexRequest :id id))))

(defn delete-request!
  "Delete an index request. Returns true if a row was removed.

  Hard delete for now: nothing applies these to the warehouse yet, so there is no physical index to drop. Once the
  run-path lands, delete may shift to marking `:dropped` so a subsequent run can issue the physical DROP."
  [id]
  (pos? (t2/delete! :model/IndexRequest :id id)))

(defn requests-for-transform
  "All index requests for a transform, oldest first."
  [transform-id]
  (t2/select :model/IndexRequest :transform_id transform-id {:order-by [[:id :asc]]}))
