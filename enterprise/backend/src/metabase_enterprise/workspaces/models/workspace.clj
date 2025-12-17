(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase.models.interface :as mi]
   [metabase.util.json :as json]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private type->grouping "How models are grouped in lists"
  ;; do not forget to update `entities` if you add stuff here
  {:transform :transforms})

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:graph            mi/transform-json
   :database_details mi/transform-encrypted-json
   :status           mi/transform-keyword})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- entities [entity-type ids]
  (->> (case entity-type
         :transform
         (t2/select [:model/Transform
                     :id :name :description :source :target :source_type :creator_id :collection_id
                     :created_at :updated_at :transform.workspace_id :wmt.upstream_id
                     [:upstream.target :upstream]]
                    :transform.workspace_id [:in ids]
                    {:left-join [[:workspace_mapping_transform :wmt] [:= :wmt.downstream_id :transform.id]
                                 [:transform :upstream]              [:= :upstream.id :wmt.upstream_id]]
                     :order-by [:id]}))
       (mapv #(-> %
                  (update :upstream json/decode+kw)
                  (assoc :type entity-type)))))

(defn- ws-contents [ids]
  (fn []
    (->> (mapcat #(entities % ids) (keys type->grouping))
         (reduce (fn [acc e]
                   (update-in acc [(:workspace_id e) (type->grouping (:type e))] (fnil conj []) e))
                 {}))))

(methodical/defmethod t2/batched-hydrate [:model/Workspace :contents]
  "Batch hydrate `Workspace` contents"
  [_model k wses]
  (let [ids (mapv :id wses)]
    (mi/instances-with-hydrated-data wses k (ws-contents ids) :id {:default {}})))

(defn archive!
  "Archive a workspace. Destroys database isolation resources, revokes access grants, and sets archived_at."
  [workspace]
  (let [database     (t2/select-one :model/Database (:database_id workspace))
        workspace-id (:id workspace)]
    (ws.isolation/destroy-workspace-isolation! database workspace)
    ;; Mark all inputs as ungranted since the user was dropped
    (t2/update! :model/WorkspaceInput {:workspace_id workspace-id}
                {:access_granted false})
    (t2/update! :model/Workspace workspace-id {:archived_at [:now]})))

(defn unarchive!
  "Unarchive a workspace. Re-initializes database isolation resources, re-grants read access
   to source tables, and clears archived_at."
  [workspace]
  (let [database         (t2/select-one :model/Database (:database_id workspace))
        isolation-result (ws.isolation/ensure-database-isolation! workspace database)
        workspace-id     (:id workspace)
        _                (t2/update! :model/Workspace workspace-id
                                     (merge {:archived_at nil}
                                            (select-keys isolation-result [:schema :database_details])))
        ;; Re-fetch workspace to get updated database_details and schema for granting permissions
        updated-ws       (t2/select-one :model/Workspace workspace-id)]
    ;; Re-grant read access to source tables (inputs were marked ungranted during archive)
    (ws.impl/sync-grant-accesses! updated-ws)))

(defn delete!
  "Delete a workspace. Destroys database isolation resources and deletes the workspace."
  [workspace]
  (let [database (t2/select-one :model/Database (:database_id workspace))]
    (ws.isolation/destroy-workspace-isolation! database workspace)
    (t2/update! :model/WorkspaceInput {:workspace_id (:id workspace)}
                {:access_granted false})
    (t2/delete! :model/Workspace (:id workspace))))
