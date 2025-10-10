(ns metabase-enterprise.metabot-v3.tools.dependencies
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.lib-be.metadata.jvm :as lib-be.metadata.jvm]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private ^:dynamic *max-reported-broken-transforms* 10)

(defn- format-broken-transforms
  "Format the breakages into a response suitable for Metabot."
  [edited-transform-id {transform-errors :transform}]
  (let [broken-transform-ids (set (keys transform-errors))
        ;; Limit the number of broken transforms we report back to avoid overwhelming context
        transforms-to-report (if (contains? transform-errors edited-transform-id)
                               (concat [edited-transform-id]
                                       (take (dec *max-reported-broken-transforms*)
                                             (disj broken-transform-ids edited-transform-id)))
                               (take *max-reported-broken-transforms* broken-transform-ids))
        broken-transforms    (when (seq broken-transform-ids)
                               (t2/select [:model/Transform :id :name] :id [:in transforms-to-report]))
        transforms-by-id     (u/index-by :id broken-transforms)]
    {:success             (empty? broken-transform-ids)
     :bad_transform_count (count broken-transform-ids)
     :bad_transforms      (mapv
                           (fn [[transform-id transform]]
                             {:transform transform :errors (get transform-errors transform-id)})
                           transforms-by-id)}))

(defn check-transform-dependencies
  "Check a proposed edit to a SQL transform, and return transforms that will break in a format
  suitable for Metabot. Takes a map with :id and :source keys."
  [{:keys [id source]}]
  (try
    (let [result (if (= (keyword (:type source)) :query)
                   (let [database-id   (-> source :query :database)
                         base-provider (lib-be.metadata.jvm/application-database-metadata-provider database-id)
                         original      (lib.metadata/transform base-provider id)
                         transform     (cond-> original
                                         source (assoc :source source))
                         edits         {:transform [transform]}
                         breakages     (dependencies/errors-from-proposed-edits base-provider edits)]
                     (format-broken-transforms id breakages))
                   ;; If this is a non-SQL query, we don't do any checks yet, so just return success
                   {:success true :bad_transforms []})]
      {:structured_output result})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
