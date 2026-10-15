(ns metabase-enterprise.library-branching.instance.kinds.dashboard
  "The app DB side of the kind `:dashboard`, in the item form of `format.kinds.dashboard`: a dashboard row with its
  tabs, its dashboard cards and their series. The attributes are the dashboard columns of the same names in the
  portable form of the serdes export, the tabs in their order, and the dashboard cards. Not content: the public link
  and the embedding settings (instance-local), the archive columns (scope), `cache_ttl`, the view columns and the
  bookkeeping columns.

  A write goes through the Dashboard, DashboardTab and DashboardCard models, not through the save path of the
  dashboard API, which checks the permissions of a user. A move of a dashboard moves its dashboard questions with it,
  and a trash of a dashboard moves them to the trash, as the save path does. A restore of a dashboard restores none
  of its questions: each question is an item of its own."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.dashboard :as format.dashboard]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.instance.values-source :as values-source]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(def ^:private column-attrs
  "The attributes that are dashboard columns of the same names."
  [:description :caveats :points_of_interest :collection_position :position :width :auto_apply_filters
   :show_in_getting_started])

;;; ------------------------------------------------------- Read -----------------------------------------------------

(defn- without-nil-settings
  "Visualization settings without a top-level key whose value is nil; the export adds `:column_settings nil`."
  [settings]
  (into {} (remove (comp nil? val)) settings))

(defn- resolve-metric-link
  "`settings` with the id `id` of the metric that its link card links to replaced by `(resolve id :model/Card)`;
  `settings` when it links to no metric."
  [settings resolve]
  (cond-> settings
    (and (= "metric" (get-in settings [:link :entity :model]))
         (some? (get-in settings [:link :entity :id])))
    (update-in [:link :entity :id] resolve :model/Card)))

(defn- export-settings
  "The portable form of the visualization settings `settings` of a dashboard card."
  [settings]
  ;; The serdes export converts the id of a link card only for the models that it knows, and "metric" is not one.
  (-> (resolve-metric-link settings serdes/*export-fk*)
      serdes/export-visualization-settings
      without-nil-settings))

(defn- import-settings
  "The visualization settings of a dashboard card of the portable form `settings`, the inverse of [[export-settings]]."
  [settings]
  (or (serdes/import-visualization-settings (resolve-metric-link settings serdes/*import-fk*)) {}))

(defn- export-parameters
  "The portable form of the dashboard parameters `parameters`, in their order."
  [parameters]
  (->> (serdes/export-parameters parameters)
       (sort-by :position)
       (mapv #(dissoc % :position))))

(defn- export-dashcard
  "The portable entry of dashboard card `dc`, whose tab ids are the entity ids of `tab-eids` and whose series cards are
  `series`, before the document form."
  [tab-eids series dc]
  {:id                     (:entity_id dc)
   :card_id                (serdes/*export-fk* (:card_id dc) :model/Card)
   :action_id              (serdes/*export-fk* (:action_id dc) :model/Action)
   :dashboard_tab_id       (get tab-eids (:dashboard_tab_id dc))
   :row                    (:row dc)
   :col                    (:col dc)
   :size_x                 (:size_x dc)
   :size_y                 (:size_y dc)
   :parameter_mappings     (serdes/export-parameter-mappings (:parameter_mappings dc))
   :visualization_settings (export-settings (:visualization_settings dc))
   :series                 (mapv #(serdes/*export-fk* % :model/Card) series)
   :inline_parameters      (:inline_parameters dc)})

(defn- portable-content
  "`{:place :attrs}` of dashboard row `row`, with its tabs `tabs` and its dashboard cards `dashcards`; `series` is
  `{dashcard-id [card-id]}`."
  [tabs dashcards series row]
  (let [tab-eids  (into {} (map (juxt :id :entity_id)) tabs)
        entries   (->> dashcards
                       (map #(export-dashcard tab-eids (get series (:id %)) %))
                       (mapv (comp format.dashboard/normal-dashcard portable/document)))
        tab-items (mapv (fn [{:keys [entity_id name]}] {:id entity_id :name name}) tabs)]
    {:place (serdes/*export-fk* (:collection_id row) :model/Collection)
     :attrs (content/attrs format.dashboard/spec
                           (-> (portable/document (select-keys row column-attrs))
                               (assoc :parameters (portable/document (export-parameters (:parameters row)))
                                      :tabs       tab-items
                                      :dashcards  (format.dashboard/dashcard-order tab-items entries))))}))

(defn read-dashboards
  "`{entity-id item}` of the dashboards of `entity-ids`."
  [entity-ids]
  (let [rows      (content/in-chunks library-branching.db/dashboards-by-entity-id (vec entity-ids))
        ids       (mapv :id rows)
        tabs      (group-by :dashboard_id (content/in-chunks library-branching.db/tabs-of-dashboards ids))
        dashcards (content/in-chunks library-branching.db/dashcards-of-dashboards ids)
        series    (update-vals (group-by :dashboardcard_id
                                         (content/in-chunks library-branching.db/series-of-dashcards (mapv :id dashcards)))
                               #(mapv :card_id %))
        by-dash   (group-by :dashboard_id dashcards)
        contents  (portable/export-batch (fn [row]
                                           (portable-content (get tabs (:id row)) (get by-dash (:id row)) series row))
                                         rows)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :dashboard entity_id name place attrs)])
               rows
               contents))))

(defn current-dashboard
  "The state of dashboard `id` (`instance/current`), after a lock on its rows."
  [id]
  (let [row (library-branching.db/lock-dashboard id)]
    (content/current-state (boolean (and row (tree/collection-id-in-tree? (:collection_id row))))
                           #(scope/in-scope? :dashboard id)
                           #(get (read-dashboards [id]) id))))

;;; ------------------------------------------------------ Write -----------------------------------------------------

(defn- dashcard-columns
  "The columns of the portable dashboard card entry `entry`, an absent entry at its default, with its tab's id from
  `tab-ids` (`{entity-id id}`). Imports in the current serdes import resolver."
  [tab-ids {:keys [card_id action_id dashboard_tab_id parameter_mappings visualization_settings inline_parameters]
            :as   entry}]
  {:card_id                (some-> card_id (serdes/*import-fk* :model/Card))
   :action_id              (some-> action_id (serdes/*import-fk* :model/Action))
   :dashboard_tab_id       (some->> dashboard_tab_id (get tab-ids))
   :row                    (:row entry)
   :col                    (:col entry)
   :size_x                 (:size_x entry)
   :size_y                 (:size_y entry)
   :parameter_mappings     (vec (serdes/import-parameter-mappings (or parameter_mappings [])))
   :visualization_settings (import-settings visualization_settings)
   :inline_parameters      (or inline_parameters [])})

(defn- series-ids
  [entry]
  (mapv #(serdes/*import-fk* % :model/Card) (:series entry)))

(defn- write-tabs!
  "Makes the tabs of dashboard `dashboard-id` with the tabs `old` (`{:id :entity_id ...}`) the tabs `new` (`{:id :name}`
  entries), but deletes none. Returns `{entity-id id}` of the new tabs."
  [dashboard-id old new]
  (let [old-by-eid (into {} (map (juxt :entity_id identity)) old)
        positions  (into {} (map-indexed (fn [i tab] [(:entity_id tab) i])) old)]
    (into {}
          (map-indexed
           (fn [i {eid :id tab-name :name}]
             (if-let [row (get old-by-eid eid)]
               (let [changes (cond-> {}
                               (not= tab-name (:name row))  (assoc :name tab-name)
                               (not= i (get positions eid)) (assoc :position i))]
                 (when (seq changes)
                   (library-branching.db/update-dashboard-tab! (:id row) changes))
                 [eid (:id row)])
               [eid (library-branching.db/insert-dashboard-tab! {:dashboard_id dashboard-id
                                                                 :entity_id    eid
                                                                 :name         tab-name
                                                                 :position     i})])))
          new)))

(defn- write-dashcards!
  "Makes the dashboard cards of dashboard `dashboard-id` whose cards are `old` (`{:id :entity_id}`, with their portable
  entries `old-entries`) the entries `new`, but deletes none. `tab-ids` is `{entity-id id}` of the tabs."
  [dashboard-id tab-ids old old-entries new]
  (let [old-by-eid   (into {} (map (juxt :entity_id identity)) old)
        entry-by-eid (into {} (map (juxt :id identity)) old-entries)]
    (doseq [{eid :id :as entry} new]
      (if-let [row (get old-by-eid eid)]
        (let [before  (get entry-by-eid eid)
              columns (dashcard-columns tab-ids entry)
              entry-v (fn [e k] (get e k (get format.dashboard/dashcard-defaults k)))
              changed (into {} (filter (fn [[k _]] (not= (entry-v before k) (entry-v entry k)))) columns)]
          (when (seq changed)
            (library-branching.db/update-dashcard! (:id row) changed))
          (when (not= (:series before []) (:series entry []))
            (dashboard-card/update-dashboard-cards-series! {(:id row) (series-ids entry)})))
        (let [id (library-branching.db/insert-dashcard! (merge (dashcard-columns tab-ids entry)
                                                               {:dashboard_id dashboard-id :entity_id eid}))]
          (when (seq (:series entry))
            (dashboard-card/update-dashboard-cards-series! {id (series-ids entry)})))))))

(defn- dashboard-columns
  "The dashboard columns of the attributes `ks` of `attrs`, an absent one at its default. Imports in the current serdes
  import resolver."
  [attrs ks]
  (into {}
        (map (fn [k]
               (let [v (content/attr-value format.dashboard/spec attrs k)]
                 [k (if (= :parameters k) (vec (serdes/import-parameters v)) v)])))
        ks))

(defn- children
  "`[tabs dashcards]`: the tab rows and the dashboard card rows of dashboard `dashboard-id`."
  [dashboard-id]
  [(library-branching.db/tabs-of-dashboards [dashboard-id])
   (library-branching.db/dashcards-of-dashboards [dashboard-id])])

(defn- write-children!
  "Makes the tabs and dashboard cards of dashboard `dashboard-id` those of the attributes `attrs`. `old` is the content
  of the dashboard before, or nil."
  [dashboard-id old attrs]
  (let [[tabs dashcards] (children dashboard-id)
        new-tabs         (content/attr-value format.dashboard/spec attrs :tabs)
        new-dashcards    (content/attr-value format.dashboard/spec attrs :dashcards)
        tab-ids          (write-tabs! dashboard-id tabs new-tabs)
        _                (write-dashcards! dashboard-id tab-ids dashcards (get-in old [:attrs :dashcards]) new-dashcards)
        kept             (set (map :id new-tabs))
        gone             (vec (keep (fn [tab] (when-not (kept (:entity_id tab)) (:id tab))) tabs))]
    (when (seq gone)
      (dashboard-tab/delete-tabs! gone))))

(defn- delete-gone-dashcards!
  "Deletes the dashboard cards of dashboard `dashboard-id` that the attributes `attrs` do not hold."
  [dashboard-id attrs]
  (let [kept (set (map :id (content/attr-value format.dashboard/spec attrs :dashcards)))
        gone (vec (keep (fn [dc] (when-not (kept (:entity_id dc)) (:id dc)))
                        (library-branching.db/dashcards-of-dashboards [dashboard-id])))]
    (when (seq gone)
      (dashboard-card/delete-dashboard-cards! gone))))

(defn write-dashboard!
  "Makes the content of dashboard `id` equal to `item`, by the contract of `instance/write!`."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :dashboard id item)
  (let [row    (library-branching.db/lock-dashboard id)
        _      (when row (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row))))
        _      (when (nil? place)
                 (instance/refuse! :place id "A dashboard is in a collection of the Library."))
        parent (tree/place-collection id place)
        ks     (keys (:attrs format.dashboard/spec))
        own    (remove #{:tabs :dashcards} ks)]
    (portable/do-with-strict-import
     id
     (fn []
       (if-not row
         (let [{dashboard-id :id} (library-branching.db/insert-dashboard!
                                   (merge {:entity_id     id
                                           :name          name
                                           :collection_id (:id parent)
                                           :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
                                          (dashboard-columns attrs own)))]
           (write-children! dashboard-id nil attrs))
         ;; The cards go first: a delete of a card with inline parameters removes them from the dashboard.
         (let [_       (delete-gone-dashcards! (:id row) attrs)
               old     (get (read-dashboards [id]) id)
               changes (cond-> (dashboard-columns attrs (filter (content/changed-attrs format.dashboard/spec
                                                                                       (:attrs old) attrs)
                                                                own))
                         (not= name (:name old))                  (assoc :name name)
                         (not= (:id parent) (:collection_id row)) (assoc :collection_id (:id parent))
                         (:archived row)                          (assoc :archived false :archived_directly false))]
           (when (seq changes)
             (library-branching.db/update-dashboard! (:id row) changes))
           (when (contains? changes :collection_id)
             (dashboard/cascade-card-state-from-dashboard-update! row (select-keys changes [:collection_id])))
           (write-children! (:id row) old attrs)))))
    nil))

(defn trash-dashboard!
  "Moves dashboard `id` and its dashboard questions to the trash."
  [id]
  (when-let [row (library-branching.db/lock-dashboard id)]
    (tree/check-in-tree! id (tree/collection-id-in-tree? (:collection_id row)))
    (when-not (:archived row)
      (values-source/do-keeping-outside-values-sources
       (library-branching.db/values-source-users-of-dashboard-questions (:id row))
       (fn []
         (library-branching.db/update-dashboard! (:id row) {:archived true :archived_directly true})
         (dashboard/cascade-card-state-from-dashboard-update! row {:archived true}))))
    nil))

(defn stub-dashboard
  "The content of a new dashboard `id` with no reference: `content` with no dashboard cards and no parameters."
  [id content]
  (let [attrs (dissoc (:attrs content) :dashcards :parameters)]
    (assoc content :attrs attrs :refs (format.kinds/refs :dashboard id attrs))))

(def ^:private models-of-read
  "The models whose tables a read of dashboards reads: the dashboards with their tabs, cards and series, and the
  collections, cards, actions, dashboards, timelines and environment objects that they refer to."
  #{:model/Action :model/Card :model/Collection :model/Dashboard :model/DashboardCard :model/DashboardCardSeries
    :model/DashboardTab :model/Database :model/Field :model/Table :model/Timeline :model/TimelineEvent})

(def kind-store
  "The `KindStore` of dashboards."
  (reify
    instance/KindStore
    (read-all [_ ids] (read-dashboards ids))
    (read-models [_] models-of-read)
    (current [_ id] (current-dashboard id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-dashboard! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-dashboard! id)))

    instance/Stub
    (stub [_ id content _refs] (stub-dashboard id content))))
