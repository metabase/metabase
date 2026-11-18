(ns metabase.dashboards.revisions
  "What a Dashboard needs of the revisions beyond its columns: its revert, which puts back its tabs and dashcards, and
  the description of what changed in it."
  (:require
   [clojure.data :refer [diff]]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.models.dashboard-tab :as dashboard-tab]
   [metabase.queries.core :as queries]
   [metabase.revisions.core :as revisions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru deferred-trun]]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(defn- check-reverted-dashcards-timeline-permissions!
  "Reverting can put a card back on a publicly shared or embedded dashboard, exposing its selected timeline events, so
  the current user needs read access to those timelines."
  [dashboard-id current-cards reverted-cards]
  (queries/check-newly-exposed-dashcards-timeline-permissions!
   (dashboards.db/dashboard dashboard-id) current-cards reverted-cards))

(defn- revert-dashcards
  [dashboard-id serialized-cards]
  (let [current-cards    (->> (t2/hydrate (dashboards.db/dashcards dashboard-id) :series)
                              (mapv #(revisions/snapshot :model/DashboardCard %)))
        id->current-card (zipmap (map :id current-cards) current-cards)
        {:keys [to-create to-update to-delete]} (u/row-diff current-cards serialized-cards)]
    (check-reverted-dashcards-timeline-permissions! dashboard-id current-cards (concat to-create to-update))
    (when (seq to-delete)
      (dashboard-card/delete-dashboard-cards! (map :id to-delete)))
    (when (seq to-create)
      (dashboard-card/create-dashboard-cards! (map #(assoc % :dashboard_id dashboard-id) to-create)))
    (when (seq to-update)
      (dashboard-card/update-dashboard-cards!
       (for [update-card to-update]
         [update-card (id->current-card (:id update-card))])))))

(defn- remove-invalid-dashcards
  "Given a list of dashcards, remove any dashcard that references cards that are archived, do not exist, or now belong
  to other dashboards ."
  [dashboard-id dashcards]
  (let [card-ids          (set (keep :card_id dashcards))
        active-card-ids   (when-let [card-ids (seq card-ids)]
                            (dashboards.db/active-card-ids-for-dashboard card-ids dashboard-id))
        inactive-card-ids (set/difference card-ids active-card-ids)]
    (remove #(contains? inactive-card-ids (:card_id %)) dashcards)))

(defn- clean-invalid-parameter-card-references
  "Given a list of parameters, remove card references from any parameter whose values_source_config.card_id
  references a card that is archived or does not exist. The parameter is reset to use connected fields."
  [parameters]
  (let [card-ids        (set (keep #(get-in % [:values_source_config :card_id]) parameters))
        active-card-ids (when (seq card-ids)
                          (dashboards.db/active-card-ids card-ids))
        invalid-card-ids (set/difference card-ids active-card-ids)]
    (if (empty? invalid-card-ids)
      parameters
      (mapv (fn [param]
              (if (contains? invalid-card-ids (get-in param [:values_source_config :card_id]))
                (dissoc param :values_source_type :values_source_config)
                param))
            parameters))))

(defn revert-dashboard!
  "Return the Dashboard `dashboard-id` to the `serialized-dashboard` that a Revision recorded: its columns, its tabs and
  its dashcards."
  [dashboard-id _user-id serialized-dashboard]
  ;; Clean invalid parameter card references before reverting (cards may have been deleted since the revision)
  (let [cleaned-parameters   (clean-invalid-parameter-card-references (or (:parameters serialized-dashboard) []))
        serialized-dashboard (assoc serialized-dashboard :parameters cleaned-parameters)]
    (queries/check-new-parameter-source-card-permissions "dashboard" dashboard-id cleaned-parameters)
    ;; Update the dashboard description / name / permissions
    (revisions/revert-columns! :model/Dashboard dashboard-id serialized-dashboard)
    ;; Now update the tabs and cards as needed
    (let [serialized-dashcards      (:cards serialized-dashboard)
          current-tabs              (mapv #(dissoc (t2.realize/realize %) :created_at :updated_at :entity_id :dashboard_id)
                                          (dashboards.db/dashboard-tabs-for-dashboards [dashboard-id]))
          {:keys [old->new-tab-id]} (dashboard-tab/do-update-tabs! dashboard-id current-tabs (:tabs serialized-dashboard))
          _                         (dashboard-card/archive-or-unarchive-internal-dashboard-questions! dashboard-id serialized-dashcards)
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

(defn describe-change
  "The strings that describe how the snapshot `prev-dashboard` of a Dashboard changed into `dashboard`, naming the
  Collections and Dashboards they moved between from `names`."
  [prev-dashboard dashboard names]
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
    (-> [(when-let [default-description (u/build-sentence (revisions/describe-columns :model/Dashboard prev-dashboard dashboard names))]
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
