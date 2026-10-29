(ns metabase.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection.model]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.db :as queries.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [toucan2.core :as t2]))

(declare metabot-metrics-and-models-query)

;;; ------------------------------------------------- Metabot -------------------------------------------------

(mu/defn metabot :- [:maybe ::metabot.schema/metabot]
  "The ::metabot.schema/metabot with `metabot-id`, or nil."
  [metabot-id :- ms/PositiveInt]
  (t2/select-one :model/Metabot :id [:auto/param metabot-id]))

(mu/defn metabot-by-entity-id
  "The Metabot with `entity-id`, or nil."
  [entity-id :- [:maybe :string]]
  (t2/select-one :model/Metabot :entity_id entity-id))

(mu/defn metabot-id-by-entity-id
  "The ID of the Metabot with `entity-id`, or nil."
  [entity-id :- [:maybe :string]]
  (t2/select-one-pk :model/Metabot :entity_id entity-id))

(mu/defn metabots-by-name
  "Every Metabot, ordered by name."
  []
  (t2/select :model/Metabot {:order-by [[:name :asc]]}))

(mu/defn metabot-exists?
  "Whether a Metabot with `metabot-id` exists."
  [metabot-id :- ms/PositiveInt]
  (t2/exists? :model/Metabot :id metabot-id))

(mu/defn update-metabot!
  "Apply `changes` to the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt
   changes :- (mut/select-keys ::metabot.schema/metabot.update [:use_verified_content :collection_id])]
  (t2/update! :model/Metabot metabot-id changes))

;;; --------------------------------------------- Metabot prompts ---------------------------------------------

(mu/defn prompts-for-metabots
  "The MetabotPrompts of the Metabots with `metabot-ids`."
  [metabot-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/MetabotPrompt {:where [:in :metabot_id metabot-ids]}))

(defn- prompts-for-metabot-query
  "Honey SQL `:join`/`:where` restricting to MetabotPrompts of the Metabot with `metabot-id` whose Card is within
  scope, optionally further restricted to Cards of `card-type` or the Card with `card-id`."
  [metabot-id card-type card-id]
  (cond-> {:join  [[^:allow-subquery {:select [:id :name :type]
                                      :from   [[(metabot-metrics-and-models-query metabot-id nil) :scope]]}
                    :card]
                   [:and
                    [:= :card.id :metabot_prompt.card_id]]]
           :where [:and
                   [:= :metabot_prompt.metabot_id metabot-id]]}
    card-type (update :where conj [:= :card.type card-type])
    card-id   (update :where conj [:= :card.id card-id])))

(defn- prompt-sample-order-by
  "A random `:order-by` clause, using the database's native random function."
  []
  [[[(case (mdb/db-type)
       :postgres :random
       :rand)]]])

(mu/defn prompts
  "The prompt, model, and Card columns of the MetabotPrompts of the Metabot with `metabot-id` whose Card is within
  scope, optionally restricted to Cards of `card-type` or the Card with `card-id`, ordered randomly if `sample?` else
  by Card name, and limited/offset by `limit`/`offset`."
  [metabot-id :- ms/PositiveInt
   card-type :- [:maybe [:enum "metric" "model"]]
   card-id :- [:maybe ::lib.schema.id/card]
   sample? :- [:maybe :boolean]
   limit :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select [:model/MetabotPrompt
              :id
              :prompt
              :model
              [:card_id :model_id]
              [:card.name :model_name]
              :created_at
              :updated_at]
             (cond-> (prompts-for-metabot-query metabot-id card-type card-id)
               true   (assoc :order-by (if sample?
                                         (prompt-sample-order-by)
                                         [[:card.name :asc] [:id :asc]]))
               limit  (assoc :limit limit)
               offset (assoc :offset offset))))

(mu/defn prompt-count
  "The number of MetabotPrompts of the Metabot with `metabot-id` whose Card is within scope, optionally restricted to
  Cards of `card-type` or the Card with `card-id`."
  [metabot-id :- ms/PositiveInt
   card-type :- [:maybe [:enum "metric" "model"]]
   card-id :- [:maybe ::lib.schema.id/card]]
  (t2/count :model/MetabotPrompt (prompts-for-metabot-query metabot-id card-type card-id)))

(mu/defn prompt-count-for-metabot
  "The number of MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (t2/count :model/MetabotPrompt :metabot_id metabot-id))

(mu/defn insert-prompts!
  "Insert the MetabotPrompt `rows`."
  [rows :- [:sequential ::metabot.schema/metabot-prompt.update]]
  (t2/insert! :model/MetabotPrompt rows))

(mu/defn delete-metabot-prompt!
  "Delete the MetabotPrompt with `prompt-id` belonging to the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt
   prompt-id :- ms/PositiveInt]
  (t2/delete! :model/MetabotPrompt {:where [:and
                                            [:= :id prompt-id]
                                            [:= :metabot_id metabot-id]]}))

(mu/defn delete-prompts-for-metabot!
  "Delete the MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (t2/delete! :model/MetabotPrompt {:where [:= :metabot_id metabot-id]}))

;;; ----------------------------------------------- Conversations -----------------------------------------------

(mu/defn metabot-conversation :- [:maybe ::metabot.schema/metabot-conversation]
  "The ::metabot.schema/metabot-conversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id [:auto/param conversation-id]))

(mu/defn lock-conversation
  "The MetabotConversation with `conversation-id`, locked for update."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id {:for :update}))

(defn- participation-clause
  "Match conversations visible in history for `user-id`.

  New rows participate via `metabot_message.user_id`; legacy rows created before message authors were stamped fall
  back to the conversation originator."
  [user-id]
  [:or
   [:= :c.user_id user-id]
   [:exists ^:allow-subquery {:select [[[:inline 1]]]
                              :from   [[:metabot_message :participation_message]]
                              :where  [:and
                                       [:= :participation_message.conversation_id :c.id]
                                       [:= :participation_message.user_id user-id]]}]])

(defn- last-live-message-profile-id-subquery
  []
  ^:allow-subquery
  {:select   [:last_message.profile_id]
   :from     [[:metabot_message :last_message]]
   :where    [:and
              [:= :last_message.conversation_id :c.id]
              [:= :last_message.deleted_at nil]]
   :order-by [[:last_message.created_at :desc] [:last_message.id :desc]]
   :limit    1})

(defn- live-message-count-subquery
  []
  ^:allow-subquery
  {:select [[[:count :*]]]
   :from   [[:metabot_message :counted_message]]
   :where  [:and
            [:= :counted_message.conversation_id :c.id]
            [:= :counted_message.deleted_at nil]]})

(defn- last-live-message-at-subquery
  []
  ^:allow-subquery
  {:select [[[:max :recent_message.created_at]]]
   :from   [[:metabot_message :recent_message]]
   :where  [:and
            [:= :recent_message.conversation_id :c.id]
            [:= :recent_message.deleted_at nil]]})

(defn- activity-at-expression
  []
  [:greatest :c.created_at [:coalesce (last-live-message-at-subquery) :c.created_at]])

(defn- conversations-list-where
  [user-id profile-id]
  (cond-> [:and (participation-clause user-id)]
    profile-id (conj [:= (last-live-message-profile-id-subquery) profile-id])))

(mu/defn conversations-page
  "A page of up to `limit` (offset by `offset`) MetabotConversations visible in the history of the User with
  `user-id`, most-recent-activity first, optionally narrowed to the last live message's `profile-id`."
  [user-id :- ::lib.schema.id/user
   profile-id :- [:maybe :string]
   limit :- [:maybe ms/PositiveInt]
   offset :- [:maybe ms/IntGreaterThanOrEqualToZero]]
  (t2/select :model/MetabotConversation
             {:select   [:c.id :c.created_at :c.title :c.user_id :c.forked_from_conversation_id
                         [(live-message-count-subquery) :message_count]
                         [(last-live-message-at-subquery) :last_message_at]
                         [(last-live-message-profile-id-subquery) :profile_id]]
              :from     [[:metabot_conversation :c]]
              :where    (conversations-list-where user-id profile-id)
              :order-by [[(activity-at-expression) :desc] [:c.id :asc]]
              :limit    limit
              :offset   offset}))

(mu/defn conversation-count
  "The number of MetabotConversations visible in the history of the User with `user-id`, optionally narrowed to the
  last live message's `profile-id`."
  [user-id :- ::lib.schema.id/user
   profile-id :- [:maybe :string]]
  (:count (t2/query-one {:select [[[:count :*] :count]]
                         :from   [[:metabot_conversation :c]]
                         :where  (conversations-list-where user-id profile-id)})))

(mu/defn titleless-conversation-ids
  "Up to `limit` IDs of the MetabotConversations without a title, whose ID is greater than `after-id` (or every one,
  when `after-id` is nil), in ID order."
  [after-id :- [:maybe :string]
   limit :- ms/PositiveInt]
  (t2/select-fn-vec :id :model/MetabotConversation
                    {:where    [:and [:= :title nil] (when after-id [:> :id after-id])]
                     :order-by [[:id :asc]]
                     :limit    limit}))

(mu/defn insert-conversation!
  "Insert `conversation` under the client-generated `conversation-id`."
  [conversation-id :- :string
   conversation    :- ::metabot.schema/metabot-conversation.update]
  (t2/insert! :model/MetabotConversation (assoc conversation :id conversation-id)))

(mu/defn upsert-conversation!
  "Insert or update the MetabotConversation with `conversation-id`. `update-fn` receives the existing row (or nil on
  insert) and must return the fields to write."
  [conversation-id :- :string
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotConversation {:id conversation-id} update-fn))

(mu/defn set-conversation-title-if-missing!
  "Set the title of the MetabotConversation with `conversation-id` if it has none."
  [conversation-id :- :string
   title :- :string]
  (t2/update! :model/MetabotConversation {:id conversation-id, :title nil} {:title title}))

(mu/defn delete-conversations-created-before!
  "Delete the MetabotConversations created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/MetabotConversation {:where [:< :created_at cutoff]}))

;;; -------------------------------------------------- Messages --------------------------------------------------

(mu/defn participant?
  "Whether the User with `user-id` has sent a message in the MetabotConversation with `conversation-id`."
  [conversation-id :- :string
   user-id :- ::lib.schema.id/user]
  (t2/exists? :model/MetabotMessage :conversation_id conversation-id :user_id user-id))

(mu/defn- other-participant?
  "Whether a User other than `user-id` has sent a message in the MetabotConversation with `conversation-id`."
  [conversation-id :- :string
   user-id :- ::lib.schema.id/user]
  (t2/exists? :model/MetabotMessage :conversation_id conversation-id :user_id [:not= user-id]))

(mu/defn- slack-message?
  "Whether any message in the MetabotConversation with `conversation-id` was sent through Slack."
  [conversation-id :- :string]
  (t2/exists? :model/MetabotMessage :conversation_id conversation-id :channel_id [:not= nil]))

(mu/defn conversation-open-to-others?
  "Whether someone other than the User with `user-id` can read the MetabotConversation with `conversation-id`,
   now or by joining it later. False for a conversation that does not exist.
   Superusers can read every conversation and are not counted."
  [conversation-id :- :string
   user-id :- ::lib.schema.id/user]
  (boolean
   (when-let [{:keys [id user_id slack_thread_ts]} (metabot-conversation conversation-id)]
     ;; Anyone in a Slack thread can join its conversation, so the thread counts before a second person writes.
     ;; A thread older than the `slack_thread_ts` column shows as Slack only through its messages.
     ;; Whoever started a conversation can read it even when none of its messages name them.
     (or (some? slack_thread_ts)
         (some-> user_id (not= user-id))
         (other-participant? id user-id)
         (slack-message? id)))))

(mu/defn message-by-external-id
  "The ID and conversation of the MetabotMessage with `external-id`, or nil."
  [external-id :- :string]
  (t2/select-one [:model/MetabotMessage :id :conversation_id] :external_id external-id))

(mu/defn live-messages
  "The non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id :- [:maybe :string]]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn opening-messages
  "The first `limit` non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id :- :string
   limit :- ms/PositiveInt]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]
              :limit    limit}))

(mu/defn leaf-assistant-message
  "The most recent non-deleted assistant MetabotMessage of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotMessage
                 {:where    [:and
                             [:= :conversation_id conversation-id]
                             [:= :deleted_at nil]
                             [:= :role "assistant"]]
                  :order-by [[:created_at :desc] [:id :desc]]}))

(mu/defn insert-message-returning-pk!
  "Insert `message` and return its ID."
  [message :- ::metabot.schema/metabot-message.update]
  (t2/insert-returning-pk! :model/MetabotMessage message))

(mu/defn insert-messages!
  "Insert one MetabotMessage map or a sequence of them."
  [messages :- [:or ::metabot.schema/metabot-message.update [:sequential ::metabot.schema/metabot-message.update]]]
  (t2/insert! :model/MetabotMessage messages))

(mu/defn update-message!
  "Apply `changes` to the MetabotMessage with `message-id`."
  [message-id :- ms/PositiveInt
   changes :- ::metabot.schema/metabot-message.update]
  (t2/update! :model/MetabotMessage message-id changes))

(mu/defn soft-delete-messages-where!
  "Soft-delete the MetabotMessages matching `conditions` on behalf of `deleted-by-user-id`, returning the number of
  rows updated. `conditions` must have at least one key -- an empty map would match every message. `:id` matches a
  single MetabotMessage or, given a collection, any of several."
  [conditions :- [:and
                  [:map {:closed true}
                   [:id           {:optional true} [:maybe [:or ms/PositiveInt [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]]
                   [:channel_id   {:optional true} [:maybe :string]]
                   [:slack_msg_id {:optional true} [:maybe :string]]
                   [:role         {:optional true} [:maybe [:or :keyword :string]]]]
                  [:fn {:error/message "must have at least one condition"} seq]]
   deleted-by-user-id :- ::lib.schema.id/user]
  (let [{:keys [id]} conditions
        conditions   (cond-> conditions
                       (coll? id) (assoc :id [:in id]))]
    (t2/update! :model/MetabotMessage conditions {:deleted_at         [:now]
                                                  :deleted_by_user_id deleted-by-user-id})))

(mu/defn insert-used-tables!
  "Insert the MetabotUsedTable `rows`."
  [rows :- [:sequential [:map {:closed true}
                         [:id {:optional true} ms/PositiveInt]
                         [:message_id {:optional true} [:maybe ms/PositiveInt]]
                         [:table_id {:optional true} [:maybe ::lib.schema.id/table]]
                         [:created_at {:optional true} [:maybe ms/TemporalInstant]]]]]
  (t2/insert! :model/MetabotUsedTable rows))

;;; --------------------------------------------------- Feedback ---------------------------------------------------

(mu/defn upsert-feedback!
  "Insert or update the MetabotFeedback row for the MetabotMessage with `message-id` and the User with
  `submitter-user-id`. `update-fn` receives the existing row (or nil on insert) and must return the fields to
  write."
  [message-id :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotFeedback
                         {:message_id message-id :user_id submitter-user-id}
                         update-fn))

(mu/defn upsert-source-feedback!
  "Insert or update the MetabotSourceFeedback row for the MetabotMessage with `message-id`, the User with
  `submitter-user-id`, and the source with `source-id`/`source-type`. `update-fn` receives the existing row (or nil
  on insert) and must return the fields to write."
  [message-id :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   source-id :- ms/PositiveInt
   source-type :- [:enum "table" "card" "model" "dashboard"]
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotSourceFeedback
                         {:message_id  message-id
                          :user_id     submitter-user-id
                          :source_id   source-id
                          :source_type source-type}
                         update-fn))

;;; ------------------------------------------------ Databases ------------------------------------------------

(mu/defn database-with-columns
  "The `columns` of the Database with `database-id`."
  [columns :- [:sequential :keyword]
   database-id :- ::lib.schema.id/database]
  (t2/select-one columns database-id))

;;; ------------------------------------------------- Tables -------------------------------------------------

(defn readable-active-table-database-id
  "The Database ID of the active Table with `table-id`, or nil when there is no such table *or*
  the current user cannot read it.

  Collapsing those two cases is the point. A caller resolving an agent-authored numeric id has
  no metadata provider yet — this lookup is what decides which one to build — so a bare
  existence answer here runs ahead of every permission check, and lets the id argument
  enumerate table ids across databases the caller cannot otherwise see.

  Selects the whole row rather than the two columns this fn returns: `mi/can-read?` for a Table
  is polymorphic over the instance, and its published-collection branch reads `:is_published`
  and `:collection_id`. Handing it a trimmed row makes it answer a narrower question and deny a
  user whose access comes through that path."
  [table-id]
  (when-let [table (warehouse-schema.db/table table-id)]
    (when (and (:active table) (mi/can-read? table))
      (:db_id table))))

(mu/defn tables-by-id
  "A map of ID to Table for `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-fn->fn :id identity :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(defn- current-user-visible-table-clause
  "Honey SQL `{:where …}` (plus `:with` when the filter needs a CTE) restricting Tables to those visible to the
  current user for querying."
  []
  (let [{table-where-clause :clause table-cte :with}
        (mi/visible-filter-clause :model/Table
                                  :id
                                  {:user-id       api/*current-user-id*
                                   :is-superuser? api/*is-superuser?*}
                                  {:perms/view-data      :unrestricted
                                   :perms/create-queries :query-builder-and-native})]
    (cond-> {:where table-where-clause}
      table-cte (assoc :with table-cte))))

(mu/defn visible-table-summaries-for-current-user
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id` that are visible to the current user for querying."
  [database-id :- ::lib.schema.id/database
   table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil
             (assoc (current-user-visible-table-clause) :from [(warehouse-schema-overlay/table-query)])))

(def ^:private max-visible-tables-to-consider
  "Cap on the number of visible Tables fetched for fuzzy table-name matching."
  10000)

(mu/defn visible-tables-excluding
  "Reducible ID, name, schema, and description of up to [[max-visible-tables-to-consider]] active, unhidden Tables in
  the Database with `database-id` that are visible to the current user for querying, excluding `excluded-table-ids`."
  [database-id :- ::lib.schema.id/database
   excluded-table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/reducible-select [:model/Table :id :name :schema :description]
                       :db_id database-id
                       :active true
                       :visibility_type nil
                       (cond-> (assoc (current-user-visible-table-clause)
                                      :from  [(warehouse-schema-overlay/table-query)]
                                      :limit max-visible-tables-to-consider)
                         (seq excluded-table-ids)
                         (update :where (fn [where-clause]
                                          (if where-clause
                                            [:and where-clause [:not-in :id excluded-table-ids]]
                                            [:not-in :id excluded-table-ids]))))))

(mu/defn most-viewed-tables-visible-to-current-user
  "The ID, Database ID, name, schema, and description of up to `limit` active, unhidden Tables in the Database with
  `database-id` (which callers may pass as an invalid/nonexistent id to get no results back) that are visible to the
  current user for querying, most viewed first."
  [database-id :- :int
   limit :- ms/PositiveInt]
  (t2/select [:model/Table :id :db_id :name :schema :description]
             :db_id database-id
             :active true
             :visibility_type nil
             (assoc (current-user-visible-table-clause)
                    :from     [(warehouse-schema-overlay/table-query)]
                    :order-by [[:view_count :desc]]
                    :limit    limit)))

(mu/defn active-schemas-for-database
  "The distinct `:schema` rows of the active Tables in the Database with `database-id`, ordered by schema."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select-distinct [:schema]
             :from            [(warehouse-schema-overlay/table-query {:user-settings? false})]
             :where           [:and [:= :db_id database-id] [:= :active true]]
             :order-by        [[:schema :asc]]}))

;;; ------------------------------------------------- Fields -------------------------------------------------

;;; -------------------------------------------------- Cards --------------------------------------------------

(defn- metabot-metrics-and-models-query
  "Honey SQL query selecting the metric and model Cards in scope of the Metabot with `metabot-id` that are visible to
  the current user, ignoring analytics content. If the Metabot has `:use_verified_content` enabled, restricts to
  verified-or-curated content (verified, official-collection, or library-published). `limit`, if given, caps the
  number of rows."
  [metabot-id limit]
  (let [metabot-instance       (metabot metabot-id)
        metabot-collection-id  (:collection_id metabot-instance)
        use-verified-content?  (:use_verified_content metabot-instance)
        verified?              (premium-features/has-feature? :content-verification)
        official?              (premium-features/has-feature? :official-collections)
        library?               (premium-features/has-feature? :library)
        ;; ids of collections under a Library-type root; their metrics/models are library-published content
        library-coll-ids (when library?
                           (let [roots (collections.db/root-collections-of-types {:types (mapv name collection.model/library-collection-types)})]
                             (into (set (map :id roots)) (mapcat collection.model/descendant-ids roots))))
        ;; Mirror collections.curation/curated? for card scope: verified, official-collection, or
        ;; library-published (under a Library root). Each disjunct is gated on its feature.
        curated-conds (cond-> []
                        verified? (conj [:= :mr.status "verified"])
                        official? (conj [:= :collection.authority_level "official"])
                        (seq library-coll-ids) (conj [:in :report_card.collection_id (vec library-coll-ids)]))
        ;; Columns are qualified with report_card because the official-collections branch joins
        ;; `collection`, which shares column names (type, archived, id) — unqualified refs would be ambiguous.
        collection-filter (if metabot-collection-id
                            (let [metabot-collection (collections.db/collection metabot-collection-id)
                                  collection-ids (conj (collection.model/descendant-ids metabot-collection) metabot-collection-id)]
                              [:in :report_card.collection_id collection-ids])
                            [:and true])
        base-query ^:allow-subquery {:select [:report_card.*]
                                     :from   [[:report_card]]
                                     :where [:and
                                             [:!= :report_card.database_id audit-app/audit-db-id]
                                             collection-filter
                                             [:in :report_card.type ["metric" "model"]]
                                             [:= :report_card.archived false]
                                             (when api/*current-user-id*
                                               (collection.model/visible-collection-filter-clause :report_card.collection_id))]}]
    (cond-> base-query
      verified?
      (update :left-join (fnil into []) [[:moderation_review :mr] [:and
                                                                   [:= :mr.moderated_item_id :report_card.id]
                                                                   [:= :mr.moderated_item_type "card"]
                                                                   [:= :mr.most_recent true]]])

      official?
      (update :left-join (fnil into []) [[:collection :collection]
                                         [:= :collection.id :report_card.collection_id]])

      ;; Prioritize curated content.
      (seq curated-conds)
      (assoc :order-by [[[:case (into [:or] curated-conds) [:inline 0] :else [:inline 1]] :asc]])

      ;; Restrict to curated content only when that's desired.
      (and use-verified-content? (seq curated-conds))
      (update :where conj (into [:or] curated-conds))

      ;; Setting on but no curation features active → nothing is curated, so return nothing rather than
      ;; falling through unfiltered to uncurated cards.
      (and use-verified-content? (empty? curated-conds))
      (update :where conj [:= [:inline 1] [:inline 0]])

      (integer? limit)
      (assoc :limit limit))))

(mu/defn metabot-metrics-and-models
  "The metric and model Cards in scope of the Metabot with `metabot-id` that are visible to the current user (see
  [[metabot-metrics-and-models-query]]), ordered to prioritize curated content and then by Card id. `limit`, if
  given, caps the number of rows returned."
  [metabot-id :- ms/PositiveInt
   limit      :- [:maybe ms/PositiveInt]]
  (t2/select :model/Card (-> (metabot-metrics-and-models-query metabot-id limit)
                             (update :order-by (fnil conj []) [:report_card.id]))))

(mu/defn card-source-info
  "Return a map of Card IDs to stored metric definitions for `card-ids`.

  Each row contains the `:dataset_query` for [[metabase.metabot.tools.util/metric-required-source]].
  Queries are returned with the model's output transform, without running card-schema upgrades."
  ;; The first stage's `:source_card_id` cannot distinguish single-stage and multi-stage card metrics.
  [card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (let [query-out (:out lib-be/transform-query)]
    (into {}
          (map (fn [{:keys [id dataset_query]}]
                 [id {:dataset_query (query-out dataset_query)}]))
          (when (seq card-ids)
            (queries.db/raw-card-dataset-queries {:card-ids card-ids})))))

(mu/defn link-card-to-conversation!
  "Record that the Card with `card-id` was saved from the MetabotConversation with `conversation-id` as `chart-id`."
  [card-id :- ::lib.schema.id/card
   conversation-id :- :string
   chart-id :- :string]
  (t2/update! (t2/table-name :model/Card) card-id {:metabot_conversation_id conversation-id
                                                   :metabot_chart_id        chart-id}))

;;; ----------------------------------------------- Collections -----------------------------------------------

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn messages-for-conversation
  "The MetabotMessages of the MetabotConversation with `conversation-id`, oldest first."
  [{:keys [conversation-id]} :- [:map {:closed true}
                                 [:conversation-id :string]]]
  (t2/select :model/MetabotMessage :conversation_id [:auto/param conversation-id] {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn message-data-for-conversations
  "The conversation id, data, and data version of the MetabotMessages of the conversations with `conversation-ids`."
  [{:keys [conversation-ids]} :- [:map {:closed true}
                                  [:conversation-ids [:sequential :string]]]]
  (t2/select [:model/MetabotMessage :conversation_id :data :data_version] :conversation_id [:in conversation-ids]))

(mu/defn feedback-for-conversation
  "The MetabotFeedback rows on the messages of the MetabotConversation with `conversation-id`, oldest first."
  [{:keys [conversation-id]} :- [:map {:closed true}
                                 [:conversation-id :string]]]
  (t2/select :model/MetabotFeedback
             {:select   [:metabot_feedback.id
                         :metabot_feedback.message_id
                         :metabot_feedback.user_id
                         [:mm.external_id :external_id]
                         :metabot_feedback.positive
                         :metabot_feedback.issue_type
                         :metabot_feedback.freeform_feedback
                         :metabot_feedback.created_at
                         :metabot_feedback.updated_at]
              :from     [:metabot_feedback]
              :join     [[:metabot_message :mm] [:= :mm.id :metabot_feedback.message_id]]
              :where    [:= :mm.conversation_id [:auto/param conversation-id]]
              :order-by [[:metabot_feedback.created_at :asc]
                         [:metabot_feedback.message_id :asc]
                         [:metabot_feedback.user_id :asc]]}))
