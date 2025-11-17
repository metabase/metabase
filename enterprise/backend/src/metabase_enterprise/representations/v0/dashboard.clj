(ns metabase-enterprise.representations.v0.dashboard
  "Dashboard representations for v0 format.
  
  ASSUMPTIONS AND DESIGN DECISIONS:
  
  1. Dashboard Structure:
     - Dashboards contain multiple DashboardCards (report_dashboardcard)
     - DashboardCards can be organized into Tabs (dashboard_tab)
     - Each DashboardCard references a Card (question/model) or can be a text card
  
  2. Parameter Handling:
     - Dashboard-level parameters are stored in the :parameters field
     - Each DashboardCard can have parameter_mappings linking dashboard params to card params
     - Parameter mappings are complex nested structures that need careful preservation
  
  3. Card References:
     - DashboardCards reference Cards via :card_id
     - We convert these to refs (e.g., 'question-123') for export
     - Text cards have :card_id nil and :visualization_settings containing markdown
  
  4. Series Handling:
     - DashboardCards can have additional cards shown as series
     - Series are stored as :series in visualization_settings
     - Each series card needs to be tracked as a dependency
  
  5. Visualization Settings:
     - Complex nested maps containing chart configuration
     - May contain references to other cards (in series)
     - Preserved as-is except for card ID -> ref conversions
  
  6. Tab Support:
     - Tabs organize cards into logical groupings
     - Each tab has an ID, name, and position
     - DashboardCards reference their tab via :dashboard_tab_id
  
  7. Auto-Apply Filters:
     - The :auto_apply_filters field controls whether filters apply automatically
     - Preserved during export/import
  
  DIFFICULTIES AND CHALLENGES:
  
  1. Circular Dependencies:
     - Dashboards reference Cards, Cards can reference Dashboards (via dashboard_id)
     - We only track Dashboard -> Card dependencies, not the reverse
  
  2. Archived Cards:
     - DashboardCards might reference archived cards
     - Need to decide: fail on archived cards or skip them?
     - Current approach: include archived card refs but mark with comment
  
  3. Parameter Mapping Complexity:
     - Parameter mappings have variable structure (can be null, maps, or arrays)
     - Different mapping types for different field types (category, location, etc.)
     - Preserved as-is but may be fragile across versions
  
  4. Visualization Settings Size:
     - Can be very large JSON blobs
     - May contain computed/derived values
     - Risk of storing stale cached data
  
  5. Position and Size:
     - Cards have col, row, size_x, size_y for grid layout
     - These are viewport-specific and might not translate across systems
     - Preserved but users may need to adjust layouts after import
  
  6. Dashboard Filters vs Card Filters:
     - Dashboard parameters can be connected to card filters
     - The connection is through parameter_mappings which use parameter_id + card_id
     - Parameter IDs might change on import, requiring remapping"
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(def toucan-model
  "The toucan model keyword associated with dashboard representations"
  :model/Dashboard)

(defmethod v0-common/representation-type :model/Dashboard [_entity]
  :dashboard)

;; -- Import --

(defn- resolve-card-ref
  "Resolve a card reference to an actual card ID.
  Card refs can be in the format 'question-123' or 'model-456'."
  [card-ref ref-index]
  (when card-ref
    (let [resolved (v0-common/replace-refs-everywhere card-ref ref-index)]
      (if (number? resolved)
        resolved
        ;; If it's still a string after replacement, it might be unresolvable
        (log/warn "Could not resolve card reference:" card-ref)))))

(defn- import-parameter-mappings
  "Import parameter mappings, resolving any card references.
  Parameter mappings link dashboard parameters to card parameters."
  [parameter-mappings ref-index]
  (when parameter-mappings
    ;; Parameter mappings are complex structures that may contain card references
    ;; We preserve them as-is since they're mostly parameter IDs and field references
    (v0-common/replace-refs-everywhere parameter-mappings ref-index)))

(defn- import-series
  "Import series from visualization settings, resolving card references.
  Series are additional cards shown on the same visualization."
  [series ref-index]
  (when series
    (mapv (fn [series-card]
            ;; Each series entry might have a :card_id that needs resolution
            (if-let [card-ref (:card_id series-card)]
              (assoc series-card :card_id (resolve-card-ref card-ref ref-index))
              series-card))
          series)))

(defn- import-visualization-settings
  "Import visualization settings, resolving any embedded card references.
  Visualization settings can contain series (additional cards) that need resolution."
  [viz-settings ref-index]
  (when viz-settings
    (let [viz-settings (v0-common/replace-refs-everywhere viz-settings ref-index)]
      ;; Special handling for series if present
      (if-let [series (:series viz-settings)]
        (assoc viz-settings :series (import-series series ref-index))
        viz-settings))))

(defn- import-dashcard
  "Convert a representation dashcard to Toucan-compatible data.
  Resolves card references and parameter mappings."
  [dashcard ref-index]
  (-> dashcard
      (update :card_id resolve-card-ref ref-index)
      (update :parameter_mappings import-parameter-mappings ref-index)
      (update :visualization_settings import-visualization-settings ref-index)
      ;; Remove the temporary dashboard_id reference - it will be set when inserting
      (dissoc :dashboard_id)
      u/remove-nils))

(defn- import-tabs
  "Convert representation tabs to Toucan-compatible data.
  Tabs organize cards into logical groupings."
  [tabs]
  (when tabs
    (mapv (fn [tab]
            (-> tab
                ;; Remove the temporary dashboard_id - it will be set when inserting
                (dissoc :dashboard_id)
                (select-keys [:name :position])
                u/remove-nils))
          tabs)))

(defn yaml->toucan
  "Convert a v0 dashboard representation to Toucan-compatible data.
  
  NOTE: This returns the dashboard data only. DashboardCards and Tabs
  must be created separately after the dashboard is persisted, since they
  require the dashboard ID."
  [{:keys [name display_name description parameters
           embeddable embedding_parameters width] :as _representation}
   ref-index]
  ;; ASSUMPTION: We only create the dashboard entity here
  ;; DashboardCards and Tabs are handled in persist! after we have a dashboard ID
  (-> {:name (or display_name name)
       :description description
       :parameters parameters
       :embeddable embeddable                 ;; optional
       :embedding_params embedding_parameters ;; optional
       :width width}                          ;; optional
      u/remove-nils))

(defn- create-or-update-tabs!
  "Create or update tabs for a dashboard.
  
  DIFFICULTY: Tab IDs change between systems, so DashboardCards reference tabs by position.
  We need to create tabs first, then map old positions to new IDs."
  [dashboard-id tabs]
  (when (seq tabs)
    ;; First, delete existing tabs
    (t2/delete! :model/DashboardTab :dashboard_id dashboard-id)

    ;; Create new tabs and build a position->id map
    (let [created-tabs (for [tab tabs]
                         (first (t2/insert-returning-instances!
                                 :model/DashboardTab
                                 (assoc tab :dashboard_id dashboard-id))))]
      ;; Return a map of position -> new tab ID
      (into {} (map (fn [tab] [(:position tab) (:id tab)]) created-tabs)))))

(defn- create-or-update-dashcards!
  "Create or update dashcards for a dashboard.
  
  CHALLENGE: DashboardCards reference tabs by ID, but tab IDs change between systems.
  We use the position->tab-id map to remap tab references."
  [dashboard-id dashcards tab-position->id]
  (when (seq dashcards)
    ;; Delete existing dashcards
    (t2/delete! :model/DashboardCard :dashboard_id dashboard-id)

    ;; Create new dashcards
    (doseq [dashcard dashcards]
      (let [;; Remap dashboard_tab_id using position if we have tabs
            dashboard-tab-id (when-let [tab-pos (:dashboard_tab_id dashcard)]
                              ;; ASSUMPTION: dashboard_tab_id in representation is actually position
                              ;; This might need adjustment based on actual export format
                               (get tab-position->id tab-pos))
            dashcard-data (-> dashcard
                              (assoc :dashboard_id dashboard-id)
                              (assoc :dashboard_tab_id dashboard-tab-id)
                              u/remove-nils)]
        ;; DIFFICULTY: If card_id is nil, this is a text card
        ;; Text cards store their content in visualization_settings
        (when (or (:card_id dashcard-data)
                  (get-in dashcard-data [:visualization_settings :text]))
          (t2/insert! :model/DashboardCard dashcard-data))))))

(defn persist!
  "Persist a v0 dashboard representation by creating or updating it in the database.
  
  COMPLEXITY: Dashboards have three related entities that must be created in order:
  1. Dashboard (parent)
  2. DashboardTabs (children, needed for tab IDs)
  3. DashboardCards (children, reference tabs by ID)"
  [representation ref-index]
  (let [dashboard-data (->> (yaml->toucan representation ref-index)
                            (rep-t2/with-toucan-defaults :model/Dashboard))
        entity-id (:entity_id dashboard-data)
        existing (when entity-id
                   (t2/select-one :model/Dashboard :entity_id entity-id))

        ;; Create or update the dashboard
        dashboard (if existing
                    (do
                      (log/info "Updating existing dashboard" (:name dashboard-data)
                                "with ref" (:name representation))
                      (t2/update! :model/Dashboard (:id existing) (dissoc dashboard-data :entity_id))
                      (t2/select-one :model/Dashboard :id (:id existing)))
                    (do
                      (log/info "Creating new dashboard" (:name dashboard-data))
                      (first (t2/insert-returning-instances! :model/Dashboard dashboard-data))))

        dashboard-id (:id dashboard)

        ;; Import tabs first (to get their IDs)
        tabs (import-tabs (:tabs representation))
        tab-position->id (create-or-update-tabs! dashboard-id tabs)

        ;; Import and create dashcards (using tab IDs from above)
        dashcards (map #(import-dashcard % ref-index) (:dashcards representation))
        _ (create-or-update-dashcards! dashboard-id dashcards tab-position->id)]

    dashboard))

(defn- set-up-tabs
  [dashboard-id tab-representations ref-index]
  (let [tab-instances (t2/insert-returning-instances! :model/DashboardTab
                                                      (for [[pos tab-rep] (map vector (range) tab-representations)]
                                                        {:dashboard_id dashboard-id
                                                         :name (:name tab-rep)
                                                         :position pos}))]
    (t2/insert! :model/DashboardCard
                (for [[tab-rep tab-inst] (map vector tab-representations tab-instances)
                      dashcard-rep (:cards tab-rep)]
                  {:size_x (:width dashcard-rep)
                   :size_y (:height dashcard-rep)
                   :row    (:row dashcard-rep)
                   :col    (:column dashcard-rep)
                   :card_id (some->> (:card dashcard-rep)
                                     (v0-common/lookup-entity ref-index))
                   :dashboard_id dashboard-id
                   :dashboard_tab_id (:id tab-inst)
                   :parameter_mappings (:parameter_mappings dashcard-rep)
                   :visualization_settings ()}))))

(defn insert!
  [representation ref-index]
  (let [representation (rep-read/parse representation)]
    (assert (= :dashboard (:type representation)))
    (let [toucan (->> (yaml->toucan representation ref-index)
                      (rep-t2/with-toucan-defaults :model/Dashboard))
          dashboard (t2/insert-returning-instance! :model/Dashboard toucan)]
      (set-up-tabs (:id dashboard) (:tabs representation) ref-index)
      ;;todo (eric 2025-11-10): hydrate?
      )))

(defn update!
  [representation id ref-index]
  (let [representation (rep-read/parse representation)]
    (assert (= :dashboard (:type representation)))
    (let [toucan (yaml->toucan representation ref-index)]
      (t2/update! :model/Dashboard id (dissoc toucan :entity_id))
      (t2/delete! :model/DashboardTab :dashboard_id id)
      (t2/delete! :model/DashboardCard :dashboard_id id)
      (set-up-tabs id (:tabs representation) ref-index)
      ;;todo (eric 2025-11-10): hydrate?
      )))

;; -- Export --

(defn- series-card-ref [series-card]
  (u/update-if-exists series-card :card_id #(v0-common/id-model->ref % :model/Card)))

(defn- vis-settings-refs [settings]
  (when settings
    (u/update-if-exists settings :series #(mapv series-card-ref %))))

(defn- export-dashcard
  "Export a DashboardCard to representation format.
  Converts card_id to a card reference (e.g., 'ref:question-123')."
  [dashcard]
  (let [card-ref (when (:card_id dashcard)
                   (v0-common/id-model->ref (:card_id dashcard) :model/Card))]
    (-> (ordered-map
         :card card-ref ;; nil for text cards
         :row (:row dashcard)
         :column (:col dashcard)
         :width (:size_x dashcard)
         :height (:size_y dashcard)
         :dashboard_tab_id (:dashboard_tab_id dashcard)
         :parameter_mappings (:parameter_mappings dashcard)
         :visualization_settings (vis-settings-refs (:visualization_settings dashcard)))
        u/remove-nils)))

(defn- export-tab
  "Export a DashboardTab to representation format. Takes a toucan entity for the tab and toucan entities for its cards."
  [t2-tab t2-cards]
  (-> (ordered-map
       :name (:name t2-tab)
       :cards (mapv export-dashcard t2-cards))
      u/remove-nils))

(defn export-dashboard
  "Export a Dashboard Toucan entity to a v0 dashboard representation."
  [t2-dashboard]
  (let [dashboard-ref (v0-common/entity->ref t2-dashboard)

        ;; Fetch related tabs and cards
        tabs (t2/select :model/DashboardTab :dashboard_id (:id t2-dashboard)
                        {:order-by [[:position :asc]]})
        dashcards (t2/select :model/DashboardCard :dashboard_id (:id t2-dashboard)
                             {:order-by [[:row :asc] [:col :asc]]})
        cards-by-tab (group-by :dashboard_tab_id dashcards)]

    (-> (ordered-map
         :name dashboard-ref
         :type :dashboard
         :version :v0
         :display_name (:name t2-dashboard)
         :description (:description t2-dashboard)
         :parameters (:parameters t2-dashboard)
         :embeddable (:enable_embedding t2-dashboard)
         :embedding_parameters (:embedding_params t2-dashboard)
         :width (:width t2-dashboard)
         :tabs (mapv #(export-tab % (get cards-by-tab (:id %))) tabs))
        u/remove-nils)))
