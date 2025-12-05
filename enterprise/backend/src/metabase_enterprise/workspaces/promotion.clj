(ns metabase-enterprise.workspaces.promotion
  "Functionality for promoting workspace transforms back to main Metabase."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- find-upstream-xf
  "Find the original transform that was mirrored into this workspace.
   Uses the workspace_mapping_transform table to find the upstream transform."
  [xf workspace-id]
  (or (when-let [mapping (t2/select-one :model/WorkspaceMappingTransform
                                        :downstream_id (:id xf)
                                        :workspace_id workspace-id)]
        (t2/select-one :model/Transform :id (:upstream_id mapping)))
      (throw (ex-info "Original transform not found" {:transform-id (:id xf)
                                                      :workspace-id workspace-id}))))

(defn- promote-single-transform!
  "Promote a single workspace transform to replace its original.
   Returns a map with :id, :name, and :status."
  [{:keys [target] :as downstream-xf} upstream-xf new->old-s+n]
  (try
    ;; TODO assert database is what we expect
    (assert (= "table" (:type target)) "Only table targets are supported for promotion.")
    (let [upstream-id (:id upstream-xf)
          actual      (or (new->old-s+n (select-keys target [:schema :name]))
                          (select-keys (:target upstream-xf) [:schema :name]))
          _           (assert (:name actual) "Unable to find the upstream table to sub for the isolated one.")
          remapped-xf (-> downstream-xf
                          ;; TODO: do query remapping here, if the transform is dependent on an isolated table.
                          ;;   ... with the current FE this is not possible! :-D
                          (update :target merge actual))
          ;; TODO revisit whether there are any other fields we want
          updates     (select-keys remapped-xf [:name :description :source :target])]
      (log/infof "Promoting transform %d -> %d: %s" (:id downstream-xf) upstream-id (:name upstream-xf))
      (t2/update! :model/Transform upstream-id updates)
      (assoc updates :id upstream-id))
    (catch Throwable e
      (log/errorf e "Failed to promote transform %s" (:name downstream-xf))
      {:id    (:id downstream-xf)
       :name  (:name downstream-xf)
       :error (ex-message e)})))

(defn- transform-ids [graph]
  (->> (:transforms graph) (keep :mapping) (mapv :id)))

(defn promote-transforms!
  "Promote all transforms in a workspace back to main Metabase.

   This will:
   1. Get all workspace transforms
   2. Order them by dependencies (using the workspace graph)
   3. For each transform:
      - Find the original transform
      - Update it with the workspace version's definition
      - Re-execute it in the original schema

   Returns a map with:
   - :promoted - sequence of {:id, :name} maps
   - :errors - any transforms that failed to promote"
  [ws]
  (log/infof "Starting promotion of transforms from workspace %s" (:id ws))

  (let [ids             (transform-ids (:graph ws))
        xs              (if (seq ids)
                          (t2/select :model/Transform :id [:in ids])
                          ;; fallback for when there is no graph
                          (t2/select :model/Transform :workspace_id (:id ws)))
        _               (log/infof "Found %d workspace transforms to promote" (count xs))
        new->old-s+n    (u/for-map [{:keys [old_schema old_name new_schema new_name]}
                                    (t2/query {:select [[:t1.schema :old_schema]
                                                        [:t1.name :old_name]
                                                        [:t2.schema :new_schema]
                                                        [:t2.name :new_name]]
                                               :from   [[(t2/table-name :model/WorkspaceMappingTable) :m]
                                                        [(t2/table-name :model/Table) :t1]
                                                        [(t2/table-name :model/Table) :t2]]
                                               :where  [:and
                                                        [:= :m.workspace_id (:id ws)]
                                                        [:= :t1.id :m.upstream_id]
                                                        [:= :t2.id :m.downstream_id]]})]
                          [{:schema new_schema :name new_name}
                           {:schema old_schema :name old_name}])
        results         (for [xf xs
                              :let [upstream-xf (find-upstream-xf xf (:id ws))]]
                          (promote-single-transform! xf upstream-xf new->old-s+n))
        {promoted false
         errors   true} (group-by #(contains? % :error) results)]

    (log/infof "Promotion complete. %d succeeded, %d failed"
               (count promoted)
               (count errors))

    {:promoted promoted
     :errors   errors}))

(comment
  (let [ws {:id 836}]
    (t2/query {:select [[:t1.schema :old_schema]
                        [:t1.name :old_name]
                        [:t2.schema :new_schema]
                        [:t2.name :new_name]]
               :from   [[(t2/table-name :model/WorkspaceMappingTable) :m]
                        [(t2/table-name :model/Table) :t1]
                        [(t2/table-name :model/Table) :t2]]
               :where  [:and
                        [:= :m.workspace_id (:id ws)]
                        [:= :t1.id :m.upstream_id]
                        [:= :t2.id :m.downstream_id]]}))

  (promote-transforms! (t2/select-one :model/Workspace :id 836)))
