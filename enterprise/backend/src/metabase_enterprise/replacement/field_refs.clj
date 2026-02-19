(ns metabase-enterprise.replacement.field-refs
  (:require
   [clojure.walk :as clojure.walk]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.models.visualization-settings :as vs]
   [toucan2.core :as t2]))

;; I tried putting the various {dashboard-card,card,transform}-upgrade-field-refs! functions in the respective models
;; namespaces, but there were cyclical dependencies.

(defn- upgrade-legacy-field-ref
  "Given a card's dataset_query (pMBQL) and a legacy field ref
  ([\"field\" 42 {...}]), resolve it through the metadata system and return
  an upgraded version."
  [query stage-number field-ref]
  (let [pmbql-ref   (lib.convert/legacy-ref->pMBQL query field-ref)
        ;; TODO (eric 2026-02-18): Is this the right way?
        col-meta    (lib/metadata query stage-number pmbql-ref)
        upgraded    (lib/ref col-meta)
        legacy-back (lib/->legacy-MBQL upgraded)]
    legacy-back))

(defn- upgrade-column-settings-keys
  "Given a card's dataset_query (pMBQL) and a column_settings map (from visualization_settings),
  return a new column_settings map with upgraded parameter-mapping. Keys are JSON-encoded strings."
  [query stage-number column-settings]
  (clojure.walk/postwalk
   (fn [form]
     (if (lib/is-field-clause? form)
       (upgrade-legacy-field-ref query stage-number form)
       form))
   column-settings))

(defn- upgrade-parameter-mappings
  [query parameter-mapping]
  (update parameter-mapping :target
          #(let [field-ref (lib.convert/legacy-ref->pMBQL query (lib/parameter-target-field-ref %))
                 options (lib/parameter-target-dimension-options %)
                 filterable-columns (lib/filterable-columns query (:stage-number options))
                 matching-column (lib/find-matching-column query (:stage-number options) field-ref filterable-columns)]
             (when (nil? matching-column)
               (throw (ex-info "Could not find matching column for parameter mapping."
                               {:query query
                                :parameter-mapping parameter-mapping})))
             ;; TODO (eric 2026-02-18): Probably shouldn't build one of these from scratch outside of lib
             [:dimension (-> matching-column lib/ref lib/->legacy-MBQL) options])))

(defn- dashboard-card-upgrade-field-refs!
  [query card-id]
  (doseq [dashcard (t2/select :model/DashboardCard :card_id card-id)]
    (let [viz (vs/db->norm (:visualization_settings dashcard))
          column-settings (::vs/column-settings viz)
          column-settings' (upgrade-column-settings-keys query -1 column-settings)
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
  (let [dataset-query (t2/select-one-pk :dataset_query :model/Card card-id)
        dataset-query' (lib/upgrade-field-refs dataset-query)]
    (when (not= dataset-query dataset-query')
      (t2/update! :model/Card card-id {:dataset_query dataset-query'}))
    (dashboard-card-upgrade-field-refs! dataset-query' card-id)))

(defn- transform-upgrade-field-refs!
  [transform-id]
  (let [source (t2/select-one-pk :source :model/Transform transform-id)]
    (when (= :query (:type source))
      (let [query (:query source)
            query' (lib/upgrade-field-refs query)]
        (when (not= query query')
          (t2/update! :model/Transform transform-id {:source (assoc source :query query')}))))))

(defn upgrade!
  [[entity-type entity-id]]
  (case entity-type
    :card
    (card-upgrade-field-refs! entity-id)

    :transform
    (transform-upgrade-field-refs! entity-id)

    :dashboard
    :do-nothing))
