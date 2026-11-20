(ns metabase.dashboards.models.dashboard-card
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.audit :as dashboards.audit]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.serialization :as dashboards.serialization]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCard [_model] :report_dashboardcard)

(doto :model/DashboardCard
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defn- snapshot-series
  "The `snapshots` of the DashboardCard `rows`, each with the ids of the Cards of its series."
  [rows snapshots]
  (let [rows (if (or (empty? rows) (contains? (first rows) :series))
               rows
               (t2/hydrate rows :series))]
    (mapv (fn [row snapshot]
            (assoc snapshot :series (mapv :id (:series row))))
          rows
          snapshots)))

(t2/deftransforms :model/DashboardCard
  {:parameter_mappings     parameters/transform-parameter-mappings
   :visualization_settings lib-be/transform-visualization-settings
   :inline_parameters      mi/transform-json})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- validate-link-card-entity-id
  "Require the link-card entity id to be an integer before it is stored. It is used as an id when the linked
  entity is looked up on read, so validating on write keeps a malformed value from being persisted."
  [dashcard]
  (when-let [id (get-in dashcard [:visualization_settings :link :entity :id])]
    (dashboards.db/ensure-integer-link-card-id id))
  dashcard)

(defn- validate-click-behavior-target-ids
  "Require click-behavior target ids to be integers before they are stored. They are later used as entity ids
  (e.g. by the dependency backfill), so validating on write keeps a malformed value from being persisted."
  [dashcard]
  (let [viz (:visualization_settings dashcard)]
    (doseq [cb (cons (:click_behavior viz)
                     (map (comp :click_behavior val) (:column_settings viz)))
            :let [id (:targetId cb)]
            :when (some? id)]
      (when-not (integer? id)
        (throw (ex-info "Click behavior target id must be an integer"
                        {:status-code 400, :id id})))))
  dashcard)

(defn- validate-dashcard-on-write
  [dashcard]
  (-> dashcard
      validate-link-card-entity-id
      validate-click-behavior-target-ids))

(defn- check-tab
  "Throws a 400 unless the tab of `dashcard`, if any, belongs to the Dashboard of the dashcard."
  [{:keys [dashboard_id dashboard_tab_id]}]
  (when (and dashboard_tab_id
             (not= dashboard_id (:dashboard_id (dashboards.db/dashboard-tab dashboard_tab_id))))
    (throw (ex-info (tru "The tab of a dashboard card must belong to its dashboard.") {:status-code 400}))))

(defn- check-card-not-in-document
  "Throws a 400 when the Card of `dashcard` belongs to a Document."
  [{:keys [card_id]}]
  (when card_id
    (when-let [document-cards (seq (dashboards.db/document-cards-among [card_id]))]
      (throw (ex-info (tru "Cards with {0} cannot be added to dashboards" "'document_id'")
                      {:status-code        400
                       :in-report-card-ids (map :id document-cards)})))))

(t2/define-before-insert :model/DashboardCard
  [dashcard]
  (check-tab dashcard)
  (check-card-not-in-document dashcard)
  (-> (merge {:parameter_mappings     []
              :visualization_settings {}
              :inline_parameters      []}
             dashcard)
      validate-dashcard-on-write))

(t2/define-before-update :model/DashboardCard
  [dashcard]
  (let [changes (t2/changes dashcard)]
    (when (contains? changes :dashboard_id)
      (throw (ex-info (tru "You cannot move a dashboard card to another dashboard.") {:status-code 400})))
    (when (contains? changes :dashboard_tab_id)
      (check-tab dashcard))
    (when (contains? changes :card_id)
      (check-card-not-in-document dashcard))
    (validate-dashcard-on-write dashcard)))

;;; Update visualizer dashboard cards in stats to have card id references instead of entity ids
(t2/define-after-select :model/DashboardCard
  [dashcard]
  (if (contains? dashcard :visualization_settings)
    (update dashcard :visualization_settings
            #(first (serialization/import-visualizer-settings serialization/app-db-store [%] {:lenient? true})))
    dashcard))

(declare series)

;;; --------------------------------------------------- Permissions --------------------------------------------------

(defn- card-collection-ids
  "For each of `dashcards`, by id, the ids of the Collections, nil for the root, of its Card and of the Cards of its
  series, whose permissions a DashboardCard takes, the Cards and series not hydrated loaded together."
  [dashcards]
  (run! #(when % (api/check-500 (contains? % :card_id) "No :card_id is set for a DashboardCard.")) dashcards)
  (let [dashcards (t2/hydrate (into [] (remove nil?) dashcards) :series)
        card-ids  (into #{} (comp (remove :card) (keep :card_id)) dashcards)
        cards     (if (seq card-ids)
                    (dashboards.db/card-collection-ids card-ids)
                    {})]
    (into {}
          (map (fn [{:keys [id card card_id series]}]
                 [id (cond-> (into #{} (map :collection_id) series)
                       card                  (conj (:collection_id card))
                       (and card_id
                            (not card)
                            (contains? cards card_id)) (conj (get cards card_id)))]))
          dashcards)))

(methodical/defmethod t2/batched-hydrate [:model/DashboardCard :can_read]
  "Whether the current user reads each of `dashcards`: the content of the Collections of its Card and series Cards,
  answered together."
  [_model _k dashcards]
  (let [collection-ids (card-collection-ids dashcards)
        readable       (collection/content-readable-collection-ids (into #{} cat (vals collection-ids))
                                                                   {:root-namespace nil, :audit-rules? false})]
    (for [dashcard dashcards]
      (when dashcard
        (vary-meta dashcard assoc :can_read (every? #(contains? readable %) (get collection-ids (:id dashcard))))))))

(methodical/defmethod t2/batched-hydrate [:model/DashboardCard :can_write]
  "Whether the current user writes each of `dashcards`: the content of the Collections of its Card and series Cards,
  answered together."
  [_model _k dashcards]
  (let [collection-ids (card-collection-ids dashcards)
        writable       (collection/content-writable-collection-ids (into #{} cat (vals collection-ids))
                                                                   {:root-namespace nil, :audit-rules? false})]
    (for [dashcard dashcards]
      (when dashcard
        (assoc dashcard :can_write (every? #(contains? writable %) (get collection-ids (:id dashcard))))))))

(defn from-parsed-json
  "Convert a map with dashboard-card into a Toucan instance assuming it came from parsed JSON and the map keys have
   been keywordized. This is useful if the data from a request body inside a `defendpoint` body, and you need it in the
   same format as if it were selected from the DB with toucan. It doesn't transform the `:created_at` or `:updated_at`
   fields, as the types of timestamp values differ by the application database driver.

   For example:
   ```
   (= dashcard ;; from toucan select, excluding :created_at and :updated_at
      (-> (json/encode dashcard)
          json/decode+kw
          from-parsed-json))
   =>
   true
   ```"
  [dashboard-card]
  (t2/instance :model/DashboardCard
               (-> dashboard-card
                   (m/update-existing :parameter_mappings #(some->> % (lib/normalize ::parameters.schema/parameter-mappings)))
                   (m/update-existing :visualization_settings #(lib/normalize ::lib.schema.visualization/visualization-settings %)))))

(defn virtual-card-settings
  "`visualization_settings` for a virtual dashcard — a dashcard with no backing card, such as a text
  card, heading, link, or iframe. `display` is the virtual display type as a string (\"text\",
  \"heading\", \"link\", \"iframe\", ...); `extras` (e.g. `{:text \"...\"}`, `{:link {:url \"...\"}}`)
  is merged in on top of the `:virtual_card` wrapper. Mirrors the shape the frontend saves; see
  `createVirtualCard` in frontend/src/metabase/common/utils/dashboard.ts."
  [display extras]
  (cond-> (merge {:virtual_card {:name                   nil
                                 :display                display
                                 :visualization_settings {}
                                 :archived               false}}
                 extras)
    ;; headings render without a card background, matching the frontend default
    (= display "heading") (assoc :dashcard.background false)))

;;; --------------------------------------------------- HYDRATION ----------------------------------------------------

(mi/define-batched-hydration-method series
  :series
  "Return the `Cards` associated as additional series on this DashboardCard."
  [dashcards]
  (when (seq dashcards)
    (let [dashcard-ids        (map :id dashcards)
          dashcard-id->series (when (seq dashcard-ids)
                                (as-> (dashboards.db/series-cards-for-dashcards dashcard-ids) series
                                  (group-by :dashboardcard_id series)
                                  ;; :result_metadata, :dimensions and :dimension_mappings are selected only so the
                                  ;; Card schema upgrade can run; they are not part of the series payload.
                                  (update-vals series #(map (fn [card]
                                                              (dissoc card :dashboardcard_id :result_metadata
                                                                      :dimensions :dimension_mappings))
                                                            %))))]
      (map (fn [dashcard]
             (assoc dashcard :series (get dashcard-id->series (:id dashcard) [])))
           dashcards))))

;;; ---------------------------------------------------- CRUD FNS ----------------------------------------------------

(mu/defn retrieve-dashboard-card
  "Fetch a single DashboardCard by its ID value."
  [id :- ms/PositiveInt]
  (-> (dashboards.db/dashcard id)
      (t2/hydrate :series)))

(defn dashcard->multi-cards
  "Return the cards which have been added to this dashcard using the 'add series' dashboard feature.

  Dashboards allow Line, Area, and Bar dashcards to have other questions (series) added to them
  so that several Questions are displayed in a single dashcard.

  It's important to know that this is different from the combo display,
  which is its own visualization type for Questions.

  This is also different from having multiple series displayed on Line, Area, or Bar Questions."
  [dashcard]
  (dashboards.db/multi-cards-for-dashcard (:id dashcard)))

;;; ----------------------------------------------- Link cards ----------------------------------------------------

(def ^:private link-card-models
  (set (keys serialization/link-card-model->toucan-model)))

(defn link-card-entity
  "The instance of the link-card `model` (a string like \"card\" or \"table\") with `id`, or nil."
  [model id]
  (dashboards.db/link-card-entity model id))

(defn link-card-entities
  "The instances of the link-card `model` (a string like \"card\" or \"table\") with integer `ids`."
  [model ids]
  (dashboards.db/link-card-entities model ids))

(mi/define-batched-hydration-method dashcard-linkcard-info
  :dashcard/linkcard-info
  "Update entity info for link cards.

  Link cards are dashcards that link to internal entities like Database/Dashboard/... or an url.
  The viz-settings only store the model name and id, info like name, description will need to be
  hydrated on fetch to make sure those info are up-to-date."
  [dashcards]
  (let [entity-path   [:visualization_settings :link :entity]
        ;; find all dashcards that are link-cards and get its model, id
        ;; [[:table #{1 2}] [:database #{3 4}]]
        model-and-ids (->> dashcards
                           (map #(get-in % entity-path))
                           (filter #(link-card-models (:model %)))
                           (group-by :model)
                           (map (fn [[k v]] [k (set (map :id v))])))]
    (if (seq model-and-ids)
      (let [;; query all entities in 1 db call
            ;; {[:table 3] {:name ...}}
            collection-columns
            (dashboards.db/link-card-collection-read-columns (vec (get (into {} model-and-ids) "collection")))
            model-and-id->info
            (-> (m/index-by (juxt :model :id) (dashboards.db/link-card-info-rows model-and-ids))
                (update-vals (fn [{model :model :as instance}]
                               (if (mi/can-read? (t2/hydrate (t2/instance (serialization/link-card-model->toucan-model model)
                                                                          (cond-> instance
                                                                            (= model "collection")
                                                                            (merge (get collection-columns (:id instance)))))
                                                             :can_read))
                                 instance
                                 {:restricted true}))))]
        (map (fn [card]
               (if-let [model-info (->> (get-in card entity-path)
                                        ((juxt :model :id))
                                        (get model-and-id->info))]
                 (assoc-in card entity-path model-info)
                 card))
             dashcards))
      dashcards)))

(defn dashcard-comparator
  "Comparator that determines which of two dashcards comes first in the layout order used for pulses.
  This is the same order used on the frontend for the mobile layout. Orders cards left-to-right, then top-to-bottom"
  [{row-1 :row col-1 :col} {row-2 :row col-2 :col}]
  (if (= row-1 row-2)
    (compare col-1 col-2)
    (compare row-1 row-2)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/DashboardCard
  [_model]
  {:create :event/dashboard-card-create
   :update :event/dashboard-card-update
   :delete :event/dashboard-card-delete})

(defmethod app-db-copy/spec :model/DashboardCard [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCard [_]
  {:schema    ::dashboards.schema/external-dashboard-card
   :copy      [:col :entity_id :inline_parameters :row :size_x :size_y]
   :parent    {:model :model/Dashboard
               :key   :dashboard_id
               :order (juxt :dashboard_tab_id :row :col :entity_id)}
   :children  {:series :model/DashboardCardSeries}
   :transform {:dashboard_id           serialization/import-only-transform
               :card_id                (serialization/fk-transform :model/Card)
               :action_id              (serialization/fk-transform :model/Action)
               :dashboard_tab_id       dashboards.serialization/dashboard-tab-id-transform
               :parameter_mappings     serialization/parameter-mappings-transform
               :visualization_settings serialization/visualization-settings-transform}})

(defmethod remote-sync/spec :model/DashboardCard
  [_model]
  {:synced-filter-clause dashboards.db/synced-dashcards-clause})

(defmethod revisions/spec :model/DashboardCard [_model]
  {:track    [:card_id :action_id :dashboard_id :dashboard_tab_id :row :col :size_x :size_y :parameter_mappings
              :inline_parameters :visualization_settings]
   :skip     [:entity_id]
   :parent   {:model :model/Dashboard :key :dashboard_id}
   :snapshot snapshot-series})

(defmethod audit/spec :model/DashboardCard [_model]
  {:track          []
   :track-redacted [:action_id :card_id :col :dashboard_id :dashboard_tab_id :inline_parameters :parameter_mappings
                    :row :size_x :size_y :visualization_settings]
   :skip           [:entity_id]
   :parent         {:model   :model/Dashboard
                    :key     :dashboard_id
                    :topics  {:create :dashboard-add-cards
                              :delete :dashboard-remove-cards}
                    :details dashboards.audit/cards-details}})

(defmethod dependencies/spec :model/DashboardCard [_model]
  {:part-of      {:type :dashboard :key :dashboard_id}
   :part-columns #{:card_id :dashboard_id :visualization_settings}})

(defmethod eid-translation/spec :model/DashboardCard [_model]
  {:names [:dashboard-card]})
