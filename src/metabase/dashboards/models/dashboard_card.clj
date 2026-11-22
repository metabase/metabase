(ns metabase.dashboards.models.dashboard-card
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard-card-series :as dashboard-card-series]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.serialization :as dashboards.serialization]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.pulse.models.pulse :as pulse]
   [metabase.queries.models.card :as card]
   [metabase.queries.schema :as queries.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCard [_model] :report_dashboardcard)

(doto :model/DashboardCard
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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

(t2/define-before-insert :model/DashboardCard
  [dashcard]
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

(defn- questions-to-unarchive
  "The ids of the dashboard questions of the Dashboard `dashboard-id` that `new-cards` name."
  [dashboard-id new-cards]
  (set/intersection (dashboards.db/internal-dashboard-question-ids dashboard-id) (into #{} (map :card_id) new-cards)))

(defn- questions-to-archive
  "The ids of the dashboard questions of the Dashboard `dashboard-id` that `new-cards` do not name."
  [dashboard-id new-cards]
  (set/difference (dashboards.db/internal-dashboard-question-ids dashboard-id) (into #{} (map :card_id) new-cards)))

(defn- check-questions-updatable!
  "Throws a 403 unless the current user may set `archived` of each of the Cards among `card-ids` that it changes."
  [card-ids archived?]
  (when (seq card-ids)
    (api/check-403 (mi/can-update-each? :model/Card (dashboards.db/cards-to-set-archived (vec card-ids) archived?) {:archived archived?}))))

(defn check-unarchive-internal-dashboard-questions!
  "Throws a 403 unless the current user may unarchive the dashboard questions that [[unarchive-internal-dashboard-questions!]]
  unarchives for `dashboard-id` and `new-cards`."
  [dashboard-id new-cards]
  (check-questions-updatable! (questions-to-unarchive dashboard-id new-cards) false))

(defn check-archive-internal-dashboard-questions!
  "Throws a 403 unless the current user may archive the dashboard questions that [[archive-internal-dashboard-questions!]]
  archives for `dashboard-id` and `new-cards`."
  [dashboard-id new-cards]
  (check-questions-updatable! (questions-to-archive dashboard-id new-cards) true))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-dashcards
  "Throw a 400 unless every DashboardCard with `ids` satisfies these rules:

  - its tab, if it has one, belongs to its Dashboard
  - its Card does not belong to a Document"
  [ids]
  (when (dashboards.db/dashcards-in-violation? ids)
    (when (dashboards.db/dashcards-of-document-cards? ids)
      (throw (ex-info (tru "Cards with ''document_id'' cannot be added to dashboards.") {:status-code 400})))
    (throw (ex-info (tru "The tab of a dashboard card must belong to its dashboard.") {:status-code 400}))))

(def ^:private DashboardCardWrite
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:id                         ms/PositiveInt]
    [:series                     {:optional true} [:maybe [:sequential ms/PositiveInt]]]
    [:card                       {:optional true} [:maybe ::queries.schema/card]]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]]])

(def ^:private updatable-columns
  [:action_id :card_id :row :col :size_x :size_y :parameter_mappings :visualization_settings :dashboard_tab_id
   :inline_parameters])

(defn- shallow-updates
  "The entries of `new` whose values differ from those of `old`."
  [new old]
  (into {} (filter (fn [[k v]] (not= v (get old k)))) new))

(defn- replace-series!
  "Replace the series of the DashboardCards of `series-by-dashcard`, a map from id to the ids of the Cards in the new
  series, in the order of their position, for those whose series differ from the stored ones, returning the ids of those
  that did."
  [series-by-dashcard]
  (let [stored-series (group-by :dashboardcard_id
                                (sort-by :position (dashboards.db/dashcard-series-for-dashcards (vec (keys series-by-dashcard)))))
        changed       (into {}
                            (filter (fn [[dashcard-id card-ids]]
                                      (not= (vec card-ids) (mapv :card_id (get stored-series dashcard-id)))))
                            series-by-dashcard)]
    (when (seq changed)
      (dashboard-card-series/delete-dashboard-card-series!
       (into [] (comp (mapcat #(get stored-series %)) (map :id)) (keys changed)))
      (dashboard-card-series/create-dashboard-card-series!
       (for [[dashcard-id card-ids] changed
             [i card-id]            (map-indexed vector card-ids)]
         {:dashboardcard_id dashcard-id, :card_id card-id, :position i})))
    (vec (keys changed))))

(mu/defn update-dashboard-cards! :- [:sequential ::lib.schema.id/dashcard]
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardCard, that differ from the stored ones, and
  replace its series by its `:series`, the ids of Cards, when it has one, and return the ids of the DashboardCards that
  changed. A DashboardCard moved to a tab of another Dashboard throws a 400, and the DashboardCards with the same
  changes are one statement."
  [rows :- [:sequential DashboardCardWrite]]
  (t2/with-transaction [_conn]
    (let [stored  (m/index-by :id (if (seq rows) (dashboards.db/dashcards-by-ids (mapv :id rows)) []))
          rows    (filterv #(contains? stored (:id %)) rows)
          changes (mapv (fn [row]
                          (assoc (shallow-updates (select-keys row updatable-columns) (get stored (:id row)))
                                 :id (:id row)))
                        rows)
          changed (filterv #(seq (dissoc % :id)) changes)]
      (doseq [[updates group] (group-by #(dissoc % :id) changed)]
        (dashboards.db/update-dashcards! (mapv :id group) updates))
      (when-let [moved (not-empty (into [] (comp (filter #(contains? % :dashboard_tab_id)) (map :id)) changed))]
        (check-dashcards moved))
      (let [series-by-dashcard (into {} (keep (fn [row] (when (contains? row :series) [(:id row) (or (:series row) [])]))) rows)
            series-changed     (when (seq series-by-dashcard)
                                 (replace-series! series-by-dashcard))]
        (into [] (distinct) (concat (map :id changed) series-changed))))))

(def ^:private NewDashboardCard
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:dashboard_id                ms/PositiveInt]
    [:id                          {:optional true} [:maybe ms/Int]]
    [:card                        {:optional true} [:maybe [:ref ::queries.schema/card]]]
    [:collection_authority_level  {:optional true} [:maybe [:or :keyword :string]]]
    [:series                      {:optional true} [:maybe [:sequential ms/PositiveInt]]]]])

(defn- insert-row
  "The row to insert for `dashboard-card`: the columns of a new DashboardCard with their defaults, or those of an
  imported one as they are."
  [dashboard-card writer]
  (if (= :import writer)
    dashboard-card
    (merge {:parameter_mappings     []
            :visualization_settings {}
            :inline_parameters      []}
           (dissoc dashboard-card :id :created_at :updated_at :entity_id :series :card :collection_authority_level))))

(mu/defn create-dashboard-cards! :- [:sequential :map]
  "Insert the DashboardCards `rows` with their series, and return the new DashboardCards, hydrated with their series, or,
  for an import, as inserted. A DashboardCard whose tab belongs to another Dashboard, or whose Card belongs to a
  Document, throws a 400."
  ([rows :- [:sequential NewDashboardCard]]
   (create-dashboard-cards! rows nil))
  ([rows :- [:sequential NewDashboardCard]
    opts :- [:maybe [:map {:closed true} [:writer {:optional true} [:= :import]]]]]
   (if (empty? rows)
     []
     (t2/with-transaction [_conn]
       (let [writer   (:writer opts)
             inserted (dashboards.db/insert-dashcards! (mapv #(insert-row % writer) rows))]
         (check-dashcards (mapv :id inserted))
         (when-let [series (not-empty (for [[dashcard row] (map vector inserted rows)
                                            [i card-id]    (map-indexed vector (:series row))]
                                        {:dashboardcard_id (:id dashcard), :card_id card-id, :position i}))]
           (dashboard-card-series/create-dashboard-card-series! series))
         (if (= :import writer)
           inserted
           (-> (dashboards.db/dashcards-by-ids (mapv :id inserted))
               (t2/hydrate :series))))))))

(mu/defn delete-dashboard-cards! :- :nil
  "Delete the DashboardCards with `dashboard-card-ids`, with their PulseCards and DashboardCardSeries."
  [dashboard-card-ids :- [:sequential ::lib.schema.id/dashcard]]
  (when (seq dashboard-card-ids)
    (pulse/delete-pulse-cards-for-dashcards! dashboard-card-ids)
    (dashboards.db/delete-dashcards! (vec dashboard-card-ids)))
  nil)

(defn unarchive-internal-dashboard-questions!
  "Unarchives the dashboard questions of the Dashboard `dashboard-id` that appear in `new-cards`, the dashcards about to be
  saved, which come before the dashcards that name them."
  [dashboard-id new-cards]
  (when-let [ids (seq (questions-to-unarchive dashboard-id new-cards))]
    (card/update-cards! (mapv :id (dashboards.db/cards-to-set-archived (vec ids) false)) {:archived false})))

(defn archive-internal-dashboard-questions!
  "Archives the dashboard questions of the Dashboard `dashboard-id`, which are internal to it and not displayed as part of a
  collection, that no card of `new-cards`, the dashcards saved, names, which come after the dashcards that named them."
  [dashboard-id new-cards]
  (when-let [ids (seq (questions-to-archive dashboard-id new-cards))]
    (card/update-cards! (mapv :id (dashboards.db/cards-to-set-archived (vec ids) true)) {:archived true})))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardCard [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCard [_]
  {:schema    ::dashboards.schema/external-dashboard-card
   :copy      [:col :entity_id :inline_parameters :row :size_x :size_y]
   :parent    {:model :model/Dashboard
               :key   :dashboard_id
               :order (juxt :dashboard_tab_id :row :col :entity_id)}
   :children  {:series :model/DashboardCardSeries}
   :insert!   #(create-dashboard-cards! % {:writer :import})
   :update!   #(do (update-dashboard-cards! %) %)
   :delete!   delete-dashboard-cards!
   :transform {:dashboard_id           serialization/import-only-transform
               :card_id                (serialization/fk-transform :model/Card)
               :action_id              (serialization/fk-transform :model/Action)
               :dashboard_tab_id       dashboards.serialization/dashboard-tab-id-transform
               :parameter_mappings     serialization/parameter-mappings-transform
               :visualization_settings serialization/visualization-settings-transform}})

(defmethod remote-sync/spec :model/DashboardCard
  [_model]
  {:synced-filter-clause dashboards.db/synced-dashcards-clause})

(defmethod eid-translation/spec :model/DashboardCard [_model]
  {:names [:dashboard-card]})
