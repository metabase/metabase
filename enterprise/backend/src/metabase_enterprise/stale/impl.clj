(ns metabase-enterprise.stale.impl
  (:require
   [metabase.embedding.settings :as embed.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private FindStaleContentArgs
  [:map
   [:collection-ids [:set {:doc "The set of collection IDs to search for stale content."} [:maybe :int]]]
   [:cutoff-date [:time/local-date {:doc "The cutoff date for stale content."}]]
   [:limit  [:maybe {:doc "The limit for pagination."} :int]]
   [:offset [:maybe {:doc "The offset for pagination."} :int]]
   [:sort-column  [:enum {:doc "The column to sort by."} :name :last_used_at]]
   [:sort-direction  [:enum {:doc "The direction to sort by."} :asc :desc]]])

(defmulti ^:private find-stale-query
  "Find stale content of a given model type."
  {:arglists '([model args])}
  (fn [model _args] model))

(defmethod find-stale-query :model/Card
  [_model args]
  {:select [:report_card.id
            [(h2x/literal "Card") :model]
            [:report_card.name :name]
            :last_used_at]
   :from :report_card
   :left-join [:moderation_review [:and
                                   [:= :moderation_review.moderated_item_id :report_card.id]
                                   [:= :moderation_review.moderated_item_type (h2x/literal "card")]
                                   [:= :moderation_review.most_recent true]
                                   [:= :moderation_review.status (h2x/literal "verified")]]
               :pulse_card [:= :pulse_card.card_id :report_card.id]
               :pulse [:and
                       [:= :pulse_card.pulse_id :pulse.id]
                       [:= :pulse.archived false]]
               :sandboxes [:= :sandboxes.card_id :report_card.id]
               :collection [:= :collection.id :report_card.collection_id]]
   :where [:and
           [:= :sandboxes.id nil]
           [:= :pulse.id nil]
           [:= :moderation_review.id nil]
           [:= :report_card.archived false]
           [:<= :report_card.last_used_at (-> args :cutoff-date)]
           ;; find things only in regular collections, not the `instance-analytics` collection.
           [:= :collection.type nil]
           (when (embed.settings/some-embedding-enabled?)
             [:= :report_card.enable_embedding false])
           (when (setting/get :enable-public-sharing)
             [:= :report_card.public_uuid nil])
           [:or
            (when (contains? (:collection-ids args) nil)
              [:is :report_card.collection_id nil])
            [:in :report_card.collection_id (-> args :collection-ids)]]]})

(defmethod find-stale-query :model/Dashboard
  [_model args]
  {:select [:report_dashboard.id
            [(h2x/literal "Dashboard") :model]
            [:report_dashboard.name :name]
            [:last_viewed_at :last_used_at]]
   :from :report_dashboard
   :left-join [:pulse [:and
                       [:= :pulse.archived false]
                       [:= :pulse.dashboard_id :report_dashboard.id]]
               :collection [:= :collection.id :report_dashboard.collection_id]
               :moderation_review [:and
                                   [:= :moderation_review.moderated_item_id :report_dashboard.id]
                                   [:= :moderation_review.moderated_item_type (h2x/literal "dashboard")]
                                   [:= :moderation_review.most_recent true]
                                   [:= :moderation_review.status (h2x/literal "verified")]]]
   :where [:and
           [:= :pulse.id nil]
           [:= :moderation_review.id nil]
           [:= :report_dashboard.archived false]
           [:<= :report_dashboard.last_viewed_at (-> args :cutoff-date)]
           ;; find things only in regular collections, not the `instance-analytics` collection.
           [:= :collection.type nil]
           (when (embed.settings/some-embedding-enabled?)
             [:= :report_dashboard.enable_embedding false])
           (when (setting/get :enable-public-sharing)
             [:= :report_dashboard.public_uuid nil])
           [:or
            (when (contains? (:collection-ids args) nil)
              [:is :report_dashboard.collection_id nil])
            [:in :report_dashboard.collection_id (-> args :collection-ids)]]]})

(defn- sort-column [column]
  (case column
    :name :%lower.name
    :last_used_at :last_used_at))

(defn- queries [args]
  (for [model [:model/Card :model/Dashboard]]
    (find-stale-query model args)))

(mu/defn- rows-query [args :- FindStaleContentArgs]
  {:select [:id :model]
   :from [[{:union-all (queries args)} :dummy_alias]]
   :order-by [[(sort-column (:sort-column args))
               (:sort-direction args)]]})

(mu/defn- rows-query-with-limit [{:keys [limit offset] :as args} :- FindStaleContentArgs]
  (cond->  (rows-query args)
    (some? limit) ;; limit
    (assoc :limit limit)
    (some? offset) ;; offset
    (assoc :offset offset)))

(mu/defn ^:private total-query [args :- FindStaleContentArgs]
  {:select [[:%count.* :count]]
   :from [[{:union-all (queries args)} :dummy_alias]]})

(mu/defn find-candidates :- [:map
                             [:rows [:sequential [:map
                                                  [:id pos-int?]
                                                  [:model keyword?]]]]
                             [:total :int]]
  "Find stale content in the given collections.

  Arguments are defined by [[FindStaleContentArgs]]:

  - `collection-ids`: the set of collection IDs to look for stale content in. Non-recursive, the exact set you pass in
  will be searched

  - `cutoff-date`: if something was last accessed before this date, it is 'stale'

  - `limit` / `offset`: to support pagination

  - `sort-column`: one of `:name` or `:last_used_at` (column to sort on)

  - `sort-direction`: `:asc` or `:desc`

  Returns a map containing two keys,

  - `:rows` (a collection of maps containing an `:id` and `:model` field, like `{:id 1 :model :model/Card}`), and

  - `:total` (the total count of stale elements that could be found if you iterated through all pages)
  "
  [{:keys [collection-ids] :as args} :- FindStaleContentArgs]
  (when (contains? collection-ids :root) (throw (ex-info "not implemented." {:collection-ids collection-ids})))
  {:rows (into []
               (comp
                (map #(select-keys % [:id :model]))
                (map (fn [v] (update v :model #(keyword "model" %)))))
               (t2/query (rows-query-with-limit args)))
   :total (:count (t2/query-one (total-query args)))})

;;; ------------------------------------------------ Bulk Archive Operations -------------------------------------------------

(defn find-all-candidates
  "Find all stale candidates without pagination. Returns a sequence of maps with :id and :model keys."
  [args]
  (into []
        (comp
         (map #(select-keys % [:id :model]))
         (map (fn [v] (update v :model #(keyword "model" %)))))
        ;; TODO fix this dumb thing
        (t2/query (rows-query (assoc args :limit 0 :offset 0 :sort-column :name :sort-direction :asc)))))

(defn- batch-archive-cards!
  "Archive cards in batches, checking permissions and recording audit events via plural events.
  Returns a sequence of successfully archived card IDs."
  [cards user-id]
  (if (empty? cards)
    []
    (let [cards (t2/select :model/Card :id [:in (map :id cards)])
          ;; Filter to only cards user can write
          cards-to-archive (filter mi/can-write? cards)
          card-ids (map :id cards-to-archive)
          _ (log/infof "Archiving %d cards (filtered from %d based on permissions)" (count card-ids) (count cards))]
      (when (seq card-ids)
        ;; Store previous state before updating
        (let [previous-cards-by-id (into {} (map (juxt :id identity)) cards-to-archive)]
          ;; Batch update in chunks of 500
          (doseq [id-chunk (partition-all 500 card-ids)]
            (t2/update! :model/Card {:id [:in id-chunk]} {:archived true :archived_directly true}))

          ;; Fetch updated cards
          (let [updated-cards (t2/select :model/Card :id [:in card-ids])]
            ;; Publish single plural event with both previous and current state
            ;; This will trigger both audit log and revision handlers
            (events/publish-event! :event/cards-update
                                   {:events
                                    (for [card updated-cards]
                                      {:object card
                                       :user-id user-id
                                       :previous-object (get previous-cards-by-id (:id card))})}))))
      card-ids)))

(defn- batch-archive-dashboards!
  "Archive dashboards in batches, checking permissions and recording audit events via plural events.
  Returns a sequence of successfully archived dashboard IDs."
  [dashboards user-id]
  (if (empty? dashboards)
    []
    (let [dashboards (t2/select :model/Dashboard :id [:in (map :id dashboards)])
          ;; Filter to only dashboards user can write
          dashboards-to-archive (filter mi/can-write? dashboards)
          dashboard-ids (map :id dashboards-to-archive)
          _ (log/infof "Archiving %d dashboards (filtered from %d based on permissions)"
                       (count dashboard-ids) (count dashboards))]
      (when (seq dashboard-ids)
        ;; Store previous state before updating
        (let [previous-dashboards-by-id (into {} (map (juxt :id identity)) dashboards-to-archive)]
          ;; Batch update in chunks of 500
          (doseq [id-chunk (partition-all 500 dashboard-ids)]
            (t2/update! :model/Dashboard {:id [:in id-chunk]} {:archived true :archived_directly true}))

          ;; Fetch updated dashboards
          (let [updated-dashboards (t2/select :model/Dashboard :id [:in dashboard-ids])]
            ;; Publish single plural event with both previous and current state
            ;; This will trigger both audit log and revision handlers
            (events/publish-event! :event/dashboards-update
                                   {:events (for [dashboard updated-dashboards]
                                              {:object dashboard
                                               :user-id user-id
                                               :previous-object (get previous-dashboards-by-id (:id dashboard))})}))))
      dashboard-ids)))

(def ^:private ArchiveArgs
  [:map
   [:collection-ids [:set {:doc "The set of collection IDs to search for stale content."} [:maybe :int]]]
   [:cutoff-date [:time/local-date {:doc "The cutoff date for stale content."}]]
   [:user-id pos-int?]
   [:sort-column {:optional true} [:enum :name :last_used_at]]
   [:sort-direction {:optional true} [:enum :asc :desc]]])

(mu/defn archive-candidates!
  "Archive all stale candidates matching the given criteria.

  Performs bulk archive operation with:
  - Batch SQL updates (500 items per chunk)
  - Bulk audit log inserts (guaranteed complete audit trail)
  - Best-effort revision events (fire-and-forget)

  Returns a map with:
  - :total_archived - total number of items successfully archived
  - :cards_archived - number of cards archived
  - :dashboards_archived - number of dashboards archived
  - :archived_ids - sequence of {:id X :model \"card\"|\"dashboard\"} for undo support"
  [{:keys [user-id] :as args} :- ArchiveArgs]
  (let [;; Find all candidates (no pagination)
        candidates (find-all-candidates (merge args
                                               {:limit nil
                                                :offset nil
                                                :sort-column (or (:sort-column args) :name)
                                                :sort-direction (or (:sort-direction args) :asc)}))
        ;; Group by model type
        by-model (group-by :model candidates)
        cards (get by-model :model/Card [])
        dashboards (get by-model :model/Dashboard [])]

    (log/infof "Starting bulk archive: %d cards, %d dashboards" (count cards) (count dashboards))

    ;; Perform archives in a transaction (updates + audit logs atomic)
    (t2/with-transaction [_conn]
      (let [archived-card-ids (batch-archive-cards! cards user-id)
            archived-dashboard-ids (batch-archive-dashboards! dashboards user-id)
            total (+ (count archived-card-ids) (count archived-dashboard-ids))]

        (log/infof "Bulk archive complete: %d items archived" total)

        {:total_archived total
         :cards_archived (count archived-card-ids)
         :dashboards_archived (count archived-dashboard-ids)
         :archived_ids (concat
                        (map #(hash-map :id % :model "card") archived-card-ids)
                        (map #(hash-map :id % :model "dashboard") archived-dashboard-ids))}))))

(def ^:private UnarchiveArgs
  [:map
   [:items [:sequential [:map
                         [:id pos-int?]
                         [:model [:enum "card" "dashboard"]]]]]
   [:user-id pos-int?]])

(mu/defn unarchive-items!
  "Unarchive specific items (used for undo functionality).

  Performs bulk unarchive operation with:
  - Permission checks for each item
  - Batch SQL updates
  - Bulk audit log inserts

  Returns a map with:
  - :total_unarchived - total number of items successfully unarchived"
  [{:keys [items user-id]} :- UnarchiveArgs]
  (let [{cards "card" dashboards "dashboard"} (group-by :model items)
        ;; Filter to only items the user has write permission for
        card-ids (filter #(mi/can-write? :model/Card %) (map :id cards))
        dashboard-ids (filter #(mi/can-write? :model/Dashboard %) (map :id dashboards))]

    (log/infof "Starting bulk unarchive: %d cards, %d dashboards (filtered from %d cards, %d dashboards based on permissions)"
               (count card-ids) (count dashboard-ids) (count cards) (count dashboards))

    (t2/with-transaction [_conn]
      ;; Unarchive cards
      (when (seq card-ids)
        ;; Fetch previous state before updating
        (let [previous-cards (t2/select :model/Card :id [:in card-ids])
              previous-cards-by-id (into {} (map (juxt :id identity)) previous-cards)]
          (doseq [id-chunk (partition-all 500 card-ids)]
            (t2/update! :model/Card {:id [:in id-chunk]} {:archived false}))

          (let [updated-cards (t2/select :model/Card :id [:in card-ids])]
            ;; Publish single plural event with both previous and current state
            (events/publish-event! :event/cards-update
                                   {:events (for [card updated-cards]
                                              {:object card
                                               :user-id user-id
                                               :previous-object (get previous-cards-by-id (:id card))})}))))

      ;; Unarchive dashboards
      (when (seq dashboard-ids)
        ;; Fetch previous state before updating
        (let [previous-dashboards (t2/select :model/Dashboard :id [:in dashboard-ids])
              previous-dashboards-by-id (into {} (map (juxt :id identity)) previous-dashboards)]
          (doseq [id-chunk (partition-all 500 dashboard-ids)]
            (t2/update! :model/Dashboard {:id [:in id-chunk]} {:archived false}))

          (let [updated-dashboards (t2/select :model/Dashboard :id [:in dashboard-ids])]
            ;; Publish single plural event with both previous and current state
            (events/publish-event! :event/dashboards-update
                                   {:events (for [dashboard updated-dashboards]
                                              {:object dashboard
                                               :user-id user-id
                                               :previous-object (get previous-dashboards-by-id (:id dashboard))})}))))

      (log/infof "Bulk unarchive complete: %d items" (+ (count card-ids) (count dashboard-ids)))

      {:total_unarchived (+ (count card-ids) (count dashboard-ids))})))
