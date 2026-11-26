(ns metabase.metrics.db
  "Application database queries for the metrics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- visible-metric-cards-where
  "The `:where` clause selecting the unarchived metric Cards the current user can read. Mirrors
  `metabase.queries.core/visible-metric-cards-where-clause`, which this namespace cannot call: the queries module
  requires the metrics module, so requiring it back here would close a load cycle."
  []
  [:and
   [:= :type "metric"]
   [:= :archived false]
   (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/Card) :collection_id) (api/current-user-info) {:include-trash-collection? false
                                                                                                                                  :include-archived-items    :exclude
                                                                                                                                  :permission-level          :read
                                                                                                                                  :root-namespace            nil})])

(mu/defn visible-metric-card-count
  "The number of unarchived metric Cards the current user can read."
  []
  (t2/count :model/Card {:where (visible-metric-cards-where)}))

(mu/defn visible-metric-cards-page
  "Up to `limit` id, name, description, and Collection id rows from `offset` of the unarchived metric Cards the
  current user can read, in name order."
  [limit  :- ms/PositiveInt
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select [:model/Card :id :name :description :collection_id]
             {:where    (visible-metric-cards-where)
              :order-by [[:name :asc]]
              :limit    limit
              :offset   offset}))

(mu/defn metric-card
  "The metric Card with `id`, or nil."
  [id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id id :type "metric"))

(mu/defn metric-cards-by-ids
  "The metric Cards with `ids`."
  [ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %] :type "metric") ids))

(mu/defn measures-by-ids
  "The Measures with `ids`."
  [ids :- [:sequential ::lib.schema.id/measure]]
  (mdb/select-batched #(t2/select :model/Measure :id [:in %]) ids))

(mu/defn measure
  "The Measure with `id`, or nil."
  [id :- ::lib.schema.id/measure]
  (t2/select-one :model/Measure :id id))

(mu/defn raw-metric-cards-for-database
  "The id and dimensions of the metric Cards of the Database with `database-id`.

  Selects the `report_card` table directly rather than `:model/Card`: this asks whether dimensions have ever been
  *persisted*, so it has to see the stored column. Going through the model runs the `:card_schema` upgrades, which
  populates missing `:dimensions`."
  [database-id :- ::lib.schema.id/database]
  (t2/select [(t2/table-name :model/Card) :id :dimensions] :type "metric" :database_id database-id))

(mu/defn fields-with-columns
  "The id and `columns` of the Fields with `field-ids`."
  [columns   :- [:sequential :keyword]
   field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/select (into [:model/Field :id] columns) :id [:in %]) field-ids))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))
