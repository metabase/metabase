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
  [card]
  (let [dataset-query (:dataset_query card)]
    (when (lib-be/should-upgrade-field-refs-in-query? dataset-query)
      (let [dataset-query' (lib-be/upgrade-field-refs-in-query dataset-query)]
        (when (not= dataset-query dataset-query')
          (t2/update! :model/Card (:id card) {:dataset_query dataset-query'}))
        (dashboard-card-upgrade-field-refs! dataset-query' (:id card))))))

(defn- transform-upgrade-field-refs!
  [transform]
  (let [source (:source transform)]
    (when (= :query (:type source))
      (let [query (:query source)
            query' (lib-be/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  [segment]
  (let [definition  (:definition segment)
        definition' (lib-be/upgrade-field-refs-in-query definition)]
    (when (not= definition definition')
      (t2/update! :model/Segment (:id segment) {:definition definition'}))))

(defn- measure-upgrade-field-refs!
  [measure]
  (let [definition  (:definition measure)
        definition' (lib-be/upgrade-field-refs-in-query definition)]
    (when (not= definition definition')
      (t2/update! :model/Measure (:id measure) {:definition definition'}))))

(defn upgrade!
  "Upgrade field refs in an entity object.

  The entity can be:
  - A card map with :dataset_query
  - A transform map with :source
  - A segment map with :definition
  - A measure map with :definition
  - nil or other (no-op)"
  [entity]
  (when entity
    (cond
      ;; Card (has dataset_query)
      (:dataset_query entity)
      (card-upgrade-field-refs! entity)

      ;; Transform (has source)
      (and (:source entity) (:id entity))
      (transform-upgrade-field-refs! entity)

      ;; Segment (has definition and typically comes from :model/Segment)
      ;; We differentiate from measure by checking if it has :table_id (segments do, measures might not)
      (and (:definition entity)
           (:table_id entity)
           (not (:aggregation entity))) ; measures have :aggregation in definition
      (segment-upgrade-field-refs! entity)

      ;; Measure (has definition)
      (:definition entity)
      (measure-upgrade-field-refs! entity)

      ;; Dashboard, document, table, or nil - no-op
      :else
      :do-nothing)))
