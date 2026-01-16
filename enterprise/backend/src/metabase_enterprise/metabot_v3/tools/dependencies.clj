(ns metabase-enterprise.metabot-v3.tools.dependencies
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(def ^:private ^:dynamic *max-reported-broken-transforms* 10)

(defn- format-broken-transforms
  "Format the breakages into a response suitable for Metabot."
  [edited-transform-id {transform-errors :transform
                        card-errors      :card}]
  (let [broken-transform-ids (set (keys transform-errors))
        ;; Limit the number of broken transforms/cards we report back to avoid overwhelming context
        transforms-to-report (if (contains? transform-errors edited-transform-id)
                               (concat [edited-transform-id]
                                       (take (dec *max-reported-broken-transforms*)
                                             (disj broken-transform-ids edited-transform-id)))
                               (take *max-reported-broken-transforms* broken-transform-ids))
        broken-transforms    (when (seq transforms-to-report)
                               (->> (t2/select :model/Transform :id [:in transforms-to-report])
                                    (filter mi/can-read?)
                                    (map #(select-keys % [:id :name]))))
        broken-card-ids      (set (keys card-errors))
        cards-to-report      (take *max-reported-broken-transforms* broken-card-ids)
        broken-cards         (when (seq cards-to-report)
                               (->> (t2/select :model/Card :id [:in cards-to-report])
                                    (filter mi/can-read?)
                                    (map #(select-keys % [:id :name]))))]
    {:success             (empty? broken-transform-ids)
     :bad_transform_count (count broken-transform-ids)
     :bad_transforms      (mapv
                           (fn [transform]
                             {:transform transform :errors (get transform-errors (:id transform))})
                           broken-transforms)
     ;; Use "question" terminology rather than "card" to avoid confusing Metabot
     :bad_question_count  (count broken-card-ids)
     :bad_questions       (when (seq broken-card-ids)
                            (mapv (fn [card]
                                    {:question card :errors (get card-errors (:id card))})
                                  broken-cards))}))

(defn check-transform-dependencies
  "Check a proposed edit to a SQL transform, and return transforms that will break in a format
  suitable for Metabot. Takes a map with :id and :source keys."
  [{:keys [id source]}]
  (try
    (let [transform-to-check (api/check-404 (t2/select-one :model/Transform :id id))]
      (api/read-check transform-to-check)
      (let [result (if (= (keyword (:type source)) :query)
                     (let [database-id       (-> source :query :database)
                           base-provider     (lib-be/application-database-metadata-provider database-id)
                           metadata          (lib-be/instance->metadata transform-to-check :metadata/transform)
                           updated-metadata  (cond-> metadata
                                               source (assoc :source source))
                           edits             {:transform [updated-metadata]}
                           breakages         (dependencies/errors-from-proposed-edits edits
                                                                                      :base-provider base-provider
                                                                                      :include-native? true)]
                       (format-broken-transforms id breakages))
                     ;; If this is a non-SQL query, we don't do any checks yet, so just return success
                     {:success true :bad_transforms []})]
        {:structured_output result}))
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
