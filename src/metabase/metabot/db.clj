(ns metabase.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.models.collection :as collection.model]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(declare collection metabot-metrics-and-models-query root-collections-of-types)

;;; ------------------------------------------------- Metabot -------------------------------------------------

(mu/defn metabot :- [:maybe (ms/InstanceOf :model/Metabot)]
  "The Metabot with `metabot-id`, or nil."
  [metabot-id :- ms/PositiveInt]
  (t2/select-one :model/Metabot :id metabot-id))

(mu/defn metabot-by-entity-id :- [:maybe (ms/InstanceOf :model/Metabot)]
  "The Metabot with `entity-id`, or nil."
  [entity-id :- [:maybe :string]]
  (t2/select-one :model/Metabot :entity_id entity-id))

(mu/defn metabot-id-by-entity-id :- [:maybe ms/PositiveInt]
  "The ID of the Metabot with `entity-id`, or nil."
  [entity-id :- [:maybe :string]]
  (t2/select-one-pk :model/Metabot :entity_id entity-id))

(mu/defn metabots-by-name :- [:sequential (ms/InstanceOf :model/Metabot)]
  "Every Metabot, ordered by name."
  []
  (t2/select :model/Metabot {:order-by [[:name :asc]]}))

(mu/defn metabot-exists? :- :boolean
  "Whether a Metabot with `metabot-id` exists."
  [metabot-id :- ms/PositiveInt]
  (t2/exists? :model/Metabot :id metabot-id))

(mu/defn update-metabot! :- :int
  "Apply `changes` to the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:use_verified_content {:optional true} :boolean]
               [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/update! :model/Metabot metabot-id changes))

;;; --------------------------------------------- Metabot prompts ---------------------------------------------

(mu/defn prompts-for-metabots :- [:sequential (ms/InstanceOf :model/MetabotPrompt)]
  "The MetabotPrompts of the Metabots with `metabot-ids`."
  [metabot-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/MetabotPrompt {:where [:in :metabot_id metabot-ids]}))

(defn- prompts-for-metabot-query
  "Honey SQL `:join`/`:where` restricting to MetabotPrompts of the Metabot with `metabot-id` whose Card is within
  scope, optionally further restricted to Cards of `card-type` or the Card with `card-id`."
  [metabot-id card-type card-id]
  (cond-> {:join  [[^:allow-subquery {:select [:id :name :type]
                                      :from   [[(metabot-metrics-and-models-query metabot-id) :scope]]}
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

(mu/defn prompts :- [:sequential (ms/InstanceOf :model/MetabotPrompt)]
  "The prompt, model, and Card columns of the MetabotPrompts of the Metabot with `metabot-id` whose Card is within
  scope, optionally restricted to Cards of `card-type` or the Card with `card-id`, ordered randomly if `sample?` else
  by Card name, and limited/offset by `limit`/`offset`."
  [metabot-id :- ms/PositiveInt
   card-type :- [:maybe [:enum "metric" "model"]]
   card-id :- [:maybe ms/PositiveInt]
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

(mu/defn prompt-count :- ms/IntGreaterThanOrEqualToZero
  "The number of MetabotPrompts of the Metabot with `metabot-id` whose Card is within scope, optionally restricted to
  Cards of `card-type` or the Card with `card-id`."
  [metabot-id :- ms/PositiveInt
   card-type :- [:maybe [:enum "metric" "model"]]
   card-id :- [:maybe ms/PositiveInt]]
  (t2/count :model/MetabotPrompt (prompts-for-metabot-query metabot-id card-type card-id)))

(mu/defn prompt-count-for-metabot :- ms/IntGreaterThanOrEqualToZero
  "The number of MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (t2/count :model/MetabotPrompt :metabot_id metabot-id))

(mu/defn insert-prompts! :- :int
  "Insert the MetabotPrompt `rows`."
  [rows :- [:sequential [:map {:closed true}
                         [:id {:optional true} :any]
                         [:model {:optional true} :any]
                         [:card_id {:optional true} :any]
                         [:entity_id {:optional true} :any]
                         [:prompt {:optional true} :any]
                         [:created_at {:optional true} :any]
                         [:updated_at {:optional true} :any]
                         [:metabot_id {:optional true} :any]]]]
  (t2/insert! :model/MetabotPrompt rows))

(mu/defn delete-metabot-prompt! :- :int
  "Delete the MetabotPrompt with `prompt-id` belonging to the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt
   prompt-id :- ms/PositiveInt]
  (t2/delete! :model/MetabotPrompt {:where [:and
                                            [:= :id prompt-id]
                                            [:= :metabot_id metabot-id]]}))

(mu/defn delete-prompts-for-metabot! :- :int
  "Delete the MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (t2/delete! :model/MetabotPrompt {:where [:= :metabot_id metabot-id]}))

;;; ----------------------------------------------- Conversations -----------------------------------------------

(mu/defn conversation :- [:maybe (ms/InstanceOf :model/MetabotConversation)]
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(mu/defn conversation-id-and-user-id :- [:maybe (ms/InstanceOf :model/MetabotConversation)]
  "The ID and originator of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one [:model/MetabotConversation :id :user_id] :id conversation-id))

(mu/defn conversation-title :- [:maybe :string]
  "The title of the MetabotConversation with `conversation-id`."
  [conversation-id :- :string]
  (t2/select-one-fn :title :model/MetabotConversation :id conversation-id))

(mu/defn lock-conversation :- [:maybe (ms/InstanceOf :model/MetabotConversation)]
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

(mu/defn conversations-page :- [:sequential (ms/InstanceOf :model/MetabotConversation)]
  "A page of up to `limit` (offset by `offset`) MetabotConversations visible in the history of the User with
  `user-id`, most-recent-activity first, optionally narrowed to the last live message's `profile-id`."
  [user-id :- ms/PositiveInt
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

(mu/defn conversation-count :- ms/IntGreaterThanOrEqualToZero
  "The number of MetabotConversations visible in the history of the User with `user-id`, optionally narrowed to the
  last live message's `profile-id`."
  [user-id :- ms/PositiveInt
   profile-id :- [:maybe :string]]
  (:count (t2/query-one {:select [[[:count :*] :count]]
                         :from   [[:metabot_conversation :c]]
                         :where  (conversations-list-where user-id profile-id)})))

(mu/defn titleless-conversation-ids :- [:maybe [:sequential :string]]
  "Up to `limit` IDs of the MetabotConversations without a title, whose ID is greater than `after-id` (or every one,
  when `after-id` is nil), in ID order."
  [after-id :- [:maybe :string]
   limit :- ms/PositiveInt]
  (t2/select-fn-vec :id :model/MetabotConversation
                    {:where    [:and [:= :title nil] (when after-id [:> :id after-id])]
                     :order-by [[:id :asc]]
                     :limit    limit}))

(mu/defn insert-conversation! :- :int
  "Insert `conversation`."
  [conversation :- [:map {:closed true}
                    [:id {:optional true} :any]
                    [:created_at {:optional true} :any]
                    [:user_id {:optional true} :any]
                    [:title {:optional true} :any]
                    [:ip_address {:optional true} :any]
                    [:slack_team_id {:optional true} :any]
                    [:slack_channel_id {:optional true} :any]
                    [:slack_thread_ts {:optional true} :any]
                    [:embedding_hostname {:optional true} :any]
                    [:embedding_path {:optional true} :any]
                    [:user_agent {:optional true} :any]
                    [:sanitized_user_agent {:optional true} :any]
                    [:forked_from_conversation_id {:optional true} :any]]]
  (t2/insert! :model/MetabotConversation conversation))

(mu/defn upsert-conversation! :- :string
  "Insert or update the MetabotConversation with `conversation-id`. `update-fn` receives the existing row (or nil on
  insert) and must return the fields to write."
  [conversation-id :- :string
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotConversation {:id conversation-id} update-fn))

(mu/defn set-conversation-title-if-missing! :- :int
  "Set the title of the MetabotConversation with `conversation-id` if it has none."
  [conversation-id :- :string
   title :- :string]
  (t2/update! :model/MetabotConversation {:id conversation-id, :title nil} {:title title}))

(mu/defn delete-conversations-created-before! :- :int
  "Delete the MetabotConversations created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/MetabotConversation {:where [:< :created_at cutoff]}))

;;; -------------------------------------------------- Messages --------------------------------------------------

(mu/defn participant? :- :boolean
  "Whether the User with `user-id` has sent a message in the MetabotConversation with `conversation-id`."
  [conversation-id :- :string
   user-id :- ms/PositiveInt]
  (t2/exists? :model/MetabotMessage :conversation_id conversation-id :user_id user-id))

(mu/defn message-by-external-id :- [:maybe (ms/InstanceOf :model/MetabotMessage)]
  "The ID and conversation of the MetabotMessage with `external-id`, or nil."
  [external-id :- :string]
  (t2/select-one [:model/MetabotMessage :id :conversation_id] :external_id external-id))

(mu/defn live-messages :- [:sequential (ms/InstanceOf :model/MetabotMessage)]
  "The non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id :- :string]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(mu/defn opening-messages :- [:sequential (ms/InstanceOf :model/MetabotMessage)]
  "The first `limit` non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id :- :string
   limit :- ms/PositiveInt]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]
              :limit    limit}))

(mu/defn leaf-assistant-message :- [:maybe (ms/InstanceOf :model/MetabotMessage)]
  "The most recent non-deleted assistant MetabotMessage of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotMessage
                 {:where    [:and
                             [:= :conversation_id conversation-id]
                             [:= :deleted_at nil]
                             [:= :role "assistant"]]
                  :order-by [[:created_at :desc] [:id :desc]]}))

(def ^:private MetabotMessageRow
  "A whole-entity `metabot_message` row for insert/update."
  [:map {:closed true}
   [:id {:optional true} :any]
   [:created_at {:optional true} :any]
   [:profile_id {:optional true} :any]
   [:role {:optional true} :any]
   [:data {:optional true} :any]
   [:usage {:optional true} :any]
   [:total_tokens {:optional true} :any]
   [:conversation_id {:optional true} :any]
   [:slack_msg_id {:optional true} :any]
   [:channel_id {:optional true} :any]
   [:deleted_at {:optional true} :any]
   [:deleted_by_user_id {:optional true} :any]
   [:user_id {:optional true} :any]
   [:ai_proxied {:optional true} :any]
   [:external_id {:optional true} :any]
   [:finished {:optional true} :any]
   [:error {:optional true} :any]
   [:data_version {:optional true} :any]
   [:state {:optional true} :any]
   [:forked_from_message_id {:optional true} :any]])

(mu/defn insert-message-returning-pk! :- ms/PositiveInt
  "Insert `message` and return its ID."
  [message :- MetabotMessageRow]
  (t2/insert-returning-pk! :model/MetabotMessage message))

(mu/defn insert-messages! :- :int
  "Insert one MetabotMessage map or a sequence of them."
  [messages :- [:or MetabotMessageRow [:sequential MetabotMessageRow]]]
  (t2/insert! :model/MetabotMessage messages))

(mu/defn update-message! :- :int
  "Apply `changes` to the MetabotMessage with `message-id`."
  [message-id :- ms/PositiveInt
   changes :- MetabotMessageRow]
  (t2/update! :model/MetabotMessage message-id changes))

(mu/defn soft-delete-messages-where! :- :int
  "Soft-delete the MetabotMessages matching the Toucan `conditions` on behalf of `deleted-by-user-id`, returning the
  number of rows updated."
  [conditions :- :map
   deleted-by-user-id :- ms/PositiveInt]
  (t2/update! :model/MetabotMessage conditions {:deleted_at         [:now]
                                                :deleted_by_user_id deleted-by-user-id}))

(mu/defn insert-used-tables! :- :int
  "Insert the MetabotUsedTable `rows`."
  [rows :- [:sequential [:map {:closed true}
                         [:id {:optional true} :any]
                         [:message_id {:optional true} :any]
                         [:table_id {:optional true} :any]
                         [:created_at {:optional true} :any]]]]
  (t2/insert! :model/MetabotUsedTable rows))

;;; --------------------------------------------------- Feedback ---------------------------------------------------

(mu/defn upsert-feedback! :- ms/PositiveInt
  "Insert or update the MetabotFeedback row for the MetabotMessage with `message-id` and the User with
  `submitter-user-id`. `update-fn` receives the existing row (or nil on insert) and must return the fields to
  write."
  [message-id :- ms/PositiveInt
   submitter-user-id :- ms/PositiveInt
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotFeedback
                         {:message_id message-id :user_id submitter-user-id}
                         update-fn))

(mu/defn upsert-source-feedback! :- ms/PositiveInt
  "Insert or update the MetabotSourceFeedback row for the MetabotMessage with `message-id`, the User with
  `submitter-user-id`, and the source with `source-id`/`source-type`. `update-fn` receives the existing row (or nil
  on insert) and must return the fields to write."
  [message-id :- ms/PositiveInt
   submitter-user-id :- ms/PositiveInt
   source-id :- ms/PositiveInt
   source-type :- [:enum "table" "card" "model"]
   update-fn :- fn?]
  (mdb/update-or-insert! :model/MetabotSourceFeedback
                         {:message_id  message-id
                          :user_id     submitter-user-id
                          :source_id   source-id
                          :source_type source-type}
                         update-fn))

;;; ------------------------------------------------ Databases ------------------------------------------------

(mu/defn database-summary :- [:maybe (ms/InstanceOf :model/Database)]
  "The ID, name, description, and engine of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/select-one [:model/Database :id :name :description :engine] database-id))

(mu/defn database-with-columns :- [:maybe (ms/InstanceOf :model/Database)]
  "The `columns` of the Database with `database-id`."
  [columns :- [:sequential :keyword]
   database-id :- ms/PositiveInt]
  (t2/select-one columns database-id))

(mu/defn database-exists? :- :boolean
  "Whether a Database with `database-id` exists."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Database :id database-id))

(mu/defn database-ids-by-name :- [:maybe [:sequential ms/PositiveInt]]
  "The IDs of the Databases named `database-name`."
  [database-name :- :string]
  (t2/select-pks-vec :model/Database :name database-name))

(mu/defn database-engines-and-names :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Database)]
  "A map of ID to the engine and name of the Databases with `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/Database :id :engine :name] :id [:in database-ids]))

(mu/defn destination-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the routing destination Databases among `database-ids`."
  [database-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil]))

(mu/defn non-audit-databases :- [:sequential (ms/InstanceOf :model/Database)]
  "The ID, name, engine, description, and audit flag of every non-audit, non-destination Database, ordered by name."
  []
  (t2/select [:model/Database :id :name :engine :description :is_audit]
             :is_audit false
             :router_database_id nil
             {:order-by [[:%lower.name :asc]]}))

;;; ------------------------------------------------- Tables -------------------------------------------------

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn active-table-with-columns :- [:maybe (ms/InstanceOf :model/Table)]
  "The `columns` of the active Table with `table-id`, or nil."
  [columns :- [:sequential :keyword]
   table-id :- ms/PositiveInt]
  (t2/select-one columns :id table-id :active true))

(mu/defn table-database-id :- [:maybe ms/PositiveInt]
  "The Database ID of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(mu/defn tables-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Table)]
  "A map of ID to Table for `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :id identity :model/Table :id [:in table-ids]))

(mu/defn table-summaries :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, names, schema, Database ID, and description of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description] :id [:in table-ids]))

(mu/defn table-schema-rows :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, name, schema, and Database ID of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :name :schema :db_id] :id [:in table-ids]))

(mu/defn table-curation-rows :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, published flag, data layer, and data authority of the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :is_published :data_layer :data_authority] :id [:in table-ids]))

(mu/defn visible-table-summaries :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id`."
  [database-id :- ms/PositiveInt
   table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil))

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

(mu/defn visible-table-summaries-for-current-user :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id` that are visible to the current user for querying."
  [database-id :- ms/PositiveInt
   table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil
             (current-user-visible-table-clause)))

(def ^:private max-visible-tables-to-consider
  "Cap on the number of visible Tables fetched for fuzzy table-name matching."
  10000)

(mu/defn visible-tables-excluding
  "Reducible ID, name, schema, and description of up to [[max-visible-tables-to-consider]] active, unhidden Tables in
  the Database with `database-id` that are visible to the current user for querying, excluding `excluded-table-ids`."
  [database-id :- ms/PositiveInt
   excluded-table-ids :- [:seqable ms/PositiveInt]]
  (t2/reducible-select [:model/Table :id :name :schema :description]
                       :db_id database-id
                       :active true
                       :visibility_type nil
                       (cond-> (assoc (current-user-visible-table-clause) :limit max-visible-tables-to-consider)
                         (seq excluded-table-ids)
                         (update :where (fn [where-clause]
                                          (if where-clause
                                            [:and where-clause [:not-in :id excluded-table-ids]]
                                            [:not-in :id excluded-table-ids]))))))

(mu/defn most-viewed-tables-visible-to-current-user :- [:sequential (ms/InstanceOf :model/Table)]
  "The ID, Database ID, name, schema, and description of up to `limit` active, unhidden Tables in the Database with
  `database-id` (which callers may pass as an invalid/nonexistent id to get no results back) that are visible to the
  current user for querying, most viewed first."
  [database-id :- :int
   limit :- ms/PositiveInt]
  (t2/select [:model/Table :id :db_id :name :schema :description]
             :db_id database-id
             :active true
             :visibility_type nil
             (assoc (current-user-visible-table-clause) :order-by [[:view_count :desc]] :limit limit)))

(mu/defn table-names :- [:sequential (ms/InstanceOf :model/Table)]
  "Up to `limit` IDs, names, and schemas of the active, unhidden Tables in the Database with `database-id`."
  [database-id :- ms/PositiveInt
   limit :- ms/PositiveInt]
  (t2/select [:model/Table :id :name :schema]
             :db_id database-id
             :active true
             :visibility_type nil
             {:limit limit}))

(mu/defn active-tables-for-database :- [:sequential (ms/InstanceOf :model/Table)]
  "The presentable columns of the active Tables in the Database with `database-id`, ordered by schema and name."
  [database-id :- ms/PositiveInt]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :active true
             {:order-by [[:%lower.schema :asc] [:%lower.name :asc]]}))

(mu/defn active-tables-in-schema :- [:sequential (ms/InstanceOf :model/Table)]
  "The presentable columns of the active Tables in `schema` of the Database with `database-id`, ordered by name."
  [database-id :- ms/PositiveInt
   schema :- [:maybe :string]]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:%lower.name :asc]]}))

(mu/defn active-schemas-for-database :- [:sequential [:map {:closed true} [:schema [:maybe :string]]]]
  "The distinct `:schema` rows of the active Tables in the Database with `database-id`, ordered by schema."
  [database-id :- ms/PositiveInt]
  (t2/query {:select-distinct [:schema]
             :from            [:metabase_table]
             :where           [:and [:= :db_id database-id] [:= :active true]]
             :order-by        [[:schema :asc]]}))

(def ^:private quoted-identifier-chars
  "Characters that quote a SQL identifier, making its match against a Table name/schema case-sensitive."
  "\"`")

(defn- quote-stripper
  [quote-char]
  (let [doubled (str quote-char quote-char)
        single  (str quote-char)]
    #(-> (subs % 1 (dec (count %)))
         (str/replace doubled single))))

(def ^:private quote-char->stripper
  (zipmap quoted-identifier-chars (map quote-stripper quoted-identifier-chars)))

(defn- table-part-clause
  "Exact match for a quoted `value`, case-insensitive match for an unquoted `value`. Case-insensitive matching is not
  correct for every database (Oracle/Postgres/H2 all treat unquoted identifiers differently), but MySQL is truly
  case-insensitive, so this caters to the lowest common denominator; identifiers differing only by case are already
  an anti-pattern, so this leniency is unlikely to cause issues in practice."
  [field value]
  (if-let [strip (quote-char->stripper (first value))]
    [:= field (strip value)]
    [:= [:lower field] (u/lower-case-en value)]))

(defn- table-match-clause
  [{:keys [schema table]}]
  (if-not schema
    (table-part-clause :t.name table)
    [:and
     (table-part-clause :t.name table)
     (table-part-clause :t.schema schema)]))

(mu/defn query-table-reference :- [:maybe (ms/InstanceOf :model/QueryTable)]
  "The first Table ID, name, and schema in the Database with `db-id` matching `table` (and `schema`, if given), as a
  query table reference. Matching is case-insensitive unless `table`/`schema` are quoted with `\"` or `` ` ``."
  [db-id :- ms/PositiveInt
   schema :- [:maybe :string]
   table :- :string]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                  :from   [[(t2/table-name :model/Table) :t]]
                  :where  [:and
                           [:= :t.db_id db-id]
                           (table-match-clause {:schema schema :table table})]}))

(mu/defn query-table-references :- [:sequential (ms/InstanceOf :model/QueryTable)]
  "The Table IDs, names, and schemas in the Database with `db-id` matching any of `tables` (each a map of `:schema`
  and `:table`), as query table references. Matching is case-insensitive unless quoted, as in
  [[query-table-reference]]."
  [db-id :- ms/PositiveInt
   tables :- [:sequential [:map {:closed true}
                           [:schema [:maybe :string]]
                           [:table :string]]]]
  (t2/select :model/QueryTable
             {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
              :from   [[(t2/table-name :model/Table) :t]]
              :where  [:and
                       [:= :t.db_id db-id]
                       (into [:or] (map table-match-clause) tables)]}))

;;; ------------------------------------------------- Fields -------------------------------------------------

(mu/defn field :- [:maybe (ms/InstanceOf :model/Field)]
  "The Field with `field-id`, or nil."
  [field-id :- ms/PositiveInt]
  (t2/select-one :model/Field :id field-id))

(mu/defn field-fingerprint :- :any
  "The fingerprint of the Field with `field-id`."
  [field-id :- ms/PositiveInt]
  (t2/select-one-fn :fingerprint :model/Field :id field-id))

(mu/defn field-table-ids :- [:map-of ms/PositiveInt ms/PositiveInt]
  "A map of Field ID to Table ID for `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in field-ids]))

;;; -------------------------------------------------- Cards --------------------------------------------------

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-by-entity-id :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Card :entity_id entity-id))

(mu/defn card-of-type :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id` if it is of `type`, or nil."
  [card-id :- ms/PositiveInt
   type :- [:enum :model :metric :question]]
  (t2/select-one :model/Card :id card-id :type type))

(mu/defn card-type-row :- [:maybe (ms/InstanceOf :model/Card)]
  "The ID, type, and schema of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :id :type :card_schema] :id card-id))

(mu/defn metabot-metrics-and-models-query :- :map
  "Honey SQL query selecting the metric and model Cards in scope of the Metabot with `metabot-id` that are visible to
  the current user, ignoring analytics content. If the Metabot has `:use_verified_content` enabled, restricts to
  verified-or-curated content (verified, official-collection, or library-published). `limit`, if given, caps the
  number of rows."
  [metabot-id :- ms/PositiveInt & {:keys [limit]}]
  (let [metabot-instance       (metabot metabot-id)
        metabot-collection-id  (:collection_id metabot-instance)
        use-verified-content?  (:use_verified_content metabot-instance)
        verified?              (premium-features/has-feature? :content-verification)
        official?              (premium-features/has-feature? :official-collections)
        library?               (premium-features/has-feature? :library)
        ;; ids of collections under a Library-type root; their metrics/models are library-published content
        library-coll-ids (when library?
                           (let [roots (root-collections-of-types (mapv name collection.model/library-collection-types))]
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
                            (let [metabot-collection (collection metabot-collection-id)
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

(mu/defn cards-where :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards matching the Honey SQL `query`."
  [query :- :map]
  (t2/select :model/Card query))

(mu/defn card-entity-ids :- [:map-of ms/PositiveInt :string]
  "A map of Card ID to entity ID for `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :entity_id :model/Card :id [:in card-ids]))

(mu/defn card-table-ids :- [:map-of ms/PositiveInt [:maybe ms/PositiveInt]]
  "A map of Card ID to Table ID for `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :table_id :model/Card :id [:in card-ids]))

(mu/defn card-search-rows :- [:sequential (ms/InstanceOf :model/Card)]
  "The searchable columns of the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Card :id :name :description :database_id :collection_id :card_schema :type] :id [:in card-ids]))

(mu/defn unarchived-card-summaries :- [:sequential (ms/InstanceOf :model/Card)]
  "The presentable columns of the unarchived Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :id [:in card-ids]
             :archived false))

(mu/defn cards-in-collection :- [:sequential (ms/InstanceOf :model/Card)]
  "The presentable columns of the unarchived Cards in the Collection with `collection-id`, ordered by name."
  [collection-id :- ms/PositiveInt]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
              :order-by [[:%lower.name :asc]]}))

(mu/defn cards-for-table :- [:sequential (ms/InstanceOf :model/Card)]
  "The presentable columns of the unarchived Cards on the Table with `table-id`, ordered by name."
  [table-id :- ms/PositiveInt]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :table_id table-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn models-for-database :- [:sequential (ms/InstanceOf :model/Card)]
  "The presentable columns of the unarchived model Cards on the Database with `database-id`, ordered by name."
  [database-id :- ms/PositiveInt]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :type :model
             :database_id database-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn saved-cards-for-conversation :- [:sequential (ms/InstanceOf :model/Card)]
  "The ID and chart ID of the unarchived Cards saved from the MetabotConversation with `conversation-id`, in ID order."
  [conversation-id :- :string]
  (t2/select [:model/Card :id :metabot_chart_id]
             :metabot_conversation_id conversation-id
             :archived false
             {:order-by [[:id :asc]]}))

(mu/defn link-card-to-conversation! :- :int
  "Record that the Card with `card-id` was saved from the MetabotConversation with `conversation-id` as `chart-id`."
  [card-id :- ms/PositiveInt
   conversation-id :- :string
   chart-id :- :string]
  (t2/update! (t2/table-name :model/Card) card-id {:metabot_conversation_id conversation-id
                                                   :metabot_chart_id        chart-id}))

;;; ----------------------------------------------- Collections -----------------------------------------------

(mu/defn collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-name :- [:maybe :string]
  "The name of the Collection with `collection-id`."
  [collection-id :- ms/PositiveInt]
  (t2/select-one-fn :name :model/Collection :id collection-id))

(mu/defn collection-descriptions :- [:map-of ms/PositiveInt [:maybe :string]]
  "A map of Collection ID to description for `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn :description :model/Collection :id [:in collection-ids]))

(mu/defn collection-summaries :- [:sequential (ms/InstanceOf :model/Collection)]
  "The ID, name, and authority level of the Collections with `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Collection :id :name :authority_level] :id [:in collection-ids]))

(mu/defn collection-curation-info-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Collection)]
  "A map of ID to the ID, authority level, location, and type of the Collections with `collection-ids`."
  [collection-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/Collection :id :authority_level :location :type] :id [:in collection-ids]))

(mu/defn navigable-collections :- [:sequential (ms/InstanceOf :model/Collection)]
  "The presentable columns of the non-trash Collections in the default namespace, ordered by location and name.
  Restricted to top-level Collections unless `include-nested?`."
  [include-nested? :- :boolean]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id]
             {:where    (cond-> [:and
                                 [:= :archived false]
                                 [:= :namespace nil]
                                 [:or [:= :type nil] [:!= :type "trash"]]]
                          (not include-nested?) (conj [:= :location "/"]))
              :order-by [[:location :asc] [:%lower.name :asc]]}))

(mu/defn unarchived-collections-at-location :- [:sequential (ms/InstanceOf :model/Collection)]
  "The presentable columns of the unarchived Collections directly at `location`, ordered by name."
  [location :- :string]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id]
             :location location
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn root-collections-of-types :- [:sequential (ms/InstanceOf :model/Collection)]
  "The top-level Collections whose type is one of `types`."
  [types :- [:seqable :string]]
  (t2/select :model/Collection :type [:in types] :location "/"))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn dashboard :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/Dashboard dashboard-id))

(mu/defn dashboard-summary :- [:maybe (ms/InstanceOf :model/Dashboard)]
  "The ID, description, name, and Collection ID of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one [:model/Dashboard :id :description :name :collection_id] dashboard-id))

(mu/defn dashboard-name :- [:maybe :string]
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one-fn :name :model/Dashboard :id dashboard-id))

(mu/defn dashboards-in-collection :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The ID, name, description, and Collection ID of the unarchived Dashboards in the Collection with
  `collection-id`, ordered by name."
  [collection-id :- ms/PositiveInt]
  (t2/select [:model/Dashboard :id :name :description :collection_id]
             :collection_id collection-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn dashboard-tabs :- [:sequential (ms/InstanceOf :model/DashboardTab)]
  "The ID and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashcards :- [:sequential (ms/InstanceOf :model/DashboardCard)]
  "The ID, Card, action, tab, and settings of the DashboardCards of the Dashboard with `dashboard-id`, in grid
  order."
  [dashboard-id :- ms/PositiveInt]
  (t2/select [:model/DashboardCard :id :card_id :action_id :dashboard_tab_id :visualization_settings]
             :dashboard_id dashboard-id
             {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn documents-in-collection :- [:sequential (ms/InstanceOf :model/Document)]
  "The ID, name, Collection ID, and exploration of the unarchived, non-exploration Documents in the Collection with
  `collection-id`, ordered by name."
  [collection-id :- ms/PositiveInt]
  (t2/select [:model/Document :id :name :collection_id :exploration_id]
             :collection_id collection-id
             :archived false
             :exploration_id nil
             {:order-by [[:%lower.name :asc]]}))

(mu/defn unarchived-documents :- [:sequential (ms/InstanceOf :model/Document)]
  "The unarchived Documents with `document-ids`."
  [document-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Document :id [:in document-ids] :archived false))

(mu/defn transforms :- [:sequential (ms/InstanceOf :model/Transform)]
  "The Transforms with `transform-ids`."
  [transform-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Transform :id [:in transform-ids]))

(mu/defn transforms-for-source-database :- [:sequential (ms/InstanceOf :model/Transform)]
  "The ID, name, description, source Database, and source of the Transforms reading from the Database with
  `database-id`, ordered by name."
  [database-id :- ms/PositiveInt]
  (t2/select [:model/Transform :id :name :description :source_database_id :source]
             :source_database_id database-id
             {:order-by [[:%lower.name :asc]]}))

(mu/defn verified-item-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `item-ids` of `item-type` whose most recent moderation review is verified."
  [item-ids :- [:seqable ms/PositiveInt]
   item-type :- :string]
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_id   [:in item-ids]
                    :moderated_item_type item-type
                    :most_recent         true
                    :status              "verified"))

(mu/defn latest-review-status-row :- [:maybe (ms/InstanceOf :model/ModerationReview)]
  "The `:status` row of the most recent moderation review of the item with `item-id` of `item-type`, or nil."
  [item-id :- ms/PositiveInt
   item-type :- :string]
  (t2/select-one [:model/ModerationReview :status]
                 :moderated_item_id item-id
                 :moderated_item_type item-type
                 :most_recent true
                 {:order-by [[:id :desc]]}))

(mu/defn glossary-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Glossary entries."
  []
  (t2/count :model/Glossary))

(mu/defn glossary-definitions :- [:map-of :string :string]
  "A map of term to definition for the first `limit` Glossary entries ordered by `order-column` descending."
  [order-column :- :keyword
   limit :- ms/PositiveInt]
  (t2/select-fn->fn :term :definition :model/Glossary
                    {:order-by [[order-column :desc]]
                     :limit    limit}))

(mu/defn user-summary :- [:maybe (ms/InstanceOf :model/User)]
  "The ID, email, and names of the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/select-one [:model/User :id :email :first_name :last_name] user-id))

(mu/defn user-summaries-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/User)]
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn card-collection-ids :- [:sequential (ms/InstanceOf :model/Card)]
  "The ID and Collection ID of the Cards with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Card :id :collection_id] :id [:in ids]))

(mu/defn dashboard-collection-ids :- [:sequential (ms/InstanceOf :model/Dashboard)]
  "The ID and Collection ID of the Dashboards with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Dashboard :id :collection_id] :id [:in ids]))

(mu/defn measure-table-id :- [:maybe ms/PositiveInt]
  "The Table ID of the Measure with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Measure :id id))

(mu/defn segment-table-id :- [:maybe ms/PositiveInt]
  "The Table ID of the Segment with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :table_id :model/Segment :id id))

(mu/defn measure-entity-id :- [:maybe :string]
  "The entity ID of the Measure with `id`."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :entity_id :model/Measure :id id))

(mu/defn segment-entity-id :- [:maybe :string]
  "The entity ID of the Segment with `id`."
  [id :- ms/PositiveInt]
  (t2/select-one-fn :entity_id :model/Segment :id id))

(mu/defn measures :- [:sequential (ms/InstanceOf :model/Measure)]
  "The ID, name, description, Table ID, and entity ID of the Measures with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Measure :id :name :description :table_id :entity_id] :id [:in ids]))

(mu/defn segments :- [:sequential (ms/InstanceOf :model/Segment)]
  "The ID, name, description, Table ID, and entity ID of the Segments with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Segment :id :name :description :table_id :entity_id] :id [:in ids]))
