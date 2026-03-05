(ns metabase-enterprise.replacement.field-refs
  (:require
   [clojure.walk :as clojure.walk]
   [medley.core :as m]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.util :as replacement.util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as vs]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; I tried putting the various {dashboard-card,card,transform}-upgrade-field-refs! functions in the respective models
;; namespaces, but there were cyclical dependencies.

(mu/defn- upgrade-card-viz-settings :- :map
  [query         :- ::lib.schema/query
   viz-settings  :- :map]
  (letfn [(ref->maybe-name [ref]
            (when (lib.util/field-clause? ref)
              (when-let [column (lib.field.resolution/resolve-field-ref query -1 ref)]
                (when-not (:lib.field.resolution/fallback-metadata? column)
                  ((some-fn :lib/deduplicated-name :name) column)))))
          (legacy-ref-or-name->maybe-name [ref-or-name]
            (or (when (and (vector? ref-or-name) (= :field (keyword (first ref-or-name))))
                  (-> ref-or-name lib/->pMBQL ref->maybe-name))
                ref-or-name))
          (legacy-refs-or-names->names [refs-or-names]
            (into [] (keep legacy-ref-or-name->maybe-name) refs-or-names))
          (column-setting->maybe-ref [#::vs{:keys [field-id field-metadata]}]
            (some-> (lib.metadata/field query field-id)
                    lib.ref/ref
                    (lib.options/update-options merge field-metadata)))
          (update-column-settings [column-settings]
            (m/map-kv (fn [k v]
                        (or (when (::vs/field-id k)
                              (when-some [ref (column-setting->maybe-ref k)]
                                (when-some [name (ref->maybe-name ref)]
                                  [{::vs/column-name name} v])))
                            [k v]))
                      column-settings))
          (update-column-formatting [column-formatting]
            (into [] (map #(m/update-existing % :columns legacy-refs-or-names->names)) column-formatting))]
    (-> viz-settings
        (m/update-existing ::vs/column-settings update-column-settings)
        (m/update-existing :table.column_formatting update-column-formatting)
        (m/update-existing-in [:pivot_table.column_split :rows] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.column_split :columns] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.column_split :values] legacy-refs-or-names->names)
        (m/update-existing-in [:pivot_table.collapsed_rows :rows] legacy-refs-or-names->names))))

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

(defn- card-upgrade-field-refs!
  [card]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [dataset-query  (:dataset_query card)
          dataset-query' (lib-be/upgrade-field-refs-in-query dataset-query)
          viz            (:visualization_settings card)
          viz'           (some->> viz
                                  vs/db->norm
                                  (upgrade-card-viz-settings dataset-query')
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
