(ns metabase.dashboards.models.dashboard
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.actions.models :as actions.models]
   [metabase.activity-feed.recent-views.spec :as recent-views]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.cache.models.cache-config :as cache-config]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.config.core :as config]
   [metabase.dashboards.audit :as dashboards.audit]
   [metabase.dashboards.collection-items :as dashboards.collection-items]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.dependencies :as dashboards.dependencies]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-card-series :as dashboard-card-series]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.dashboards.recent-views :as dashboards.recent-views]
   [metabase.dashboards.replacement :as dashboards.replacement]
   [metabase.dashboards.revisions :as dashboards.revisions]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.serialization :as dashboards.serialization]
   [metabase.dashboards.staleness :as dashboards.staleness]
   [metabase.dashboards.xrays :as dashboards.xrays]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.pulse.models.pulse :as pulse]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as card]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.queries.schema :as queries.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(methodical/defmethod t2/model-for-automagic-hydration [#_model :default #_k :dashboard]
  [_original-model _k]
  :model/Dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive :hook/worktree-id)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/non-timestamped-fields :model/Dashboard [_]
  #{:last_viewed_at :initially_published_at})

(def ^:private column-normalizers
  "The function that converts a value of each column of a Dashboard that a transform converts on its way in."
  {:parameters       #(lib/normalize ::parameters.schema/parameters %)
   :embedding_params #(lib/normalize ms/EmbeddingParams %)})

(t2/deftransforms :model/Dashboard
  {:parameters       parameters/transform-parameters
   :public_uuid      (mi/transform-encrypted-text "report_dashboard.public_uuid")
   :embedding_params {:in  (comp mi/json-in (:embedding_params column-normalizers))
                      :out mi/json-out-without-keywordization}})

(defn- normalize-columns
  "`row`, the columns of a Dashboard, with the value of each column a transform converts converted the same way, so that
  it compares with a stored row."
  [row]
  (reduce-kv (fn [row k f] (m/update-existing row k f)) row column-normalizers))

(defmethod mi/non-internal-filter-clause :model/Dashboard
  [_model alias]
  [:not= (u/qualified-key alias :creator_id) config/internal-mb-user-id])

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (-> (merge {:parameters []} dashboard)
      maybe-populate-initially-published-at
      public-sharing/add-public-uuid-prefix))

(defn- add-archived-directly
  "`row`, an update of a Dashboard, with the expression that sets `archived_directly` when it changes `archived` and does
  not give it: true when the Collection the Dashboard is in after the update is not archived, which the database reads."
  [row]
  (let [changes (t2/changes row)]
    (if (or (not (contains? changes :archived)) (contains? changes :archived_directly))
      row
      (assoc row :archived_directly (mi/archived-directly-clause :model/Dashboard changes)))))

(t2/define-before-update :model/Dashboard
  [row]
  (-> row
      add-archived-directly
      mi/add-initially-published-at
      public-sharing/add-public-uuid-prefix-if-changed))

(mu/defn- migrate-parameter [p :- ::parameters.schema/parameter]
  (cond-> p
    ;; It was previously possible for parameters to have empty strings for :name and
    ;; :slug, but these are now required to be non-blank strings. (metabase#24500)
    (or (= (:name p) "")
        (= (:slug p) ""))
    (assoc :name "unnamed" :slug "unnamed")
    (or
     ;; we don't support linked filters for parameters with :values_source_type of anything except nil,
     ;; but it was previously possible to set :values_source_type to "static-list" or "card" and still
     ;; have linked filters. (metabase#33892)
     (some? (:values_source_type p))
     (= (:values_query_type p) :none))
    ;; linked filters don't do anything when parameters have values_query_type="none" (aka "Input box"),
    ;; but it was previously possible to set :values_query_type to "none" and still have linked filters.
    ;; (metabase#34657)
    (dissoc :filteringParameters)))

(defn- migrate-parameters-list
  "Update the `:parameters` list of a dashboard from legacy formats."
  [dashboard]
  (m/update-existing dashboard :parameters #(map migrate-parameter %)))

(t2/define-after-select :model/Dashboard
  [dashboard]
  (-> dashboard
      migrate-parameters-list
      public-sharing/remove-public-uuid-if-public-sharing-is-disabled))

;;; --------------------------------------------------- Permissions --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :can_read]
  "Whether the current user reads each of `dashboards`, as the content of its Collection."
  [_model _k dashboards]
  (collection/hydrate-content-can-read :model/Dashboard dashboards {:audit-rules? true}))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :can_write]
  "Whether the current user writes each of `dashboards`, as the content of its Collection."
  [_model _k dashboards]
  (collection/hydrate-content-can-write :model/Dashboard dashboards {:audit-rules? true}))

(def ^:private embedding-columns
  "The columns that decide whether and how a Dashboard is embedded."
  [:enable_embedding :embedding_type :embedding_params])

(defn- can-write-collection?
  "Whether the current user writes the Collection with `collection-id`, nil for the root."
  [collection-id]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defn changes-embedding?
  "Whether `changes` change the embedding of `dashboard`."
  [dashboard changes]
  (boolean (some #(api/column-will-change? (get dashboard %) (get changes % ::api/not-provided)) embedding-columns)))

(defn- can-change-embedding?
  "Whether the current user may do what `changes` do to the embedding of `dashboard`: only a superuser changes it."
  [dashboard changes]
  (or (not (changes-embedding? dashboard changes))
      (boolean (mi/superuser?))))

(defn- public-link-change
  "Whether `changes` set, `:set`, or clear, `:clear`, the public link of `dashboard`, and nil when they leave it."
  [dashboard changes]
  (when (api/column-will-change? (:public_uuid dashboard) (get changes :public_uuid ::api/not-provided))
    (if (:public_uuid changes) :set :clear)))

(defn- can-change-public-link?
  "Whether the current user may do what `changes` do to the public link of `dashboard`: a superuser sets it, and one
  with the application permission to change settings clears it."
  [dashboard changes]
  (case (public-link-change dashboard changes)
    :set   (mi/superuser?)
    :clear (boolean (or (mi/superuser?) (perms/current-user-has-application-permissions? :setting)))
    true))

(defn- changes-only-public-link?
  "Whether `changes` change the public link of `dashboard` and nothing else, the one change that needs no write access
  to it: a settings manager may remove the link of a Dashboard they cannot write."
  [dashboard changes]
  (boolean (and (public-link-change dashboard changes)
                (every? #{:public_uuid :made_public_by_id} (keys changes)))))

(defn- creates-shared-dashboard?
  "Whether `dashboard` is created with a public link or with embedding."
  [dashboard]
  (boolean (or (:public_uuid dashboard)
               (:enable_embedding dashboard)
               (:embedding_type dashboard)
               (seq (:embedding_params dashboard)))))

(defmethod mi/can-create? :model/Dashboard
  [_model {collection-id :collection_id, :as dashboard}]
  (and (can-write-collection? collection-id)
       (or (not (creates-shared-dashboard? dashboard))
           (boolean (mi/superuser?)))))

(defn- following-questions
  "The Cards internal to the Dashboards with `dashboard-ids` that archiving them, when `archive?`, or restoring them
  takes along."
  [dashboard-ids archive?]
  (if archive?
    (dashboards.db/questions-archived-with-dashboards dashboard-ids)
    (dashboards.db/questions-restored-with-dashboards dashboard-ids)))

(defn- writable-for?
  "Whether the current user writes `dashboard` as far as `changes` need: a change of its public link alone needs no
  write access."
  [dashboard changes]
  (or (changes-only-public-link? dashboard changes)
      (mi/can-write? dashboard)))

(defn- can-share?
  "Whether the current user may do what `changes` do to the embedding and the public link of `dashboard`."
  [dashboard changes]
  (and (can-change-embedding? dashboard changes)
       (can-change-public-link? dashboard changes)))

(defmethod mi/can-update? :model/Dashboard
  [dashboard changes]
  (mi/can-update-all? :model/Dashboard [dashboard] changes))

(defmethod mi/can-update-all? :model/Dashboard
  [_model dashboards changes]
  (boolean
   (and (every? #(writable-for? % changes) dashboards)
        (mi/archive-followers-updatable? dashboards changes :model/Card following-questions)
        (collection/can-move-all-or-404? dashboards changes)
        (every? #(can-share? % changes) dashboards))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :tabs]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id (dashboards.db/dashboard-tabs-for-dashboards (map :id dashboards)))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :dashcards]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id
              (dashboards.db/dashcards-with-visible-cards-for-dashboards (map :id dashboards)))
   :id
   {:default []}))

(mi/define-batched-hydration-method collections-authority-level
  :collection_authority_level
  "Efficiently hydrate the `:collection_authority_level` of a sequence of dashboards."
  [dashboards]
  (when (seq dashboards)
    (let [coll-id->level (into {}
                               (map (juxt :id :authority_level))
                               (dashboards.db/dashboard-collection-authority-levels
                                (into #{} (map u/the-id) dashboards)))]
      (for [dashboard dashboards]
        (assoc dashboard :collection_authority_level (get coll-id->level (u/the-id dashboard)))))))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :resolved-params]
  "Return map of Dashboard parameter key -> param with resolved `:mappings`.
   (params/dashboard->resolved-params (t2/select-one Dashboard :id 62))
   ;; ->
   {\"ee876336\" {:name     \"Category Name\"
                  :slug     \"category_name\"
                  :id       \"ee876336\"
                  :type     \"category\"
                  :mappings #{{:parameter_id \"ee876336\"
                               :card_id      66
                               :dashcard     ...
                               :target       [:dimension [:fk-> [:field-id 263] [:field-id 276]]]}}},
    \"6f10a41f\" {:name     \"Price\"
                  :slug     \"price\"
                  :id       \"6f10a41f\"
                  :type     \"category\"
                  :mappings #{{:parameter_id \"6f10a41f\"
                               :card_id      66
                               :dashcard     ...
                               :target       [:dimension [:field-id 264]]}}}}"
  [_model k dashboards]
  (let [dashboards-with-cards (t2/hydrate dashboards [:dashcards :card :series])]
    (map #(assoc %1 k %2) dashboards (map params/dashboard->resolved-params dashboards-with-cards))))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- check-dashboards
  "Throw a 400 unless each of `rows`, holding the `:collection_id` and `:archived` state a Dashboard is about to have,
  satisfies these rules, checked for the first row that breaks one, with one read of the Collections:

  - its Collection is in a namespace that holds Dashboards
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Dashboard is
  - its parameters, when it has any, are well formed"
  [rows]
  (collection/check-collections-for-model :model/Dashboard rows)
  (run! params/assert-valid-parameters rows))

(def ^:private TabPart
  [:map {:closed true}
   [:id        ms/Int]
   [:name      ::dashboards.schema/dashboard-tab.name]
   [:position  {:optional true} ::dashboards.schema/dashboard-tab.position]
   [:entity_id {:optional true} [:maybe :string]]])

(def ^:private DashcardPart
  [:merge
   ::dashboards.schema/dashboard-card.update
   [:map {:closed true}
    [:id                         {:optional true} [:maybe ms/Int]]
    [:dashboard_tab_id           {:optional true} [:maybe ms/Int]]
    [:card                       {:optional true} [:maybe [:ref ::queries.schema/card]]]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]
    [:series                     {:optional true} [:maybe [:sequential ms/PositiveInt]]]]])

(defn- create-parts!
  "Insert the tabs and the dashcards that the `rows` give to the `dashboards` they created, in the same order, with the
  ids of the tabs that the dashcards name replaced by those of the tabs created."
  [dashboards rows]
  (let [tabs      (vec (for [[dashboard row] (map vector dashboards rows)
                             tab             (:tabs row)]
                         [(:id dashboard) tab]))
        created   (when (seq tabs)
                    (dashboard-tab/create-dashboard-tabs!
                     (mapv (fn [[dashboard-id tab]]
                             (assoc (select-keys tab [:name :position :entity_id]) :dashboard_id dashboard-id))
                           tabs)))
        tab-ids   (zipmap (map (fn [[dashboard-id tab]] [dashboard-id (:id tab)]) tabs) (map :id created))
        dashcards (vec (for [[dashboard row] (map vector dashboards rows)
                             dashcard        (:dashcards row)]
                         (cond-> (assoc dashcard :dashboard_id (:id dashboard))
                           (:dashboard_tab_id dashcard)
                           (update :dashboard_tab_id #(get tab-ids [(:id dashboard) %] %)))))]
    (dashboard-card/create-dashboard-cards! dashcards)))

(def ^:private NewDashboard
  [:merge
   ::dashboards.schema/dashboard.create
   [:map {:closed true}
    [:tabs      {:optional true} [:maybe [:sequential TabPart]]]
    [:dashcards {:optional true} [:maybe [:sequential DashcardPart]]]]])

(defn- insert-dashboards!
  "Insert `rows`, the checked new Dashboards of one batch, with their ParameterCards, tabs and dashcards, and return the
  new Dashboards."
  [rows]
  (let [dashboards (dashboards.db/insert-dashboards! (mapv #(dissoc % :tabs :dashcards) rows))]
    (parameter-card/sync-parameter-cards!
     "dashboard"
     (mapv (fn [dashboard] [(:id dashboard) (or (:parameters dashboard) [])]) dashboards))
    (create-parts! dashboards rows)
    dashboards))

(defn- create-dashboard-batch!
  "Check and insert `rows`, one batch of a call, and return the new Dashboards."
  [rows]
  (check-dashboards (mapv #(update % :archived boolean) rows))
  (insert-dashboards! rows))

(mu/defn create-dashboards! :- [:sequential :map]
  "Insert the Dashboard `rows` and return the inserted instances in the order of the rows, in one transaction,
  publishing their create event, each Collection having to hold a Dashboard, the ParameterCards of the parameters
  that draw values from a Card being created, and the `:tabs` and `:dashcards` of a row being inserted with it and
  held by the Revision of the creation."
  ([rows :- [:sequential NewDashboard]]
   (create-dashboards! rows nil))
  ([rows :- [:sequential NewDashboard]
    opts :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [created (into [] (mapcat #(create-dashboard-batch! (vec %)))
                         (partition-all app-db/create-partition-size rows))]
       (when (seq created)
         (events/publish-event! :event/dashboard-create (events/create-event created opts)))
       created))))

(defn- changed?
  "Whether `row`, the columns to write, changes the column `k` of `stored`."
  [stored row k]
  (and (contains? row k) (not= (get row k) (get stored k))))

(defn- move-questions!
  "Moves the dashboard questions of the Dashboards of `moved`, update rows that change `collection_id`, to the Collection
  of their Dashboard, with one call for each Collection."
  [moved]
  (doseq [[collection-id moved-rows] (group-by :collection_id moved)
          :let [question-ids (dashboards.db/question-ids-of-dashboards (mapv :id moved-rows))]
          :when (seq question-ids)]
    (card/update-cards! (mapv (fn [id] {:id id :collection_id collection-id}) question-ids))))

(defn- set-questions-archived!
  "Archives the dashboard questions of the Dashboards of `rows`, update rows that change `archived`, which the Dashboard
  archives, and restores those that its archive took down."
  [rows]
  (doseq [[archived? group] (group-by (comp boolean :archived) rows)
          :let [ids          (mapv :id group)
                question-ids (if archived?
                               (dashboards.db/question-ids-archived-with-dashboards ids)
                               (dashboards.db/question-ids-restored-with-dashboards ids))]
          :when (seq question-ids)]
    (card/update-cards! (mapv (fn [id] {:id id :archived archived?}) question-ids) {:context {:archived-with [:model/Dashboard (first ids)]}})))

(mu/defn parameters-without-orphans :- [:maybe [:sequential :map]]
  "The `parameters` of a Dashboard without the inline parameters that `dashcards` of it, which are being deleted, held,
  nil when none is left out."
  [parameters :- [:maybe [:sequential :map]]
   dashcards  :- [:maybe [:sequential :map]]]
  (let [orphaned-ids (set (mapcat :inline_parameters dashcards))
        cleaned      (filterv #(not (contains? orphaned-ids (:id %))) parameters)]
    (when (and (seq orphaned-ids) (not= (count parameters) (count cleaned)))
      cleaned)))

(defn- write-columns!
  "Apply the columns of `rows`, each holding the `:id` of one of the Dashboards of `id->stored`, a map from id to the
  instance read before, with one statement for the rows that get the same changes, moving the dashboard questions of
  a Dashboard that moves, updating the ParameterCards of a change of `parameters` and archiving or restoring the
  dashboard questions of a change of `archived`, and return the rows with the `archived_directly` that the database
  gave to those that change `archived`."
  [id->stored rows]
  (let [moved           (filterv #(changed? (get id->stored (:id %)) % :collection_id) rows)
        reparameterised (filterv #(changed? (get id->stored (:id %)) % :parameters) rows)
        archived        (filterv #(changed? (get id->stored (:id %)) % :archived) rows)]
    (move-questions! moved)
    (when (seq reparameterised)
      (parameter-card/sync-parameter-cards!
       "dashboard" (mapv (juxt :id :parameters) reparameterised)))
    (dashboards.db/update-dashboards-by-changes! rows)
    (set-questions-archived! archived)
    (if-let [ids (not-empty (into [] (comp (remove #(contains? % :archived_directly)) (map :id)) archived))]
      (let [fresh (dashboards.db/dashboards-by-ids ids)]
        (mapv #(cond-> % (contains? fresh (:id %)) (assoc :archived_directly (:archived_directly (get fresh (:id %))))) rows))
      rows)))

(defn- publish-update!
  "Publish, as the last step of a write, the update event of the Dashboards that the `rows` change, and the touch event of
  those of `touched-ids` that they leave unchanged, whose dashcards or tabs the write changed, so that their records, as
  their Revisions, are made once; `id->stored` holds the Dashboards as read before."
  [id->stored rows touched-ids opts]
  (let [event   (events/update-event id->stored rows opts)
        updated (into #{} (map (comp :id :object)) (:changes event))
        touched (into [] (comp (remove updated) (distinct) (keep id->stored)) touched-ids)]
    (events/publish-event! :event/dashboard-update
                           (update event :changes into (:changes (events/touch-event touched))))))

(defn- publish-cards!
  "Publish the audit event of the dashcards `added` to and of those `removed` from the Dashboards of `dashboards`, a
  map from id to the instance, one event for each of them holding an entry `:object` with its `:dashcards` for each
  Dashboard."
  [dashboards added removed]
  (doseq [[topic dashcards] [[:event/dashboard-add-cards added] [:event/dashboard-remove-cards removed]]
          :when (seq dashcards)]
    (events/publish-event! topic {:objects (into []
                                                 (map (fn [[dashboard-id group]]
                                                        {:object    (get dashboards dashboard-id)
                                                         :dashcards (vec group)}))
                                                 (group-by :dashboard_id dashcards))
                                  :user-id (mi/current-user-id)})))

(defn- replace-parts!
  "Replace the tabs, for each Dashboard of `parts`, a map from its id to the part lists it gives, when it holds
  `:tabs`, and the dashcards, when it holds `:dashcards`, by those of `parts`, deleting the ones the new lists lack,
  updating the others and creating the new ones, with one statement for each of them, and return, by Dashboard id,
  the dashcards `:added` and `:removed` and whether the write `:changed?` anything."
  [parts]
  (let [tabbed        (filterv #(contains? (get parts %) :tabs) (keys parts))
        carded        (filterv #(contains? (get parts %) :dashcards) (keys parts))
        current-cards (when (seq carded)
                        (group-by :dashboard_id (dashboards.db/dashcards-of-dashboards carded)))
        current-tabs  (when (seq tabbed)
                        (group-by :dashboard_id (dashboards.db/dashboard-tabs-for-dashboards tabbed)))
        tab-results   (zipmap tabbed
                              (dashboard-tab/replace-dashboard-tabs!
                               (mapv (fn [id]
                                       {:dashboard_id id
                                        :current-tabs (mapv #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                                            (get current-tabs id))
                                        :new-tabs     (:tabs (get parts id))})
                                     tabbed)))
        plans         (into {}
                            (map (fn [id]
                                   (let [tabs         (get tab-results id)
                                         deleted-tabs (set (:deleted-tab-ids tabs))
                                         current      (remove (comp deleted-tabs :dashboard_tab_id) (get current-cards id))
                                         current-ids  (into #{} (map :id) current)
                                         new-ids      (into #{} (keep :id) (:dashcards (get parts id)))
                                         dashcards    (mapv #(cond-> % (:dashboard_tab_id %)
                                                                     (update :dashboard_tab_id (fn [tab-id] (get (:old->new-tab-id tabs) tab-id tab-id))))
                                                            (:dashcards (get parts id)))]
                                     [id {:to-update (filterv #(contains? current-ids (:id %)) dashcards)
                                          :to-create (filterv #(not (contains? current-ids (:id %))) dashcards)
                                          :to-delete (filterv #(not (contains? new-ids (:id %))) current)}])))
                            carded)
        to-update     (into [] (mapcat (comp :to-update val)) plans)
        to-delete     (into [] (mapcat (comp :to-delete val)) plans)
        updated       (set (when (seq to-update) (dashboard-card/update-dashboard-cards! to-update)))
        _             (when (seq to-delete) (dashboard-card/delete-dashboard-cards! (mapv :id to-delete)))
        added         (group-by :dashboard_id
                                (when-let [to-create (not-empty
                                                      (into []
                                                            (mapcat (fn [[id plan]] (map #(assoc % :dashboard_id id) (:to-create plan))))
                                                            plans))]
                                  (dashboard-card/create-dashboard-cards! to-create)))]
    (into {}
          (map (fn [id]
                 (let [tabs (get tab-results id)
                       plan (get plans id)]
                   [id {:added    (vec (get added id))
                        :removed  (vec (:to-delete plan))
                        :changed? (boolean (or (seq (:created-tab-ids tabs)) (seq (:updated-tab-ids tabs)) (seq (:deleted-tab-ids tabs))
                                               (some #(contains? updated (:id %)) (:to-update plan))
                                               (seq (:to-delete plan)) (seq (get added id))))}])))
          (keys parts))))

(def ^:private UpdateDashboard
  [:merge
   ::dashboards.schema/dashboard.update
   [:map {:closed true}
    [:tabs      {:optional true} [:maybe [:sequential TabPart]]]
    [:dashcards {:optional true} [:maybe [:sequential DashcardPart]]]]])

(defn- check-dashboard-updates
  "Throw a 400 unless every one of `rows`, updates of the `id->stored` Dashboards that move, satisfies these rules:

  - its Collection is in a namespace that holds Dashboards
  - its Collection is not the library, its Data or its Metrics collection
  - its Collection is not archived, unless the Dashboard is
  - a change of its parameters keeps them well formed"
  [id->stored rows]
  (doseq [row rows :when (contains? row :parameters)]
    (params/assert-valid-parameters row))
  (check-dashboards
   (for [row (filterv #(changed? (get id->stored (:id %)) % :collection_id) rows)]
     {:collection_id (:collection_id row)
      :archived      (boolean (if (contains? row :archived) (:archived row) (:archived (get id->stored (:id row)))))})))

(defn- write-dashboard-updates!
  "Writes `rows`, updates of the `id->stored` Dashboards, with the parts each holds in `parts`, and returns what the events
  need: the Dashboards `:id->stored` and as they are `:after`, the `:rows` with their `archived_directly`, and what the
  parts `:replaced`."
  [id->stored rows parts]
  (let [replaced (replace-parts! (select-keys parts (map :id rows)))
        rows     (mapv (fn [row]
                         (let [cleaned (parameters-without-orphans
                                        (if (contains? row :parameters)
                                          (:parameters row)
                                          (:parameters (get id->stored (:id row))))
                                        (:removed (get replaced (:id row))))]
                           (cond-> row cleaned (assoc :parameters cleaned))))
                       rows)
        rows     (write-columns! id->stored rows)]
    {:id->stored   id->stored
     :rows     rows
     :after    (into {} (map (fn [row] [(:id row) (merge (get id->stored (:id row)) row)])) rows)
     :replaced replaced}))

(defn- update-dashboard-batch!
  "Checks and writes the Dashboards of `batch`, up to one partition of the call, and returns what the events need."
  [batch]
  (let [parts  (into {} (keep (fn [row]
                                (when (or (contains? row :tabs) (contains? row :dashcards))
                                  [(:id row) (select-keys row [:tabs :dashcards])])))
                     batch)
        rows   (mapv #(normalize-columns (dissoc % :tabs :dashcards)) batch)
        id->stored (dashboards.db/dashboards-by-ids (mapv :id rows))
        rows   (filterv #(contains? id->stored (:id %)) rows)]
    (check-dashboard-updates id->stored rows)
    (write-dashboard-updates! id->stored rows parts)))

(defn- publish-dashboard-updates!
  "Publishes the events of the Dashboards that `batches`, what [[update-dashboard-batch!]] returned, wrote: the audit
  events of their dashcards and one update event, with a touch of each Dashboard an import leaves unchanged."
  [batches opts]
  (let [replaced (into {} (map :replaced) batches)
        rows     (into [] (mapcat :rows) batches)]
    (publish-cards! (into {} (map :after) batches)
                    (into [] (mapcat (comp :added val)) replaced)
                    (into [] (mapcat (comp :removed val)) replaced))
    (when (seq rows)
      (publish-update! (into {} (map :id->stored) batches)
                       rows
                       (into (if (= :import (:writer opts)) (mapv :id rows) [])
                             (comp (filter (comp :changed? val)) (map key))
                             replaced)
                       opts))))

(mu/defn- write-updates! :- :nil
  "Apply the columns of each of `rows` to the Dashboard with its `:id` and replace the parts a row holds, publishing
  last one update event for all the Dashboards whose columns or parts it changes, and for an import a touch of each
  one it leaves unchanged, with the columns as [[write-columns!]] applies them."
  [rows :- [:sequential UpdateDashboard]
   opts :- :metabase.events.schema/write-opts]
  (t2/with-transaction [_conn]
    (let [batches (mapv update-dashboard-batch! (partition-all app-db/update-partition-size rows))]
      (publish-dashboard-updates! batches opts)))
  nil)

(def ^:private DashboardChangesWithParts
  (mut/dissoc UpdateDashboard :id))

(mu/defn update-dashboards! :- :nil
  "Apply `updates`, each the `:id` of a Dashboard with the columns to give it, which may differ from one to the next, and
  publish one update event for all of them, after what the columns do, see [[write-columns!]]."
  ([updates :- [:sequential ::dashboards.schema/dashboard.update]]
   (update-dashboards! updates nil))
  ([updates :- [:sequential ::dashboards.schema/dashboard.update]
    opts    :- :metabase.events.schema/write-opts]
   (write-updates! updates opts)
   nil))

(mu/defn update-dashboard! :- :nil
  "Apply `changes` to the Dashboard with `id`, its columns and the new lists of its `:tabs` and `:dashcards`, which
  replace the stored ones, deleting those the lists lack, updating the others and creating those with another id, the
  `:dashboard_tab_id` of a dashcard naming a tab created by its temporary id, and publish one update event for the
  whole write, the audit events of the dashcards a replacement adds and removes, and for an import a touch when no
  column changes."
  ([id :- ::lib.schema.id/dashboard
    changes :- DashboardChangesWithParts]
   (update-dashboard! id changes nil))
  ([id :- ::lib.schema.id/dashboard
    changes :- DashboardChangesWithParts
    opts :- :metabase.events.schema/write-opts]
   (write-updates! [(assoc changes :id id)] opts)
   nil))

(mu/defn add-dashcards! :- [:sequential :map]
  "Insert the DashboardCards `dashcards`, each holding the `:dashboard_id` of its Dashboard and the ids of the Cards of its
  `:series`, and return them hydrated with their series, publishing, for each Dashboard, the audit event of the dashcards
  added and, as the last step, its update event."
  ([dashcards :- [:sequential DashcardPart]]
   (add-dashcards! dashcards nil))
  ([dashcards :- [:sequential DashcardPart]
    opts      :- :metabase.events.schema/write-opts]
   (if (empty? dashcards)
     []
     (t2/with-transaction [_conn]
       (let [created (dashboard-card/create-dashboard-cards! dashcards)
             id->stored  (dashboards.db/dashboards-by-ids (vec (distinct (map :dashboard_id created))))]
         (publish-cards! id->stored created [])
         (publish-update! id->stored [] (keys id->stored) opts)
         created)))))

(mu/defn update-dashcards! :- :nil
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardCard, and replace its series by its `:series`,
  the ids of Cards, when it has one, publishing, as the last step, the update event of the Dashboards whose DashboardCards
  changed."
  ([rows :- [:sequential DashcardPart]]
   (update-dashcards! rows nil))
  ([rows :- [:sequential DashcardPart]
    opts :- :metabase.events.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (when-let [changed (not-empty (dashboard-card/update-dashboard-cards! rows))]
         (let [dashboard-ids (into #{} (map :dashboard_id) (dashboards.db/dashcards-by-ids changed))
               id->stored        (dashboards.db/dashboards-by-ids (vec dashboard-ids))]
           (publish-update! id->stored [] dashboard-ids opts)))))
   nil))

(mu/defn remove-dashcards! :- :nil
  "Delete the DashboardCards with `dashcard-ids`, with their PulseCards and series, and the inline parameters they held
  from the parameters of their Dashboards, publishing, for each Dashboard, the audit event of the dashcards removed and, as
  the last step, its update event."
  ([dashcard-ids :- [:sequential ::lib.schema.id/dashcard]]
   (remove-dashcards! dashcard-ids nil))
  ([dashcard-ids :- [:sequential ::lib.schema.id/dashcard]
    opts         :- :metabase.events.schema/write-opts]
   (when (seq dashcard-ids)
     (t2/with-transaction [_conn]
       (let [dashcards (dashboards.db/dashcards-by-ids (vec dashcard-ids))
             id->stored    (dashboards.db/dashboards-by-ids (vec (distinct (map :dashboard_id dashcards))))
             rows      (into []
                             (keep (fn [[dashboard-id group]]
                                     (when-let [cleaned (parameters-without-orphans
                                                         (:parameters (get id->stored dashboard-id)) group)]
                                       {:id dashboard-id :parameters cleaned})))
                             (group-by :dashboard_id dashcards))]
         (dashboard-card/delete-dashboard-cards! (mapv :id dashcards))
         (let [rows (write-columns! id->stored rows)]
           (publish-cards! id->stored [] dashcards)
           (publish-update! id->stored rows (keys id->stored) opts)))))
   nil))

(defn- delete-dashboard-dependents!
  "Delete the rows that depend on the Dashboards with `dashboard-ids`, one batch of a call."
  [dashboard-ids]
  (parameter-card/delete-parameter-cards-for-objects! "dashboard" dashboard-ids [])
  (revision/delete-revisions-for-entities! "Dashboard" dashboard-ids)
  (cache-config/delete-cache-configs! (cache-config/cache-config-ids-for-targets "dashboard" dashboard-ids))
  (pulse/delete-pulses! (dashboards.db/pulse-ids-for-dashboards dashboard-ids)))

(defn- publish-and-delete-dashboard-dependents!
  "Publish the delete event of the Dashboards `dashboards` with `opts`, then delete the rows that depend on them."
  [dashboards opts]
  (events/publish-event! :event/dashboard-delete (events/delete-event dashboards opts))
  (run! delete-dashboard-dependents! (map vec (partition-all app-db/delete-partition-size (map :id dashboards)))))

(mu/defn delete-dashboards! :- :nil
  "Delete the Dashboards with `dashboard-ids` along with their ParameterCards, Revisions, cache configs and Pulses,
  which go through their model so that the triggers of their subscriptions are removed too, in one transaction,
  publishing their delete event right before the first statement."
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
   (delete-dashboards! dashboard-ids nil))
  ([dashboard-ids :- [:sequential ::lib.schema.id/dashboard]
    opts          :- :metabase.events.schema/write-opts]
   (app-db/delete-batched! :model/Dashboard (distinct dashboard-ids)
                           {:before-delete #(publish-and-delete-dashboard-dependents! % opts)})))

(mu/defn revert-dashboard! :- :map
  "Return the Dashboard `dashboard-id` to the `serialized-dashboard` that a Revision recorded, its columns, its tabs
  and its dashcards, with writes that publish no event that a Revision comes of."
  [dashboard-id        :- ::lib.schema.id/dashboard
   _user-id            :- ms/PositiveInt
   serialized-dashboard :- ::dashboards.schema/dashboard.revision]
  (let [cleaned-parameters   (dashboards.revisions/clean-invalid-parameter-card-references
                              (:parameters serialized-dashboard))
        serialized-dashboard (assoc serialized-dashboard :parameters cleaned-parameters)
        serialized-dashcards (:cards serialized-dashboard)
        kept-tab-ids         (into #{} (map :id) (:tabs serialized-dashboard))
        current-tab-ids      (into #{} (map :id) (dashboards.db/dashboard-tabs-for-dashboards [dashboard-id]))]
    (parameter-card/check-new-parameter-source-card-permissions "dashboard" dashboard-id cleaned-parameters)
    (dashboard-card/check-unarchive-internal-dashboard-questions dashboard-id serialized-dashcards)
    (dashboard-card/unarchive-internal-dashboard-questions! dashboard-id serialized-dashcards)
    (let [dashcards     (dashboards.revisions/remove-invalid-dashcards dashboard-id serialized-dashcards)
          current-cards (->> (dashboards.db/dashcards dashboard-id)
                             (remove #(and (contains? current-tab-ids (:dashboard_tab_id %))
                                           (not (contains? kept-tab-ids (:dashboard_tab_id %)))))
                             (dashboards.revisions/snapshot-dashcards))]
      ;; Reverting can put a card back on a publicly shared or embedded dashboard, exposing its selected timeline
      ;; events and its goals, so the current user needs read access to those timelines and to what the goals reference.
      (let [dashboard (dashboards.db/dashboard dashboard-id)]
        (queries/check-newly-exposed-dashcards-timeline-permissions! dashboard current-cards dashcards)
        (queries/check-newly-exposed-dashcards-goal-permissions! dashboard current-cards dashcards))
      ;; a restored dashcard may reuse goals still on the dashboard; one that's no longer anywhere is checked
      (dashboard-card/check-new-goal-references current-cards dashcards)
      (update-dashboard! dashboard-id
                         (assoc (select-keys serialized-dashboard (:track (revisions/spec :model/Dashboard)))
                                :tabs      (mapv #(select-keys % [:id :name :position]) (:tabs serialized-dashboard))
                                :dashcards dashcards)
                         {:writer :revert})
      (dashboard-card/check-archive-internal-dashboard-questions dashboard-id serialized-dashcards)
      (dashboard-card/archive-internal-dashboard-questions! dashboard-id serialized-dashcards))
    serialized-dashboard))

(mu/defn increment-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Dashboards with `ids`, in one
  plain statement that publishes no event for a usage stat no rule reads, and return the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (app-db/increment-counts! :model/Dashboard :view_count count->ids))

(mu/defn touch-last-viewed! :- :nil
  "Move `last_viewed_at` of each Dashboard in `dashboard-id->timestamp` forward to its timestamp, without touching
  `updated_at`, in one plain statement that publishes no event: a usage stat the search index may see late."
  [dashboard-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  (dashboards.db/update-dashboards-last-viewed-at! dashboard-id->timestamp)
  nil)

(mu/defn set-last-viewed-at! :- :int
  "Set `last_viewed_at` of the Dashboard with `id`, through the model, which the testing API uses to backdate it, and
  return the number updated."
  [id   :- ::lib.schema.id/dashboard
   time :- ms/TemporalInstant]
  (dashboards.db/set-dashboard-last-viewed-at! id time))

(defmethod collection/shift-positions-in-collection! :model/Dashboard
  [_model collection-id positions direction]
  (dashboards.db/shift-dashboard-positions! collection-id positions direction))

(defmethod collection/positioned-rows-in-collections :model/Dashboard
  [_model collection-ids]
  (dashboards.db/positioned-dashboards-in-collections (vec collection-ids)))

(defmethod collection/update-positions! :model/Dashboard
  [_model id->position]
  (update-dashboards! (mapv (fn [[id position]] {:id id :collection_position position}) id->position)))

(defmethod card/update-followers! :model/Dashboard
  [_model rows]
  (write-updates! (vec rows) nil))

(defmethod card/create-followers! :model/DashboardCard
  [_model rows]
  (add-dashcards! rows))

(defmethod card/update-followers! :model/DashboardCard
  [_model rows]
  (update-dashcards! rows))

(defmethod card/delete-followers! :model/DashboardCard
  [_model ids]
  (remove-dashcards! ids))

(defmethod card/delete-followers! :model/DashboardCardSeries
  [_model ids]
  (t2/with-transaction [_conn]
    (let [series        (dashboards.db/dashcard-series-by-ids (vec ids))
          dashboard-ids (into #{} (map :dashboard_id) (dashboards.db/dashcards-by-ids (mapv :dashboardcard_id series)))
          stored        (dashboards.db/dashboards-by-ids (vec dashboard-ids))]
      (dashboard-card-series/delete-dashboard-card-series! (mapv :id series))
      (publish-update! stored [] dashboard-ids nil))))

(defmethod actions.models/delete-for-archived-actions! :model/DashboardCard
  [_model action-ids]
  (remove-dashcards! (mapv :id (dashboards.db/dashcards-of-actions action-ids))))

(defmethod collection/archive-in-collections! :model/Dashboard
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-archive model collection-ids))]
    (update-dashboards! (mapv (fn [id] {:id id :archived true}) ids) opts)))

(defmethod collection/restore-in-collections! :model/Dashboard
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-to-restore model collection-ids))]
    (update-dashboards! (mapv (fn [id] {:id id :archived false}) ids) opts)))

(defmethod collection/delete-in-collections! :model/Dashboard
  [model collection-ids opts]
  (when-let [ids (not-empty (collection/item-ids-in-collections model collection-ids))]
    (delete-dashboards! ids opts)))

;; An anonymous user who can open a dashboard reaches a database in three ways:
;; - a dashcard whose Card runs against it,
;; - a dashcard with a series Card that runs against it, and
;; - a filter whose value list comes from a Card that runs against it.
;; The first two are returned by `shown-card-ids`, the last is returned by `value-list-sources`.
(defmethod public-sharing/shown-card-ids :model/Dashboard
  [_model dashboard-ids]
  (->> (concat (dashboards.db/dashcard-cards-for-dashboards dashboard-ids)
               (dashboards.db/dashcard-series-cards-for-dashboards dashboard-ids))
       ;; text, link and action dashcards have no Card
       (filter :card_id)
       (reduce (fn [acc {:keys [dashboard_id card_id]}]
                 (update acc dashboard_id (fnil conj #{}) card_id))
               {})))

(defmethod public-sharing/value-list-sources :model/Dashboard
  [_model dashboard-ids]
  (->> (dashboards.db/parameters-for-dashboards dashboard-ids)
       (map (fn [{:keys [id parameters]}]
              [id (vec (for [parameter parameters
                             :let  [card-id (queries/values-source-card-id parameter)]
                             :when card-id]
                         {:parameter parameter, :card-id card-id}))]))
       (into {})))

(defmethod public-sharing/embedding-params :model/Dashboard
  [_model dashboard-ids]
  (into {} (map (juxt :id :embedding_params)) (dashboards.db/parameters-for-dashboards dashboard-ids)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Dashboard [_model]
  {:skip? false})

(defmethod change-log/spec :model/Dashboard [_model]
  {:track [:name :description :creator_id :parameters :points_of_interest :caveats :show_in_getting_started
           :public_uuid :made_public_by_id :enable_embedding :embedding_params :archived :position :collection_id
           :collection_position :cache_ttl :entity_id :auto_apply_filters :width :initially_published_at
           :archived_directly :embedding_type :public_uuid_prefix]
   :skip  [:last_viewed_at :view_count]})

(defmethod serialization/spec :model/Dashboard [_]
  {:schema              ::dashboards.schema/external-dashboard
   :copy                [:archived :archived_directly :auto_apply_filters :caveats :collection_position
                         :description :embedding_params :enable_embedding :embedding_type :entity_id :name
                         :points_of_interest :position :public_uuid :show_in_getting_started :width]
   :skip                [:initially_published_at :view_count :last_viewed_at :cache_ttl :public_uuid_prefix]
   :transform           {:collection_id     (serialization/fk-transform :model/Collection)
                         :creator_id        serialization/user-transform
                         :made_public_by_id serialization/user-transform
                         :parameters        serialization/parameters-transform}
   :children            {:tabs      :model/DashboardTab
                         :dashcards :model/DashboardCard}
   :defaults            {:archived                false
                         :archived_directly       false
                         :auto_apply_filters      true
                         :enable_embedding        false
                         :show_in_getting_started false}
   :import-dependencies dashboards.serialization/import-dependencies
   :export-dependencies dashboards.serialization/export-dependencies
   :before-load         dashboards.serialization/before-load
   :insert!             #(create-dashboards! % {:writer :import})
   :update!             #(do (update-dashboards! % {:writer :import}) %)
   :delete!             #(delete-dashboards! % {:writer :import})})

(defmethod remote-sync/spec :model/Dashboard
  [_model]
  {:synced-items         dashboards.db/synced-dashboard-items
   :synced-filter-clause dashboards.db/synced-dashboards-clause})

(defmethod revisions/spec :model/Dashboard [_model]
  {:track    [:name :description :archived :archived_directly :auto_apply_filters :cache_ttl :collection_id
              :parameters :width]
   :skip     [:caveats :collection_position :creator_id :embedding_params :embedding_type :enable_embedding :entity_id
              :initially_published_at :last_viewed_at :made_public_by_id :points_of_interest :position
              :public_uuid :public_uuid_prefix :show_in_getting_started :view_count]
   :schema   ::dashboards.schema/dashboard.revision
   :snapshot dashboards.revisions/snapshot-parts
   :revert!  revert-dashboard!
   :describe dashboards.revisions/describe-change})

(defmethod audit/spec :model/Dashboard [_model]
  {:track          [:name :description]
   :track-redacted [:archived :archived_directly :auto_apply_filters :cache_ttl :caveats :collection_id :creator_id
                    :embedding_params :embedding_type :enable_embedding :initially_published_at :made_public_by_id
                    :parameters :points_of_interest :public_uuid :public_uuid_prefix :show_in_getting_started :width]
   :skip           [:collection_position :entity_id :last_viewed_at :position :view_count]
   :topics         {:create :dashboard-create
                    :delete :dashboard-delete}
   :moments        [{:topic :dashboard-public-link-created, :when dashboards.audit/public-link-created?}
                    {:topic :dashboard-public-link-deleted, :when dashboards.audit/public-link-deleted?}]})

(defmethod search/spec :model/Dashboard
  [_model]
  {"dashboard"
   {:attrs        {:archived       true
                   :collection-id  true
                   :creator-id     true
                   :database-id    false
                   :last-editor-id :r.user_id
                   :last-edited-at :r.timestamp
                   :last-viewed-at true
                   :pinned         [:> [:coalesce :collection_position [:inline 0]] [:inline 0]]
                   :verified       [:= "verified" :mr.status]
                   :official-collection [:= "official" :collection.authority_level]
                   :view-count     true
                   :created-at     true
                   :updated-at     true
                   :collection-type :collection.type
                   :collection-location :collection.location
                   :root-collection-type {:batch-fn collection/root-collection-types}}
    :search-terms [:name :description]
    :render-terms {:archived-directly          true
                   :collection-authority_level :collection.authority_level
                   :collection-name            :collection.name
                   ;; This is used for legacy ranking, in future it will be replaced by :pinned
                   :collection-position        true
                   :moderated-status           :mr.status}
    :where        []
    :bookmark     [:model/DashboardBookmark [:and
                                             [:= :bookmark.dashboard_id :this.id]
                                             ;; a magical alias, or perhaps this clause can be implicit
                                             [:= :bookmark.user_id :current_user/id]]]
    :joins        {:collection [:model/Collection [:= :collection.id :this.collection_id]]
                   :r          [:model/Revision [:and
                                                 [:= :r.model_id :this.id]
                                                 [:= :r.model "Dashboard"]
                                                 (revisions.sql/newest-revision-clause :r "Dashboard" :this.id)]]
                   :mr         [:model/ModerationReview [:and
                                                         [:= :mr.moderated_item_type "dashboard"]
                                                         [:= :mr.moderated_item_id :this.id]
                                                         [:= :mr.most_recent true]]]}}})

(defmethod dependencies/spec :model/Dashboard [_model]
  {:type  :dashboard
   :items dashboards.db/dependency-dashboard-items

   :hydrate      dashboards.dependencies/hydrate
   :dependencies dashboards.dependencies/dependencies

   :dependency-columns  #{:parameters}
   :written-with-parts? true})

(defmethod replacement/spec :model/DashboardCard [_model]
  {:update! #(update-dashcards! % {:writer :replacement})})

(defmethod replacement/spec :model/Dashboard [_model]
  {:hydrate            dashboards.replacement/hydrate
   :upgrade-field-refs dashboards.replacement/upgrade-field-refs
   :swap-source        dashboards.replacement/swap-source
   :update!            #(update-dashboards! % {:writer :replacement})})

(defmethod collection-items/spec :model/Dashboard [_model]
  {"dashboard" {:rank    1
                :items   dashboards.db/collection-dashboard-items
                :hydrate dashboards.collection-items/hydrate}})

(defmethod recent-views/spec :model/Dashboard [_model]
  {"dashboard" {:load   dashboards.db/recent-view-dashboards
                :render dashboards.recent-views/render}})

(defmethod staleness/spec :model/Dashboard [_model]
  {:candidates dashboards.db/stale-dashboard-candidates
   :load       dashboards.staleness/load-items
   :render     dashboards.staleness/render})

(defmethod eid-translation/spec :model/Dashboard [_model]
  {:names [:dashboard]})

(defmethod xrays/spec :model/Dashboard [_model]
  {:related dashboards.xrays/related})
