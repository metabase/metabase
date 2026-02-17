(ns metabase.revisions.impl.dashboard
  (:require
   [clojure.data :refer [diff]]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.revisions.models.revision :as revision]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru deferred-trun]]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(def ^:private excluded-columns-for-dashboard-revision
  #{:id :created_at :updated_at :creator_id :points_of_interest :caveats :show_in_getting_started :entity_id
    ;; not sure what position is for, from the column remark:
    ;; > The position this Dashboard should appear in the Dashboards list,
    ;;   lower-numbered positions appearing before higher numbered ones.
    ;; TODO: querying on stats we don't have any dashboard that has a position, maybe we could just drop it?
    :dependency_analysis_version
    :public_uuid :made_public_by_id
    :position :initially_published_at :view_count
    :last_viewed_at})

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
  "Given a list of dashcards, remove any dashcard that references cards that are archived, do not exist, or now belong
  to other dashboards ."
  [dashboard-id dashcards]
  (let [card-ids          (set (keep :card_id dashcards))
        active-card-ids   (when-let [card-ids (seq card-ids)]
                            (t2/select-pks-set :model/Card
                                               {:where [:and
                                                        [:in :id card-ids]
                                                        ;; skip when archived
                                                        [:= :archived false]
                                                        ;; belong to this dashboard, or are not Dashboard Questions
                                                        [:or
                                                         [:= :dashboard_id dashboard-id]
                                                         [:= :dashboard_id nil]]]}))
        inactive-card-ids (set/difference card-ids active-card-ids)]
    (remove #(contains? inactive-card-ids (:card_id %)) dashcards)))

(defn- clean-invalid-parameter-card-references
  "Given a list of parameters, remove card references from any parameter whose values_source_config.card_id
  references a card that is archived or does not exist. The parameter is reset to use connected fields."
  [parameters]
  (let [card-ids        (set (keep #(get-in % [:values_source_config :card_id]) parameters))
        active-card-ids (when (seq card-ids)
                          (t2/select-pks-set :model/Card
                                             {:where [:and
                                                      [:in :id card-ids]
                                                      [:= :archived false]]}))
        invalid-card-ids (set/difference card-ids active-card-ids)]
    (if (empty? invalid-card-ids)
      parameters
      (mapv (fn [param]
              (if (contains? invalid-card-ids (get-in param [:values_source_config :card_id]))
                (dissoc param :values_source_type :values_source_config)
                param))
            parameters))))

(defmethod revision/revert-to-revision! :model/Dashboard
  [model dashboard-id user-id serialized-dashboard]
  ;; Clean invalid parameter card references before reverting (cards may have been deleted since the revision)
  (let [cleaned-parameters   (clean-invalid-parameter-card-references (or (:parameters serialized-dashboard) []))
        serialized-dashboard (assoc serialized-dashboard :parameters cleaned-parameters)]
    ;; Update the dashboard description / name / permissions
    ((get-method revision/revert-to-revision! :default) model dashboard-id user-id (dissoc serialized-dashboard :cards :tabs))
    ;; Now update the tabs and cards as needed
    (let [serialized-dashcards      (:cards serialized-dashboard)
          current-tabs              (t2/select-fn-vec #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                                      :model/DashboardTab :dashboard_id dashboard-id)
          {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! dashboard-id current-tabs (:tabs serialized-dashboard))
          _                         (dashboard/archive-or-unarchive-internal-dashboard-questions! dashboard-id serialized-dashcards)
          serialized-dashcards      (cond->> serialized-dashcards
                                      true
                                      (remove-invalid-dashcards dashboard-id)
                                      ;; in case reverting result in new tabs being created,
                                      ;; we need to remap the tab-id
                                      (seq old->new-tab-id)
                                      (map (fn [card]
                                             (if-let [new-tab-id (get old->new-tab-id (:dashboard_tab_id card))]
                                               (assoc card :dashboard_tab_id new-tab-id)
                                               card))))]
      (revert-dashcards dashboard-id serialized-dashcards))
    serialized-dashboard))

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
    (-> [(when-let [default-description (u/build-sentence ((get-method revision/diff-strings :default) :model/Dashboard prev-dashboard dashboard))]
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
