(ns metabase.models.chat-card
  "Underlying DB model for 'ChatCard', similar to 'Card'. Represents questions or models with chat-specific attributes."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util :as lib.util]
   [metabase.models.audit-log :as audit-log]
   [metabase.models.collection :as collection]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.chat_card.metadata :as card.metadata]
   [metabase.models.parameter-card :as parameter-card :refer [ParameterCard]]
   [metabase.models.params :as params]
   [metabase.models.permissions :as perms]
   [metabase.models.query :as query]
   [metabase.models.query.permissions :as query-perms]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [metabase.util.malli.registry :as mr]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(def ChatCard
  "Reference to the 'ChatCard' model."
  :model/ChatCard)

(methodical/defmethod t2/table-name :model/ChatCard [_model] :chat_card)

(methodical/defmethod t2.hydrate/model-for-automagic-hydration [#_model :default #_k :chat_card]
  [_original-model _k]
  :model/ChatCard)

(t2/deftransforms :model/ChatCard
  {:dataset_query          mi/transform-metabase-query
   :display                mi/transform-keyword
   :embedding_params       mi/transform-json
   :query_type             mi/transform-keyword
   :result_metadata        mi/transform-result-metadata
   :visualization_settings mi/transform-visualization-settings
   :parameters             mi/transform-parameters-list
   :parameter_mappings     mi/transform-parameters-list
   :type                   mi/transform-keyword})

(doto :model/ChatCard
  (derive :metabase/model)
  ;; You can read/write a ChatCard if you can read/write its parent Collection
  (derive ::perms/use-parent-collection-perms)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod mi/can-write? ChatCard
  ([instance]
   ;; Prevent write access to cards in the audit collection.
   (if (and
        (some? (:id (audit/default-audit-collection)))
        (= (:collection_id instance) (:id (audit/default-audit-collection))))
     false
     (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection instance :write))))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/ChatCard :id pk))))

(defmethod mi/can-read? ChatCard
  ([instance]
   (perms/can-read-audit-helper :model/ChatCard instance))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/ChatCard :id pk))))

(def chat-card-types
  "All acceptable chat card types."
  #{:model :question :metric})

(mr/def ::type
  (into [:enum] chat-card-types))
(defn chat-model?
  "Returns true if `chat_card` is a model."
  [chat-card]
  (= (keyword (:type chat-card)) :model))

;;; -------------------------------------------------- Hydration --------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/ChatCard :dashboard_count]
  [_model k chat-cards]
  (mi/instances-with-hydrated-data
   chat-cards k
   #(->> (t2/query {:select    [[:%count.* :count] :card_id]
                    :from      [:report_dashboardcard]
                    :where     [:in :card_id (map :id chat-cards)]
                    :group-by  [:card_id]})
         (map (juxt :card_id :count))
         (into {}))
   :id
   {:default 0}))

(methodical/defmethod t2/batched-hydrate [:model/ChatCard :average_query_time]
  [_model k chat-cards]
  (mi/instances-with-hydrated-data
   chat-cards k
   #(->> (t2/query {:select [[:%avg.running_time :running_time] :card_id]
                    :from   [:query_execution]
                    :where  [:and
                             [:not= :running_time nil]
                             [:not= :cache_hit true]
                             [:in :card_id (map :id chat-cards)]]
                    :group-by [:card_id]})
         (map (juxt :card_id :running_time))
         (into {}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ChatCard :last_query_start]
  [_model k chat-cards]
  (mi/instances-with-hydrated-data
   chat-cards k
   #(->> (t2/query {:select [[:%max.started_at :started_at] :card_id]
                    :from   [:query_execution]
                    :where  [:and
                             [:not= :running_time nil]
                             [:not= :cache_hit true]
                             [:in :card_id (map :id chat-cards)]]
                    :group-by [:card_id]})
         (map (juxt :card_id :started_at))
         (into {}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ChatCard :metrics]
  [_model k chat-cards]
  (mi/instances-with-hydrated-data
   chat-cards k
   #(group-by :source_card_id
              (t2/select :model/ChatCard
                         :source_card_id [:in (map :id chat-cards)],
                         :archived false,
                         :type :metric,
                         {:order-by [[:name :asc]]}))
   :id))

(methodical/defmethod t2/batched-hydrate [:model/ChatCard :parameter_usage_count]
  [_model k chat-cards]
  (mi/instances-with-hydrated-data
   chat-cards k
   #(->> (t2/query {:select    [[:%count.* :count] :card_id]
                    :from      [:parameter_card]
                    :where     [:in :card_id (map :id chat-cards)]
                    :group-by  [:card_id]})
         (map (juxt :card_id :count))
         (into {}))
   :id
   {:default 0}))

;; There's more hydration in the shared metabase.moderation namespace, but it needs to be required:
(comment moderation/keep-me)

;;; --------------------------------------------------- Revisions ----------------------------------------------------

(def ^:private excluded-columns-for-chat-card-revision
  [:id :created_at :updated_at :last_used_at :entity_id :creator_id :public_uuid])

(defmethod revision/revert-to-revision! :model/ChatCard
  [model id user-id serialized-chat-card]
  ((get-method revision/revert-to-revision! :default) model id user-id serialized-chat-card))

(defmethod revision/serialize-instance :model/ChatCard
  ([instance]
   (revision/serialize-instance ChatCard nil instance))
  ([_model _id instance]
   (apply dissoc instance excluded-columns-for-chat-card-revision)))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn populate-query-fields-chat-card
  "Lift `database_id`, `table_id`, and `query_type` fields
  from query definition when inserting/updating a ChatCard."
  [{query :dataset_query, :as chat-card}]
  (merge
   chat-card
   (when (and (map? query) (not mi/*deserializing?*))
     (when-let [{:keys [database-id table-id]} (query/query->database-and-table-ids query)]
       (let [query-type (if (query/query-is-native? query) :native :query)]
         (merge
          {:query_type (keyword query-type)}
          (when database-id
            {:database_id database-id})
          (when table-id
            {:table_id table-id})))))))

(defn- pre-insert-chat-card [chat-card]
  (let [defaults {:parameters []}]
    (merge defaults chat-card)))

(t2/define-before-insert :model/ChatCard
  [chat-card]
  (-> chat-card
      (assoc :metabase_version config/mb-version-string)
      card.metadata/populate-result-metadata
      pre-insert-chat-card
      populate-query-fields-chat-card))

(t2/define-after-insert :model/ChatCard
  [chat-card]
  (u/prog1 chat-card
    (parameter-card/upsert-or-delete-from-parameters! "chat_card" (:id chat-card) (:parameters chat-card))))

(t2/define-before-update :model/ChatCard
  [{:keys [verified-result-metadata?] :as chat-card}]
  (-> (into {:id (:id chat-card)} (t2/changes (dissoc chat-card :verified-result-metadata?)))
      populate-query-fields-chat-card))

(defmethod serdes/hash-fields :model/ChatCard
  [_chat-card]
  [:name (serdes/hydrated-hash :collection) :created_at])

;;; ----------------------------------------------- Creating Chat Cards ----------------------------------------------------

(defn create-chat-card!
  "Create a new Card. Metadata will be fetched off thread. If the metadata takes longer than [[metadata-sync-wait-ms]]
  the card will be saved without metadata and it will be saved to the card in the future when it is ready.

  Dispatches the `:card-create` event unless `delay-event?` is true. Useful for when many cards are created in a
  transaction and work in the `:card-create` event cannot proceed because the cards would not be visible outside of
  the transaction yet. If you pass true here it is important to call the event after the cards are successfully
  created."
  ([card creator] (create-chat-card! card creator false))
  ([{:keys [dataset_query result_metadata parameters parameter_mappings type] :as card-data} creator delay-event?]
   (let [data-keys                          [:dataset_query :description :display :name :visualization_settings
                                             :parameters :parameter_mappings :collection_id :collection_position
                                             :cache_ttl :type]
         ;; `zipmap` instead of `select-keys` because we want to get `nil` values for keys that aren't present. Required
         ;; by `api/maybe-reconcile-collection-position!`
         card-data                          (-> (zipmap data-keys (map card-data data-keys))
                                                (assoc
                                                 :creator_id (:id creator)
                                                 :parameters (or parameters [])
                                                 :parameter_mappings (or parameter_mappings []))
                                                (cond-> (nil? type)
                                                  (assoc :type :question)))
         {:keys [metadata metadata-future]} (card.metadata/maybe-async-result-metadata {:query    dataset_query
                                                                                        :metadata result_metadata
                                                                                        :model?   (chat-model? card-data)})
         card                               (t2/with-transaction [_conn]
                                              ;; Adding a new card at `collection_position` could cause other cards in
                                              ;; this collection to change position, check that and fix it if needed
                                              (api/maybe-reconcile-collection-position! card-data)
                                              (t2/insert-returning-instance! ChatCard (cond-> card-data
                                                                                    metadata
                                                                                    (assoc :result_metadata metadata))))]
   
     (when metadata-future
       (log/info "Metadata not available soon enough. Saving new card and asynchronously updating metadata")
       (card.metadata/save-metadata-async! metadata-future card))
     ;; include same information returned by GET /api/card/:id since frontend replaces the Card it currently has with
     ;; returned one -- See #4283
     card)))




;;; ------------------------------------------------- Updating Chat Cards -------------------------------------------------

(defn update-chat-card!
  "Update a ChatCard. Metadata is fetched asynchronously."
  [{:keys [chat-card-before-update chat-card-updates actor]}]
  (t2/with-transaction [_conn]
    (t2/update! ChatCard (:id chat-card-before-update)
                (u/select-keys-when chat-card-updates
                                    :non-nil #{:dataset_query :display :name :visualization_settings :type :parameters})))
  (let [chat-card (t2/select-one ChatCard :id (:id chat-card-before-update))]
    (events/publish-event! :event/chat-card-update {:object chat-card :user-id api/*current-user-id*})
    chat-card))


;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/dependencies "ChatCard"
  [{:keys [database_id dataset_query parameters result_metadata table_id visualization_settings]}]
  (set
   (concat
    [[{:model "Database" :id database_id}]]
    (when table_id #{(serdes/table->path table_id)})
    (serdes/parameters-deps parameters)
    (serdes/mbql-deps dataset_query)
    (serdes/visualization-settings-deps visualization_settings))))
