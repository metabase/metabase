(ns metabase-enterprise.replacement.field-refs
  (:require
   [clojure.walk :as clojure.walk]
   [metabase.lib-be.core :as lib-be]
   [metabase.models.visualization-settings :as vs]
   [toucan2.core :as t2]))

;; I tried putting the various {dashboard-card,card,transform}-upgrade-field-refs! functions in the respective models
;; namespaces, but there were cyclical dependencies.

(defn- upgrade-column-settings-keys
  "Given a card's dataset_query (pMBQL) and a column_settings map (from visualization_settings),
  return a new column_settings map with upgraded parameter-mapping. Keys are JSON-encoded strings."
  [query column-settings]
  (clojure.walk/postwalk
   (fn [form]
     ;; some forms don't get converted to keywords, so hack it
     (if (and (vector? form)
              (= "dimension" (first form)))
       (try
         (let [dim (-> form
                       (update 0 keyword)
                       (update-in [1 0] keyword)
                       (update-in [1 2 :base-type] keyword))]
           (lib-be/upgrade-field-ref-in-parameter-target query dim))
         (catch Exception _
           form))
       form))
   column-settings))

(defn- upgrade-parameter-mappings
  [query parameter-mapping]
  (update parameter-mapping :target #(lib-be/upgrade-field-ref-in-parameter-target query %)))

(defn- dashboard-card-upgrade-field-refs!
  [query card-id]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (let [viz (vs/db->norm (:visualization_settings dashcard))
          column-settings (::vs/column-settings viz)
          column-settings' (upgrade-column-settings-keys query column-settings)
          parameter-mappings (:parameter_mappings dashcard)
          parameter-mappings' (mapv #(upgrade-parameter-mappings query %) parameter-mappings)
          changes (cond-> {}
                    (not= column-settings column-settings')
                    (merge {:visualization_settings (-> viz
                                                        (assoc ::vs/column-settings column-settings')
                                                        vs/norm->db)})

                    (not= parameter-mappings parameter-mappings')
                    (merge {:parameter_mappings parameter-mappings'}))]
      (when (seq changes)
        (t2/update! :model/DashboardCard (:id dashcard) changes)))))

(defn- card-upgrade-field-refs!
  [card-id]
  (let [dataset-query (t2/select-one-fn :dataset_query :model/Card card-id)
        dataset-query' (lib-be/upgrade-field-refs-in-query dataset-query)]
    (when (not= dataset-query dataset-query')
      (t2/update! :model/Card card-id {:dataset_query dataset-query'}))
    (dashboard-card-upgrade-field-refs! dataset-query' card-id)))

(defn- transform-upgrade-field-refs!
  [transform-id]
  (let [source (t2/select-one-fn :source :model/Transform transform-id)]
    (when (= :query (:type source))
      (let [query (:query source)
            query' (lib-be/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform transform-id {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  [segment-id]
  (let [definition  (t2/select-one-fn :definition :model/Segment segment-id)
        definition' (lib-be/upgrade-field-refs-in-query definition)]
    (when (not= definition definition')
      (t2/update! :model/Segment segment-id {:definition definition'}))))

(defn- measure-upgrade-field-refs!
  [measure-id]
  (let [definition  (t2/select-one-fn :definition :model/Measure measure-id)
        definition' (lib-be/upgrade-field-refs-in-query definition)]
    (when (not= definition definition')
      (t2/update! :model/Measure measure-id {:definition definition'}))))

(defn upgrade!
  [[entity-type entity-id]]
  (case entity-type
    :card
    (card-upgrade-field-refs! entity-id)

    :transform
    (transform-upgrade-field-refs! entity-id)

    :segment
    (segment-upgrade-field-refs! entity-id)

    :measure
    (measure-upgrade-field-refs! entity-id)

    (:dashboard :document :table)
    :do-nothing))
