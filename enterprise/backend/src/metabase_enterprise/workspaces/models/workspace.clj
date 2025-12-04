(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private type->t2-selector "Models supported by workspaces"
  {:transform :model/Transform})
(def ^:private type->t2-fields "Fields that are returned as part of the workspace contents"
  {:transform [:id :name :description :source :target :source_type
               :creator_id :collection_id
               :created_at :updated_at]})
(def ^:private type->mapping "Mapping models for supported models"
  {:transform :model/WorkspaceMappingTransform})
(def ^:private type->grouping "How models are grouped in lists"
  {:transform :transforms})

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(t2/deftransforms :model/Workspace
  {:graph            mi/transform-json
   :database_details mi/transform-encrypted-json})

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- field [table field-name]
  (keyword (name table) (name field-name)))

(defn- entities [entity-type ids]
  (let [t2-model (type->t2-selector entity-type)
        t2-table (t2/table-name t2-model)
        mapping  (t2/table-name (type->mapping entity-type))]
    (->> (t2/select (concat [t2-model] (type->t2-fields entity-type)
                            [(field t2-table :workspace_id) (field mapping :upstream_id)])
                    (field t2-table :workspace_id) [:in ids]
                    {:left-join [mapping [:= (field mapping :downstream_id) (field t2-table :id)]]})
         (mapv (fn [e] (assoc e :type entity-type))))))

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
