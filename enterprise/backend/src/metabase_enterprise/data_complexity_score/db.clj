(ns metabase-enterprise.data-complexity-score.db
  "Application database queries for `:model/DataComplexityScore`. Queries that do not fit [[::opts]] live in the
  data-complexity-score-only section at the bottom of this namespace."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.data-complexity-score.schema :as data-complexity-score.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which DataComplexityScores a query applies to. Keys mirror the columns of `data_complexity_score`: a scalar
  matches that value and a set matches any of its values."
  [:map {:closed true}
   [:id          {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:fingerprint {:optional true} [:or :string [:set :string]]]
   [:source      {:optional true} [:or :string [:set :string]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::data-complexity-score.schema/data-complexity-score.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::data-complexity-score.schema/data-complexity-score.column
                                              [:tuple ::data-complexity-score.schema/data-complexity-score.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/DataComplexityScore columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-data-complexity-score :- [:maybe ::data-complexity-score.schema/data-complexity-score.partial]
  "The first DataComplexityScore matching `opts`, or nil."
  ([]
   (select-one-data-complexity-score nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-data-complexity-score! :- ms/PositiveInt
  "Insert the DataComplexityScore `row` and return its id."
  [row :- ::data-complexity-score.schema/data-complexity-score.create]
  (t2/insert-returning-pk! :model/DataComplexityScore row))

;;; ---------------------- Queries used only by the data-complexity-score module ----------------------

(mu/defn select-active-field-counts-by-table
  "Rows of `:table_id` and `:field_count` of active Fields for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select   [:table_id [:%count.* :field_count]]
             :from     [:metabase_field]
             :where    [:and
                        [:= :active true]
                        [:in :table_id table-ids]]
             :group-by [:table_id]}))

(mu/defn select-unarchived-measure-names
  "The Table ID and name of the unarchived Measures on the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Measure :table_id :name] :archived false :table_id [:in table-ids]))

(mu/defn select-collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn select-verified-card-ids
  "The IDs of the Cards whose most recent moderation review is verified."
  []
  (t2/select-fn-set :moderated_item_id :model/ModerationReview
                    :moderated_item_type "card"
                    :most_recent         true
                    :status              "verified"))

(mu/defn select-official-collection-ids
  "The IDs of the official Collections."
  []
  (t2/select-fn-set :id :model/Collection :authority_level "official"))

(mu/defn select-universe-cards
  "The ID, name, type, and Collection of the unarchived metric and model Cards outside the Database with
  `audit-database-id`."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/select [:model/Card :id :name :type :collection_id :card_schema]
             :type        [:in ["metric" "model"]]
             :archived    false
             :database_id [:not= audit-database-id]))

(mu/defn select-universe-tables
  "The scoring columns of the active Tables outside the Database with `audit-database-id`."
  [audit-database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :name :collection_id :is_published :visibility_type :db_id :data_layer :data_authority]
             :active true
             :db_id  [:not= audit-database-id] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn select-metabot-by-entity-id
  "The Metabot with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Metabot :entity_id entity-id))

(mu/defn data-complexity-score-scored-within-hours?
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

(mu/defn delete-data-complexity-scores-older-than!
  "Delete the DataComplexityScores created more than `months` months ago, returning the number deleted."
  [months :- ms/PositiveInt]
  (t2/delete! :model/DataComplexityScore {:where [:< :created_at (t/minus (t/offset-date-time) (t/months months))]}))
