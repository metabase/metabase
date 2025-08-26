(ns metabase-enterprise.branching.models.branch-model-mapping
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/BranchModelMapping
  [_model] :branch_model_mapping)

(doto :model/Branch
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn resolve-branched-id
  "Given an original model ID and branch, return the branched ID if it exists"
  [model-type original-id branch-id]
  (or (t2/select-one-fn :branched_model_id :model/BranchModelMapping
                        :original_id original-id
                        :model_type (name model-type)
                        :branch_id branch-id)
      original-id))

(defn batch-resolve-branched-ids
  "Efficiently resolve multiple IDs for a branch"
  [model-type original-ids branch-id]
  (when (seq original-ids)
    (let [mappings (t2/select :model/BranchModelMapping
                              :model_type (name model-type)
                              :original_id [:in original-ids]
                              :branch_id branch-id)
          mapping-map (into {} (map (juxt :original_id :branched_model_id)) mappings)]
      (map #(get mapping-map % %) original-ids))))
