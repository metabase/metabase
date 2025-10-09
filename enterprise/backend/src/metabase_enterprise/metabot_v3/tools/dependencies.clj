(ns metabase-enterprise.metabot-v3.tools.dependencies
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- format-broken-transforms
  "Format the breakages into a response suitable for Metabot."
  [{:keys [transform]}]
  (let [broken-transform-ids (keys transform)
        broken-transforms    (when (seq broken-transform-ids)
                               (t2/select [:model/Transform :id :name] :id [:in broken-transform-ids]))
        transforms-by-id     (u/index-by :id broken-transforms)]
    {:success        (empty? broken-transform-ids)
     :bad_transforms (reduce
                      (fn [acc [transform-id errors]]
                        (let [transform (get transforms-by-id transform-id)]
                          (conj acc {:transform transform :errors errors})))
                      []
                      transform)}))

(defn check-transform-dependencies
  "Check a proposed edit to a SQL transform, and return transforms that will break.
  Takes a map with :id (required), :source (optional), and :target (optional) keys."
  [{:keys [id source]}]
  (try
    (let [result (if (= (keyword (:type source))
                        :query)
                   (let [database-id   (-> source :query :database)
                         base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
                         original      (lib.metadata/transform base-provider id)
                         transform     (cond-> original
                                         source (assoc :source source))
                         edits         {:transform [transform]}
                         breakages     (dependencies/errors-from-proposed-edits base-provider edits)]
                     (format-broken-transforms breakages))
                   ;; If this is a non-SQL query, we don't do any checks yet, so just return success
                   {:success true :bad_transforms []})]
      {:structured_output result})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
