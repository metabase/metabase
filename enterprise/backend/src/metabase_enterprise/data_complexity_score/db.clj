(ns metabase-enterprise.data-complexity-score.db
  "Application database queries for the data-complexity-score module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase-enterprise.data-complexity-score.schema :as data-complexity-score.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-field-counts-by-table
  "Rows of `:table_id` and `:field_count` of active Fields for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select   [:table_id [:%count.* :field_count]]
             :from     [:metabase_field]
             :where    [:and
                        [:= :active true]
                        [:in :table_id table-ids]]
             :group-by [:table_id]}))

(mu/defn unarchived-measure-names
  "The Table ID and name of the unarchived Measures on the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Measure :table_id :name] :archived false :table_id [:in table-ids]))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn verified-card-ids
  "The IDs of the Cards whose most recent moderation review is verified."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(mu/defn official-collection-ids
  "The IDs of the official Collections."
  []
  (t2/select-fn-set :id :model/Collection :authority_level "official"))

(mu/defn routed-child-database-ids
  "The IDs of the Databases that are routing destinations."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(mu/defn universe-cards
  "The ID, name, type, and Collection of the unarchived metric and model Cards outside the Database with
  `audit-database-id`."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/select [:model/Card :id :name :type :collection_id]
             :type        [:in ["metric" "model"]]
             :archived    false
             :database_id [:not= audit-database-id]))

(mu/defn universe-tables
  "The scoring columns of the active Tables outside the Database with `audit-database-id`."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :name :collection_id :is_published :visibility_type :db_id :data_layer :data_authority]
             :active true
             :db_id  [:not= audit-database-id]))

(mu/defn metabot-by-entity-id
  "The Metabot with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Metabot :entity_id entity-id))

(mu/defn latest-score-entry
  "The most recent DataComplexityScore of `source` for `fingerprint`, or nil."
  [fingerprint :- :string
   source      :- :string]
  (t2/select-one :model/DataComplexityScore :fingerprint fingerprint :source source {:order-by [[:id :desc]]}))

(mu/defn score-entry
  "The DataComplexityScore with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/DataComplexityScore :id id))

(mu/defn scored-within-hours?
  "Whether a DataComplexityScore of `source` for `fingerprint` was created within the last `hours` hours of
  database time."
  [fingerprint :- :string
   source      :- :string
   hours       :- number?]
  (t2/exists? :model/DataComplexityScore
              {:where [:and
                       [:= :fingerprint fingerprint]
                       [:= :source source]
                       [:>= :created_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- hours) :hour)]]}))

(mu/defn insert-score!
  "Insert `score-entry` and return its ID."
  [score-entry :- (mut/select-keys ::data-complexity-score.schema/data-complexity-score.update [:fingerprint :source :score_data])]
  (t2/insert-returning-pk! :model/DataComplexityScore score-entry))

(mu/defn delete-scores-older-than!
  "Delete the DataComplexityScores created more than `months` months ago, returning the number deleted."
  [months :- ms/PositiveInt]
  (t2/delete! :model/DataComplexityScore {:where [:< :created_at (t/minus (t/offset-date-time) (t/months months))]}))

;;; ------------------------------------- CLI reads and write -------------------------------------
;;; The CLI scores an appdb that may be older than this jar, so these name tables directly and run no model hooks
;;; or transforms. Text columns come back as strings.

(mu/defn raw-universe-cards
  "The rows of [[universe-cards]], read with a raw query."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/query {:select [:id :name :type :collection_id]
             :from   [:report_card]
             :where  [:and
                      [:in :type ["metric" "model"]]
                      [:= :archived false]
                      [:not= :database_id [:auto/param audit-database-id]]]}))

(defn- raw-universe-tables-query
  "A query selecting `select` from the active Tables outside the Database with `audit-database-id`.
  The Tables are `metabase_table` aliased as `t`."
  [select audit-database-id]
  {:select select
   :from   [[:metabase_table :t]]
   :where  [:and
            [:= :t.active true]
            [:not= :t.db_id [:auto/param audit-database-id]]]})

(mu/defn raw-universe-tables
  "The rows of [[universe-tables]], read with a raw query.
  On MySQL and MariaDB the `:is_published` values come back as `0` or `1`."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/query (raw-universe-tables-query [:t.id :t.name :t.collection_id :t.is_published :t.visibility_type :t.db_id
                                        :t.data_layer :t.data_authority]
                                       audit-database-id)))

(mu/defn raw-universe-tables-with-user-settings
  "The rows of [[raw-universe-tables]], with the values users set in `metabase_table_user_settings` applied.
  The rules are the ones the `ceygl0` changeset uses to copy those values back into `metabase_table`.
  Use it for an appdb whose user values are only in the settings table: 64.0 to 64.5.1 and 65.0 to 65.3.1."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/query
   (assoc (raw-universe-tables-query
           [:t.id :t.name :t.db_id
            [[:case [:is-not :s.is_published nil] :s.is_published :else :t.is_published] :is_published]
            [[:case [:is-not :s.is_published nil] :s.collection_id :else :t.collection_id] :collection_id]
            [[:case [:= :s.visibility_type_set true] :s.visibility_type :else :t.visibility_type] :visibility_type]
            [[:case [:= :s.data_layer_set true] :s.data_layer :else :t.data_layer] :data_layer]
            [[:case [:is-not :s.data_authority nil] :s.data_authority :else :t.data_authority] :data_authority]]
           audit-database-id)
          :left-join [[:metabase_table_user_settings :s] [:= :s.table_id :t.id]])))

(mu/defn probe-score-columns
  "Select the columns the CLI writes from `data_complexity_score`, matching no rows.
  Throws when the table or one of the columns is missing."
  []
  (t2/query {:select [:fingerprint :source :score_data :created_at]
             :from   [:data_complexity_score]
             :where  [:= 1 0]}))

(mu/defn insert-score-row!
  "Insert `row` into `data_complexity_score` with a raw query, so no model hooks or transforms run."
  [row :- [:map {:closed true}
           [:fingerprint :string]
           [:source      :string]
           [:score_data  :string]]]
  (t2/query {:insert-into [:data_complexity_score]
             :values      [row]}))
