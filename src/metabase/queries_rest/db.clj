(ns metabase.queries-rest.db
  "Application database queries for the queries REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [honey.sql.helpers :as sql.helpers]
   [malli.util :as mut]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private order-by-name {:order-by [[:%lower.name :asc]]})

(mu/defn unarchived-cards :- [:sequential ::queries.schema/card]
  "The unarchived Cards, in case-insensitive name order."
  []
  (t2/select :model/Card, :archived false, order-by-name))

(mu/defn unarchived-cards-by-creator :- [:sequential ::queries.schema/card]
  "The unarchived Cards created by the User with `creator-id`, in case-insensitive name order."
  [creator-id :- ::lib.schema.id/user]
  (t2/select :model/Card, :creator_id creator-id, :archived false, order-by-name))

(mu/defn unarchived-cards-for-database :- [:sequential ::queries.schema/card]
  "The unarchived Cards of the Database with `database-id`, in case-insensitive name order."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Card, :database_id database-id, :archived false, order-by-name))

(mu/defn unarchived-cards-for-table :- [:sequential ::queries.schema/card]
  "The unarchived Cards of the Table with `table-id`, in case-insensitive name order."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Card, :table_id table-id, :archived false, order-by-name))

(mu/defn archived-cards :- [:sequential ::queries.schema/card]
  "The archived Cards, in case-insensitive name order."
  []
  (t2/select :model/Card, :archived true, order-by-name))

(mu/defn cards-with-query-like :- [:sequential ::queries.schema/card]
  "The Cards whose query matches the SQL LIKE `pattern`, in case-insensitive name order."
  [pattern :- :string]
  (t2/select :model/Card (merge order-by-name {:where [:like :dataset_query pattern]})))

(def ^:private CardBookmarksForUser
  "Rows returned by [[card-bookmarks-for-user]]."
  (mut/select-keys ::bookmarks.schema/card-bookmark [:card_id]))

(mu/defn card-bookmarks-for-user :- [:sequential CardBookmarksForUser]
  "The Card ids bookmarked by the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select [:model/CardBookmark :card_id] :user_id user-id))

(mu/defn cards-using-model :- [:sequential ::queries.schema/card]
  "The unarchived Cards of the same Database as the model Card with `model-id` whose query mentions it, in
  case-insensitive name order."
  [model-id :- ms/PositiveInt]
  (t2/select :model/Card {:select [:c.*]
                          :from [[:report_card :m]]
                          :join [[:report_card :c] [:and
                                                    [:= :c.database_id :m.database_id]
                                                    [:or
                                                     [:like :c.dataset_query (format "%%card__%s%%" model-id)]
                                                     [:like :c.dataset_query (format "%%#%s%%" model-id)]]]]
                          :where [:and [:= :m.id model-id] [:not :c.archived]]
                          :order-by [[[:lower :c.name] :asc]]}))

(def ^:private PublicCard
  "Rows returned by [[public-cards]]."
  (mut/select-keys ::queries.schema/card [:name :id :public_uuid :card_schema]))

(mu/defn public-cards :- [:sequential PublicCard]
  "The name, id, public uuid, and schema of the unarchived Cards that are publicly shared."
  []
  (t2/select [:model/Card :name :id :public_uuid :card_schema], :public_uuid [:not= nil], :archived false))

(def ^:private EmbeddableCard
  "Rows returned by [[embeddable-cards]]."
  (mut/select-keys ::queries.schema/card [:name :id :card_schema]))

(mu/defn embeddable-cards :- [:sequential EmbeddableCard]
  "The name, id, and schema of the unarchived Cards with embedding enabled."
  []
  (t2/select [:model/Card :name :id :card_schema], :enable_embedding true, :archived false))

(mu/defn segment-database-id :- [:maybe ::lib.schema.id/database]
  "The Database id of the Table of the Segment with `segment-id`, or nil."
  [segment-id :- ::lib.schema.id/segment]
  (t2/select-one-fn :db_id :model/Table {:select [:t.db_id]
                                         :from [[:metabase_table :t]]
                                         :join [[:segment :m] [:= :t.id :m.table_id]]
                                         :where [:= :m.id segment-id]}))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(mu/defn card :- [:maybe ::queries.schema/card]
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards-by-id :- [:map-of ms/PositiveInt ::queries.schema/card]
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-fn->fn :id identity :model/Card :id [:in card-ids]))

(mu/defn card-query :- [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]
  "The query of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(def ^:private CardPublicUuidColumn
  "Rows returned by [[card-public-uuid-columns]]."
  (mut/select-keys ::queries.schema/card [:public_uuid :card_schema]))

(mu/defn card-public-uuid-columns :- [:maybe CardPublicUuidColumn]
  "The public uuid and schema of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :public_uuid :card_schema] :id card-id))

(mu/defn compatible-series-cards :- [:sequential ::queries.schema/card]
  "The unarchived Cards other than `excluded-card-id` displayed as one of `display-types`, newest first, whose id is
  less than `last-cursor` (when given), excluding `exclude-ids`, and whose lower-cased name matches the SQL LIKE
  `name-pattern` (when given). Up to `limit` results (when given)."
  [excluded-card-id :- ::lib.schema.id/card
   display-types :- [:set :keyword]
   last-cursor :- [:maybe ms/PositiveInt]
   exclude-ids :- [:maybe [:sequential ms/PositiveInt]]
   name-pattern :- [:maybe [:or :string vector?]]
   limit :- [:maybe ms/PositiveInt]]
  (t2/select :model/Card
             :archived false
             :display [:in display-types]
             :id [:not= excluded-card-id]
             (cond-> {:order-by [[:id :desc]]}
               last-cursor
               (sql.helpers/where [:< :id last-cursor])

               (seq exclude-ids)
               (sql.helpers/where [:not [:in :id exclude-ids]])

               name-pattern
               (sql.helpers/where [:like :%lower.name name-pattern])

               limit
               (assoc :limit limit))))

(mu/defn dashboard-collection-id :- [:maybe ::lib.schema.id/collection]
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(mu/defn update-card! :- :int
  "Apply `changes` to the Card with `card-id`."
  [card-id :- ::lib.schema.id/card
   changes :- (mut/select-keys ::queries.schema/card.update [:collection_position :collection_id :public_uuid :made_public_by_id])]
  (t2/update! :model/Card card-id changes))

(mu/defn delete-card! :- :int
  "Delete the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/Card :id card-id))

(def ^:private MaxCollectionPosition
  "Rows returned by [[max-collection-position]]."
  (mut/merge ::queries.schema/card
             [:map [:max_position [:maybe :int]]]))

(mu/defn max-collection-position :- [:maybe MaxCollectionPosition]
  "The `:max_position` of the Cards in the Collection with `collection-id` (nil for the root)."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one [:model/Card [:%max.collection_position :max_position]] :collection_id collection-id))

(def ^:private CardsToMoveToCollection
  "Rows returned by [[cards-to-move-to-collection]]."
  (mut/select-keys ::queries.schema/card
                   [:id :collection_id :collection_position :dataset_query :card_schema]))

(mu/defn cards-to-move-to-collection :- [:sequential CardsToMoveToCollection]
  "The id, Collection, position, query, and schema of the Cards among `card-ids` not already in
  `new-collection-id-or-nil`."
  [card-ids :- [:set ::lib.schema.id/card]
   new-collection-id-or-nil :- [:maybe ms/PositiveInt]]
  (t2/select [:model/Card :id :collection_id :collection_position :dataset_query :card_schema]
             {:where [:and [:in :id card-ids]
                      [:or [:not= :collection_id new-collection-id-or-nil]
                       (when new-collection-id-or-nil
                         [:= :collection_id nil])]]}))

(mu/defn set-cards-collection-raw! :- :int
  "Move the Cards with `card-ids` to the Collection with `collection-id` without running model hooks."
  [card-ids :- [:set ::lib.schema.id/card]
   collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/update! (t2/table-name :model/Card) {:id [:in card-ids]} {:collection_id collection-id}))

(mu/defn stored-result :- [:maybe ::queries.schema/stored-result]
  "The StoredResult with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/StoredResult :id id))
