(ns metabase-enterprise.data-complexity-score.db
  "Application database queries for the data-complexity-score module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn active-field-counts-by-table :- [:sequential [:map {:closed true}
                                                       [:table_id ms/PositiveInt]
                                                       [:field_count :int]]]
  "Rows of `:table_id` and `:field_count` of active Fields for `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/query {:select   [:table_id [:%count.* :field_count]]
             :from     [:metabase_field]
             :where    [:and
                        [:= :active true]
                        [:in :table_id table-ids]]
             :group-by [:table_id]}))

(mu/defn unarchived-measure-names :- [:sequential (ms/InstanceOf :model/Measure)]
  "The Table ID and name of the unarchived Measures on the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Measure :table_id :name] :archived false :table_id [:in table-ids]))

(mu/defn collection :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ms/PositiveInt]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn verified-card-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Cards whose most recent moderation review is verified."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(mu/defn official-collection-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the official Collections."
  []
  (t2/select-fn-set :id :model/Collection :authority_level "official"))

(mu/defn routed-child-database-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the Databases that are routing destinations."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(mu/defn universe-cards :- [:sequential (ms/InstanceOf :model/Card)]
  "The ID, name, type, and Collection of the unarchived metric and model Cards outside the Database with
  `audit-database-id`."
  [audit-database-id :- ms/PositiveInt]
  (t2/select [:model/Card :id :name :type :collection_id :card_schema]
             :type        [:in ["metric" "model"]]
             :archived    false
             :database_id [:not= audit-database-id]))

(mu/defn universe-tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The scoring columns of the active Tables outside the Database with `audit-database-id`."
  [audit-database-id :- ms/PositiveInt]
  (t2/select [:model/Table :id :name :collection_id :is_published :visibility_type :db_id :data_layer :data_authority]
             :active true
             :db_id  [:not= audit-database-id]))

(mu/defn metabot-by-entity-id :- [:maybe (ms/InstanceOf :model/Metabot)]
  "The Metabot with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Metabot :entity_id entity-id))

(mu/defn latest-score-entry :- [:maybe (ms/InstanceOf :model/DataComplexityScore)]
  "The most recent DataComplexityScore of `source` for `fingerprint`, or nil."
  [fingerprint :- :string
   source      :- :string]
  (t2/select-one :model/DataComplexityScore :fingerprint fingerprint :source source {:order-by [[:id :desc]]}))

(mu/defn score-entry :- [:maybe (ms/InstanceOf :model/DataComplexityScore)]
  "The DataComplexityScore with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/DataComplexityScore :id id))

(mu/defn scored-within-hours? :- :boolean
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

(mu/defn insert-score! :- ms/PositiveInt
  "Insert `score-entry` and return its ID."
  [score-entry :- [:map {:closed true}
                   [:fingerprint :string]
                   [:source      :string]
                   [:score_data  :any]]]
  (t2/insert-returning-pk! :model/DataComplexityScore score-entry))

(mu/defn delete-scores-created-before! :- :int
  "Delete the DataComplexityScores created before `cutoff`, returning the number deleted. `cutoff` is a temporal
  value (e.g. `java.sql.Timestamp`, which is not a `java.time.temporal.Temporal`), so it is typed loosely."
  [cutoff :- :any]
  (t2/delete! :model/DataComplexityScore {:where [:< :created_at cutoff]}))
