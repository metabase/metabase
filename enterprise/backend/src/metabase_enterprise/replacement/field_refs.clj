(ns metabase-enterprise.replacement.field-refs
  (:require
   [clojure.walk :as clojure.walk]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.malli :as mu]
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

(defn- ->field-ref [#::vs{:keys [field-id field-metadata]}]
  (-> [:field field-metadata field-id]
      lib.options/ensure-uuid))

(defn- upgrade-field-ref-to-name
  [query field-ref]
  (when (= :field (keyword (first field-ref)))
    (try
      (let [field-ref (lib/->pMBQL field-ref)]
        (when (lib.util/field-clause? field-ref)
          (when-let [column (lib.field.resolution/resolve-field-ref query -1 field-ref)]
            (when-not (:lib.field.resolution/fallback-metadata? column)
              ((some-fn :lib/deduplicated-name :name) column)))))
      (catch Exception _
        nil))))

(defn- upgrade-card-column-settings
  [column-settings query]
  (reduce #(merge-with merge %1 %2)
          {}
          (for [[k v] column-settings]
            (or (when (::vs/field-id k)
                  (when-some [column-name (upgrade-field-ref-to-name query (->field-ref k))]
                    {{::vs/column-name column-name} v}))
                {k v}))))

(def ^:private viz-settings-field-ref-locations
  [[:pivot_table.column_split :rows]
   [:pivot_table.column_split :columns]
   [:pivot_table.column_split :values]
   [:pivot_table.collapsed_rows :rows]])

(defn- update-existing
  [mp k f & args]
  (if (contains? mp k)
    (apply update mp k f args)
    mp))

(defn- upgrade-viz-settings-locations
  [viz-settings query]
  (let [upgrade-refs (fn [refs]
                       (mapv #(or (upgrade-field-ref-to-name query %) %) refs))
        viz (reduce (fn [viz location]
                      (if-some [refs' (some->> (get-in viz location) upgrade-refs)]
                        (assoc-in viz location refs')
                        viz))
                    viz-settings viz-settings-field-ref-locations)]
    ;; table.column_formatting is a vector of maps, each with a :columns key
    (update-existing viz :table.column_formatting
                     (fn [entries]
                       (mapv #(update-existing % :columns upgrade-refs) entries)))))

(defn- card-upgrade-field-refs!
  [card]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [dataset-query  (:dataset_query card)
          dataset-query' (lib-be/upgrade-field-refs-in-query dataset-query)
          viz            (:visualization_settings card)
          viz' (-> viz
                   vs/db->norm
                   (update-existing ::vs/column-settings upgrade-card-column-settings dataset-query')
                   (upgrade-viz-settings-locations dataset-query')
                   vs/norm->db)
          changes (cond-> {}
                    (not= dataset-query dataset-query')
                    (assoc :dataset_query dataset-query')

                    (not= viz viz')
                    (assoc :visualization_settings viz'))
          ;; result_metadata is set to nil for native queries if not present in changes
          changes (cond-> changes
                    (and (seq changes)
                         (lib/native-only-query? dataset-query'))
                    (assoc :result_metadata (:result_metadata card)))]
      (when (seq changes)
        (t2/update! :model/Card (:id card) changes)))))

(defn- transform-upgrade-field-refs!
  [transform]
  (let [source (:source transform)]
    (when (and (= :query (:type source))
               (replacement.util/valid-query? (:query source)))
      (let [query (:query source)
            query' (lib-be/upgrade-field-refs-in-query query)]
        (when (not= query query')
          (t2/update! :model/Transform (:id transform) {:source (assoc source :query query')}))))))

(defn- segment-upgrade-field-refs!
  [segment]
  (when (replacement.util/valid-query? (:definition segment))
    (let [definition  (:definition segment)
          definition' (lib-be/upgrade-field-refs-in-query definition)]
      (when (not= definition definition')
        (t2/update! :model/Segment (:id segment) {:definition definition'})))))

(defn- measure-upgrade-field-refs!
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [definition  (:definition measure)
          definition' (lib-be/upgrade-field-refs-in-query definition)]
      (when (not= definition definition')
        (t2/update! :model/Measure (:id measure) {:definition definition'})))))

(defn dashboard-upgrade-field-refs!
  "Upgrade field refs in parameter_mappings and column_settings for all dashcards in a dashboard.
   Each parameter_mapping's :card_id determines which card's query to use for the upgrade."
  [dashboard-id]
  (let [dashcards    (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        all-card-ids (into #{} (comp (mapcat (fn [dc]
                                               (cons (:card_id dc)
                                                     (keep :card_id (:parameter_mappings dc)))))
                                     (remove nil?))
                           dashcards)
        cards-by-id  (when (seq all-card-ids)
                       (into {} (map (juxt :id identity))
                             (t2/select :model/Card :id [:in all-card-ids])))]
    (doseq [dashcard dashcards]
      (let [parameter-mappings  (:parameter_mappings dashcard)
            parameter-mappings' (mapv (fn [pm]
                                        (if-let [card (get cards-by-id (:card_id pm))]
                                          (if (replacement.util/valid-query? (:dataset_query card))
                                            (let [query (lib-be/upgrade-field-refs-in-query (:dataset_query card))]
                                              (upgrade-parameter-mappings query pm))
                                            pm)
                                          pm))
                                      parameter-mappings)
            primary-card    (get cards-by-id (:card_id dashcard))
            primary-query   (when (replacement.util/valid-query? (:dataset_query primary-card))
                              (lib-be/upgrade-field-refs-in-query (:dataset_query primary-card)))
            viz             (vs/db->norm (:visualization_settings dashcard))
            column-settings (::vs/column-settings viz)
            column-settings' (if primary-query
                               (upgrade-column-settings-keys primary-query column-settings)
                               column-settings)
            changes (cond-> {}
                      (not= parameter-mappings parameter-mappings')
                      (assoc :parameter_mappings parameter-mappings')
                      (not= column-settings column-settings')
                      (assoc :visualization_settings (-> viz
                                                         (assoc ::vs/column-settings column-settings')
                                                         vs/norm->db)))]
        (when (seq changes)
          (t2/update! :model/DashboardCard (:id dashcard) changes))))))

(mu/defn upgrade!
  "Upgrade field refs in an entity.

  `entity-ref` is a [type id] tuple like [:dashboard 123] or [:card 456].
  `loaded-object` is an optional pre-fetched entity map from bulk-load-metadata-for-entities!.
  Dashboards don't use loaded-object (not bulk-loaded)."
  ([entity-ref :- ::replacement.schema/entity-ref]
   (upgrade! entity-ref nil))
  ([entity-ref :- ::replacement.schema/entity-ref
    loaded-object]
   (let [[entity-type entity-id] entity-ref]
     (case entity-type
       :dashboard (dashboard-upgrade-field-refs! entity-id)
       :card      (when loaded-object (card-upgrade-field-refs! loaded-object))
       :transform (when loaded-object (transform-upgrade-field-refs! loaded-object))
       :segment   (when loaded-object (segment-upgrade-field-refs! loaded-object))
       :measure   (when loaded-object (measure-upgrade-field-refs! loaded-object))
       ;; table - no-op
       nil))))
