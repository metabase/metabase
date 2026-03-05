(ns metabase-enterprise.replacement.field-refs
  (:require
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

(defn- card-upgrade-field-refs!
  [card]
  (when (replacement.util/valid-query? (:dataset_query card))
    (let [query         (:dataset_query card)
          query'        (lib-be/upgrade-field-refs-in-query query)
          viz-settings  (:visualization_settings card)
          viz-settings' (some->> viz-settings vs/db->norm (upgrade-card-viz-settings query') vs/norm->db)
          changes       (cond-> {}
                          (not= query query') (assoc :dataset_query query')
                          (not= viz-settings viz-settings') (assoc :visualization_settings viz-settings'))
          ;; result_metadata is set to nil for native queries if not present in changes
          changes       (cond-> changes
                          (and (seq changes)
                               (lib/native-only-query? query'))
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
    (let [query  (:definition segment)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Segment (:id segment) {:definition query'})))))

(defn- measure-upgrade-field-refs!
  [measure]
  (when (replacement.util/valid-query? (:definition measure))
    (let [query  (:definition measure)
          query' (lib-be/upgrade-field-refs-in-query query)]
      (when (not= query query')
        (t2/update! :model/Measure (:id measure) {:definition query'})))))

(defn- dashcard-upgrade-parameter-mappings
  [parameter-mappings cards-by-id]
  (mapv (fn [mapping]
          (or (when-let [card (get cards-by-id (:card_id mapping))]
                (let [query (:dataset_query card)]
                  (when (replacement.util/valid-query? query)
                    (m/update-existing mapping :target #(lib-be/upgrade-field-ref-in-parameter-target query %)))))
              mapping))
        parameter-mappings))

;; TODO - this is incorrect - it doesn't take the target into account
;; TODO - use normalized click behavior API

;; (defn- upgrade-column-settings-keys
;;   "Given a card's dataset_query (pMBQL) and a column_settings map (from visualization_settings),
;;   return a new column_settings map with upgraded parameter-mapping. Keys are JSON-encoded strings."
;;   [query column-settings]
;;   (clojure.walk/postwalk
;;    (fn [form]
;;      ;; some forms don't get converted to keywords, so hack it
;;      (if (and (vector? form)
;;               (= "dimension" (first form)))
;;        (try
;;          (let [dim (-> form
;;                        (update 0 keyword)
;;                        (update-in [1 0] keyword)
;;                        (update-in [1 2 :base-type] keyword))]
;;            (lib-be/upgrade-field-ref-in-parameter-target query dim))
;;          (catch Exception _
;;            form))
;;        form))
;;    column-settings))

(defn- click-behavior->card-id
  [click-behavior]
  (when (= ::vs/question (::vs/link-type click-behavior))
    (::vs/link-target-id click-behavior)))

(defn- viz-settings->card-ids
  [viz-settings]
  (concat
   ;; global click behavior (non-table cards)
   (when-let [id (click-behavior->card-id (::vs/click-behavior viz-settings))]
     [id])
   ;; per-column click behaviors
   (keep (fn [[_col-key col-viz]]
           (click-behavior->card-id (::vs/click-behavior col-viz)))
         (::vs/column-settings viz-settings))))

(defn- upgrade-click-behavior-dimensions
  "Upgrade dimension field refs in a click behavior's parameter mapping.
   Uses the target card's query (from cards-by-id) when the click behavior links to a question."
  [click-behavior cards-by-id]
  (if-let [card-id (click-behavior->card-id click-behavior)]
    (if-let [card (get cards-by-id card-id)]
      (let [query (:dataset_query card)]
        (if (replacement.util/valid-query? query)
          (m/update-existing click-behavior ::vs/parameter-mapping
                             (fn [param-mapping]
                               (m/map-vals (fn [pm-val]
                                             (let [target (::vs/param-mapping-target pm-val)]
                                               (if-let [dim (::vs/param-dimension target)]
                                                 (let [dim' (lib-be/upgrade-field-ref-in-parameter-target query dim)]
                                                   (assoc-in pm-val [::vs/param-mapping-target ::vs/param-dimension] dim'))
                                                 pm-val)))
                                           param-mapping)))
          click-behavior))
      click-behavior)
    click-behavior))

(defn- dashcard-upgrade-viz-settings
  [viz-settings cards-by-id]
  (-> viz-settings
      ;; global click behavior (non-table cards)
      (m/update-existing ::vs/click-behavior upgrade-click-behavior-dimensions cards-by-id)
      ;; per-column click behaviors
      (m/update-existing ::vs/column-settings
                         (fn [col-settings]
                           (m/map-vals (fn [col-viz]
                                         (m/update-existing col-viz ::vs/click-behavior
                                                            upgrade-click-behavior-dimensions cards-by-id))
                                       col-settings)))))

(defn- dashcard-upgrade-field-refs!
  [dashcard cards-by-id]
  (let [parameter-mappings  (:parameter_mappings dashcard)
        parameter-mappings' (dashcard-upgrade-parameter-mappings parameter-mappings cards-by-id)
        viz-settings        (:visualization_settings dashcard)
        viz-settings'       (some-> viz-settings
                                    vs/db->norm
                                    (dashcard-upgrade-viz-settings cards-by-id)
                                    vs/norm->db)
        changes (cond-> {}
                  (not= parameter-mappings parameter-mappings')
                  (assoc :parameter_mappings parameter-mappings')
                  (not= viz-settings viz-settings')
                  (assoc :visualization_settings viz-settings'))]
    (when (seq changes)
      (t2/update! :model/DashboardCard (:id dashcard) changes))))

(defn dashboard-upgrade-field-refs!
  "Upgrade field refs in parameter_mappings and column_settings for all dashcards in a dashboard.
   Each parameter_mapping's :card_id determines which card's query to use for the upgrade."
  [dashboard-id]
  (let [dashcards    (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        all-card-ids (into #{}
                           (comp (mapcat (fn [dashcard]
                                           (cons (:card_id dashcard)
                                                 (concat
                                                  (keep :card_id (:parameter_mappings dashcard))
                                                  (viz-settings->card-ids (-> dashcard :visualization_settings vs/db->norm))))))
                                 (remove nil?))
                           dashcards)
        cards-by-id  (when (seq all-card-ids)
                       (->> (t2/select :model/Card :id [:in all-card-ids])
                            (m/index-by :id)))]
    (doseq [dashcard dashcards]
      (dashcard-upgrade-field-refs! dashcard cards-by-id))))

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
       :card      (card-upgrade-field-refs! (or loaded-object (t2/select-one :model/Card :id entity-id)))
       :transform (transform-upgrade-field-refs! (or loaded-object (t2/select-one :model/Transform :id entity-id)))
       :segment   (segment-upgrade-field-refs! (or loaded-object (t2/select-one :model/Segment :id entity-id)))
       :measure   (measure-upgrade-field-refs! (or loaded-object (t2/select-one :model/Measure :id entity-id)))
       ;; table - no-op
       nil))))
