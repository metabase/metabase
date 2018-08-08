(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as i]
             [sort :as sort]
             [util :as qputil]]
            [metabase.query-processor.middleware.resolve :as resolve]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(defn- fetch-fields-for-souce-table-id [source-table-id]
  (map resolve/rename-mb-field-keys
       (-> (db/select [Field :name :display_name :base_type :special_type :visibility_type :table_id :id :position
                       :description :fingerprint]
             :table_id        source-table-id
             :active          true
             :visibility_type [:not-in ["sensitive" "retired"]]
             :parent_id       nil
             {:order-by [[:position :asc]
                         [:id :desc]]})
            (hydrate :values)
            (hydrate :dimensions))))

(defn- fields-for-source-table
  "Return the all fields for SOURCE-TABLE, for use as an implicit `:fields` clause."
  [inner-query]
  ;; Sort the implicit FIELDS so the SQL (or other native query) that gets generated (mostly) approximates the 'magic' sorting
  ;; we do on the results. This is done so when the outer query we generate is a `SELECT *` the order doesn't change
  (let [{source-table-id :id, :as source-table} (qputil/get-normalized inner-query :source-table)]
    (for [field (sort/sort-fields inner-query (fetch-fields-for-souce-table-id source-table-id))
          :let  [field (-> field
                           resolve/convert-db-field
                           (resolve/resolve-table {[nil source-table-id] source-table}))]]
      (if (qputil/datetime-field? field)
        (i/map->DateTimeField {:field field, :unit :default})
        field))))

(defn- should-add-implicit-fields? [{:keys [fields breakout source-table], aggregations :aggregation}]
  (and source-table ; if query is using another query as its source then there will be no table to add nested fields for
       (not (or (seq aggregations)
                (seq breakout)
                (seq fields)))))

(defn- add-implicit-fields [{:keys [source-table], :as inner-query}]
  (if-not (should-add-implicit-fields? inner-query)
    inner-query
    ;; this is a structured `:rows` query, so lets add a `:fields` clause with all fields from the source table + expressions
    (let [inner-query (assoc inner-query :fields-is-implicit true)
          fields      (fields-for-source-table inner-query)
          expressions (for [[expression-name] (:expressions inner-query)]
                        (i/strict-map->ExpressionRef {:expression-name (name expression-name)}))]
      (when-not (seq fields)
        (log/warn (format "Table '%s' has no Fields associated with it." (:name source-table))))
      (assoc inner-query
        :fields (concat fields expressions)))))



(defn- add-implicit-breakout-order-by
  "`Fields` specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that field is *explicitly* referenced in `order-by`."
  [{breakout-fields :breakout, order-by :order-by, :as inner-query}]
  (let [order-by-fields                   (set (map (comp #(select-keys % [:field-id :fk-field-id]) :field) order-by))
        implicit-breakout-order-by-fields (remove (comp order-by-fields #(select-keys % [:field-id :fk-field-id]))
                                                  breakout-fields)]
    (cond-> inner-query
      (seq implicit-breakout-order-by-fields) (update :order-by concat (for [field implicit-breakout-order-by-fields]
                                                                         {:field field, :direction :ascending})))))

(defn- add-implicit-clauses-to-inner-query [inner-query]
  (cond-> (add-implicit-fields (add-implicit-breakout-order-by inner-query))
    ;; if query has a source query recursively add implicit clauses to that too as needed
    (:source-query inner-query) (update :source-query add-implicit-clauses-to-inner-query)))

(defn- maybe-add-implicit-clauses [query]
  (if-not (qputil/mbql-query? query)
    query
    (update query :query add-implicit-clauses-to-inner-query)))

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [qp]
  (comp qp maybe-add-implicit-clauses))
