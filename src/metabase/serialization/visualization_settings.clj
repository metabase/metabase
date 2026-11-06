(ns metabase.serialization.visualization-settings
  "Export and import of `:visualization_settings`, and of the visualizer settings of DashboardCards, in bulk. Settings
  hold ids in many places: field refs, column settings keyed by JSON field refs, link cards, click behaviors, pivot
  tables, timelines, and visualizer column mappings."
  (:require
   [medley.core :as m]
   [metabase.serialization.mbql :as mbql]
   [metabase.serialization.resolve :as resolve]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(defn- dimension-param-mapping?
  "Whether `mapping` maps a click behavior parameter to a dimension."
  [mapping]
  (= "dimension" (get-in mapping [:target :type])))

(def link-card-model->toucan-model
  "A map from model on linkcards to its corresponding toucan model.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.

  It's here instead of [[metabase.dashboards.models.dashboard-card]] to avoid cyclic deps."
  {"card"       :model/Card
   "dataset"    :model/Card
   "collection" :model/Collection
   "database"   :model/Database
   "dashboard"  :model/Dashboard
   "document"   :model/Document
   "question"   :model/Card
   "table"      :model/Table})

(defn- walk-export-viz-link-card
  [visit settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (resolve/visit-some :model/Table id visit)
                   "database" (resolve/visit-some :model/Database id visit)
                   (if-let [model (link-card-model->toucan-model model)]
                     (resolve/visit-some model id visit)
                     id))}))))

(defn- json-export-mbql
  "Converts IDs to fully qualified names inside a JSON string, with what `visit` returns for their references."
  [visit json-str]
  (->> json-str
       json/decode+kw
       (mbql/walk-export visit)
       json/encode))

(defn- json-import-mbql
  "Converts fully qualified names to IDs in MBQL embedded inside a JSON string, with what `visit` returns for them."
  [visit json-str]
  (->> json-str
       json/decode+kw
       (mbql/walk-import visit)
       json/encode))

(defn- walk-export-viz-click-behavior-link
  [visit {:keys [linkType type] :as click-behavior}]
  (resolve/found-or-nil
   (fn []
     (cond-> click-behavior
       (= type "link") (-> (u/update-some :targetId
                                          (fn [id]
                                            (if-let [model (link-card-model->toucan-model linkType)]
                                              (visit model id)
                                              id)))
                           (u/update-some :tabId #(visit :model/DashboardTab %)))))))

(defn owned-entity-id
  "The entity id `x` names: itself, or the last of the `[owner-eid eid]` that older exports wrote for the rows of a
  model another model's rows own, like a timeline event or a dashboard tab."
  [x]
  (if (and (vector? x) (= 2 (count x)) (every? mbql/entity-id? x))
    (peek x)
    x))

(defn- walk-import-viz-click-behavior-link
  [visit {:keys [linkType type] :as click-behavior}]
  (cond-> click-behavior
    (= type "link") (-> (u/update-some :targetId (fn [eid]
                                                   (when-let [model (link-card-model->toucan-model linkType)]
                                                     (visit model eid))))
                        (u/update-some :tabId #(visit :model/DashboardTab (owned-entity-id %))))))

(defn- walk-export-viz-click-behavior-mapping [visit mapping]
  (-> mapping
      (m/update-existing    :id                  #(json-export-mbql visit %))
      (m/update-existing-in [:target :id]        #(json-export-mbql visit %))
      (m/update-existing-in [:target :dimension] #(mbql/walk-export visit %))))

(defn- walk-import-viz-click-behavior-mapping [visit mapping]
  (-> mapping
      (m/update-existing    :id                  #(json-import-mbql visit %))
      (m/update-existing-in [:target :id]        #(json-import-mbql visit %))
      (m/update-existing-in [:target :dimension] #(mbql/walk-import visit %))))

(defn- walk-export-viz-click-behavior-mappings
  "The `:parameterMapping` on a `:click_behavior` viz settings is a map of... IDs turned into JSON strings which have
  been keywordized. Therefore the keys must be converted to strings, parsed, exported, and JSONified. The values are
  ported by [[walk-export-viz-click-behavior-mapping]]."
  [visit mappings]
  (into {}
        (comp (map (fn [[k v]]
                     [(u/qualified-name k) v]))
              (map (fn [[k mapping]]
                     (if (dimension-param-mapping? mapping)
                       [(json-export-mbql visit k)
                        (walk-export-viz-click-behavior-mapping visit mapping)]
                       [k mapping]))))
        mappings))

(defn- walk-import-viz-click-behavior-mappings
  "The exported form of `:parameterMapping` on a `:click_behavior` viz settings is a map of JSON strings which contain
  fully qualified names. These must be parsed, imported and JSONified again, since that's the form used internally."
  [visit mappings]
  (into {} (for [[json-key mapping] mappings]
             (if (dimension-param-mapping? mapping)
               [(json-import-mbql visit json-key)
                (walk-import-viz-click-behavior-mapping visit mapping)]
               [json-key mapping]))))

(defn- walk-export-viz-click-behavior [visit settings]
  (some-> settings
          (u/update-some :click_behavior #(walk-export-viz-click-behavior-link visit %))
          (m/update-existing-in [:click_behavior :parameterMapping]
                                #(walk-export-viz-click-behavior-mappings visit %))))

(defn- walk-import-viz-click-behavior [visit settings]
  (some-> settings
          (m/update-existing    :click_behavior #(walk-import-viz-click-behavior-link visit %))
          (m/update-existing-in [:click_behavior :parameterMapping]
                                #(walk-import-viz-click-behavior-mappings visit %))))

(defn- walk-export-pivot-table [visit settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] #(mbql/walk-export visit %))
          (m/update-existing-in [:pivot_table.column_split :columns] #(mbql/walk-export visit %))))

(defn- walk-import-pivot-table [visit settings]
  (some-> settings
          (m/update-existing-in [:pivot_table.column_split :rows] #(mbql/walk-import visit %))
          (m/update-existing-in [:pivot_table.column_split :columns] #(mbql/walk-import visit %))))

(defn- walk-export-column-settings
  "Column settings use a JSON-encoded string as a map key, and it contains field numbers.
  This function parses those keys, converts the IDs to references, and serializes them back to JSON."
  [visit settings]
  (when settings
    (-> settings
        (update-keys #(->> % json/decode (mbql/walk-export visit) json/encode))
        (update-vals #(walk-export-viz-click-behavior visit %)))))

(defn- walk-export-card-dimension-ref
  [visit s]
  (if-let [[_ card-id] (and (string? s) (re-matches #"^\$_card:(\d+)_name$" s))]
    (str "$_card:" (visit :model/Card (parse-long card-id)) "_name")
    s))

(defn- walk-export-visualizer-source-id
  [visit source-id]
  (when (string? source-id)
    (if-let [card-id (second (re-matches #"^card:(\d+)$" source-id))]
      (str "card:" (visit :model/Card (parse-long card-id)))
      source-id)))

(defn walk-export-visualizer-settings
  "Visualizer dashcard `settings` with their embedded card ids replaced by what `visit` returns for their references."
  [visit settings]
  (m/update-existing-in
   settings
   [:visualization :columnValuesMapping]
   (fn [mapping]
     (into {}
           (for [[k cols] mapping]
             (let [updated-cols (cond
                                  (and (coll? cols) (map? (first cols)))
                                  (mapv #(update % :sourceId (partial walk-export-visualizer-source-id visit)) cols)

                                  (and (coll? cols) (string? (first cols)))
                                  (mapv #(walk-export-card-dimension-ref visit %) cols)

                                  :else cols)]
               [k updated-cols]))))))

(defn timeline-setting-ids
  "The ids stored under a `:timeline.*` visualization setting. Settings saved before these keys were validated can
  hold anything, so a non-sequential value counts as no ids rather than throwing mid-export."
  [ids]
  (when (sequential? ids) ids))

(defn- walk-export-timeline-fks [visit ids model]
  (u/keepv (fn [id] (when (pos-int? id) (resolve/found-or-nil #(visit model id)))) (timeline-setting-ids ids)))

(defn- walk-export-timeline-events [visit settings]
  (-> settings
      (m/update-existing :timeline.selected_timeline_ids #(walk-export-timeline-fks visit % :model/Timeline))
      (m/update-existing :timeline.excluded_timeline_event_ids
                         #(walk-export-timeline-fks visit % :model/TimelineEvent))))

(defn walk-export-visualization-settings
  "The `:visualization_settings` map with its ids replaced by what `visit` returns for their references."
  [visit settings]
  (when settings
    (as-> settings $
      (mbql/walk-export visit $)
      (walk-export-viz-link-card visit $)
      (walk-export-viz-click-behavior visit $)
      (walk-export-visualizer-settings visit $)
      (walk-export-pivot-table visit $)
      (walk-export-timeline-events visit $)
      (m/update-existing $ :column_settings #(walk-export-column-settings visit %)))))

(defn- walk-import-viz-link-card
  [visit settings]
  (m/update-existing-in
   settings
   [:link :entity]
   (fn [{:keys [id model] :as entity}]
     (merge entity
            {:id (case model
                   "table"    (resolve/visit-some :model/Table id visit)
                   "database" (resolve/visit-some :model/Database id visit)
                   (if-let [model (link-card-model->toucan-model model)]
                     (resolve/visit-some model id visit)
                     id))}))))

(defn- walk-import-visualizations [visit entity]
  (match/replace entity
    [#{:field "field"} (opts :guard map?) (fully-qualified-name :guard vector?)]
    [:field (walk-import-visualizations visit opts) (visit :model/Field fully-qualified-name)]

    [#{:field "field"} (fully-qualified-name :guard vector?) opts]
    [:field (visit :model/Field fully-qualified-name) (walk-import-visualizations visit opts)]

    [#{:field-id "field-id"} (fully-qualified-name :guard vector?) opts]
    [:field-id (visit :model/Field fully-qualified-name) (walk-import-visualizations visit opts)]

    [#{:field-id "field-id"} (fully-qualified-name :guard vector?)]
    [:field-id (visit :model/Field fully-qualified-name)]))

(defn- walk-import-column-settings [visit settings]
  (when settings
    (-> settings
        (update-keys #(->> % name json/decode (walk-import-visualizations visit) json/encode))
        (update-vals #(walk-import-viz-click-behavior visit %)))))

(defn- walk-import-card-dimension-ref
  [visit s]
  (or (when-let [[_ card-id] (and (string? s) (re-matches #"^\$_card:([A-Za-z0-9_\-]{21})_name$" s))]
        (when-let [resolved (visit :model/Card card-id)]
          (str "$_card:" resolved "_name")))
      s))

(defn- walk-import-visualizer-source-id
  [visit source-id]
  (when (string? source-id)
    (or (when-let [card-entity-id (second (re-matches #"^card:([A-Za-z0-9_\-]{21})$" source-id))]
          (when-let [card-id (visit :model/Card card-entity-id)]
            (str "card:" card-id)))
        source-id)))

(defn walk-import-visualizer-settings
  "Exported visualizer dashcard `settings` with their embedded entity ids replaced by what `visit` returns for them."
  [visit settings]
  (m/update-existing-in
   settings
   [:visualization :columnValuesMapping]
   update-vals
   (fn [cols]
     (cond
       (and (coll? cols) (map? (first cols)))
       (mapv #(update % :sourceId (partial walk-import-visualizer-source-id visit)) cols)

       (and (coll? cols) (string? (first cols)))
       (mapv #(walk-import-card-dimension-ref visit %) cols)

       :else cols))))

(defn- walk-import-timeline-fks [visit refs model]
  (u/keepv (fn [x]
             (let [eid (owned-entity-id x)]
               (when (mbql/entity-id? eid)
                 (resolve/found-or-nil #(visit model eid)))))
           (timeline-setting-ids refs)))

(defn- walk-import-timeline-events [visit settings]
  (-> settings
      (m/update-existing :timeline.selected_timeline_ids #(walk-import-timeline-fks visit % :model/Timeline))
      (m/update-existing :timeline.excluded_timeline_event_ids
                         #(walk-import-timeline-fks visit % :model/TimelineEvent))))

(defn- walk-import-viz-column-settings
  "Import `:column_settings`, dropping the `nil` that older exports wrote for settings without any."
  [visit settings]
  (if (some? (:column_settings settings))
    (update settings :column_settings #(walk-import-column-settings visit %))
    (dissoc settings :column_settings)))

(defn walk-import-visualization-settings
  "The exported `:visualization_settings` map with its references replaced by what `visit` returns for them."
  [visit settings]
  (when settings
    (as-> settings $
      (walk-import-visualizations visit $)
      (walk-import-viz-link-card visit $)
      (walk-import-viz-click-behavior visit $)
      (walk-import-visualizer-settings visit $)
      (walk-import-pivot-table visit $)
      (walk-import-timeline-events visit $)
      (walk-import-viz-column-settings visit $))))

(defn export-visualization-settings
  "Each of the `:visualization_settings` of `xs` exported by [[walk-export-visualization-settings]], with the database
  ids of all of them resolved in `store` at once."
  [store xs]
  (resolve/export-in-bulk store xs walk-export-visualization-settings))

(defn import-visualization-settings
  "Each of the exported `:visualization_settings` of `xs` imported by [[walk-import-visualization-settings]], with the
  references of all of them resolved in `store` at once."
  [store xs opts]
  (resolve/import-in-bulk store xs opts walk-import-visualization-settings))

(def visualization-settings-transform
  "A spec transform of `:visualization_settings`, by [[export-visualization-settings]] and
  [[import-visualization-settings]]."
  {:export (fn [store _ xs _] (export-visualization-settings store xs))
   :import (fn [store _ xs opts] (import-visualization-settings store xs opts))})

(defn import-visualizer-settings
  "Each of the exported visualizer dashcard settings of `xs` imported by [[walk-import-visualizer-settings]], with the
  references of all of them resolved in `store` at once."
  [store xs opts]
  (resolve/import-in-bulk store xs opts walk-import-visualizer-settings))
