(ns metabase.models.dashboard
  (:require [clojure.core.async :as a]
            [clojure.data :refer [diff]]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.automagic-dashboards.populate :as magic.populate]
            [metabase.events :as events]
            [metabase.models.card :as card :refer [Card]]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.dashboard-card :as dashboard-card :refer [DashboardCard]]
            [metabase.models.field-values :as field-values]
            [metabase.models.interface :as i]
            [metabase.models.params :as params]
            [metabase.models.permissions :as perms]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :as pulse-card :refer [PulseCard]]
            [metabase.models.revision :as revision]
            [metabase.models.revision.diff :refer [build-sentence]]
            [metabase.moderation :as moderation]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor.async :as qp.async]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn ordered-cards
  "Return the DashboardCards associated with `dashboard`, in the order they were created."
  {:hydrate :ordered_cards}
  [dashboard-or-id]
  (db/do-post-select DashboardCard
    (db/query {:select    [:dashcard.* [:collection.authority_level :collection_authority_level]]
               :from      [[DashboardCard :dashcard]]
               :left-join [[Card :card] [:= :dashcard.card_id :card.id]
                           [Collection :collection] [:= :collection.id :card.collection_id]]
               :where     [:and
                           [:= :dashcard.dashboard_id (u/the-id dashboard-or-id)]
                           [:or
                            [:= :card.archived false]
                            [:= :card.archived nil]]] ; e.g. DashCards with no corresponding Card, e.g. text Cards
               :order-by  [[:dashcard.created_at :asc]]})))

(defn collections-authority-level
  "Efficiently hydrate the `:collection_authority_level` of a sequence of dashboards."
  {:batched-hydrate :collection_authority_level}
  [dashboards]
  (let [coll-id->level (into {}
                             (map (juxt :id :authority_level))
                             (db/query {:select    [:dashboard.id :collection.authority_level]
                                        :from      [[:report_dashboard :dashboard]]
                                        :left-join [[Collection :collection] [:= :collection.id :dashboard.collection_id]]
                                        :where     [:in :dashboard.id (into #{} (map u/the-id) dashboards)]}))]
    (for [dashboard dashboards]
      (assoc dashboard :collection_authority_level (get coll-id->level (u/the-id dashboard))))))

(comment moderation/keep-me)

(models/defmodel Dashboard :report_dashboard)
;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(defn- assert-valid-parameters [{:keys [parameters]}]
  (when (s/check (s/maybe [{:id su/NonBlankString, s/Keyword s/Any}]) parameters)
    (throw (ex-info (tru ":parameters must be a sequence of maps with String :id keys")
                    {:parameters parameters}))))

(defn- pre-delete [dashboard]
  (db/delete! 'Revision :model "Dashboard" :model_id (u/the-id dashboard)))

(defn- pre-insert [dashboard]
  (let [defaults  {:parameters []}
        dashboard (merge defaults dashboard)]
    (u/prog1 dashboard
      (assert-valid-parameters dashboard)
      (collection/check-collection-namespace Dashboard (:collection_id dashboard)))))

(defn- pre-update [dashboard]
  (u/prog1 dashboard
    (assert-valid-parameters dashboard)
    (collection/check-collection-namespace Dashboard (:collection_id dashboard))))

(defn- update-dashboard-subscription-pulses!
  "Updates the pulses' names and syncs the PulseCards"
  [dashboard]
  (let [dashboard-id (u/the-id dashboard)
        affected     (db/query
                      {:select    [[:p.id :pulse-id] [:pc.card_id :card-id]]
                       :modifiers [:distinct]
                       :from      [[Pulse :p]]
                       :join      [[PulseCard :pc] [:= :p.id :pc.pulse_id]]
                       :where     [:= :p.dashboard_id dashboard-id]})]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (let [correct-card-ids     (->> (db/query {:select    [:dc.card_id]
                                                 :modifiers [:distinct]
                                                 :from      [[DashboardCard :dc]]
                                                 :where     [:and
                                                             [:= :dc.dashboard_id dashboard-id]
                                                             [:not= :dc.card_id nil]]})
                                      (map :card_id)
                                      set)
            stale-card-ids       (->> affected
                                      (keep :card-id)
                                      set)
            cards-to-add         (set/difference correct-card-ids stale-card-ids)
            card-id->dashcard-id (when (seq cards-to-add)
                                   (db/select-field->id :card_id DashboardCard :dashboard_id dashboard-id
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
        (db/transaction
          (db/update-where! Pulse {:dashboard_id dashboard-id}
            :name (:name dashboard))
          (pulse-card/bulk-create! new-pulse-cards))))))

(defn- post-update
  [dashboard]
  (update-dashboard-subscription-pulses! dashboard))

(u/strict-extend (class Dashboard)
  models/IModel
  (merge models/IModelDefaults
         {:properties  (constantly {:timestamped? true})
          :types       (constantly {:parameters :json, :embedding_params :json})
          :pre-delete  pre-delete
          :pre-insert  pre-insert
          :pre-update  pre-update
          :post-update post-update
          :post-select public-settings/remove-public-uuid-if-public-sharing-is-disabled})

  ;; You can read/write a Dashboard if you can read/write its parent Collection
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)


;;; --------------------------------------------------- Revisions ----------------------------------------------------

(defn serialize-dashboard
  "Serialize a Dashboard for use in a Revision."
  [dashboard]
  (-> dashboard
      (select-keys [:description :name])
      (assoc :cards (vec (for [dashboard-card (ordered-cards dashboard)]
                           (-> (select-keys dashboard-card [:sizeX :sizeY :row :col :id :card_id])
                               (assoc :series (mapv :id (dashboard-card/series dashboard-card)))))))))

(defn- revert-dashboard!
  "Revert a Dashboard to the state defined by `serialized-dashboard`."
  [_ dashboard-id user-id serialized-dashboard]
  ;; Update the dashboard description / name / permissions
  (db/update! Dashboard dashboard-id, (dissoc serialized-dashboard :cards))
  ;; Now update the cards as needed
  (let [serialized-cards    (:cards serialized-dashboard)
        id->serialized-card (zipmap (map :id serialized-cards) serialized-cards)
        current-cards       (db/select [DashboardCard :sizeX :sizeY :row :col :id :card_id], :dashboard_id dashboard-id)
        id->current-card    (zipmap (map :id current-cards) current-cards)
        all-dashcard-ids    (concat (map :id serialized-cards)
                                    (map :id current-cards))]
    (doseq [dashcard-id all-dashcard-ids]
      (let [serialized-card (id->serialized-card dashcard-id)
            current-card    (id->current-card dashcard-id)]
        (cond
          ;; If card is in current-cards but not serialized-cards then we need to delete it
          (not serialized-card) (dashboard-card/delete-dashboard-card! current-card user-id)

          ;; If card is in serialized-cards but not current-cards we need to add it
          (not current-card) (dashboard-card/create-dashboard-card! (assoc serialized-card
                                                                      :dashboard_id dashboard-id
                                                                      :creator_id   user-id))

          ;; If card is in both we need to change :sizeX, :sizeY, :row, and :col to match serialized-card as needed
          :else (dashboard-card/update-dashboard-card! serialized-card)))))

  serialized-dashboard)

(defn- diff-dashboards-str
  "Describe the difference between two Dashboard instances."
  [_ dashboard₁ dashboard₂]
  (when dashboard₁
    (let [[removals changes]  (diff dashboard₁ dashboard₂)
          check-series-change (fn [idx card-changes]
                                (when (and (:series card-changes)
                                           (get-in dashboard₁ [:cards idx :card_id]))
                                  (let [num-series₁ (count (get-in dashboard₁ [:cards idx :series]))
                                        num-series₂ (count (get-in dashboard₂ [:cards idx :series]))]
                                    (cond
                                      (< num-series₁ num-series₂)
                                      (format "added some series to card %d" (get-in dashboard₁ [:cards idx :card_id]))

                                      (> num-series₁ num-series₂)
                                      (format "removed some series from card %d" (get-in dashboard₁ [:cards idx :card_id]))

                                      :else
                                      (format "modified the series on card %d" (get-in dashboard₁ [:cards idx :card_id]))))))]
      (-> [(when (:name changes)
             (format "renamed it from \"%s\" to \"%s\"" (:name dashboard₁) (:name dashboard₂)))
           (when (:description changes)
             (cond
               (nil? (:description dashboard₁)) "added a description"
               (nil? (:description dashboard₂)) "removed the description"
               :else (format "changed the description from \"%s\" to \"%s\""
                             (:description dashboard₁) (:description dashboard₂))))
           (when (or (:cards changes) (:cards removals))
             (let [num-cards₁  (count (:cards dashboard₁))
                   num-cards₂  (count (:cards dashboard₂))]
               (cond
                 (< num-cards₁ num-cards₂) "added a card"
                 (> num-cards₁ num-cards₂) "removed a card"
                 :else                     "rearranged the cards")))]
          (concat (map-indexed check-series-change (:cards changes)))
          (->> (filter identity)
               build-sentence)))))

(u/strict-extend (class Dashboard)
  revision/IRevisioned
  (merge revision/IRevisionedDefaults
         {:serialize-instance  (fn [_ _ dashboard] (serialize-dashboard dashboard))
          :revert-to-revision! revert-dashboard!
          :diff-str            diff-dashboards-str}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 OTHER CRUD FNS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dashboard-id->param-field-ids
  "Get the set of Field IDs referenced by the parameters in this Dashboard."
  [dashboard-or-id]
  (let [dash (Dashboard (u/the-id dashboard-or-id))]
    (params/dashboard->param-field-ids (hydrate dash [:ordered_cards :card]))))


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


(defn add-dashcard!
  "Add a Card to a Dashboard.
   This function is provided for convenience and also makes sure various cleanup steps are performed when finished,
   for example updating FieldValues for On-Demand DBs.
   Returns newly created DashboardCard."
  {:style/indent 2}
  [dashboard-or-id card-or-id-or-nil & [dashcard-options]]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashboard-card      (-> (assoc dashcard-options
                                  :dashboard_id (u/the-id dashboard-or-id)
                                  :card_id      (when card-or-id-or-nil (u/the-id card-or-id-or-nil)))
                                ;; if :series info gets passed in make sure we pass it along as a sequence of IDs
                                (update :series #(filter identity (map u/the-id %))))]
    (u/prog1 (dashboard-card/create-dashboard-card! dashboard-card)
      (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
        (update-field-values-for-on-demand-dbs! old-param-field-ids new-param-field-ids)))))

(defn update-dashcards!
  "Update the `dashcards` belonging to `dashboard-or-id`.
   This function is provided as a convenience instead of doing this yourself; it also makes sure various cleanup steps
   are performed when finished, for example updating FieldValues for On-Demand DBs.
   Returns `nil`."
  {:style/indent 1}
  [dashboard-or-id dashcards]
  (let [old-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)
        dashcard-ids        (db/select-ids DashboardCard, :dashboard_id (u/the-id dashboard-or-id))]
    (doseq [{dashcard-id :id, :as dashboard-card} dashcards]
      ;; ensure the dashcard we are updating is part of the given dashboard
      (when (contains? dashcard-ids dashcard-id)
        (dashboard-card/update-dashboard-card! (update dashboard-card :series #(filter identity (map :id %))))))
    (let [new-param-field-ids (dashboard-id->param-field-ids dashboard-or-id)]
      (update-field-values-for-on-demand-dbs! old-param-field-ids new-param-field-ids))))


;; TODO - we need to actually make this async, but then we'd need to make `save-card!` async, and so forth
(defn- result-metadata-for-query
  "Fetch the results metadata for a `query` by running the query and seeing what the `qp` gives us in return."
  [query]
  (a/<!! (qp.async/result-metadata-for-query-async query)))

(defn- save-card!
  [card]
  (cond
    ;; If this is a pre-existing card, just return it
    (and (integer? (:id card)) (Card (:id card)))
    card

    ;; Don't save text cards
    (-> card :dataset_query not-empty)
    (let [card (db/insert! 'Card
                 (-> card
                     (update :result_metadata #(or % (-> card
                                                         :dataset_query
                                                         result-metadata-for-query)))
                     (dissoc :id)))]
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
  (let [c (db/count 'Collection
            :name     [:like (format "%s%%" collection-name)]
            :location (collection/children-location (db/select-one ['Collection :location :id]
                                                      :id parent-collection-id)))]
    (if (zero? c)
      collection-name
      (format "%s %s" collection-name (inc c)))))

(defn save-transient-dashboard!
  "Save a denormalized description of `dashboard`."
  [dashboard parent-collection-id]
  (let [dashboard  (ui18n/localized-strings->strings dashboard)
        dashcards  (:ordered_cards dashboard)
        collection (magic.populate/create-collection!
                    (ensure-unique-collection-name (:name dashboard) parent-collection-id)
                    (rand-nth magic.populate/colors)
                    "Automatically generated cards."
                    parent-collection-id)
        dashboard  (db/insert! Dashboard
                     (-> dashboard
                         (dissoc :ordered_cards :rule :related :transient_name
                                 :transient_filters :param_fields :more)
                         (assoc :description         (->> dashboard
                                                          :transient_filters
                                                          applied-filters-blurb)
                                :collection_id       (:id collection)
                                :collection_position 1)))]
    (doseq [dashcard dashcards]
      (let [card     (some-> dashcard :card (assoc :collection_id (:id collection)) save-card!)
            series   (some->> dashcard :series (map (fn [card]
                                                      (-> card
                                                          (assoc :collection_id (:id collection))
                                                          save-card!))))
            dashcard (-> dashcard
                         (dissoc :card :id :card_id)
                         (update :parameter_mappings
                                 (partial map #(assoc % :card_id (:id card))))
                         (assoc :series series))]
        (add-dashcard! dashboard card dashcard)))
    dashboard))
