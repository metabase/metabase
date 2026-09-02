(ns metabase.queries-rest.db
  "Application database queries for the queries REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(def ^:private order-by-name {:order-by [[:%lower.name :asc]]})

(defn unarchived-cards
  "The unarchived Cards, in case-insensitive name order."
  []
  (t2/select :model/Card, :archived false, order-by-name))

(defn unarchived-cards-by-creator
  "The unarchived Cards created by the User with `creator-id`, in case-insensitive name order."
  [creator-id]
  (t2/select :model/Card, :creator_id creator-id, :archived false, order-by-name))

(defn unarchived-cards-for-database
  "The unarchived Cards of the Database with `database-id`, in case-insensitive name order."
  [database-id]
  (t2/select :model/Card, :database_id database-id, :archived false, order-by-name))

(defn unarchived-cards-for-table
  "The unarchived Cards of the Table with `table-id`, in case-insensitive name order."
  [table-id]
  (t2/select :model/Card, :table_id table-id, :archived false, order-by-name))

(defn archived-cards
  "The archived Cards, in case-insensitive name order."
  []
  (t2/select :model/Card, :archived true, order-by-name))

(defn cards-with-query-like
  "The Cards whose query matches the SQL LIKE `pattern`, in case-insensitive name order."
  [pattern]
  (t2/select :model/Card (merge order-by-name {:where [:like :dataset_query pattern]})))

(defn card-bookmarks-for-user
  "The Card ids bookmarked by the User with `user-id`."
  [user-id]
  (t2/select [:model/CardBookmark :card_id] :user_id user-id))

(defn hydrate-card
  "Hydrate `:card` onto `bookmarks`."
  [bookmarks]
  (t2/hydrate bookmarks :card))

(defn cards-using-model
  "The unarchived Cards of the same Database as the model Card with `model-id` whose query mentions it, in
  case-insensitive name order."
  [model-id]
  (t2/select :model/Card {:select [:c.*]
                          :from [[:report_card :m]]
                          :join [[:report_card :c] [:and
                                                    [:= :c.database_id :m.database_id]
                                                    [:or
                                                     [:like :c.dataset_query (format "%%card__%s%%" model-id)]
                                                     [:like :c.dataset_query (format "%%#%s%%" model-id)]]]]
                          :where [:and [:= :m.id model-id] [:not :c.archived]]
                          :order-by [[[:lower :c.name] :asc]]}))

(defn hydrate-creator-and-collection
  "Hydrate `:creator` and `:collection` onto `cards`."
  [cards]
  (t2/hydrate cards :creator :collection))

(defn public-cards
  "The name, id, public uuid, and schema of the unarchived Cards that are publicly shared."
  []
  (t2/select [:model/Card :name :id :public_uuid :card_schema], :public_uuid [:not= nil], :archived false))

(defn embeddable-cards
  "The name, id, and schema of the unarchived Cards with embedding enabled."
  []
  (t2/select [:model/Card :name :id :card_schema], :enable_embedding true, :archived false))

(defn database-id-via-table
  "The Database id of the Table of the `model` row with `model-id`, or nil."
  [model model-id]
  (t2/select-one-fn :db_id :model/Table {:select [:t.db_id]
                                         :from [[:metabase_table :t]]
                                         :join [[model :m] [:= :t.id :m.table_id]]
                                         :where [:= :m.id model-id]}))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(defn hydrate-card-details
  "Hydrate the creator, permissions, usage, collection, moderation, and parameter details onto `card`."
  [card]
  (t2/hydrate card
              :based_on_upload
              :creator
              :can_write
              :dashboard_count
              [:dashboard :moderation_status]
              :average_query_time
              :last_query_start
              :parameter_usage_count
              :can_restore
              :can_delete
              :can_manage_db
              [:collection :is_personal]
              [:moderation_reviews :moderator_details]
              :param_fields
              :is_remote_synced))

(defn hydrate-persisted-and-can-manage-db
  "Hydrate `:persisted` and `:can_manage_db` onto the model `card`."
  [card]
  (t2/hydrate card :persisted :can_manage_db))

(defn hydrate-in-dashboards
  "Hydrate `:in_dashboards` onto `cards`."
  [cards]
  (t2/hydrate cards :in_dashboards))

(defn hydrate-moderation-reviews-with-moderator
  "Hydrate `:moderation_reviews` with their moderator details onto `card`."
  [card]
  (t2/hydrate card [:moderation_reviews :moderator_details]))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn cards-by-id
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids]
  (t2/select-fn->fn :id identity :model/Card :id [:in card-ids]))

(defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(defn card-public-uuid-columns
  "The public uuid and schema of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :public_uuid :card_schema] :id card-id))

(defn compatible-series-cards
  "The unarchived Cards other than `excluded-card-id` displayed as one of `display-types` also selected by the Honey
  SQL `query`."
  [excluded-card-id display-types query]
  (t2/select :model/Card
             :archived false
             :display [:in display-types]
             :id [:not= excluded-card-id]
             query))

(defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id changes]
  (t2/update! :model/Card card-id changes))

(defn delete-card!
  "Delete the Card with `card-id`."
  [card-id]
  (t2/delete! :model/Card :id card-id))

(defn max-collection-position
  "The `:max_position` of the Cards in the Collection with `collection-id` (nil for the root)."
  [collection-id]
  (t2/select-one [:model/Card [:%max.collection_position :max_position]] :collection_id collection-id))

(defn cards-collection-columns-where
  "The id, Collection, position, query, and schema of the Cards matching the Honey SQL `where` clause."
  [where]
  (t2/select [:model/Card :id :collection_id :collection_position :dataset_query :card_schema] {:where where}))

(defn set-cards-collection-raw!
  "Move the Cards with `card-ids` to the Collection with `collection-id` without running model hooks."
  [card-ids collection-id]
  (t2/update! (t2/table-name :model/Card) {:id [:in card-ids]} {:collection_id collection-id}))

(defn stored-result
  "The StoredResult with `id`, or nil."
  [id]
  (t2/select-one :model/StoredResult :id id))
