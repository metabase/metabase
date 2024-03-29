(ns metabase.db.metadata-queries
  "Predefined MBQL queries for getting metadata about an external database.

  TODO -- these have nothing to do with the application database. This namespace should be renamed something like
  `metabase.driver.util.metadata-queries`."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as helpers]
   [metabase.models.table :as table]
   [metabase.query-processor :as qp]
   [metabase.query-processor.interface :as qp.i]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- qp-query
  [db-id mbql-query]
  {:pre [(integer? db-id)]}
  (-> (binding [qp.i/*disable-qp-logging* true]
        (qp/process-query
         {:type       :query
          :database   db-id
          :query      mbql-query
          :middleware {:disable-remaps? true}}))
      :data
      :rows))

(defn- partition-field->filter-form
  "Given a partition field, returns the default value can be used to query."
  [field]
  (let [field-form [:field (:id field) {:base-type (:base_type field)}]]
    (condp #(isa? %2 %1) (:base_type field)
      :type/Number   [:> field-form -9223372036854775808]
      :type/Date     [:> field-form "0001-01-01"]
      :type/DateTime [:> field-form "0001-01-01T00:00:00"])))

(defn- query-with-default-partitioned-field-filter
  [query table-id]
  (let [;; In bigquery, range or datetime partitioned table can have only one partioned field,
        ;; Ingestion time partitioned table can use either _PARTITIONDATE or _PARTITIONTIME as
        ;; partitioned field
        partition-field (or (t2/select-one :model/Field
                                           :table_id table-id
                                           :database_partitioned true
                                           :active true
                                           ;; prefer _PARTITIONDATE over _PARTITIONTIME for ingestion time query
                                           {:order-by [[:name :asc]]})
                            (throw (ex-info (format "No partitioned field found for table: %d" table-id)
                                            {:table_id table-id})))
        filter-form     (partition-field->filter-form partition-field)]
    (update query :filter (fn [existing-filter]
                            (if (some? existing-filter)
                              [:and existing-filter filter-form]
                              filter-form)))))

(defn- field-mbql-query
  [table mbql-query]
  (cond-> mbql-query
    true
    (assoc :source-table (:id table))

    ;; Some table requires a filter to be able to query the data
    ;; Currently this only applied to Partitioned table in bigquery where the partition field
    ;; is required as a filter.
    ;; In the future we probably want this to be dispatched by database engine type
    (:database_require_filter table)
    (query-with-default-partitioned-field-filter (:id table))))

(defn- field-query
  [{table-id :table_id} mbql-query]
  {:pre [(integer? table-id)]}
  (let [table (t2/select-one :model/Table :id table-id)]
    (qp-query (:db_id table)
              (field-mbql-query table mbql-query))))

(def ^Integer absolute-max-distinct-values-limit
  "The absolute maximum number of results to return for a `field-distinct-values` query. Normally Fields with 100 or
  less values (at the time of this writing) get marked as `auto-list` Fields, meaning we save all their distinct
  values in a FieldValues object, which powers a list widget in the FE when using the Field for filtering in the QB.
  Admins can however manually mark any Field as `list`, which is effectively ordering Metabase to keep FieldValues for
  the Field regardless of its cardinality.

  Of course, if a User does something crazy, like mark a million-arity Field as List, we don't want Metabase to
  explode trying to make their dreams a reality; we need some sort of hard limit to prevent catastrophes. So this
  limit is effectively a safety to prevent Users from nuking their own instance for Fields that really shouldn't be
  List Fields at all. For these very-high-cardinality Fields, we're effectively capping the number of
  FieldValues that get could saved.

  This number should be a balance of:

  * Not being too low, which would definitely result in GitHub issues along the lines of 'My 500-distinct-value Field
    that I marked as List is not showing all values in the List Widget'
  * Not being too high, which would result in Metabase running out of memory dealing with too many values"
  (int 1000))

(mu/defn field-distinct-values :- [:sequential ms/NonRemappedFieldValue]
  "Return the distinct values of `field`, each wrapped in a vector.
   This is used to create a `FieldValues` object for `:type/Category` Fields."
  ([field]
   (field-distinct-values field absolute-max-distinct-values-limit))

  ([field max-results :- ms/PositiveInt]
   (field-query field {:breakout [[:field (u/the-id field) nil]]
                       :limit    (min max-results absolute-max-distinct-values-limit)})))

;; TODO this function and field-distinct-values should be in metabase.models.field-values
(defn search-values-query
  "Generate the MBQL query used to power FieldValues search in [[search-values]] below. The actual query generated
  differs slightly based on whether the two Fields are the same Field.

  Note: the generated MBQL query assume that both `field` and `search-field` are from the same table."
  [field search-field value limit]
  (field-query field {:filter   (when (some? value)
                                  [:contains [:field (u/the-id search-field) nil] value {:case-sensitive false}])
                      ;; if both fields are the same then make sure not to refer to it twice in the `:breakout` clause.
                      ;; Otherwise this will break certain drivers like BigQuery that don't support duplicate
                      ;; identifiers/aliases
                      :breakout (if (= (u/the-id field) (u/the-id search-field))
                                  [[:field (u/the-id field) nil]]
                                  [[:field (u/the-id field) nil]
                                   [:field (u/the-id search-field) nil]])
                      :limit    limit}))

(defn field-distinct-count
  "Return the distinct count of `field`."
  [field & [limit]]
  (-> (field-query field {:aggregation [[:distinct [:field (u/the-id field) nil]]]
                          :limit       limit})
      first first int))

(defn field-count
  "Return the count of `field`."
  [field]
  (-> (field-query field {:aggregation [[:count [:field (u/the-id field) nil]]]})
      first first int))

(def max-sample-rows
  "The maximum number of values we should return when using `table-rows-sample`. This many is probably fine for
  inferring semantic types and what-not; we don't want to scan millions of values at any rate."
  10000)

(def nested-field-sample-limit
  "Number of rows to sample for tables with nested (e.g., JSON) columns."
  500)

(def ^:private TableRowsSampleOptions
  "Schema for `table-rows-sample` options"
  [:maybe
   [:map
    [:truncation-size {:optional true} :int]
    [:limit           {:optional true} :int]
    [:order-by        {:optional true} (helpers/distinct (helpers/non-empty [:sequential mbql.s/OrderBy]))]
    [:rff             {:optional true} fn?]]])

(defn- text-field?
  "Identify text fields which can accept our substring optimization.

  JSON and XML fields are now marked as `:type/Structured` but in the past were marked as `:type/Text` so its not
  enough to just check the base type."
  [{:keys [base_type semantic_type]}]
  (and (= base_type :type/Text)
       (not (isa? semantic_type :type/Structured))))

(defn- table-rows-sample-query
  "Returns the mbql query to query a table for sample rows"
  [table
   fields
   {:keys [truncation-size limit order-by] :or {limit max-sample-rows} :as _opts}]
  (let [database           (table/database table)
        driver             (driver.u/database->driver database)
        text-fields        (filter text-field? fields)
        field->expressions (when (and truncation-size (driver/database-supports? driver :expressions database))
                             (into {} (for [field text-fields]
                                        [field [(str (gensym "substring"))
                                                [:substring [:field (u/the-id field) nil]
                                                 1 truncation-size]]])))]
    {:database   (:db_id table)
     :type       :query
     :query      (cond-> {:source-table (u/the-id table)
                          :expressions  (into {} (vals field->expressions))
                          :fields       (vec (for [field fields]
                                               (if-let [[expression-name _] (get field->expressions field)]
                                                 [:expression expression-name]
                                                 [:field (u/the-id field) nil])))
                          :limit        limit}
                   order-by
                   (assoc :order-by order-by)

                   (:database_require_filter table)
                   (query-with-default-partitioned-field-filter (:id table)))
     :middleware {:format-rows?           false
                  :skip-results-metadata? true}}))

(mu/defn table-rows-sample
  "Run a basic MBQL query to fetch a sample of rows of FIELDS belonging to a TABLE.

  Options: a map of
  `:truncation-size`: [optional] size to truncate text fields if the driver supports expressions.
  `:rff`: [optional] a reducing function function (a function that given initial results metadata returns a reducing
  function) to reduce over the result set in the the query-processor rather than realizing the whole collection"
  {:style/indent 1}
  ([table  :- (ms/InstanceOf :model/Table)
    fields :- [:sequential (ms/InstanceOf :model/Field)]
    rff]
   (table-rows-sample table fields rff nil))

  ([table  :- (ms/InstanceOf :model/Table)
    fields :- [:sequential (ms/InstanceOf :model/Field)]
    rff    :- fn?
    opts   :- TableRowsSampleOptions]
   (let [query (table-rows-sample-query table fields opts)]
     (qp/process-query query rff))))

(defmethod driver/table-rows-sample :default
  [_driver table fields rff opts]
  (table-rows-sample table fields rff opts))
