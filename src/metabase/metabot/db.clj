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
   [toucan2.core :as t2]))

(declare collection metabot-metrics-and-models-query root-collections-of-types)

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

(defn prompts
  "The prompt, model, and Card columns of the MetabotPrompts of the Metabot with `metabot-id` whose Card is within
  scope, optionally restricted to Cards of `card-type` or the Card with `card-id`, ordered randomly if `sample?` else
  by Card name, and limited/offset by `limit`/`offset`."
  [metabot-id card-type card-id sample? limit offset]
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

(defn prompt-count
  "The number of MetabotPrompts of the Metabot with `metabot-id` whose Card is within scope, optionally restricted to
  Cards of `card-type` or the Card with `card-id`."
  [metabot-id card-type card-id]
  (t2/count :model/MetabotPrompt (prompts-for-metabot-query metabot-id card-type card-id)))

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

(defn conversations-page
  "A page of up to `limit` (offset by `offset`) MetabotConversations visible in the history of the User with
  `user-id`, most-recent-activity first, optionally narrowed to the last live message's `profile-id`."
  [user-id profile-id limit offset]
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

(defn conversation-count
  "The number of MetabotConversations visible in the history of the User with `user-id`, optionally narrowed to the
  last live message's `profile-id`."
  [user-id profile-id]
  (:count (t2/query-one {:select [[[:count :*] :count]]
                         :from   [[:metabot_conversation :c]]
                         :where  (conversations-list-where user-id profile-id)})))

(defn titleless-conversation-ids
  "Up to `limit` IDs of the MetabotConversations without a title, whose ID is greater than `after-id` (or every one,
  when `after-id` is nil), in ID order."
  [after-id limit]
  (t2/select-fn-vec :id :model/MetabotConversation
                    {:where    [:and [:= :title nil] (when after-id [:> :id after-id])]
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

(defn visible-table-summaries-for-current-user
  "The ID, name, schema, and description of the active, unhidden Tables among `table-ids` in the Database with
  `database-id` that are visible to the current user for querying."
  [database-id table-ids]
  (t2/select [:model/Table :id :name :schema :description]
             :db_id database-id
             :id [:in table-ids]
             :active true
             :visibility_type nil
             (current-user-visible-table-clause)))

(def ^:private max-visible-tables-to-consider
  "Cap on the number of visible Tables fetched for fuzzy table-name matching."
  10000)

(defn visible-tables-excluding
  "Reducible ID, name, schema, and description of up to [[max-visible-tables-to-consider]] active, unhidden Tables in
  the Database with `database-id` that are visible to the current user for querying, excluding `excluded-table-ids`."
  [database-id excluded-table-ids]
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

(defn most-viewed-tables-visible-to-current-user
  "The ID, Database ID, name, schema, and description of up to `limit` active, unhidden Tables in the Database with
  `database-id` that are visible to the current user for querying, most viewed first."
  [database-id limit]
  (t2/select [:model/Table :id :db_id :name :schema :description]
             :db_id database-id
             :active true
             :visibility_type nil
             (assoc (current-user-visible-table-clause) :order-by [[:view_count :desc]] :limit limit)))

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

(defn query-table-reference
  "The first Table ID, name, and schema in the Database with `db-id` matching `table` (and `schema`, if given), as a
  query table reference. Matching is case-insensitive unless `table`/`schema` are quoted with `\"` or `` ` ``."
  [db-id schema table]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                  :from   [[(t2/table-name :model/Table) :t]]
                  :where  [:and
                           [:= :t.db_id db-id]
                           (table-match-clause {:schema schema :table table})]}))

(defn query-table-references
  "The Table IDs, names, and schemas in the Database with `db-id` matching any of `tables` (each a map of `:schema`
  and `:table`), as query table references. Matching is case-insensitive unless quoted, as in
  [[query-table-reference]]."
  [db-id tables]
  (t2/select :model/QueryTable
             {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
              :from   [[(t2/table-name :model/Table) :t]]
              :where  [:and
                       [:= :t.db_id db-id]
                       (into [:or] (map table-match-clause) tables)]}))

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

(defn metabot-metrics-and-models-query
  "Honey SQL query selecting the metric and model Cards in scope of the Metabot with `metabot-id` that are visible to
  the current user, ignoring analytics content. If the Metabot has `:use_verified_content` enabled, restricts to
  verified-or-curated content (verified, official-collection, or library-published). `limit`, if given, caps the
  number of rows."
  [metabot-id & {:keys [limit]}]
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

(defn navigable-collections
  "The presentable columns of the non-trash Collections in the default namespace, ordered by location and name.
  Restricted to top-level Collections unless `include-nested?`."
  [include-nested?]
  (t2/select [:model/Collection :id :name :location :authority_level :description :personal_owner_id]
             {:where    (cond-> [:and
                                 [:= :archived false]
                                 [:= :namespace nil]
                                 [:or [:= :type nil] [:!= :type "trash"]]]
                          (not include-nested?) (conj [:= :location "/"]))
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

(defn card-collection-ids
  "The ID and Collection ID of the Cards with `ids`."
  [ids]
  (t2/select [:model/Card :id :collection_id] :id [:in ids]))

(defn dashboard-collection-ids
  "The ID and Collection ID of the Dashboards with `ids`."
  [ids]
  (t2/select [:model/Dashboard :id :collection_id] :id [:in ids]))

(defn measure-table-id
  "The Table ID of the Measure with `id`, or nil."
  [id]
  (t2/select-one-fn :table_id :model/Measure :id id))

(defn segment-table-id
  "The Table ID of the Segment with `id`, or nil."
  [id]
  (t2/select-one-fn :table_id :model/Segment :id id))

(defn measure-entity-id
  "The entity ID of the Measure with `id`."
  [id]
  (t2/select-one-fn :entity_id :model/Measure :id id))

(defn segment-entity-id
  "The entity ID of the Segment with `id`."
  [id]
  (t2/select-one-fn :entity_id :model/Segment :id id))

(defn measures
  "The ID, name, description, Table ID, and entity ID of the Measures with `ids`."
  [ids]
  (t2/select [:model/Measure :id :name :description :table_id :entity_id] :id [:in ids]))

(defn segments
  "The ID, name, description, Table ID, and entity ID of the Segments with `ids`."
  [ids]
  (t2/select [:model/Segment :id :name :description :table_id :entity_id] :id [:in ids]))
