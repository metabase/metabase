(ns metabase.models.dashboard
  (:require
   [clojure.data :refer [diff]]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-tab :as dashboard-tab]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.parameter-card :as parameter-card]
   [metabase.models.params :as params]
   [metabase.models.permissions :as perms]
   [metabase.models.pulse :as pulse]
   [metabase.models.pulse-card :as pulse-card]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.moderation :as moderation]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.util :as u]
   [metabase.util.embed :refer [maybe-populate-initially-published-at]]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :as i18n :refer [deferred-tru deferred-trun tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def Dashboard
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model
  name. We'll keep this till we replace all the Dashboard symbol in our codebase."
  :model/Dashboard)

(methodical/defmethod t2/table-name :model/Dashboard [_model] :report_dashboard)

(doto :model/Dashboard
  (derive :metabase/model)
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-write? Dashboard
  ([instance]
   ;; Dashboards in audit collection should be read only
   (if (and
        ;; We want to make sure there's an existing audit collection before doing the equality check below.
        ;; If there is no audit collection, this will be nil:
        (some? (:id (audit/default-audit-collection)))
        ;; Is a direct descendant of audit collection
        (= (:collection_id instance) (:id (audit/default-audit-collection))))
     false
     (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection instance :write))))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Dashboard :id pk))))

(defmethod mi/can-read? Dashboard
  ([instance]
   (perms/can-read-audit-helper :model/Dashboard instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Dashboard :id pk))))

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
  (let [changes (t2/changes dashboard)]
    (u/prog1 (maybe-populate-initially-published-at dashboard)
      (params/assert-valid-parameters dashboard)
      (when (:parameters changes)
        (parameter-card/upsert-or-delete-from-parameters! "dashboard" (:id dashboard) (:parameters dashboard)))
      (collection/check-collection-namespace Dashboard (:collection_id dashboard))
      (when (:archived changes)
        (t2/delete! :model/Pulse :dashboard_id (u/the-id dashboard))))))

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
            (t2/update! :model/Pulse {:dashboard_id dashboard-id}
                        ;; TODO we probably don't need this anymore
                        ;; pulse.name is no longer used for generating title.
                        ;; pulse.collection_id is a thing for the old "Pulse" feature, but it was removed
                        {:name (:name dashboard)
                         :collection_id (:collection_id dashboard)})
            (pulse-card/bulk-create! new-pulse-cards)))))))

(t2/define-after-update :model/Dashboard
  [dashboard]
  (update-dashboard-subscription-pulses! dashboard))

(defn- migrate-parameter [p]
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
     (= (:values_query_type p) "none"))
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
      public-settings/remove-public-uuid-if-public-sharing-is-disabled))

(defmethod serdes/hash-fields :model/Dashboard
  [_dashboard]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:default :tabs]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id (t2/select :model/DashboardTab
                                       :dashboard_id [:in (map :id dashboards)]
                                       {:order-by [[:dashboard_id :asc] [:position :asc]]}))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:default :dashcards]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id
              (t2/select :model/DashboardCard
                         {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
                          :from      [[:report_dashboardcard :dashcard]]
                          :left-join [[:report_card :card] [:= :dashcard.card_id :card.id]
                                      [:collection :collection] [:= :collection.id :card.collection_id]]
                          :where     [:and
                                      [:in :dashcard.dashboard_id (map :id dashboards)]
                                      [:or
                                       [:= :card.archived false]
                                       [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
                          :order-by  [[:dashcard.dashboard_id] [:dashcard.created_at :asc]]}))
   :id
   {:default []}))

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
   :public_uuid :made_public_by_id
   :position :initially_published_at :view_count
   :last_viewed_at])

(def ^:private excluded-columns-for-dashcard-revision
  [:entity_id :created_at :updated_at :collection_authority_level])

(def ^:private excluded-columns-for-dashboard-tab-revision
  [:created_at :updated_at :entity_id])

(defmethod revision/serialize-instance :model/Dashboard
  [_model _id dashboard]
  (let [dashcards (or (:dashcards dashboard)
                      (:dashcards (t2/hydrate dashboard :dashcards)))
        dashcards (when (seq dashcards)
                    (if (contains? (first dashcards) :series)
                      dashcards
                      (t2/hydrate dashcards :series)))
        tabs  (or (:tabs dashboard)
                  (:tabs (t2/hydrate dashboard :tabs)))]
    (-> (apply dissoc dashboard excluded-columns-for-dashboard-revision)
        (assoc :cards (vec (for [dashboard-card dashcards]
                             (-> (apply dissoc dashboard-card excluded-columns-for-dashcard-revision)
                                 (assoc :series (mapv :id (:series dashboard-card)))))))
        (assoc :tabs (map #(apply dissoc % excluded-columns-for-dashboard-tab-revision) tabs)))))

(defn- revert-dashcards
  [dashboard-id serialized-cards]
  (let [current-cards    (t2/select-fn-vec #(apply dissoc (t2.realize/realize %) excluded-columns-for-dashcard-revision)
                                           :model/DashboardCard
                                           :dashboard_id dashboard-id)
        id->current-card (zipmap (map :id current-cards) current-cards)
        {:keys [to-create to-update to-delete]} (u/row-diff current-cards serialized-cards)]
    (when (seq to-delete)
      (dashboard-card/delete-dashboard-cards! (map :id to-delete)))
    (when (seq to-create)
      (dashboard-card/create-dashboard-cards! (map #(assoc % :dashboard_id dashboard-id) to-create)))
    (when (seq to-update)
      (doseq [update-card to-update]
        (dashboard-card/update-dashboard-card! update-card (id->current-card (:id update-card)))))))

(defn- remove-invalid-dashcards
  "Given a list of dashcards, remove any dashcard that references cards that are either archived or not exist."
  [dashcards]
  (let [card-ids          (set (keep :card_id dashcards))
        active-card-ids   (when-let [card-ids (seq card-ids)]
                            (t2/select-pks-set :model/Card :id [:in card-ids] :archived false))
        inactive-card-ids (set/difference card-ids active-card-ids)]
   (remove #(contains? inactive-card-ids (:card_id %)) dashcards)))

(defmethod revision/revert-to-revision! :model/Dashboard
  [model dashboard-id user-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions
  ((get-method revision/revert-to-revision! :default) model dashboard-id user-id (dissoc serialized-dashboard :cards :tabs))
  ;; Now update the tabs and cards as needed
  (let [serialized-dashcards      (:cards serialized-dashboard)
        current-tabs              (t2/select-fn-vec #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                                    :model/DashboardTab :dashboard_id dashboard-id)
        {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! dashboard-id current-tabs (:tabs serialized-dashboard))
        serialized-dashcards      (cond->> serialized-dashcards
                                    true
                                    remove-invalid-dashcards
                                    ;; in case reverting result in new tabs being created,
                                    ;; we need to remap the tab-id
                                    (seq old->new-tab-id)
                                    (map (fn [card]
                                           (if-let [new-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                             (assoc card :dashboard_tab_id new-tab-id)
                                             card))))]
    (revert-dashcards dashboard-id serialized-dashcards))
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
    (-> [(when-let [default-description (u/build-sentence ((get-method revision/diff-strings :default) Dashboard prev-dashboard dashboard))]
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
                 num-cards-diff (abs (- num-prev-cards num-new-cards))
                 keys-changes   (set (flatten (concat (map keys (:cards changes))
                                                      (map keys (:cards removals)))))]
             (cond
               (and
                (set/subset? prev-card-ids new-card-ids)
                (< num-prev-cards num-new-cards))                     (deferred-trun "added a card" "added {0} cards" num-cards-diff)
               (and
                (set/subset? new-card-ids prev-card-ids)
                (> num-prev-cards num-new-cards))                     (deferred-trun "removed a card" "removed {0} cards" num-cards-diff)
               (set/subset? keys-changes #{:row :col :size_x :size_y}) (deferred-tru "rearranged the cards")
               :else                                                   (deferred-tru "modified the cards"))))

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
                (< num-prev-tabs num-new-tabs))              (deferred-trun "added a tab" "added {0} tabs" num-tabs-diff)

               (and
                (set/subset? new-tab-ids prev-tab-ids)
                (> num-prev-tabs num-new-tabs))              (deferred-trun "removed a tab" "removed {0} tabs" num-tabs-diff)

               (= (set (map #(dissoc % :position) prev-tabs))
                  (set (map #(dissoc % :position) new-tabs))) (deferred-tru "rearranged the tabs")

               :else                                          (deferred-tru "modified the tabs"))))
         (let [f (comp boolean :auto_apply_filters)]
           (when (not= (f prev-dashboard) (f dashboard))
             (deferred-tru "set auto apply filters to {0}" (str (f dashboard)))))]
        (concat (map-indexed check-series-change (:cards changes)))
        (->> (filter identity)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (-> (t2/select-one Dashboard :id (u/the-id dashboard-or-id))
                 (t2/hydrate [:dashcards :card]))]
    (params/dashcards->param-field-ids (:dashcards dash))))

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
   [:dashcards [:sequential [:map
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
  (let [old-dashcards    (:dashcards dashboard)
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


(defn- legacy-result-metadata-for-query
  "Fetch the results metadata for a `query` by running the query and seeing what the `qp` gives us in return."
  [query]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (qp.metadata/legacy-result-metadata query api/*current-user-id*))

(defn- save-card!
  [card]
  (cond
    ;; If this is a pre-existing card, just return it
    (and (integer? (:id card)) (t2/select-one Card :id (:id card)))
    card

    ;; Don't save text cards
    (-> card :dataset_query not-empty)
    (let [card (first (t2/insert-returning-instances!
                       Card
                       (-> card
                           (update :result_metadata #(or % (-> card
                                                               :dataset_query
                                                               legacy-result-metadata-for-query)))
                            ;; Xrays populate this in their transient cards
                           (dissoc :id :can_run_adhoc_query))))]
      (events/publish-event! :event/card-create {:object card :user-id (:creator_id card)})
      (t2/hydrate card :creator :dashboard_count :can_write :can_run_adhoc_query :collection))))

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
  (let [{dashcards      :dashcards
         tabs           :tabs
         dashboard-name :name
         :keys          [description] :as dashboard} (i18n/localized-strings->strings dashboard)
        collection (xrays/create-collection!
                    (ensure-unique-collection-name dashboard-name parent-collection-id)
                    "Automatically generated cards."
                    parent-collection-id)
        dashboard  (first (t2/insert-returning-instances!
                            :model/Dashboard
                            (-> dashboard
                                (dissoc :dashcards :tabs :rule :related
                                        :transient_name :transient_filters :param_fields :more)
                                (assoc :description description
                                       :collection_id (:id collection)
                                       :collection_position 1))))
        {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! (:id dashboard) nil tabs)]
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
                                         (update :dashboard_tab_id (or old->new-tab-id {}))
                                         (assoc :card_id (:id card)))]
                        dashcard)))
    dashboard))

(def ^:private ParamWithMapping
  [:map
   [:id ms/NonBlankString]
   [:name ms/NonBlankString]
   [:mappings [:maybe [:set dashboard-card/ParamMapping]]]])

(mu/defn- dashboard->resolved-params :- [:map-of ms/NonBlankString ParamWithMapping]
  [dashboard :- [:map [:parameters [:maybe [:sequential :map]]]]]
  (let [param-key->mappings (apply
                             merge-with set/union
                             (for [dashcard (:dashcards dashboard)
                                   param    (:parameter_mappings dashcard)]
                               {(:parameter_id param) #{(assoc param :dashcard dashcard)}}))]
    (into {} (for [{param-key :id, :as param} (:parameters dashboard)]
               [(u/qualified-name param-key) (assoc param :mappings (get param-key->mappings param-key))]))))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :resolved-params]
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
  [_model k dashboards]
  (let [dashboards-with-cards (t2/hydrate dashboards [:dashcards :card])]
    (map #(assoc %1 k %2) dashboards (map dashboard->resolved-params dashboards-with-cards))))

(defmethod mi/exclude-internal-content-hsql :model/Dashboard
  [_model & {:keys [table-alias]}]
  [:not= (h2x/identifier :field table-alias :creator_id) config/internal-mb-user-id])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               SERIALIZATION                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+
(defmethod serdes/extract-query "Dashboard" [_ opts]
  (eduction (map #(t2/hydrate % [:dashcards :series]))
            (serdes/extract-query-collections Dashboard opts)))

(defn export-dashboard-card-series
  "Given the hydrated `:series` of a DashboardCard, as a vector of maps, converts it to a portable form with
  the card IDs replaced with their entity IDs."
  [cards]
  (mapv (fn [card]
          {:card_id (serdes/*export-fk* (:id card) :model/Card)})
        cards))

(defn- extract-dashcard
  [dashcard]
  (-> (into (sorted-map) dashcard)
      (dissoc :id :collection_authority_level :dashboard_id :updated_at)
      (update :card_id                serdes/*export-fk* 'Card)
      (update :action_id              serdes/*export-fk* 'Action)
      (update :dashboard_tab_id       serdes/*export-fk* :model/DashboardTab)
      (update :series                 export-dashboard-card-series)
      (update :parameter_mappings     serdes/export-parameter-mappings)
      (update :visualization_settings serdes/export-visualization-settings)))

(defn- extract-dashtab
  [dashtab]
  (dissoc dashtab :id :dashboard_id :updated_at))

(defmethod serdes/extract-one "Dashboard"
  [_model-name _opts dash]
  (let [dash (cond-> dash
               (nil? (:dashcards dash))
               (t2/hydrate [:dashcards :series])
               (nil? (:tabs dash))
               (t2/hydrate :tabs))]
    (-> (serdes/extract-one-basics "Dashboard" dash)
        (update :dashcards         #(mapv extract-dashcard %))
        (update :tabs              #(mapv extract-dashtab %))
        (update :parameters        serdes/export-parameters)
        (update :collection_id     serdes/*export-fk* Collection)
        (update :creator_id        serdes/*export-user*)
        (update :made_public_by_id serdes/*export-user*)
        (dissoc :view_count
                :last_viewed_at))))

(defmethod serdes/load-xform "Dashboard"
  [dash]
  (-> dash
      serdes/load-xform-basics
      ;; Deliberately not doing anything to :dashcards - they get handled by load-one! below.
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

(defn- drop-excessive-nested!
  "Remove nested entities which are not present in incoming serialization load"
  [hydration-key ingested local]
  (let [local-nested    (get (t2/hydrate local hydration-key) hydration-key)
        ingested-nested (get ingested hydration-key)
        to-remove       (set/difference (set (map :entity_id local-nested))
                                        (set (map :entity_id ingested-nested)))
        model           (t2/model (first local-nested))]
    (when (seq to-remove)
      (t2/delete! model :entity_id [:in to-remove]))))

;; Call the default load-one! for the Dashboard, then for each DashboardCard.
(defmethod serdes/load-one! "Dashboard" [ingested maybe-local]
  (let [dashboard ((get-method serdes/load-one! :default) (dissoc ingested :dashcards :tabs) maybe-local)]

    (drop-excessive-nested! :tabs ingested dashboard)
    (doseq [tab (:tabs ingested)]
      (serdes/load-one! (dashtab-for tab dashboard)
                        (t2/select-one :model/DashboardTab :entity_id (:entity_id tab))))

    (drop-excessive-nested! :dashcards ingested dashboard)
    (doseq [dashcard (:dashcards ingested)]
      (serdes/load-one! (dashcard-for dashcard dashboard)
                        (t2/select-one :model/DashboardCard :entity_id (:entity_id dashcard))))))

(defn- serdes-deps-dashcard
  [{:keys [action_id card_id parameter_mappings visualization_settings series]}]
  (->> (mapcat serdes/mbql-deps parameter_mappings)
       (concat (serdes/visualization-settings-deps visualization_settings))
       (concat (when card_id   #{[{:model "Card"   :id card_id}]}))
       (concat (when action_id #{[{:model "Action" :id action_id}]}))
       (concat (for [s series] [{:model "Card" :id (:card_id s)}]))
       set))

(defmethod serdes/dependencies "Dashboard"
  [{:keys [collection_id dashcards parameters]}]
  (->> (map serdes-deps-dashcard dashcards)
       (reduce set/union #{})
       (set/union (when collection_id #{[{:model "Collection" :id collection_id}]}))
       (set/union (serdes/parameters-deps parameters))))

(defmethod serdes/descendants "Dashboard" [_model-name id]
  (let [dashcards (t2/select ['DashboardCard :id :card_id :action_id :parameter_mappings :visualization_settings]
                             :dashboard_id id)
        dashboard (t2/select-one Dashboard :id id)]
    (set/union
      ;; DashboardCards are inlined into Dashboards, but we need to capture what those those DashboardCards rely on
      ;; here. So their actions, and their cards both direct, mentioned in their parameters viz settings, and related
      ;; via dashboard card series.
     (set (for [{:keys [card_id parameter_mappings]} dashcards
                ;; Capture all card_ids in the parameters, plus this dashcard's card_id if non-nil.
                card-id (cond-> (set (keep :card_id parameter_mappings))
                          card_id (conj card_id))]
            ["Card" card-id]))
     (when (not-empty dashcards)
       (set (for [card-id (t2/select-fn-set :card_id :model/DashboardCardSeries :dashboardcard_id [:in (map :id dashcards)])]
              ["Card" card-id])))
     (set (for [{:keys [action_id]} dashcards
                :when action_id]
            ["Action" action_id]))
     (reduce set/union #{}
             (for [dc dashcards]
               (serdes/visualization-settings-descendants (:visualization_settings dc))))
      ;; parameter with values_source_type = "card" will depend on a card
     (set (for [card-id (some->> dashboard :parameters (keep (comp :card_id :values_source_config)))]
            ["Card" card-id])))))


;;; ------------------------------------------------ Audit Log --------------------------------------------------------

(defmethod audit-log/model-details Dashboard
  [dashboard event-type]
  (case event-type
    (:dashboard-create :dashboard-delete :dashboard-read)
    (select-keys dashboard [:description :name])

    (:dashboard-add-cards :dashboard-remove-cards)
    (-> (select-keys dashboard [:description :name :parameters :dashcards])
        (update :dashcards (fn [dashcards]
                             (for [{:keys [id card_id]} dashcards]
                                  (-> (t2/select-one [Card :name :description], :id card_id)
                                      (assoc :id id)
                                      (assoc :card_id card_id))))))

    {}))
