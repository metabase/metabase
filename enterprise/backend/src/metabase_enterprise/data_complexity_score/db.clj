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

(mu/defn latest-score-entry
  "The most recent DataComplexityScore of `source` for `fingerprint`, or nil."
  [fingerprint :- :string
   source      :- :string]
  (t2/select-one :model/DataComplexityScore :fingerprint fingerprint :source source {:order-by [[:id :desc]]}))

(mu/defn data-complexity-score :- [:maybe ::data-complexity-score.schema/data-complexity-score]
  "The ::data-complexity-score.schema/data-complexity-score with `id`, or nil."
  [id :- ms/PositiveInt]
  (t2/select-one :model/DataComplexityScore :id [:auto/param id]))

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
