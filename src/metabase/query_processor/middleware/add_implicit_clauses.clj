(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as i]
             [resolve :as resolve]
             [util :as qputil]]
            [toucan.db :as db]))

(defn- fields-for-source-table
  "Return the all fields for SOURCE-TABLE, for use as an implicit `:fields` clause."
  [{source-table-id :id, :as source-table}]
  (for [field (db/select [Field :name :display_name :base_type :special_type :visibility_type :table_id :id :position :description]
                :table_id        source-table-id
                :visibility_type [:not-in ["sensitive" "retired"]]
                :parent_id       nil
                {:order-by [[:position :asc]
                            [:id :desc]]})]
    (let [field (resolve/resolve-table (i/map->Field (resolve/rename-mb-field-keys field))
                                       {[nil source-table-id] source-table})]
      (if (qputil/datetime-field? field)
        (i/map->DateTimeField {:field field, :unit :default})
        field))))

(defn- should-add-implicit-fields? [{{:keys [fields breakout], aggregations :aggregation} :query, :as query}]
  (and (qputil/mbql-query? query)
       (not (or (seq aggregations)
                (seq breakout)
                (seq fields)))))

(defn- add-implicit-fields [{{:keys [source-table]} :query, :as query}]
  (if-not (should-add-implicit-fields? query)
    query
    ;; this is a structured `:rows` query, so lets add a `:fields` clause with all fields from the source table + expressions
    (let [fields      (fields-for-source-table source-table)
          expressions (for [[expression-name] (get-in query [:query :expressions])]
                        (i/strict-map->ExpressionRef {:expression-name (name expression-name)}))]
      (when-not (seq fields)
        (log/warn (format "Table '%s' has no Fields associated with it." (:name source-table))))
      (-> query
          (assoc-in [:query :fields-is-implicit] true)
          (assoc-in [:query :fields] (concat fields expressions))))))



(defn- add-implicit-breakout-order-by
  "`Fields` specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that field is *explicitly* referenced in `order-by`."
  [{{breakout-fields :breakout, order-by :order-by} :query, :as query}]
  (if-not (qputil/mbql-query? query)
    query
    (let [order-by-fields                   (set (map :field order-by))
          implicit-breakout-order-by-fields (filter (partial (complement contains?) order-by-fields)
                                                    breakout-fields)]
      (cond-> query
        (seq implicit-breakout-order-by-fields) (update-in [:query :order-by] concat (for [field implicit-breakout-order-by-fields]
                                                                                       {:field field, :direction :ascending}))))))


(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [qp]
  (comp qp add-implicit-fields add-implicit-breakout-order-by))
