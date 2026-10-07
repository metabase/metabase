(ns metabase.warehouses-rest.db
  "Application database queries for the warehouses REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn active-visible-tables-for-databases
  "The active, visible Tables of the Databases with `database-ids`, in schema then display name order."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Table
             :active          true
             :db_id           [:in database-ids]
             :visibility_type nil
             {:from [(warehouse-schema-overlay/table-query)]
              :order-by [[:%lower.schema :asc]
                         [:%lower.display_name :asc]]}))

(mu/defn active-visible-schemas-for-databases
  "The distinct Database id and schema of the active, visible Tables of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/query {:select-distinct [:db_id :schema]
             :from      [(warehouse-schema-overlay/table-query)]
             :where           [:and
                               [:in :db_id database-ids]
                               [:= :active true]
                               [:= :visibility_type nil]]}))

(mu/defn database-engines
  "The id and engine of every Database."
  []
  (t2/select [:model/Database :id :engine]))

(mu/defn source-query-cards-reducible
  "A reducible of the Cards of `card-type` (also including \"metric\" Cards) in the Databases with `database-ids`
  visible to the current user that can be used as source queries, with their moderation status, in case-insensitive
  name order. `collection-scope` further restricts by collection: `nil` applies no collection restriction, `:root`
  restricts to Cards with no collection, and a collection of ids restricts to Cards in those collections."
  [card-type        :- [:or :keyword :string]
   database-ids     :- [:set ::lib.schema.id/database]
   collection-scope :- [:maybe [:or [:= :root] [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]]
  ;; Rows are pushed through `mi/do-after-select :model/Card` by the caller, so `:dataset_query` and
  ;; `:result_metadata` drag in the rest of [[metabase.queries.card-schema/schema-upgrade-triggers]].
  (t2/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id
                                  :result_metadata :type :source_card_id :card_schema :entity_id
                                  :dimensions :dimension_mappings
                                  [^:allow-subquery {:select   [:status]
                                                     :from     [:moderation_review]
                                                     :where    [:and
                                                                [:= :moderated_item_type "card"]
                                                                [:= :moderated_item_id :report_card.id]
                                                                [:= :most_recent true]]
                                                     :order-by [[:id :desc]]
                                                     :limit    1}
                                   :moderated_status]]
                       :from     [:report_card]
                       :where    [:and
                                  [:not= :result_metadata nil]
                                  [:= :archived false]
                                  [:in :type [(u/qualified-name card-type) "metric"]]
                                  [:in :database_id database-ids]
                                  (cond
                                    (nil? collection-scope)          nil
                                    (= collection-scope :root)       [:= :collection_id nil]
                                    :else                            [:in :collection_id collection-scope])
                                  (collection/visible-collection-filter-clause)]
                       :order-by [[:%lower.name :asc]]}))

(mu/defn databases-where
  "The Databases visible to the user with `user-id` (`is-superuser?`/`is-data-analyst?` further widen visibility), in
  name then engine order. Excludes stub Databases unless `include-stubs?` and the audit Database unless
  `include-analytics?`. Restricted to Databases routed from `router-database-id` when given, otherwise to non-routed
  Databases. When `filter-by-data-access?` is true, further restricted to Databases the user can query, manage, or edit
  the metadata of."
  [user-id                :- ::lib.schema.id/user
   is-superuser?          :- :boolean
   is-data-analyst?       :- :boolean
   filter-by-data-access? :- :boolean
   router-database-id     :- [:maybe ::lib.schema.id/database]
   include-analytics?     :- :boolean
   include-stubs?         :- :boolean]
  (let [user-info  {:user-id user-id :is-superuser? is-superuser? :is-data-analyst? is-data-analyst?}
        base-where [:and
                    (when-not include-stubs?
                      [:= :is_stub false])
                    (when-not include-analytics?
                      [:= :is_audit false])
                    (if router-database-id
                      [:= :router_database_id router-database-id]
                      [:= :router_database_id nil])]
        where      (if filter-by-data-access?
                     [:and base-where
                      [:or
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/create-queries :query-builder}))
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-database :yes}))
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-table-metadata :yes}))]]
                     base-where)]
    (t2/select :model/Database {:order-by [:%lower.name :%lower.engine]
                                :where where})))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn non-destination-database-exists?
  "Whether a Database with `database-id` that is not a routing destination exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id :router_database_id nil))

(mu/defn destination-database-exists-for-router?
  "Whether the Database with `database-id` has routing destinations."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :router_database_id database-id))

(mu/defn autocomplete-tables
  "Up to `limit` id, Database id, schema, and name rows of the active, visible Tables of the Database with
  `database-id` whose lower-cased name matches the SQL LIKE `like-pattern` (a Honey SQL LIKE right-hand side, see
  `metabase.util.honey-sql-2/like-substring`/`like-prefix`), in name order."
  [database-id  :- ::lib.schema.id/database
   like-pattern :- [:or :string vector?]
   limit        :- ms/PositiveInt]
  (t2/select [:model/Table :id :db_id :schema :name]
             {:from [(warehouse-schema-overlay/table-query)]
              :where    [:and [:= :db_id database-id]
                         [:= :active true]
                         [:like :%lower.name like-pattern]
                         [:= :visibility_type nil]]
              :order-by [[:%lower.name :asc]]
              :limit    limit}))

(defn- autocomplete-cards-search-clause
  "`search-card-slug` should be in a format like '123-foo-bar' or '123' or 'foo-bar', where 123 is the card ID
  and foo-bar is a prefix of the card name converted into a slug.

  If the search string contains a number like '123' we match that as a prefix against the card IDs.
  If the search string contains a number at the start AND text like '123-foo' we match do an exact match on card ID,
  and a substring match on the card name.
  If the search string does not start with a number, and is text like 'foo' we match that as a substring on the card
  name."
  [search-card-slug]
  (let [search-id   (re-find #"\d*" search-card-slug)
        search-name (-> (re-matches #"\d*-?(.*)" search-card-slug)
                        second
                        (str/replace #"-" " ")
                        u/lower-case-en)]
    (cond
      ;; e.g. search-string = "123"
      (and (not-empty search-id) (empty? search-name))
      [:like
       (h2x/cast (if (= (mdb/db-type) :mysql) :char :text) :report_card.id)
       (str search-id "%")]

      ;; e.g. search-string = "123-foo"
      (and (not-empty search-id) (not-empty search-name))
      [:and
       [:= :report_card.id (parse-long search-id)]
       ;; this is a prefix match to be consistent with substring matches on the entire slug
       [:like [:lower :report_card.name] (h2x/like-prefix search-name)]]

      ;; e.g. search-string = "foo"
      (and (empty? search-id) (not-empty search-name))
      [:like [:lower :report_card.name] (h2x/like-substring search-name)])))

(mu/defn autocomplete-cards
  "Up to 50 unarchived Cards of the Database with `database-id` matching `search-card-slug` (see
  [[autocomplete-cards-search-clause]]), with their Collection name, models first then newest first. Dashboard
  questions are excluded unless `include-dashboard-questions?`."
  [database-id                    :- ::lib.schema.id/database
   search-card-slug               :- :string
   include-dashboard-questions?   :- [:maybe :boolean]]
  (t2/select [:model/Card :id :type :database_id :name :collection_id
              [:collection.name :collection_name]]
             {:where    [:and
                         [:= :report_card.database_id database-id]
                         [:= :report_card.archived false]
                         (when-not include-dashboard-questions?
                           [:= :report_card.dashboard_id nil])
                         (autocomplete-cards-search-clause search-card-slug)]
              :left-join [[:collection :collection] [:= :collection.id :report_card.collection_id]]
              ;; prioritize models. This relies of `model` coming before `question` alphabetically, and Tamas pointed
              ;; out this is a little brittle. He's right -- once we put v2 Metrics in then we can replace this with a
              ;; fancy `CASE` expression or something so we can sort things exactly how we like.
              :order-by [[:type :asc]
                         [:report_card.id :desc]] ; sort by most recently created after sorting by type
              :limit    50}))

(mu/defn autocomplete-fields
  "Up to `limit` name, type, id, and Table of the active, non-sensitive Fields of active Tables of the Database with
  `database-id` whose lower-cased name matches the SQL LIKE `like-pattern` (a Honey SQL LIKE right-hand side, see
  `metabase.util.honey-sql-2/like-substring`/`like-prefix`), in field then table name order."
  [database-id  :- ::lib.schema.id/database
   like-pattern :- [:or :string vector?]
   limit        :- ms/PositiveInt]
  ;; NOTE: measuring showed that this query performance is improved ~4x when adding trgm index in pgsql and ~10x when
  ;; adding a index on `lower(metabase_field.name)` for ordering (trgm index having on impact on queries with index).
  ;; Pgsql now has an index on that (see migration `v49.2023-01-24T12:00:00`) as other dbms do not support indexes on
  ;; expressions.
  (t2/select [:model/Field :name :base_type :semantic_type :id :table_id [:table.name :table_name]]
             :metabase_field.active          true
             :%lower.metabase_field/name     [:like like-pattern]
             :metabase_field.visibility_type [:not-in ["sensitive" "retired"]]
             :table.db_id                    database-id
             {:from       [(warehouse-schema-overlay/field-query)]
              :order-by   [[[:lower :metabase_field.name] :asc]
                           [[:lower :table.name] :asc]]
              ;; checking for table.active in join makes query faster when there are a lot of inactive tables
              :inner-join [(warehouse-schema-overlay/table-query {:alias :table}) [:and :table.active
                                                                                   [:= :table.id :metabase_field.table_id]]]
              :limit      limit}))

(mu/defn table-ids-for-database
  "The ids of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :id :model/Table, :db_id database-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn non-sensitive-fields-for-tables
  "The id, name, display name, Table id, and types of the non-sensitive Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select [:model/Field :id :name :display_name :table_id :base_type :semantic_type]
             :table_id        [:in table-ids]
             :visibility_type [:not-in ["sensitive" "retired"]]
             {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn insert-database!
  "Insert the Database `row` and return the inserted instance."
  [row :- ::warehouses.schema/database.update]
  (t2/insert-returning-instance! :model/Database row))

(mu/defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn update-database!
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   changes     :- ::warehouses.schema/database.update]
  (t2/update! :model/Database database-id changes))

(mu/defn delete-destination-databases!
  "Delete the routing destination Databases of the Database with `router-database-id`, returning the number deleted."
  [router-database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database :router_database_id router-database-id))

(mu/defn delete-database!
  "Delete the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database :id database-id))

(mu/defn mark-tables-sync-complete!
  "Mark the initial sync of the Tables with `table-ids` complete, returning the number updated."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/update! :model/Table {:id [:in table-ids]} {:initial_sync_status "complete"}))

(mu/defn delete-field-values-for-database!
  "Delete the FieldValues of every Field of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/query-one {:delete-from :metabase_fieldvalues
                 :where      [:in :field_id
                              ^:allow-subquery {:select     [:f.id]
                                                :from       [[:metabase_field :f]]
                                                :right-join [[:metabase_table :t] [:= :f.table_id :t.id]]
                                                :where      [:= :t.db_id database-id]}]}))

(mu/defn active-tables-for-database
  "The active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn active-table-schemas
  "The distinct schemas of the active Tables of the Database with `database-id`, in schema order. When
  `include-hidden?` is false, restricted to Tables with no `visibility_type` (a non-nil value means the Table is
  hidden -- see [[metabase.warehouse-schema.models.table/visibility-types]])."
  [database-id     :- ::lib.schema.id/database
   include-hidden? :- :boolean]
  (let [clauses (cond-> []
                  (not include-hidden?) (conj [:= :visibility_type nil]))]
    (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                      (merge {:from     [(warehouse-schema-overlay/table-query)]
                              :order-by [[:%lower.schema :asc]]}
                             (when clauses
                               {:where (into [:and] clauses)})))))

(mu/defn active-tables-in-schema
  "The active Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             {:from [(warehouse-schema-overlay/table-query)]
              :order-by [[:display_name :asc]]}))

(mu/defn active-visible-tables-in-schema
  "The active, visible Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             :visibility_type nil
             {:from [(warehouse-schema-overlay/table-query)]
              :order-by [[:display_name :asc]]}))

(mu/defn collection-ids-named
  "The ids of the Collections named `collection-name`, or nil."
  [collection-name :- :string]
  (t2/select-pks-set :model/Collection :name collection-name))

(defn- card-usage-count-subquery
  [database-id model type-str]
  ^:allow-subquery {:select [[:%count.* model]]
                    :from   [:report_card]
                    :where  [:and
                             [:= :database_id database-id]
                             [:= :type type-str]]})

(def ^:private anonymously-published-clause
  "Honey SQL for a Card or Dashboard anonymous traffic can open: it carries a public link, or it is published as a
  guest embed."
  [:or
   [:not= :public_uuid nil]
   [:= :enable_embedding true]])

(def ^:private anonymous-dashboard-id-subquery
  "Subquery for the ids of the Dashboards an anonymous visitor can open."
  ;; an archived Dashboard neither resolves by its public link nor renders as a guest embed
  ^:allow-subquery {:select [:id]
                    :from   [(t2/table-name :model/Dashboard)]
                    :where  [:and
                             [:= :archived false]
                             anonymously-published-clause]})

(defn- anonymous-dashcard-subquery
  "Subquery for `column` of the DashboardCards of every Dashboard an anonymous visitor can open."
  [column]
  ^:allow-subquery {:select [column]
                    :from   [(t2/table-name :model/DashboardCard)]
                    :where  [:in :dashboard_id anonymous-dashboard-id-subquery]})

(def ^:private anonymous-series-card-id-subquery
  "Subquery for the ids of the Cards added as series to the DashboardCards of every Dashboard an anonymous visitor can
  open."
  ^:allow-subquery {:select [:card_id]
                    :from   [(t2/table-name :model/DashboardCardSeries)]
                    :where  [:in :dashboardcard_id (anonymous-dashcard-subquery :id)]})

(def ^:private public-document-id-subquery
  "Subquery for the ids of the Documents an anonymous visitor can open by public link. Documents carry no
  `enable_embedding`, so a public link is the only way anonymous traffic reaches one."
  ;; an archived Document's public link no longer resolves
  ^:allow-subquery {:select [:id]
                    :from   [(t2/table-name :model/Document)]
                    :where  [:and
                             [:= :archived false]
                             [:not= :public_uuid nil]]})

(defn- anonymously-reachable-query
  "Honey SQL selecting the Cards on the Database with `database-id` that anonymous traffic reaches. Four paths count,
  and the Dashboard and Document ones ask nothing of the Card beyond being unarchived and on the Database.

  Not covered: a Card a Dashboard or Document reaches only through a JSON-encoded reference -- parameter mappings,
  parameter value sources, click-behaviour targets, link cards, and prose-mirror Card embeds. The answer therefore
  under-reports: a Card this selects really is reachable, but one it misses may be reachable too."
  [database-id]
  ;; an archived Card's public link no longer resolves, nor does its guest embed render, and nor does the Card render
  ;; inside a Dashboard or Document that anonymous traffic can open
  {:where [:and
           [:= :database_id [:auto/param database-id]]
           [:= :archived false]
           [:or
            ;; the Card carries a public link, or is itself published as a guest embed
            anonymously-published-clause
            ;; a Dashboard anonymous traffic can open holds the Card through a DashboardCard
            [:in :id (anonymous-dashcard-subquery :card_id)]
            ;; the same Dashboard holds it as a series of one of those DashboardCards
            [:in :id anonymous-series-card-id-subquery]
            ;; a Document with a public link owns the Card
            [:in :document_id public-document-id-subquery]]]})

(mu/defn anonymously-reachable? :- :boolean
  "Whether any Card on the Database with `database-id` can be reached by anonymous traffic.
  [[anonymously-reachable-query]] records which paths count and which are not covered."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Card (anonymously-reachable-query database-id)))

(mu/defn database-usage-counts
  "A single row with the count of Questions (`:question`), Models (`:dataset`), Metrics (`:metric`), Segments
  (`:segment`), and Transforms (`:transform`) that use the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (mdb/query
   {:select [:*]
    :from   [[(card-usage-count-subquery database-id :question "question") :question]
             [(card-usage-count-subquery database-id :dataset "model") :dataset]
             [(card-usage-count-subquery database-id :metric "metric") :metric]
             [^:allow-subquery {:select [[:%count.* :segment]]
                                :from   [:segment]
                                :where  [:in :table_id ^:allow-subquery {:select [:id]
                                                                         :from   [:metabase_table]
                                                                         :where  [:= :db_id database-id]}]}
              :segment]
             [^:allow-subquery {:select [[:%count.* :transform]]
                                :from   [:transform]
                                :where  [:or
                                         [:= :source_database_id database-id]
                                         [:= :target_db_id database-id]]}
              :transform]]}))
