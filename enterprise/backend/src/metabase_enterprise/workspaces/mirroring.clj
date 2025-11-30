(ns metabase-enterprise.workspaces.mirroring
  (:require
   [metabase-enterprise.workspaces.context :as ws.ctx]
   [metabase-enterprise.workspaces.isolation :as ws.isolation]
   [metabase-enterprise.workspaces.remap :as ws.remap]
   [toucan2.core :as t2]))

(def ^:private transform-mirrored-keys
  #{:description :name :source :target :source_type})

(defn- mirror-data
  [transform-node ctx workspace-id]
  (merge {:workspace_id workspace-id}
         (select-keys (ws.ctx/transform-node->data ctx transform-node)
                      transform-mirrored-keys)
         (ws.remap/remap-for-transform transform-node ctx)))

;; TODO (lbrdnk 2025-11-26): Make this logic pure, move inserts upstream into single insert.
(defn- mirror-transform!
  "Create the mirroring transform and transform mapping rows for a single transform."
  [workspace ctx transform-node]
  (let [mirror-data (mirror-data transform-node ctx (:id workspace))
        mirror (t2/insert-returning-instance! :model/Transform mirror-data)
        ;; TODO (lbrdnk 2025-11-26): Strong gut feeling we want "mapping" represented differently.
        ;;                           Motivation: Transforms _created_ in the workspace have no "original" map in graph
        ;;                                       where they could live. Having some transforms in "mapping" and some
        ;;                                       elsewhere feels dirty.
        graph-node (assoc transform-node :mapping (select-keys mirror [:id :name]))]
    (t2/insert! :model/WorkspaceMappingTransform
                {:upstream_id   (:id transform-node)
                 :downstream_id (:id mirror)
                 :workspace_id  (:id workspace)})
    (update-in ctx [:graph :transforms] #(conj (or % []) graph-node))))

(defn- mirror-transforms!
  [workspace ctx]
  (reduce #(mirror-transform! workspace %1 %2)
          (update ctx :graph dissoc :transforms)
          (-> ctx :graph :transforms)))

(defn mirror-entities!
  "TODO (lbrdnk): Add docstring."
  [workspace database graph]
  (let [ctx (ws.ctx/->context-with-resources graph)]
    (->> ctx
         (ws.isolation/create-isolated-output-tables! workspace database)
         (mirror-transforms! workspace)
         :graph)))
