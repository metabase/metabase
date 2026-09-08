(ns metabase-enterprise.data-complexity-score.db
  "Application database queries for the data-complexity-score module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(defn active-field-counts-by-table
  "Rows of `:table_id` and `:field_count` of active Fields for `table-ids`."
  [table-ids]
  (t2/query {:select   [:table_id [:%count.* :field_count]]
             :from     [:metabase_field]
             :where    [:and
                        [:= :active true]
                        [:in :table_id table-ids]]
             :group-by [:table_id]}))

(defn unarchived-measure-names
  "The Table ID and name of the unarchived Measures on the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Measure :table_id :name] :archived false :table_id [:in table-ids]))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn verified-card-ids
  "The IDs of the Cards whose most recent moderation review is verified."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(defn official-collection-ids
  "The IDs of the official Collections."
  []
  (t2/select-fn-set :id :model/Collection :authority_level "official"))

(defn routed-child-database-ids
  "The IDs of the Databases that are routing destinations."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(defn universe-cards
  "The ID, name, type, and Collection of the unarchived metric and model Cards outside the Database with
  `audit-database-id`."
  [audit-database-id]
  (t2/select [:model/Card :id :name :type :collection_id :card_schema]
             :type        [:in ["metric" "model"]]
             :archived    false
             :database_id [:not= audit-database-id]))

(defn universe-tables
  "The scoring columns of the active Tables outside the Database with `audit-database-id`."
  [audit-database-id]
  (t2/select [:model/Table :id :name :collection_id :is_published :visibility_type :db_id :data_layer :data_authority]
             :active true
             :db_id  [:not= audit-database-id]))

(defn metabot-by-entity-id
  "The Metabot with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Metabot :entity_id entity-id))

(defn latest-score-entry
  "The most recent DataComplexityScore of `source` for `fingerprint`, or nil."
  [fingerprint source]
  (t2/select-one :model/DataComplexityScore :fingerprint fingerprint :source source {:order-by [[:id :desc]]}))

(defn score-entry
  "The DataComplexityScore with `id`, or nil."
  [id]
  (t2/select-one :model/DataComplexityScore :id id))

(defn scored-within-hours?
  "Whether a DataComplexityScore of `source` for `fingerprint` was created within the last `hours` hours of
  database time."
  [fingerprint source hours]
  (t2/exists? :model/DataComplexityScore
              {:where [:and
                       [:= :fingerprint fingerprint]
                       [:= :source source]
                       [:>= :created_at (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- hours) :hour)]]}))

(defn insert-score!
  "Insert `score-entry` and return its ID."
  [score-entry]
  (t2/insert-returning-pk! :model/DataComplexityScore score-entry))

(defn delete-scores-created-before!
  "Delete the DataComplexityScores created before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/DataComplexityScore {:where [:< :created_at cutoff]}))
