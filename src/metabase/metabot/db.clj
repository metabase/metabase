(ns metabase.metabot.db
  "Application database queries for the metabot module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods,
  and transactions."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Metabot -------------------------------------------------

(defn metabot
  "The Metabot with `metabot-id`, or nil."
  [metabot-id]
  (t2/select-one :model/Metabot :id metabot-id))

(defn metabot-by-entity-id
  "The Metabot with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Metabot :entity_id entity-id))

(defn metabot-id-by-entity-id
  "The ID of the Metabot with `entity-id`, or nil."
  [entity-id]
  (t2/select-one-pk :model/Metabot :entity_id entity-id))

(defn metabots-by-name
  "Every Metabot, ordered by name."
  []
  (t2/select :model/Metabot {:order-by [[:name :asc]]}))

(defn metabot-exists?
  "Whether a Metabot with `metabot-id` exists."
  [metabot-id]
  (t2/exists? :model/Metabot :id metabot-id))

(defn update-metabot!
  "Apply `changes` to the Metabot with `metabot-id`."
  [metabot-id changes]
  (t2/update! :model/Metabot metabot-id changes))

;;; --------------------------------------------- Metabot prompts ---------------------------------------------

(defn prompts-for-metabots
  "The MetabotPrompts of the Metabots with `metabot-ids`."
  [metabot-ids]
  (t2/select :model/MetabotPrompt {:where [:in :metabot_id metabot-ids]}))

(defn prompts-where
  "The prompt, model, and Card columns of the MetabotPrompts matching the Honey SQL `query`."
  [query]
  (t2/select [:model/MetabotPrompt
              :id
              :prompt
              :model
              [:card_id :model_id]
              [:card.name :model_name]
              :created_at
              :updated_at]
             query))

(defn prompt-count-where
  "The number of MetabotPrompts matching the Honey SQL `query`."
  [query]
  (t2/count :model/MetabotPrompt query))

(defn prompt-count-for-metabot
  "The number of MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id]
  (t2/count :model/MetabotPrompt :metabot_id metabot-id))

(defn insert-prompts!
  "Insert the MetabotPrompt `rows`."
  [rows]
  (t2/insert! :model/MetabotPrompt rows))

(defn delete-metabot-prompt!
  "Delete the MetabotPrompt with `prompt-id` belonging to the Metabot with `metabot-id`."
  [metabot-id prompt-id]
  (t2/delete! :model/MetabotPrompt {:where [:and
                                            [:= :id prompt-id]
                                            [:= :metabot_id metabot-id]]}))

(defn delete-prompts-for-metabot!
  "Delete the MetabotPrompts of the Metabot with `metabot-id`."
  [metabot-id]
  (t2/delete! :model/MetabotPrompt {:where [:= :metabot_id metabot-id]}))

;;; ----------------------------------------------- Conversations -----------------------------------------------

(defn conversation
  "The MetabotConversation with `conversation-id`, or nil."
  [conversation-id]
  (t2/select-one :model/MetabotConversation :id conversation-id))

(defn conversation-id-and-user-id
  "The ID and originator of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id]
  (t2/select-one [:model/MetabotConversation :id :user_id] :id conversation-id))

(defn conversation-title
  "The title of the MetabotConversation with `conversation-id`."
  [conversation-id]
  (t2/select-one-fn :title :model/MetabotConversation :id conversation-id))

(defn lock-conversation
  "The MetabotConversation with `conversation-id`, locked for update."
  [conversation-id]
  (t2/select-one :model/MetabotConversation :id conversation-id {:for :update}))

(defn conversations-page
  "The MetabotConversation rows of the Honey SQL `query`."
  [query]
  (t2/select :model/MetabotConversation query))

(defn conversation-count-where
  "The `:count` row of the MetabotConversations matching the Honey SQL `where`."
  [where]
  (t2/query-one {:select [[[:count :*] :count]]
                 :from   [[:metabot_conversation :c]]
                 :where  where}))

(defn titleless-conversation-ids
  "Up to `limit` IDs of the MetabotConversations without a title, narrowed by the optional Honey SQL `id-clause`,
  in ID order."
  [id-clause limit]
  (t2/select-fn-vec :id :model/MetabotConversation
                    {:where    [:and [:= :title nil] id-clause]
                     :order-by [[:id :asc]]
                     :limit    limit}))

(defn insert-conversation!
  "Insert `conversation`."
  [conversation]
  (t2/insert! :model/MetabotConversation conversation))

(defn set-conversation-title-if-missing!
  "Set the title of the MetabotConversation with `conversation-id` if it has none."
  [conversation-id title]
  (t2/update! :model/MetabotConversation {:id conversation-id, :title nil} {:title title}))

(defn delete-conversations-created-before!
  "Delete the MetabotConversations created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/MetabotConversation {:where [:< :created_at cutoff]}))

;;; -------------------------------------------------- Messages --------------------------------------------------

(defn participant?
  "Whether the User with `user-id` has sent a message in the MetabotConversation with `conversation-id`."
  [conversation-id user-id]
  (t2/exists? :model/MetabotMessage :conversation_id conversation-id :user_id user-id))

(defn message-by-external-id
  "The ID and conversation of the MetabotMessage with `external-id`, or nil."
  [external-id]
  (t2/select-one [:model/MetabotMessage :id :conversation_id] :external_id external-id))

(defn live-messages
  "The non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn opening-messages
  "The first `limit` non-deleted MetabotMessages of the MetabotConversation with `conversation-id`, in reader order."
  [conversation-id limit]
  (t2/select :model/MetabotMessage
             :conversation_id conversation-id
             :deleted_at nil
             {:order-by [[:created_at :asc] [:id :asc]]
              :limit    limit}))

(defn leaf-assistant-message
  "The most recent non-deleted assistant MetabotMessage of the MetabotConversation with `conversation-id`, or nil."
  [conversation-id]
  (t2/select-one :model/MetabotMessage
                 {:where    [:and
                             [:= :conversation_id conversation-id]
                             [:= :deleted_at nil]
                             [:= :role "assistant"]]
                  :order-by [[:created_at :desc] [:id :desc]]}))

(defn insert-message-returning-pk!
  "Insert `message` and return its ID."
  [message]
  (t2/insert-returning-pk! :model/MetabotMessage message))

(defn insert-messages!
  "Insert one MetabotMessage map or a sequence of them."
  [messages]
  (t2/insert! :model/MetabotMessage messages))

(defn update-message!
  "Apply `changes` to the MetabotMessage with `message-id`."
  [message-id changes]
  (t2/update! :model/MetabotMessage message-id changes))

(defn soft-delete-messages-where!
  "Soft-delete the MetabotMessages matching the Toucan `conditions` on behalf of `deleted-by-user-id`, returning the
  number of rows updated."
  [conditions deleted-by-user-id]
  (t2/update! :model/MetabotMessage conditions {:deleted_at         [:now]
                                                :deleted_by_user_id deleted-by-user-id}))

(defn insert-used-tables!
  "Insert the MetabotUsedTable `rows`."
  [rows]
  (t2/insert! :model/MetabotUsedTable rows))

;;; ------------------------------------------------ Databases ------------------------------------------------

(defn database-summary
  "The ID, name, description, and engine of the Database with `database-id`."
  [database-id]
  (t2/select-one [:model/Database :id :name :description :engine] database-id))

(defn database-with-columns
  "The `columns` of the Database with `database-id`."
  [columns database-id]
  (t2/select-one columns database-id))

(defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id]
  (t2/exists? :model/Database :id database-id))

(defn database-ids-by-name
  "The IDs of the Databases named `database-name`."
  [database-name]
  (t2/select-pks-vec :model/Database :name database-name))

(defn database-engines-and-names
  "A map of ID to the engine and name of the Databases with `database-ids`."
  [database-ids]
  (t2/select-pk->fn identity [:model/Database :id :engine :name] :id [:in database-ids]))

(defn destination-database-ids
  "The IDs of the routing destination Databases among `database-ids`."
  [database-ids]
  (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil]))

(defn non-audit-databases
  "The ID, name, engine, description, and audit flag of every non-audit, non-destination Database, ordered by name."
  []
  (t2/select [:model/Database :id :name :engine :description :is_audit]
             :is_audit false
             :router_database_id nil
             {:order-by [[:%lower.name :asc]]}))

;;; ------------------------------------------------- Tables -------------------------------------------------

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn active-table-with-columns
  "The `columns` of the active Table with `table-id`, or nil."
  [columns table-id]
  (t2/select-one columns :id table-id :active true))

(defn table-database-id
  "The Database ID of the Table with `table-id`."
  [table-id]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn tables-by-id
  "A map of ID to Table for `table-ids`."
  [table-ids]
  (t2/select-fn->fn :id identity :model/Table :id [:in table-ids]))

(defn table-summaries
  "The ID, names, schema, Database ID, and description of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description] :id [:in table-ids]))

(defn table-schema-rows
  "The ID, name, schema, and Database ID of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :name :schema :db_id] :id [:in table-ids]))

(defn table-curation-rows
  "The ID, published flag, data layer, and data authority of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :is_published :data_layer :data_authority] :id [:in table-ids]))

(defn visible-table-summaries
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id`."
  [database-id table-ids]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil))

(defn visible-table-summaries-where
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id` matching the Honey SQL `query`."
  [database-id table-ids query]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil
             query))

(defn visible-tables-reducible
  "Reducible ID, name, schema, and description of the active, unhidden Tables in the Database with `database-id`
  matching the Honey SQL `query`."
  [database-id query]
  (t2/reducible-select [:model/Table :id :name :schema :description]
                       :db_id database-id
                       :active true
                       :visibility_type nil
                       query))

(defn most-viewed-tables-where
  "The ID, Database ID, name, schema, and description of the active, unhidden Tables in the Database with
  `database-id` matching the Honey SQL `query`."
  [database-id query]
  (t2/select [:model/Table :id :db_id :name :schema :description]
             :db_id database-id
             :active true
             :visibility_type nil
             query))

(defn table-names
  "Up to `limit` IDs, names, and schemas of the active, unhidden Tables in the Database with `database-id`."
  [database-id limit]
  (t2/select [:model/Table :id :name :schema]
             :db_id database-id
             :active true
             :visibility_type nil
             {:limit limit}))

(defn active-tables-for-database
  "The presentable columns of the active Tables in the Database with `database-id`, ordered by schema and name."
  [database-id]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :active true
             {:order-by [[:%lower.schema :asc] [:%lower.name :asc]]}))

(defn active-tables-in-schema
  "The presentable columns of the active Tables in `schema` of the Database with `database-id`, ordered by name."
  [database-id schema]
  (t2/select [:model/Table :id :name :display_name :schema :db_id :description]
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:%lower.name :asc]]}))

(defn active-schemas-for-database
  "The distinct `:schema` rows of the active Tables in the Database with `database-id`, ordered by schema."
  [database-id]
  (t2/query {:select-distinct [:schema]
             :from            [:metabase_table]
             :where           [:and [:= :db_id database-id] [:= :active true]]
             :order-by        [[:schema :asc]]}))

(defn query-table-reference-where
  "The first Table ID, name, and schema matching the Honey SQL `where`, as a query table reference."
  [where]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                  :from   [[(t2/table-name :model/Table) :t]]
                  :where  where}))

(defn query-table-references-where
  "The Table IDs, names, and schemas matching the Honey SQL `where`, as query table references."
  [where]
  (t2/select :model/QueryTable
             {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
              :from   [[(t2/table-name :model/Table) :t]]
              :where  where}))

(defn hydrate-fields
  "Hydrate `:fields` onto `tables`."
  [tables]
  (t2/hydrate tables :fields))

;;; ------------------------------------------------- Fields -------------------------------------------------

(defn field
  "The Field with `field-id`, or nil."
  [field-id]
  (t2/select-one :model/Field :id field-id))

(defn field-fingerprint
  "The fingerprint of the Field with `field-id`."
  [field-id]
  (t2/select-one-fn :fingerprint :model/Field :id field-id))

(defn field-table-ids
  "A map of Field ID to Table ID for `field-ids`."
  [field-ids]
  (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in field-ids]))

;;; -------------------------------------------------- Cards --------------------------------------------------

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-by-entity-id
  "The Card with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Card :entity_id entity-id))

(defn card-of-type
  "The Card with `card-id` if it is of `type`, or nil."
  [card-id type]
  (t2/select-one :model/Card :id card-id :type type))

(defn card-type-row
  "The ID, type, and schema of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :id :type :card_schema] :id card-id))

(defn cards-where
  "The Cards matching the Honey SQL `query`."
  [query]
  (t2/select :model/Card query))

(defn card-entity-ids
  "A map of Card ID to entity ID for `card-ids`."
  [card-ids]
  (t2/select-pk->fn :entity_id :model/Card :id [:in card-ids]))

(defn card-table-ids
  "A map of Card ID to Table ID for `card-ids`."
  [card-ids]
  (t2/select-pk->fn :table_id :model/Card :id [:in card-ids]))

(defn card-search-rows
  "The searchable columns of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :name :description :database_id :collection_id :card_schema :type] :id [:in card-ids]))

(defn unarchived-card-summaries
  "The presentable columns of the unarchived Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :id [:in card-ids]
             :archived false))

(defn cards-in-collection
  "The presentable columns of the unarchived Cards in the Collection with `collection-id`, ordered by name."
  [collection-id]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
              :order-by [[:%lower.name :asc]]}))

(defn cards-for-table
  "The presentable columns of the unarchived Cards on the Table with `table-id`, ordered by name."
  [table-id]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :table_id table-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(defn models-for-database
  "The presentable columns of the unarchived model Cards on the Database with `database-id`, ordered by name."
  [database-id]
  (t2/select [:model/Card :id :name :type :description :card_schema :collection_id :database_id :table_id]
             :type :model
             :database_id database-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(defn saved-cards-for-conversation
  "The ID and chart ID of the unarchived Cards saved from the MetabotConversation with `conversation-id`, in ID order."
  [conversation-id]
  (t2/select [:model/Card :id :metabot_chart_id]
             :metabot_conversation_id conversation-id
             :archived false
             {:order-by [[:id :asc]]}))

(defn link-card-to-conversation!
  "Record that the Card with `card-id` was saved from the MetabotConversation with `conversation-id` as `chart-id`."
  [card-id conversation-id chart-id]
  (t2/update! (t2/table-name :model/Card) card-id {:metabot_conversation_id conversation-id
                                                   :metabot_chart_id        chart-id}))

(defn hydrate-average-query-time
  "Hydrate `:average_query_time` onto `card`."
  [card]
  (t2/hydrate card :average_query_time))

;;; ----------------------------------------------- Collections -----------------------------------------------

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn collection-name
  "The name of the Collection with `collection-id`."
  [collection-id]
  (t2/select-one-fn :name :model/Collection :id collection-id))

(defn collection-descriptions
  "A map of Collection ID to description for `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn :description :model/Collection :id [:in collection-ids]))

(defn collection-summaries
  "The ID, name, and authority level of the Collections with `collection-ids`."
  [collection-ids]
  (t2/select [:model/Collection :id :name :authority_level] :id [:in collection-ids]))

(defn collection-curation-info-by-id
  "A map of ID to the ID, authority level, location, and type of the Collections with `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn identity [:model/Collection :id :authority_level :location :type] :id [:in collection-ids]))

(defn collections-where
  "The presentable columns of the Collections matching the Honey SQL `where`, ordered by location and name."
  [where]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id]
             {:where    where
              :order-by [[:location :asc] [:%lower.name :asc]]}))

(defn unarchived-collections-at-location
  "The presentable columns of the unarchived Collections directly at `location`, ordered by name."
  [location]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id]
             :location location
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(defn root-collections-of-types
  "The top-level Collections whose type is one of `types`."
  [types]
  (t2/select :model/Collection :type [:in types] :location "/"))

;;; ---------------------------------------------- Other models ----------------------------------------------

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard dashboard-id))

(defn dashboard-summary
  "The ID, description, name, and Collection ID of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one [:model/Dashboard :id :description :name :collection_id] dashboard-id))

(defn dashboard-name
  "The name of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-one-fn :name :model/Dashboard :id dashboard-id))

(defn dashboards-in-collection
  "The ID, name, description, and Collection ID of the unarchived Dashboards in the Collection with
  `collection-id`, ordered by name."
  [collection-id]
  (t2/select [:model/Dashboard :id :name :description :collection_id]
             :collection_id collection-id
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(defn dashboard-tabs
  "The ID and name of the DashboardTabs of the Dashboard with `dashboard-id`, in position order."
  [dashboard-id]
  (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id {:order-by [[:position :asc] [:id :asc]]}))

(defn dashcards
  "The ID, Card, action, tab, and settings of the DashboardCards of the Dashboard with `dashboard-id`, in grid
  order."
  [dashboard-id]
  (t2/select [:model/DashboardCard :id :card_id :action_id :dashboard_tab_id :visualization_settings]
             :dashboard_id dashboard-id
             {:order-by [[:row :asc] [:col :asc]]}))

(defn hydrate-dashcards-with-cards
  "Hydrate `:dashcards` with their `:card` onto `dashboard`."
  [dashboard]
  (t2/hydrate dashboard [:dashcards :card]))

(defn documents-in-collection
  "The ID, name, Collection ID, and exploration of the unarchived, non-exploration Documents in the Collection with
  `collection-id`, ordered by name."
  [collection-id]
  (t2/select [:model/Document :id :name :collection_id :exploration_id]
             :collection_id collection-id
             :archived false
             :exploration_id nil
             {:order-by [[:%lower.name :asc]]}))

(defn unarchived-documents
  "The unarchived Documents with `document-ids`."
  [document-ids]
  (t2/select :model/Document :id [:in document-ids] :archived false))

(defn transforms
  "The Transforms with `transform-ids`."
  [transform-ids]
  (t2/select :model/Transform :id [:in transform-ids]))

(defn transforms-for-source-database
  "The ID, name, description, source Database, and source of the Transforms reading from the Database with
  `database-id`, ordered by name."
  [database-id]
  (t2/select [:model/Transform :id :name :description :source_database_id :source]
             :source_database_id database-id
             {:order-by [[:%lower.name :asc]]}))

(defn verified-item-ids
  "The subset of `item-ids` of `item-type` whose most recent moderation review is verified."
  [item-ids item-type]
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_id   [:in item-ids]
                    :moderated_item_type item-type
                    :most_recent         true
                    :status              "verified"))

(defn latest-review-status-row
  "The `:status` row of the most recent moderation review of the item with `item-id` of `item-type`, or nil."
  [item-id item-type]
  (t2/select-one [:model/ModerationReview :status]
                 :moderated_item_id item-id
                 :moderated_item_type item-type
                 :most_recent true
                 {:order-by [[:id :desc]]}))

(defn glossary-count
  "The number of Glossary entries."
  []
  (t2/count :model/Glossary))

(defn glossary-definitions
  "A map of term to definition for the first `limit` Glossary entries ordered by `order-column` descending."
  [order-column limit]
  (t2/select-fn->fn :term :definition :model/Glossary
                    {:order-by [[order-column :desc]]
                     :limit    limit}))

(defn user-summary
  "The ID, email, and names of the User with `user-id`."
  [user-id]
  (t2/select-one [:model/User :id :email :first_name :last_name] user-id))

(defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(defn collection-id-rows
  "The ID and Collection ID of the instances of `model` with `ids`."
  [model ids]
  (t2/select [model :id :collection_id] :id [:in ids]))

(defn table-id-row
  "The ID and Table ID of the instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one [model :id :table_id] :id id))

(defn table-id-of
  "The Table ID of the instance of `model` with `id`."
  [model id]
  (t2/select-one-fn :table_id model :id id))

(defn entity-id-of
  "The entity ID of the instance of `model` with `id`."
  [model id]
  (t2/select-one-fn :entity_id model :id id))

(defn measure-or-segment-rows
  "The ID, name, description, Table ID, and entity ID of the instances of `model` with `ids`."
  [model ids]
  (t2/select [model :id :name :description :table_id :entity_id] :id [:in ids]))
