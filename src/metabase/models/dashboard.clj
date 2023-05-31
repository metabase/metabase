(ns metabase.models.dashboard
  (:require
   [clojure.core.async :as a]
   [clojure.data :refer [diff]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.automagic-dashboards.populate :as populate]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.dashboard-card
    :as dashboard-card
    :refer [DashboardCard]]
   [metabase.models.dashboard-tab :as dashboard-tab]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.parameter-card :as parameter-card]
   [metabase.models.params :as params]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse :as pulse :refer [Pulse]]
   [metabase.models.pulse-card :as pulse-card]
   [metabase.models.revision :as revision]
   [metabase.models.revision.diff :refer [build-sentence]]
   [metabase.models.serialization :as serdes]
   [metabase.moderation :as moderation]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.async :as qp.async]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru deferred-trun tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def Dashboard
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
   We'll keep this till we replace all the Dashboard symbol in our codebase."
  :model/Dashboard)

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/Dashboard
  {:parameters       mi/transform-parameters-list
   :embedding_params mi/transform-json})

(t2/define-before-delete :model/Dashboard
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)]
    (parameter-card/delete-all-for-parameterized-object! "dashboard" dashboard-id)
    (t2/delete! 'Revision :model "Dashboard" :model_id dashboard-id)))

(t2/define-before-insert :model/Dashboard
  [dashboard]
  (let [defaults  {:parameters []}
        dashboard (merge defaults dashboard)]
    (u/prog1 dashboard
      (params/assert-valid-parameters dashboard)
      (collection/check-collection-namespace Dashboard (:collection_id dashboard)))))

(t2/define-after-insert :model/Dashboard
  [dashboard]
  (u/prog1 dashboard
    (parameter-card/upsert-or-delete-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard))))

(t2/define-before-update :model/Dashboard
  [dashboard]
  (u/prog1 dashboard
    (params/assert-valid-parameters dashboard)
    (parameter-card/upsert-or-delete-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard))
    (collection/check-collection-namespace Dashboard (:collection_id dashboard))))

(defn- update-dashboard-subscription-pulses!
  "Updates the pulses' names and collection IDs, and syncs the PulseCards"
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)
        affected     (mdb.query/query
                      {:select-distinct [[:p.id :pulse-id] [:pc.card_id :card-id]]
                       :from            [[:pulse :p]]
                       :join            [[:pulse_card :pc] [:= :p.id :pc.pulse_id]]
                       :where           [:= :p.dashboard_id dashboard-id]})]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (let [correct-card-ids     (->> (mdb.query/query
                                       {:select-distinct [:dc.card_id]
                                        :from            [[:report_dashboardcard :dc]]
                                        :where           [:and
                                                          [:= :dc.dashboard_id dashboard-id]
                                                          [:not= :dc.card_id nil]]})
                                      (map :card_id)
                                      set)
            stale-card-ids       (->> affected
                                      (keep :card-id)
                                      set)
            cards-to-add         (set/difference correct-card-ids stale-card-ids)
            card-id->dashcard-id (when (seq cards-to-add)
                                   (t2/select-fn->pk :card_id DashboardCard :dashboard_id dashboard-id
                                                        :card_id [:in cards-to-add]))
            positions-for        (fn [pulse-id] (drop (pulse-card/next-position-for pulse-id)
                                                      (range)))
            new-pulse-cards      (for [pulse-id                         pulse-ids
                                       [[card-id dashcard-id] position] (map vector
                                                                             card-id->dashcard-id
                                                                             (positions-for pulse-id))]
                                   {:pulse_id          pulse-id
                                    :card_id           card-id
                                    :dashboard_card_id dashcard-id
                                    :position          position})]
        (t2/with-transaction [_conn]
          (binding [pulse/*allow-moving-dashboard-subscriptions* true]
            (t2/update! Pulse {:dashboard_id dashboard-id}
                        {:name (:name dashboard)
                         :collection_id (:collection_id dashboard)})
            (pulse-card/bulk-create! new-pulse-cards)))))))

(t2/define-after-update :model/Dashboard
  [dashboard]
  (update-dashboard-subscription-pulses! dashboard))

(t2/define-after-select :model/Dashboard
  [dashboard]
  (-> dashboard
      public-settings/remove-public-uuid-if-public-sharing-is-disabled))

(defmethod serdes/hash-fields :model/Dashboard
  [_dashboard]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mi/define-simple-hydration-method ordered-tabs
  :ordered_tabs
  "Return the ordered DashboardTabs associated with `dashboard-or-id`, sorted by tab position."
  [dashboard-or-id]
  (t2/select :model/DashboardTab :dashboard_id (u/the-id dashboard-or-id) {:order-by [[:position :asc]]}))

(mi/define-simple-hydration-method ordered-cards
  :ordered_cards
  "Return the DashboardCards associated with `dashboard`, in the order they were created."
  [dashboard-or-id]
  (t2/select DashboardCard
             {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
              :from      [[:report_dashboardcard :dashcard]]
              :left-join [[:report_card :card] [:= :dashcard.card_id :card.id]
                          [:collection :collection] [:= :collection.id :card.collection_id]]
              :where     [:and
                          [:= :dashcard.dashboard_id (u/the-id dashboard-or-id)]
                          [:or
                           [:= :card.archived false]
                           [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
              :order-by  [[:dashcard.created_at :asc]]}))

(mi/define-batched-hydration-method collections-authority-level
  :collection_authority_level
  "Efficiently hydrate the `:collection_authority_level` of a sequence of dashboards."
  [dashboards]
  (when (seq dashboards)
    (let [coll-id->level (into {}
                               (map (juxt :id :authority_level))
                               (mdb.query/query {:select    [:dashboard.id :collection.authority_level]
                                                 :from      [[:report_dashboard :dashboard]]
                                                 :left-join [[:collection :collection] [:= :collection.id :dashboard.collection_id]]
                                                 :where     [:in :dashboard.id (into #{} (map u/the-id) dashboards)]}))]
      (for [dashboard dashboards]
        (assoc dashboard :collection_authority_level (get coll-id->level (u/the-id dashboard)))))))

(comment moderation/keep-me)

;;; --------------------------------------------------- Revisions ----------------------------------------------------

(def ^:private excluded-columns-for-dashboard-revision
  [:id :created_at :updated_at :creator_id :points_of_interest :caveats :show_in_getting_started :entity_id
   ;; not sure what position is for, from the column remark:
   ;; > The position this Dashboard should appear in the Dashboards list,
   ;;   lower-numbered positions appearing before higher numbered ones.
   ;; TODO: querying on stats we don't have any dashboard that has a position, maybe we could just drop it?
   :position])

(def ^:private excluded-columns-for-dashcard-revision
  [:entity_id :created_at :updated_at :collection_authority_level])

(defmethod revision/serialize-instance :model/Dashboard
  [_model _id dashboard]
  (-> (apply dissoc dashboard excluded-columns-for-dashboard-revision)
      (assoc :cards (vec (for [dashboard-card (ordered-cards dashboard)]
                           (-> (apply dissoc dashboard-card excluded-columns-for-dashcard-revision)
                               (assoc :series (mapv :id (dashboard-card/series dashboard-card)))))))
      (assoc :tabs (map #(dissoc % :created_at :updated_at :entity_id) (ordered-tabs dashboard)))))

(defn- revert-dashcards
  [dashboard-id serialized-cards]
  (let [current-cards    (t2/select-fn-vec #(apply dissoc (t2.realize/realize %) excluded-columns-for-dashcard-revision)
                                           :model/DashboardCard
                                           :dashboard_id dashboard-id)
        id->current-card (zipmap (map :id current-cards) current-cards)
        {:keys [to-create to-update to-delete]} (dashboard-tab/classify-changes current-cards serialized-cards)]
    (when (seq to-delete)
      (dashboard-card/delete-dashboard-cards! (map :id to-delete)))
    (when (seq to-create)
      (dashboard-card/create-dashboard-cards! (map #(assoc % :dashboard_id dashboard-id) to-create)))
    (when (seq to-update)
      (doseq [update-card to-update]
        (dashboard-card/update-dashboard-card! update-card (id->current-card (:id update-card)))))))

(defmethod revision/revert-to-revision! :model/Dashboard
  [_model dashboard-id _user-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions
  (t2/update! :model/Dashboard dashboard-id (dissoc serialized-dashboard :cards :tabs))
  ;; Now update the tabs and cards as needed
  (let [serialized-cards          (:cards serialized-dashboard)
        current-tabs              (t2/select-fn-vec #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                                    :model/DashboardTab :dashboard_id dashboard-id)
        {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! dashboard-id current-tabs (:tabs serialized-dashboard))
        serialized-cards          (cond->> serialized-cards
                                    ;; in case reverting result in new tabs being created,
                                    ;; we need to remap the tab-id
                                    (seq old->new-tab-id)
                                    (map (fn [card]
                                           (if-let [new-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                             (assoc card :dashboard_tab_id new-tab-id)
                                             card))))]
    (revert-dashcards dashboard-id  serialized-cards))
  serialized-dashboard)

(defmethod revision/diff-strings :model/Dashboard
  [_model prev-dashboard dashboard]
  (let [[removals changes]  (diff prev-dashboard dashboard)
        check-series-change (fn [idx card-changes]
                              (when (and (:series card-changes)
                                         (get-in prev-dashboard [:cards idx :card_id]))
                                (let [num-series₁ (count (get-in prev-dashboard [:cards idx :series]))
                                      num-series₂ (count (get-in dashboard [:cards idx :series]))]
                                  (cond
                                    (< num-series₁ num-series₂)
                                    (deferred-tru "added some series to card {0}" (get-in prev-dashboard [:cards idx :card_id]))

                                    (> num-series₁ num-series₂)
                                    (deferred-tru "removed some series from card {0}" (get-in prev-dashboard [:cards idx :card_id]))

                                    :else
                                    (deferred-tru "modified the series on card {0}" (get-in prev-dashboard [:cards idx :card_id]))))))]
    (-> [(when-let [default-description (build-sentence ((get-method revision/diff-strings :default) Dashboard prev-dashboard dashboard))]
           (cond-> default-description
             (str/ends-with? default-description ".") (subs 0 (dec (count default-description)))))
         (when (:cache_ttl changes)
           (cond
             (nil? (:cache_ttl prev-dashboard)) (deferred-tru "added a cache ttl")
             (nil? (:cache_ttl dashboard)) (deferred-tru "removed the cache ttl")
             :else (deferred-tru "changed the cache ttl from \"{0}\" to \"{1}\""
                           (:cache_ttl prev-dashboard) (:cache_ttl dashboard))))
         (when (or (:cards changes) (:cards removals))
           (let [prev-card-ids  (set (map :id (:cards prev-dashboard)))
                 num-prev-cards (count prev-card-ids)
                 new-card-ids   (set (map :id (:cards dashboard)))
                 num-new-cards  (count new-card-ids)
                 num-cards-diff (abs (- num-prev-cards num-new-cards))]
             (cond
               (and
                 (set/subset? prev-card-ids new-card-ids)
                 (< num-prev-cards num-new-cards))         (deferred-trun "added a card" "added {0} cards" num-cards-diff)
               (and
                 (set/subset? new-card-ids prev-card-ids)
                 (> num-prev-cards num-new-cards))         (deferred-trun "removed a card" "removed {0} cards" num-cards-diff)
               :else                                       (deferred-tru "modified the cards"))))
         (when (or (:tabs changes) (:tabs removals))
           (let [prev-tabs     (:tabs prev-dashboard)
                 new-tabs      (:tabs dashboard)
                 prev-tab-ids  (set (map :id prev-tabs))
                 num-prev-tabs (count prev-tab-ids)
                 new-tab-ids   (set (map :id new-tabs))
                 num-new-tabs  (count new-tab-ids)
                 num-tabs-diff (abs (- num-prev-tabs num-new-tabs))]
             (cond
               (and
                 (set/subset? prev-tab-ids new-tab-ids)
                 (< num-prev-tabs num-new-tabs))         (deferred-trun "added a tab" "added {0} tabs" num-tabs-diff)

               (and
                 (set/subset? new-tab-ids prev-tab-ids)
                 (> num-prev-tabs num-new-tabs))         (deferred-trun "removed a tab" "removed {0} tabs" num-tabs-diff)

               (and (= num-prev-tabs num-new-tabs)
                    (= prev-tab-ids new-tab-ids)
                    (= (set (map :name prev-tabs))
                       (set (map :name new-tabs))))      (deferred-tru "rearranged the tabs")

               :else                                     (deferred-tru "modified the tabs"))))
         (let [f (comp boolean :auto_apply_filters)]
           (when (not= (f prev-dashboard) (f dashboard))
             (deferred-tru "set auto apply filters to {0}" (str (f dashboard)))))]
        (concat (map-indexed check-series-change (:cards changes)))
        (->> (filter identity)))))

(defn has-tabs?
  "Check if a dashboard has tabs."
  [dashboard-or-id]
  (t2/exists? :model/DashboardTab :dashboard_id (u/the-id dashboard-or-id)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (-> (t2/select-one Dashboard :id (u/the-id dashboard-or-id))
                 (hydrate [:ordered_cards :card]))]
    (params/dashcards->param-field-ids (:ordered_cards dash))))

(defn- update-field-values-for-on-demand-dbs!
  "If the parameters have changed since last time this Dashboard was saved, we need to update the FieldValues
   for any Fields that belong to an 'On-Demand' synced DB."
  [old-param-field-ids new-param-field-ids]
  (when (and (seq new-param-field-ids)
             (not= old-param-field-ids new-param-field-ids))
    (let [newly-added-param-field-ids (set/difference new-param-field-ids old-param-field-ids)]
      (log/info "Referenced Fields in Dashboard params have changed: Was:" old-param-field-ids
                "Is Now:" new-param-field-ids
                "Newly Added:" newly-added-param-field-ids)
      (field-values/update-field-values-for-on-demand-dbs! newly-added-param-field-ids))))

(defn add-dashcards!
  "Add Cards to a Dashboard.
   This function is provided for convenience and also makes sure various cleanup steps are performed when finished,
   for example updating FieldValues for On-Demand DBs.
   Returns newly created DashboardCards."
  {:style/indent 2}
  [dashboard-or-id dashcards]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashboard-cards     (map (fn [dashcard]
                                   (-> (assoc dashcard :dashboard_id (u/the-id dashboard-or-id))
                                       (update :series #(filter identity (map u/the-id %))))) dashcards)]
    (u/prog1 (dashboard-card/create-dashboard-cards! dashboard-cards)
      (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
        (update-field-values-for-on-demand-dbs! old-param-field-ids new-param-field-ids)))))

(def ^:private DashboardWithSeriesAndCard
  [:map
   [:id ms/PositiveInt]
   [:ordered_cards [:sequential [:map
                                 [:card_id {:optional true} [:maybe ms/PositiveInt]]
                                 [:card {:optional true} [:maybe [:map
                                                                  [:id ms/PositiveInt]]]]]]]])

(mu/defn update-dashcards!
  "Update the `dashcards` belonging to `dashboard`.
   This function is provided as a convenience instead of doing this yourself; it also makes sure various cleanup steps
   are performed when finished, for example updating FieldValues for On-Demand DBs.
   Returns `nil`."
  {:style/indent 1}
  [dashboard     :- DashboardWithSeriesAndCard
   new-dashcards :- [:sequential ms/Map]]
  (let [old-dashcards    (:ordered_cards dashboard)
        id->old-dashcard (m/index-by :id old-dashcards)
        old-dashcard-ids (set (keys id->old-dashcard))
        new-dashcard-ids (set (map :id new-dashcards))
        only-new         (set/difference new-dashcard-ids old-dashcard-ids)]
    ;; ensure the dashcards we are updating are part of the given dashboard
    (when (seq only-new)
      (throw (ex-info (tru "Dashboard {0} does not have a DashboardCard with ID {1}"
                           (u/the-id dashboard) (first only-new))
                      {:status-code 404})))
    (doseq [dashcard new-dashcards]
      (let [;; update-dashboard-card! requires series to be a sequence of card IDs
            old-dashcard       (-> (get id->old-dashcard (:id dashcard))
                                   (update :series #(map :id %)))
            dashboard-card     (update dashcard :series #(map :id %))]
        (dashboard-card/update-dashboard-card! dashboard-card old-dashcard)))
    (let [new-param-field-ids (params/dashcards->param-field-ids (t2/hydrate new-dashcards :card))]
      (update-field-values-for-on-demand-dbs! (params/dashcards->param-field-ids old-dashcards) new-param-field-ids))))

;; TODO - we need to actually make this async, but then we'd need to make `save-card!` async, and so forth
(defn- result-metadata-for-query
  "Fetch the results metadata for a `query` by running the query and seeing what the `qp` gives us in return."
  [query]
  (a/<!! (qp.async/result-metadata-for-query-async query)))

(defn- save-card!
  [card]
  (cond
    ;; If this is a pre-existing card, just return it
    (and (integer? (:id card)) (t2/select-one Card :id (:id card)))
    card

    ;; Don't save text cards
    (-> card :dataset_query not-empty)
    (let [card (first (t2/insert-returning-instances!
                        'Card
                        (-> card
                            (update :result_metadata #(or % (-> card
                                                                :dataset_query
                                                                result-metadata-for-query)))
                            (dissoc :id))))]
      (events/publish-event! :card-create card)
      (hydrate card :creator :dashboard_count :can_write :collection))))

(defn- applied-filters-blurb
  [applied-filters]
  (some->> applied-filters
           not-empty
           (map (fn [{:keys [field value]}]
                  (format "%s %s" (str/join " " field) value)))
           (str/join ", ")
           (str "Filtered by: ")))

(defn- ensure-unique-collection-name
  [collection-name parent-collection-id]
  (let [c (t2/count Collection
            :name     [:like (format "%s%%" collection-name)]
            :location (collection/children-location (t2/select-one [Collection :location :id]
                                                      :id parent-collection-id)))]
    (if (zero? c)
      collection-name
      (format "%s %s" collection-name (inc c)))))

(defn save-transient-dashboard!
  "Save a denormalized description of `dashboard`."
  [dashboard parent-collection-id]
  (let [dashboard  (i18n/localized-strings->strings dashboard)
        dashcards  (:ordered_cards dashboard)
        collection (populate/create-collection!
                    (ensure-unique-collection-name (:name dashboard) parent-collection-id)
                    (rand-nth (populate/colors))
                    "Automatically generated cards."
                    parent-collection-id)
        dashboard  (first (t2/insert-returning-instances!
                            :model/Dashboard
                            (-> dashboard
                                (dissoc :ordered_cards :rule :related :transient_name
                                        :transient_filters :param_fields :more)
                                (assoc :description         (->> dashboard
                                                                 :transient_filters
                                                                 applied-filters-blurb)
                                       :collection_id       (:id collection)
                                       :collection_position 1))))]
    (add-dashcards! dashboard
                    (for [dashcard dashcards]
                      (let [card     (some-> dashcard :card (assoc :collection_id (:id collection)) save-card!)
                            series   (some->> dashcard :series (map (fn [card]
                                                                      (-> card
                                                                          (assoc :collection_id (:id collection))
                                                                          save-card!))))
                            dashcard (-> dashcard
                                         (dissoc :card :id :creator_id)
                                         (update :parameter_mappings
                                                 (partial map #(assoc % :card_id (:id card))))
                                         (assoc :series series)
                                         (assoc :card_id (:id card)))]
                        dashcard)))
   dashboard))

(def ^:private ParamWithMapping
  {:name     su/NonBlankString
   :id       su/NonBlankString
   :mappings (s/maybe #{dashboard-card/ParamMapping})
   s/Keyword s/Any})

(s/defn ^:private dashboard->resolved-params* :- (let [param-id su/NonBlankString]
                                                   {param-id ParamWithMapping})
  [dashboard :- {(s/optional-key :parameters) (s/maybe [su/Map])
                 s/Keyword                    s/Any}]
  (let [dashboard           (hydrate dashboard [:ordered_cards :card])
        param-key->mappings (apply
                             merge-with set/union
                             (for [dashcard (:ordered_cards dashboard)
                                   param    (:parameter_mappings dashcard)]
                               {(:parameter_id param) #{(assoc param :dashcard dashcard)}}))]
    (into {} (for [{param-key :id, :as param} (:parameters dashboard)]
               [(u/qualified-name param-key) (assoc param :mappings (get param-key->mappings param-key))]))))

(mi/define-simple-hydration-method dashboard->resolved-params
  :resolved-params
  "Return map of Dashboard parameter key -> param with resolved `:mappings`.
    (dashboard->resolved-params (t2/select-one Dashboard :id 62))
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
  [dashboard]
  (dashboard->resolved-params* dashboard))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SERIALIZATION                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+
(defmethod serdes/extract-query "Dashboard" [_ opts]
  (eduction (map #(hydrate % :ordered_cards))
            (serdes/extract-query-collections Dashboard opts)))

(defn- extract-dashcard
  [dashcard]
  (-> (into (sorted-map) dashcard)
      (dissoc :id :collection_authority_level :dashboard_id :updated_at)
      (update :card_id                serdes/*export-fk* 'Card)
      (update :action_id              serdes/*export-fk* 'Action)
      (update :dashboard_tab_id       serdes/*export-fk* :model/DashboardTab)
      (update :parameter_mappings     serdes/export-parameter-mappings)
      (update :visualization_settings serdes/export-visualization-settings)))

(defn- extract-dashtab
  [dashtab]
  (dissoc dashtab :id :dashboard_id :updated_at))

(defmethod serdes/extract-one "Dashboard"
  [_model-name _opts dash]
  (let [dash (cond-> dash
               (nil? (:ordered_cards dash))
               (hydrate :ordered_cards)
               (nil? (:ordered_tabs dash))
               (hydrate :ordered_tabs))]
    (-> (serdes/extract-one-basics "Dashboard" dash)
        (update :ordered_cards     #(mapv extract-dashcard %))
        (update :ordered_tabs      #(mapv extract-dashtab %))
        (update :parameters        serdes/export-parameters)
        (update :collection_id     serdes/*export-fk* Collection)
        (update :creator_id        serdes/*export-user*)
        (update :made_public_by_id serdes/*export-user*))))

(defmethod serdes/load-xform "Dashboard"
  [dash]
  (-> dash
      serdes/load-xform-basics
      ;; Deliberately not doing anything to :ordered_cards - they get handled by load-insert! and load-update! below.
      (update :collection_id     serdes/*import-fk* Collection)
      (update :parameters        serdes/import-parameters)
      (update :creator_id        serdes/*import-user*)
      (update :made_public_by_id serdes/*import-user*)))

(defn- dashcard-for [dashcard dashboard]
  (assoc dashcard
         :dashboard_id (:entity_id dashboard)
         :serdes/meta  (remove nil?
                               [{:model "Dashboard"     :id (:entity_id dashboard)}
                                (when-let [dashtab-eeid (last (:dashboard_tab_id dashcard))]
                                  {:model "DashboardTab" :id dashtab-eeid})
                                {:model "DashboardCard" :id (:entity_id dashcard)}])))

(defn- dashtab-for [tab dashboard]
  (assoc tab
         :dashboard_id (:entity_id dashboard)
         :serdes/meta  [{:model "Dashboard"    :id (:entity_id dashboard)}
                        {:model "DashboardTab" :id (:entity_id tab)}]))

;; Call the default load-one! for the Dashboard, then for each DashboardCard.
(defmethod serdes/load-one! "Dashboard" [ingested maybe-local]
  (let [dashboard ((get-method serdes/load-one! :default) (dissoc ingested :ordered_cards :ordered_tabs) maybe-local)]
    (doseq [tab (:ordered_tabs ingested)]
      (serdes/load-one! (dashtab-for tab dashboard)
                        (t2/select-one :model/DashboardTab :entity_id (:entity_id tab))))
    (doseq [dashcard (:ordered_cards ingested)]
      (serdes/load-one! (dashcard-for dashcard dashboard)
                        (t2/select-one 'DashboardCard :entity_id (:entity_id dashcard))))))

(defn- serdes-deps-dashcard
  [{:keys [card_id parameter_mappings visualization_settings]}]
  (->> (mapcat serdes/mbql-deps parameter_mappings)
       (concat (serdes/visualization-settings-deps visualization_settings))
       (concat (when card_id #{[{:model "Card" :id card_id}]}))
       set))

(defmethod serdes/dependencies "Dashboard"
  [{:keys [collection_id ordered_cards parameters]}]
  (->> (map serdes-deps-dashcard ordered_cards)
       (reduce set/union)
       (set/union (when collection_id #{[{:model "Collection" :id collection_id}]}))
       (set/union (serdes/parameters-deps parameters))))

(defmethod serdes/descendants "Dashboard" [_model-name id]
  (let [dashcards (t2/select ['DashboardCard :card_id :action_id :parameter_mappings]
                             :dashboard_id id)
        dashboard (t2/select-one Dashboard :id id)]
    (set/union
      ;; DashboardCards are inlined into Dashboards, but we need to capture what those those DashboardCards rely on
      ;; here. So their actions, and their cards both direct and mentioned in their parameters
     (set (for [{:keys [card_id parameter_mappings]} dashcards
                 ;; Capture all card_ids in the parameters, plus this dashcard's card_id if non-nil.
                card-id (cond-> (set (keep :card_id parameter_mappings))
                          card_id (conj card_id))]
            ["Card" card-id]))
     (set (for [{:keys [action_id]} dashcards
                :when action_id]
            ["Action" action_id]))
      ;; parameter with values_source_type = "card" will depend on a card
     (set (for [card-id (some->> dashboard :parameters (keep (comp :card_id :values_source_config)))]
            ["Card" card-id])))))
