(ns metabase.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.models.collection :as collection.model]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(declare collection metabot-metrics-and-models-query root-collections-of-types)

;;; ------------------------------------------------- Metabot -------------------------------------------------

(mu/defn metabot
  "The Metabot with `metabot-id`, or nil."
  [metabot-id :- ms/PositiveInt]
  (t2/select-one :model/Metabot :id metabot-id))

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

;;; --------------------------------------------- Metabot prompts ---------------------------------------------

(mu/defn prompts-for-metabots
  "The MetabotPrompts of the Metabots with `metabot-ids`."
  [metabot-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/MetabotPrompt {:where [:in :metabot_id %]}) metabot-ids))

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
             (h2x/assert-map-or-nil!
              (cond-> (prompts-for-metabot-query metabot-id card-type card-id)
                true   (assoc :order-by (if sample?
                                          (prompt-sample-order-by)
                                          [[:card.name :asc] [:id :asc]]))
                limit  (assoc :limit limit)
                offset (assoc :offset offset)))))

(mu/defn prompt-count
  "The number of MetabotPrompts of the Metabot with `metabot-id` whose Card is within scope, optionally restricted to
  Cards of `card-type` or the Card with `card-id`."
  [metabot-id :- ms/PositiveInt
   card-type :- [:maybe [:enum "metric" "model"]]
   card-id :- [:maybe ::lib.schema.id/card]]
  (t2/count :model/MetabotPrompt (h2x/assert-map-or-nil! (prompts-for-metabot-query metabot-id card-type card-id))))

(mu/defn prompt-count-for-metabot
  "The number of MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id :- ms/PositiveInt]
  (t2/count :model/MetabotPrompt :metabot_id metabot-id))

(mu/defn prompt-ids-for-metabots :- [:sequential ms/PositiveInt]
  "The ids of the MetabotPrompts of the Metabots with `metabot-ids`."
  [metabot-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (mdb/select-batched #(t2/select-pks-vec :model/MetabotPrompt :metabot_id [:in [:auto/param %]]) metabot-ids))

;;; ----------------------------------------------- Conversations -----------------------------------------------

(mu/defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(mu/defn conversation-id-and-user-id
  "The ID and originator of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id :- :string]
  (t2/select-one [:model/MetabotConversation :id :user_id] :id conversation-id))

(mu/defn conversation-title
  "The title of the MetabotConversation with `conversation-id`."
  [conversation-id :- :string]
  (t2/select-one-fn :title :model/MetabotConversation :id conversation-id))

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

(mu/defn insert-upserted-conversation!
  "Insert the MetabotConversation with `conversation-id` and the `columns` an upsert gives it, returning the inserted
  row."
  [conversation-id :- :string
   columns         :- :map]
  (first (t2/insert-returning-instances! :model/MetabotConversation (assoc columns :id conversation-id))))

(mu/defn update-conversation!
  "Apply `changes` to the MetabotConversation with `conversation-id`."
  [conversation-id :- :string
   changes         :- :map]
  (t2/update! :model/MetabotConversation :id conversation-id changes))

(mu/defn titleless-conversation
  "The MetabotConversation with `conversation-id` if it has no title, or nil."
  [conversation-id :- :string]
  (t2/select-one :model/MetabotConversation :id conversation-id :title nil))

(mu/defn conversations-created-before
  "The MetabotConversations created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (t2/select :model/MetabotConversation {:where [:< :created_at cutoff]}))

;;; -------------------------------------------------- Messages --------------------------------------------------

(mu/defn participated-conversation-ids :- [:maybe [:set :string]]
  "The IDs of those of the MetabotConversations with `conversation-ids` the User with `user-id` has sent a message in,
  or nil if none."
  [conversation-ids :- [:sequential :string]
   user-id :- ::lib.schema.id/user]
  (mdb/select-batched-set #(t2/select-fn-set :conversation_id :model/MetabotMessage
                                             :conversation_id [:in %]
                                             :user_id user-id)
                          conversation-ids))

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
   (when-let [{:keys [id user_id slack_thread_ts]} (conversation conversation-id)]
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

(mu/defn insert-messages! :- [:sequential ::metabot.schema/metabot-message]
  "Insert the MetabotMessage `rows`, one statement for each set of columns they give, and return the new instances in
  their order."
  [rows :- [:sequential [:or ::metabot.schema/metabot-message.create (mut/dissoc ::metabot.schema/metabot-message :id)]]]
  (mdb/insert-returning-instances! :model/MetabotMessage rows))

(mu/defn messages-matching
  "The ID and the deleting User of the MetabotMessages matching `conditions`, at least one of which is needed as an
  empty map would match every message, where `:id` matches a single MetabotMessage or, given a collection, any of
  several."
  [conditions :- ::metabot.schema/metabot-message.soft-delete-conditions]
  (let [{:keys [id]} conditions
        select-rows  #(apply t2/select [:model/MetabotMessage :id :deleted_by_user_id] (mapcat identity %))]
    (if (coll? id)
      (mdb/select-batched #(select-rows (assoc conditions :id [:in %])) id)
      (select-rows conditions))))

(mu/defn soft-delete-messages! :- :int
  "Stamp the deletion time on the MetabotMessages with `message-ids`, and `deleted-by-user-id` as their deleting User when
  it is given, returning the number of rows updated."
  [message-ids        :- [:sequential {:min 1} ms/PositiveInt]
   deleted-by-user-id :- [:maybe ::lib.schema.id/user]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/MetabotMessage :id [:in [:auto/param %]]
                                                          (cond-> {:deleted_at [:now]}
                                                            deleted-by-user-id (assoc :deleted_by_user_id deleted-by-user-id))) message-ids))

(mu/defn insert-used-tables!
  "Insert the MetabotUsedTable `rows`."
  [rows :- [:sequential ::metabot.schema/metabot-used-table.create]]
  (t2/insert! :model/MetabotUsedTable rows))

;;; -------------------------------------------------- AI usage --------------------------------------------------

(mu/defn usage-log-ids-created-before :- [:sequential ms/PositiveInt]
  "The ids of the AiUsageLogs created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (vec (t2/select-pks-vec :model/AiUsageLog {:where [:< :created_at [:auto/param cutoff]]})))

;;; --------------------------------------------------- Feedback ---------------------------------------------------

(defn- upsert-row!
  "Insert the `row` of `table` or, when a row with the same values of the unique `key-columns` exists, set its other
  columns to those of `row`, in one statement (`ON CONFLICT` on Postgres, `ON DUPLICATE KEY UPDATE` on MySQL and
  MariaDB, `MERGE ... KEY` on H2), binding the values and taking every identifier from the constants of this
  namespace."
  [table key-columns row]
  (let [columns     (vec (keys row))
        names       (mapv name columns)
        updated     (mapv name (remove (set key-columns) columns))
        placeholder (str/join ", " (repeat (count columns) "?"))
        column-list (str/join ", " names)
        key-list    (str/join ", " (map name key-columns))
        sql         (case (mdb/db-type)
                      :postgres (str "INSERT INTO " (name table) " (" column-list ") VALUES (" placeholder ")"
                                     " ON CONFLICT (" key-list ") DO UPDATE SET "
                                     (str/join ", " (map #(str % " = EXCLUDED." %) updated)))
                      :mysql    (str "INSERT INTO " (name table) " (" column-list ") VALUES (" placeholder ")"
                                     " ON DUPLICATE KEY UPDATE "
                                     (str/join ", " (map #(str % " = VALUES(" % ")") updated)))
                      :h2       (str "MERGE INTO " (name table) " (" column-list ") KEY (" key-list ") VALUES ("
                                     placeholder ")"))]
    (t2/query (into [sql] (map #(if (keyword? %) (name %) %)) (map row columns)))
    nil))

(mu/defn upsert-feedback!
  "Insert the MetabotFeedback of the User with `submitter-user-id` on the MetabotMessage with `message-id`, or update
  its `columns`, in one statement, and return its ID."
  [message-id        :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   columns           :- (mut/dissoc ::metabot.schema/metabot-feedback.update :message_id :user_id)]
  (upsert-row! :metabot_feedback [:message_id :user_id]
               (assoc columns :message_id message-id :user_id submitter-user-id))
  (t2/select-one-pk :model/MetabotFeedback :message_id message-id :user_id submitter-user-id))

(mu/defn upsert-source-feedback!
  "Insert the MetabotSourceFeedback of the User with `submitter-user-id` on the source with `source-id` and
  `source-type` of the MetabotMessage with `message-id`, or update its `columns`, in one statement, and return its ID."
  [message-id        :- ms/PositiveInt
   submitter-user-id :- ::lib.schema.id/user
   source-id         :- ms/PositiveInt
   source-type       :- [:enum "table" "card" "model" "dashboard"]
   columns           :- (mut/select-keys ::metabot.schema/metabot-source-feedback.update [:positive :updated_at])]
  (upsert-row! :metabot_source_feedback [:message_id :user_id :source_id :source_type]
               (assoc columns :message_id message-id :user_id submitter-user-id
                      :source_id source-id :source_type source-type))
  (t2/select-one-pk :model/MetabotSourceFeedback
                    :message_id message-id :user_id submitter-user-id :source_id source-id :source_type source-type))

;;; ------------------------------------------------ Databases ------------------------------------------------

(mu/defn database-summary
  "The ID, name, description, and engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one [:model/Database :id :name :description :engine] :id [:auto/param database-id]))

(mu/defn database-with-columns
  "The `columns` of the Database with `database-id`."
  [columns :- [:sequential :keyword]
   database-id :- ::lib.schema.id/database]
  (t2/select-one columns :id database-id))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn database-ids-by-name
  "The IDs of the Databases named `database-name`."
  [database-name :- :string]
  (t2/select-pks-vec :model/Database :name database-name))

(mu/defn database-engines-and-names
  "A map of ID to the engine and name of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched-map #(t2/select-pk->fn identity [:model/Database :id :engine :name] :id [:in %]) database-ids))

(mu/defn destination-database-ids
  "The IDs of the routing destination Databases among `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (mdb/select-batched-set #(t2/select-fn-set :id :model/Database :id [:in %] :router_database_id [:not= nil])
                          database-ids))

(mu/defn non-audit-databases
  "The ID, name, engine, description, and audit flag of every non-audit, non-stub, non-destination Database, ordered
  by name."
  []
  (t2/select [:model/Database :id :name :engine :description :is_audit]
             :is_audit false
             :is_stub false
             :router_database_id nil
             {:order-by [[:%lower.name :asc]]}))

;;; ------------------------------------------------- Tables -------------------------------------------------

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn active-visible-tables-named
  "The ID, schema, and name of the active, unhidden Tables in the Database with `database-id` whose name is one of
  `table-names`."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential {:min 1} :string]]
  (mdb/select-batched #(t2/select [:model/Table :id :schema :name]
                                  :db_id database-id
                                  :name [:in %]
                                  :active true
                                  :visibility_type nil)
                      table-names))

(mu/defn active-table-with-columns
  "The `columns` of the active Table with `table-id`, or nil."
  [columns :- [:sequential :keyword]
   table-id :- ::lib.schema.id/table]
  (t2/select-one columns :id table-id :active true))

(mu/defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn readable-active-table-database-id
  "The Database ID of the active Table with `table-id`, or nil when there is no such table *or*
  the current user cannot read it.

  Collapsing those two cases is the point. A caller resolving an agent-authored numeric id has
  no metadata provider yet — this lookup is what decides which one to build — so a bare
  existence answer here runs ahead of every permission check, and lets the id argument
  enumerate table ids across databases the caller cannot otherwise see.

  Selects the whole row rather than the two columns this fn returns, so `mi/can-read?` for a Table
  answers for the row as stored."
  [table-id]
  (when-let [table (t2/select-one :model/Table :id table-id :active true)]
    (when (mi/can-read? (t2/hydrate table :can_read))
      (:db_id table))))

(mu/defn tables-by-id
  "A map of ID to Table for `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (mdb/select-batched-map #(t2/select-fn->fn :id identity :model/Table :id [:in %]) table-ids))

(mu/defn table-summaries
  "The ID, names, schema, Database ID, and description of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select [:model/Table :id :name :display_name :schema :db_id :description] :id [:in %]) table-ids))

(mu/defn table-schema-rows
  "Return the ID, name, schema, and database ID of each table in `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select [:model/Table :id :name :schema :db_id] :id [:in %]) table-ids))

(mu/defn table-curation-rows
  "The ID, Database ID, active flag, visibility type, data layer, data authority, and published flag (nil when not set)
  of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched
   #(t2/select [:model/Table :t.id :t.db_id :t.active :t.visibility_type :t.data_layer :t.data_authority :s.is_published]
               {:from      [[(t2/table-name :model/Table) :t]]
                :left-join [[(t2/table-name :model/TableUserSettings) :s] [:= :s.table_id :t.id]]
                :where     [:in :t.id %]})
   table-ids))

(mu/defn visible-table-summaries
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id`."
  [database-id :- ::lib.schema.id/database
   table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select [:model/Table :id :name :schema :description]
                                  :db_id database-id
                                  :id [:in %]
                                  :active true
                                  :visibility_type nil)
                      table-ids))

(defn- current-user-visible-table-clause
  "Honey SQL `{:where …}` restricting Tables to those visible to the current user for querying."
  []
  {:where (perms/visible-tables-filter-clause :id
                                              (api/current-user-info)
                                              {:perms/view-data      :unrestricted
                                               :perms/create-queries :query-builder-and-native}
                                              {:active-only? false, :include-published-via-collection? false})})

(mu/defn visible-table-summaries-for-current-user
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id` that are visible to the current user for querying."
  [database-id :- ::lib.schema.id/database
   table-ids :- [:sequential ::lib.schema.id/table]]
  (let [visible-clause (current-user-visible-table-clause)]
    (mdb/select-batched #(t2/select [:model/Table :id :name :schema :description]
                                    :db_id database-id
                                    :id [:in %]
                                    :active true
                                    :visibility_type nil
                                    visible-clause)
                        table-ids)))

(def ^:private max-visible-tables-to-consider
  "Cap on the number of visible Tables fetched for fuzzy table-name matching."
  10000)

(mu/defn visible-tables-excluding
  "Reducible ID, name, schema, and description of up to [[max-visible-tables-to-consider]] active, unhidden Tables in
  the Database with `database-id` that are visible to the current user for querying, excluding `excluded-table-ids`."
  [database-id :- ::lib.schema.id/database
   excluded-table-ids :- [:sequential ::lib.schema.id/table]]
  (let [select-tables (fn [clause]
                        (t2/reducible-select [:model/Table :id :name :schema :description]
                                             :db_id database-id
                                             :active true
                                             :visibility_type nil
                                             clause))
        clause        (current-user-visible-table-clause)]
    (if (> (count excluded-table-ids) mdb/select-partition-size)
      (let [excluded (set excluded-table-ids)]
        (eduction (remove (comp excluded :id)) (take max-visible-tables-to-consider) (select-tables clause)))
      (select-tables
       (cond-> (assoc clause :limit max-visible-tables-to-consider)
         (seq excluded-table-ids)
         (update :where (fn [where-clause]
                          (if where-clause
                            [:and where-clause [:not-in :id excluded-table-ids]]
                            [:not-in :id excluded-table-ids]))))))))

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
                    :order-by [[:view_count :desc]]
                    :limit    limit)))

(mu/defn table-names
  "Up to `limit` IDs, names, and schemas of the active, unhidden Tables in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   limit :- ms/PositiveInt]
  (t2/select [:model/Table :id :name :schema]
             :db_id database-id
             :active true
             :visibility_type nil
             {:limit limit}))

(mu/defn active-tables-for-database
  "The presentable columns of the active Tables in the Database with `database-id`, ordered by schema and name."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :active true
             {:order-by [[:%lower.schema :asc] [:%lower.name :asc]]}))

(mu/defn active-tables-in-schema
  "The presentable columns of the active Tables in `schema` of the Database with `database-id`, ordered by name."
  [database-id :- ::lib.schema.id/database
   schema :- [:maybe :string]]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:%lower.name :asc]]}))

(mu/defn active-schemas-for-database
  "The distinct `:schema` rows of the active Tables in the Database with `database-id`, ordered by schema."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:select-distinct [:schema]
             :from            [(t2/table-name :model/Table)]
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

(mu/defn query-table-reference
  "The first Table ID, name, and schema in the Database with `db-id` matching `table` (and `schema`, if given), as a
  query table reference. Matching is case-insensitive unless `table`/`schema` are quoted with `\"` or `` ` ``."
  [db-id :- ::lib.schema.id/database
   schema :- [:maybe :string]
   table :- :string]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                  :from      [[(t2/table-name :model/Table) :t]]
                  :where  [:and
                           [:= :t.db_id db-id]
                           (table-match-clause {:schema schema :table table})]}))

(mu/defn query-table-references
  "The Table IDs, names, and schemas in the Database with `db-id` matching any of `tables` (each a map of `:schema`
  and `:table`), as query table references. Matching is case-insensitive unless quoted, as in
  [[query-table-reference]]."
  [db-id :- ::lib.schema.id/database
   tables :- [:sequential [:map {:closed true}
                           [:schema [:maybe :string]]
                           [:table :string]]]]
  (into []
        (distinct)
        (mdb/select-batched #(t2/select :model/QueryTable
                                        {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                                         :from      [[(t2/table-name :model/Table) :t]]
                                         :where  [:and
                                                  [:= :t.db_id db-id]
                                                  (into [:or] (map table-match-clause) %)]})
                            tables)))

;;; ------------------------------------------------- Fields -------------------------------------------------

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn field-fingerprint
  "The fingerprint of the Field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :fingerprint :model/Field :id field-id))

(mu/defn field-table-ids
  "A map of Field ID to Table ID for `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched-map #(t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in %]) field-ids))

;;; -------------------------------------------------- Cards --------------------------------------------------

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn dashboard-questions
  "The Cards among `card-ids` that are saved inside a dashboard, which is their `:dashboard_id`."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %] :dashboard_id [:not= nil]) card-ids))

(mu/defn card-by-entity-id
  "The Card with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Card :entity_id entity-id))

(mu/defn card-of-type
  "The Card with `card-id` if it is of `type`, or nil."
  [card-id :- ::lib.schema.id/card
   type :- [:enum :model :metric :question]]
  (t2/select-one :model/Card :id card-id :type type))

(mu/defn card-types :- [:map-of ::lib.schema.id/card :keyword]
  "The map from each of `card-ids` that is the ID of a Card to its type."
  [card-ids :- [:sequential {:min 1} ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :type :model/Card :id [:in [:auto/param %]]) card-ids))

(mu/defn card-type-row
  "The ID and type of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :id :type] :id card-id))

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
                                               (perms/visible-collections-filter-clause :report_card.collection_id (api/current-user-info) {:root-namespace nil}))]}]
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
  (t2/select :model/Card (h2x/assert-map-or-nil!
                          (-> (metabot-metrics-and-models-query metabot-id limit)
                              (update :order-by (fnil conj []) [:report_card.id])))))

(mu/defn card-entity-ids
  "A map of Card ID to entity ID for `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :entity_id :model/Card :id [:in %]) card-ids))

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
          (mdb/select-batched #(t2/select [(t2/table-name :model/Card) :id :dataset_query] :id [:in %]) card-ids))))

(mu/defn card-source-rows
  "Return the source cards in `card-ids`, with their name and entity ID and the columns needed by `can-read?`."
  [card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (mdb/select-batched #(t2/select (into [:model/Card :name :entity_id] queries/card-read-check-columns) :id [:in %])
                      card-ids))

(mu/defn card-search-rows
  "The searchable columns of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select [:model/Card :id :name :description :database_id :collection_id :type] :id [:in %])
                      card-ids))

(mu/defn cards-with-ids
  "The Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %]) card-ids))

(mu/defn cards-with-entity-ids
  "The Cards with `entity-ids`."
  [entity-ids :- [:sequential :string]]
  (mdb/select-batched #(t2/select :model/Card :entity_id [:in %]) entity-ids))

(mu/defn tables-with-ids
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select :model/Table :id [:in %]) table-ids))

(mu/defn cards-for-read-check
  "The unarchived Cards with `card-ids`, with only the columns `mi/can-read?` needs to check a Card without another
  query."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select (into [:model/Card] queries/card-read-check-columns) :id [:in %] :archived false)
                      card-ids))

(mu/defn unarchived-card-summaries
  "The presentable columns of the unarchived Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select [:model/Card :id :name :type :description :collection_id :database_id :table_id]
                                  :id [:in %]
                                  :archived false)
                      card-ids))

(mu/defn cards-in-collection
  "Return unarchived card summaries in a collection, ordered by name.

  A nil `collection-id` selects the root collection."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select [:model/Card :id :name :type :description :collection_id :database_id :table_id]
             {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
              :order-by [[:%lower.name :asc]]}))

(mu/defn cards-for-table
  "The presentable columns of the unarchived Cards on the Table with `table-id`, ordered by name."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Card :id :name :type :description :collection_id :database_id :table_id]
             :table_id table-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn models-for-database
  "The presentable columns of the unarchived model Cards on the Database with `database-id`, ordered by name."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Card :id :name :type :description :collection_id :database_id :table_id]
             :type :model
             :database_id database-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn saved-cards-for-conversation
  "The ID and chart ID of the unarchived Cards saved from the MetabotConversation with `conversation-id`, in ID order."
  [conversation-id :- :string]
  (t2/select [:model/Card :id :metabot_chart_id]
             :metabot_conversation_id conversation-id
             :archived false
             {:order-by [[:id :asc]]}))

(mu/defn conversation-dashboard-chart-questions :- [:sequential :map]
  "The unarchived dashboard questions of `dashboard-id` that were saved from any of `chart-ids` in the conversation with
  `conversation-id`, oldest first for each chart."
  [conversation-id :- :string
   chart-ids       :- [:sequential :string]
   dashboard-id    :- ::lib.schema.id/dashboard]
  (mdb/select-batched #(t2/select :model/Card
                                  :metabot_conversation_id [:auto/param conversation-id]
                                  :metabot_chart_id        [:in [:auto/param %]]
                                  :dashboard_id            [:auto/param dashboard-id]
                                  :archived                false
                                  {:order-by [[:id :asc]]})
                      chart-ids))

;;; ----------------------------------------------- Collections -----------------------------------------------

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collection-with-ancestors
  "The Collection with `collection-id`, hydrated with the ancestors the current user can read, root first, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (some-> (t2/select-one [:model/Collection
                          :id :name :location :namespace :personal_owner_id :type :archived :archived_directly
                          :authority_level]
                         :id [:auto/param collection-id])
          (t2/hydrate :effective_ancestors)))

(mu/defn collection-name
  "The name of the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one-fn :name :model/Collection :id collection-id))

(mu/defn collection-descriptions
  "A map of Collection ID to description for `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched-map #(t2/select-pk->fn :description :model/Collection :id [:in %]) collection-ids))

(mu/defn collection-summaries
  "The ID, name, and authority level of the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched #(t2/select [:model/Collection :id :name :authority_level] :id [:in %]) collection-ids))

(mu/defn collection-curation-info-by-id
  "A map of ID to the ID, authority level, location, and type of the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (mdb/select-batched-map #(t2/select-pk->fn identity [:model/Collection :id :authority_level :location :type] :id [:in %])
                          collection-ids))

(mu/defn navigable-collections
  "The presentable columns of the non-trash Collections in the default namespace, ordered by location and name.
  Restricted to top-level Collections unless `include-nested?`."
  [include-nested? :- :boolean]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id :type :namespace
              :is_remote_synced]
             {:where    (cond-> [:and
                                 [:= :archived false]
                                 [:= :namespace nil]
                                 [:or [:= :type nil] [:!= :type "trash"]]]
                          (not include-nested?) (conj [:= :location "/"]))
              :order-by [[:location :asc] [:%lower.name :asc]]}))

(mu/defn unarchived-collections-at-location
  "The presentable columns of the unarchived Collections directly at `location`, ordered by name."
  [location :- :string]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id :type :namespace
              :is_remote_synced]
             :location location
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn root-collections-of-types
  "The top-level Collections whose type is one of `types`."
  [types :- [:sequential :string]]
  (t2/select :model/Collection :type [:in types] :location "/"))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id [:auto/param dashboard-id]))

(mu/defn dashboard-summary
  "The ID, description, name, Collection ID, parameters, creator ID, creation time and archived flag of the Dashboard
  with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one [:model/Dashboard :id :description :name :collection_id :parameters :creator_id :created_at
                  :archived]
                 :id [:auto/param dashboard-id]))

(mu/defn dashboard-name
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :name :model/Dashboard :id dashboard-id))

(mu/defn dashboards-in-collection
  "Return unarchived dashboard summaries in a collection, ordered by name.

  A nil `collection-id` selects the root collection."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select [:model/Dashboard :id :name :description :collection_id]
             :collection_id collection-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn dashboard-tabs
  "The ID and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(mu/defn dashcards
  "The ID, Card, action, tab, position, size, filter mappings, and settings of the DashboardCards of the Dashboard
  with `dashboard-id`, in grid order."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select [:model/DashboardCard :id :card_id :action_id :dashboard_tab_id :row :col :size_x :size_y
              :parameter_mappings :visualization_settings]
             :dashboard_id dashboard-id
             {:order-by [[:row :asc] [:col :asc]]}))

(mu/defn documents-in-collection
  "Return unarchived document summaries in a collection, ordered by name.

  Excludes exploration summaries. A nil `collection-id` selects the root collection."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select [:model/Document :id :name :collection_id :exploration_id]
             :collection_id collection-id
             :archived false
             :exploration_id nil
             {:order-by [[:%lower.name :asc]]}))

(mu/defn documents-in-archived-state
  "The Documents with `document-ids` whose archived flag matches `archived?`. The flag is the
  caller's search state, not a constant: an archived search validates its hits against the
  archived set, and hardcoding `false` here drops every archived hit while the caller's total
  still counts it."
  [document-ids :- [:set ms/PositiveInt]
   archived?    :- :boolean]
  (mdb/select-batched #(t2/select :model/Document :id [:in %] :archived (boolean archived?)) document-ids))

(mu/defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids :- [:set ::lib.schema.id/transform]]
  (mdb/select-batched #(t2/select :model/Transform :id [:in %]) transform-ids))

(mu/defn transforms-for-source-database
  "The ID, name, description, source Database, and source of the Transforms reading from the Database with
  `database-id`, ordered by name."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Transform :id :name :description :source_database_id :source]
             :source_database_id database-id
             {:order-by [[:%lower.name :asc]]}))

(mu/defn verified-item-ids
  "The subset of `item-ids` of `item-type` whose most recent moderation review is verified."
  [item-ids :- [:sequential ms/PositiveInt]
   item-type :- :string]
  (mdb/select-batched-set #(t2/select-fn-set :moderated_item_id :model/ModerationReview
                                             :moderated_item_id   [:in %]
                                             :moderated_item_type item-type
                                             :most_recent         true
                                             :status              "verified")
                          item-ids))

(mu/defn latest-review-status-row
  "The `:status` row of the most recent moderation review of the item with `item-id` of `item-type`, or nil."
  [item-id :- ms/PositiveInt
   item-type :- :string]
  (t2/select-one [:model/ModerationReview :status]
                 :moderated_item_id item-id
                 :moderated_item_type item-type
                 :most_recent true
                 {:order-by [[:id :desc]]}))

(mu/defn latest-review-status-rows :- [:sequential [:map {:closed true}
                                                    [:id                ms/PositiveInt]
                                                    [:moderated_item_id ms/PositiveInt]
                                                    [:status            [:maybe :string]]]]
  "The `:moderated_item_id`, `:status` and `:id` rows of the most recent moderation reviews of the items with
  `item-ids` of `item-type`."
  [item-ids :- [:sequential ms/PositiveInt]
   item-type :- :string]
  (mdb/select-batched #(t2/select [:model/ModerationReview :id :moderated_item_id :status]
                                  :moderated_item_id [:in [:auto/param %]]
                                  :moderated_item_type [:auto/param item-type]
                                  :most_recent true)
                      item-ids))

(mu/defn glossary-count
  "The number of Glossary entries."
  []
  (t2/count :model/Glossary))

(mu/defn glossary-definitions
  "A map of term to definition for the first `limit` Glossary entries ordered by `order-column` descending."
  [order-column :- :keyword
   limit :- ms/PositiveInt]
  (t2/select-fn->fn :term :definition :model/Glossary
                    {:order-by [[order-column :desc]]
                     :limit    limit}))

(mu/defn user-summary
  "The ID, email, and names of the User with `user-id`, or nil if `user-id` is nil or matches no User."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (when user-id
    (t2/select-one [:model/User :id :email :first_name :last_name] :id [:auto/param user-id])))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (mdb/select-batched-map #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in %])
                          user-ids))

(mu/defn archived-card-ids
  "The subset of `ids` that are archived Cards."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-set #(t2/select-fn-set :id :model/Card :id [:in %] :archived true) ids))

(mu/defn card-database-ids
  "A map of Card ID to Database ID for the Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  ;; select only the two columns: a full Card row runs its query-dependent after-select hooks
  (into {} (map (juxt :id :database_id)) (mdb/select-batched #(t2/select [:model/Card :id :database_id] :id [:in %]) ids)))

(mu/defn card-curation-rows
  "The ID, Collection ID, archived flag, and Document ID of the Cards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Card :id :collection_id :archived :document_id] :id [:in %]) ids))

(mu/defn database-card-read-rows
  "The ID, Collection ID, and Document ID of the Cards of `database-id` with `ids`: the columns that the `:can_read`
  hydration reads."
  [database-id :- ::lib.schema.id/database
   ids         :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Card :id :collection_id :document_id] :id [:in %] :database_id [:auto/param database-id])
                      ids))

(mu/defn snippet-read-rows
  "The ID and Collection ID of the NativeQuerySnippets with `ids`: the columns that the `:can_read` hydration reads."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/NativeQuerySnippet :id :collection_id] :id [:in %]) ids))

(mu/defn database-table-names
  "The schema and name of each active Table of `database-id` whose name case-insensitively is one of `table-names`,
  whatever its visibility."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential :string]]
  (mdb/select-batched #(t2/select [:model/Table :schema :name]
                                  :db_id [:auto/param database-id]
                                  :active true
                                  {:where [:in [:lower :name] %]})
                      (into #{} (map u/lower-case-en) table-names)))

(mu/defn database-table-names-like
  "The schema and name of each active Table of `database-id` whose name case-insensitively starts with one of
  `prefixes`, whatever its visibility. As in SQL `LIKE`, a `_` or `%` in a prefix matches any character, so the
  result can hold Tables whose names do not start with the prefix."
  [database-id :- ::lib.schema.id/database
   prefixes    :- [:sequential {:min 1} :string]]
  (into []
        (distinct)
        (mdb/select-batched #(t2/select [:model/Table :schema :name]
                                        :db_id [:auto/param database-id]
                                        :active true
                                        {:where (into [:or]
                                                      (map (fn [prefix]
                                                             [:like [:lower :name] [:auto/param (str (u/lower-case-en prefix) "%")]]))
                                                      %)})
                            prefixes)))

(mu/defn dashboard-curation-rows
  "The ID, Collection ID, and archived flag of the Dashboards with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Dashboard :id :collection_id :archived] :id [:in %]) ids))

(mu/defn measure-table-id
  "The Table ID of the Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one-fn :table_id :model/Measure :id id))

(mu/defn segment-table-id
  "The Table ID of the Segment with `id`, or nil."
  [id :- ::lib.schema.id/segment]
  (t2/select-one-fn :table_id :model/Segment :id id))

(mu/defn measure-table-ids :- [:map-of ::lib.schema.id/measure ::lib.schema.id/table]
  "A map of ID to Table ID of the Measures with `ids`."
  [ids :- [:set ::lib.schema.id/measure]]
  (mdb/select-batched-map #(t2/select-pk->fn :table_id :model/Measure :id [:in [:auto/param %]]) ids))

(mu/defn segment-tables :- [:map-of ::lib.schema.id/segment [:map {:closed true}
                                                             [:table_id ::lib.schema.id/table]
                                                             [:db_id ::lib.schema.id/database]]]
  "A map of ID to the Table ID and Database ID of the Segments with `ids` whose Table exists."
  [ids :- [:set ::lib.schema.id/segment]]
  (mdb/select-batched-map #(into {}
                                 (map (juxt :id (fn [row] (select-keys row [:table_id :db_id]))))
                                 (t2/query {:select [:segment.id :segment.table_id :table.db_id]
                                            :from   [[:segment :segment]]
                                            :join   [[:metabase_table :table] [:= :table.id :segment.table_id]]
                                            :where  [:in :segment.id [:auto/param %]]}))
                          ids))

(mu/defn live-measure-table-id
  "The Table ID of the Measure with `id`, or nil when it is missing or in the trash."
  [id :- ::lib.schema.id/measure]
  (t2/select-one-fn :table_id :model/Measure :id id :archived false))

(mu/defn live-segment-table-id
  "The Table ID of the Segment with `id`, or nil when it is missing or in the trash."
  [id :- ::lib.schema.id/segment]
  (t2/select-one-fn :table_id :model/Segment :id id :archived false))

(mu/defn measure-entity-id
  "The entity ID of the Measure with `id`."
  [id :- ::lib.schema.id/measure]
  (t2/select-one-fn :entity_id :model/Measure :id id))

(mu/defn segment-entity-id
  "The entity ID of the Segment with `id`."
  [id :- ::lib.schema.id/segment]
  (t2/select-one-fn :entity_id :model/Segment :id id))

(mu/defn measures
  "The ID, name, description, Table ID, and entity ID of the Measures with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Measure :id :name :description :table_id :entity_id] :id [:in %]) ids))

(mu/defn segments
  "The ID, name, description, Table ID, and entity ID of the Segments with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Segment :id :name :description :table_id :entity_id] :id [:in %]) ids))

(mu/defn measure-entity-ids
  "A map of Measure ID to entity ID for `ids`."
  [ids :- [:sequential ::lib.schema.id/measure]]
  (mdb/select-batched-map #(t2/select-pk->fn :entity_id :model/Measure :id [:in %]) ids))

(mu/defn segment-entity-ids
  "A map of Segment ID to entity ID for `ids`."
  [ids :- [:sequential ::lib.schema.id/segment]]
  (mdb/select-batched-map #(t2/select-pk->fn :entity_id :model/Segment :id [:in %]) ids))

(mu/defn insert-conversation-row!
  "Insert the MetabotConversation `row`, which carries its own id and timestamps, returning the inserted row."
  [row :- ::metabot.schema/metabot-conversation]
  (first (mdb/insert-returning-instances! :model/MetabotConversation [row])))

(mu/defn insert-usage-log-row!
  "Insert the AiUsageLog `row`, timestamps and all."
  [row :- ::metabot.schema/ai-usage-log.update]
  (t2/insert! :model/AiUsageLog row))

(mu/defn usage-log-ids-for-conversations :- [:sequential ms/PositiveInt]
  "The ids of the AiUsageLog rows of the conversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (mdb/select-batched #(t2/select-pks-vec :model/AiUsageLog {:where [:in :conversation_id %]}) conversation-ids))

(mu/defn conversation-ids-created-before :- [:sequential :string]
  "The ids of the MetabotConversations created before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (mapv :id (conversations-created-before cutoff)))
