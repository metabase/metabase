(ns metabase.lib.query.util
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.query :as lib.schema.query]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]))

(mu/defn- find-source :- [:or ::lib.schema.metadata/table ::lib.schema.metadata/card]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [id type]}     :- ::lib.schema.query/test-source-spec]
  (case type
    :table (lib.metadata/table metadata-providerable id)
    :card  (lib.metadata/card metadata-providerable id)))

(mu/defn- matches-column? :- :boolean
  [query          :- ::lib.schema/query
   _stage-number   :- :int
   column         :- ::lib.schema.metadata/column
   {:keys [name source-name]} :- ::lib.schema.query/test-column-spec]
  (cond-> true
    (some? name) (and (= name (:name column)))
    (some? source-name) (and (= source-name (:name (lib.metadata/table query (:table-id column)))))))

(mu/defn- find-column :- ::lib.schema.metadata/column
  [query        :- ::lib.schema/query
   stage-number :- :int
   columns      :- [:sequential ::lib.schema.metadata/column]
   column-spec  :- ::lib.schema.query/test-column-spec]
  (let [columns (filterv #(matches-column? query stage-number % column-spec) columns)]
    (case (count columns)
      0 (throw (ex-info "No column found" {:columns columns, :column-spec column-spec}))
      1 (first columns)
      (throw (ex-info "Multiple columns found" {:columns columns, :column-spec column-spec})))))

(mu/defn- matches-temporal-bucket? :- :boolean
  [query          :- ::lib.schema/query
   stage-number   :- :int
   option         :- ::lib.schema.temporal-bucketing/option
   {:keys [unit]} :- ::lib.schema.query/test-temporal-bucket-spec]
  (cond-> true
    (some? unit) (and (= unit (:unit option)))))

(mu/defn- find-temporal-bucket :- ::lib.schema.temporal-bucketing/option
  [query                :- ::lib.schema/query
   stage-number         :- :int
   options              :- [:sequential ::lib.schema.temporal-bucketing/option]
   temporal-bucket-spec :- ::lib.schema.query/test-temporal-bucket-spec]
  (let [options (filterv #(matches-temporal-bucket? query stage-number % temporal-bucket-spec) options)]
    (case (count options)
      0 (throw (ex-info "No temporal bucket found" {:options options}))
      1 (first options)
      (throw (ex-info "Multiple temporal buckets found" {:options options})))))

(mu/defn- append-breakout :- ::lib.schema/query
  [query               :- ::lib.schema/query
   stage-number        :- :int
   columns             :- [:sequential ::lib.schema.metadata/column]
   {:keys [unit]
    :as breakout-spec} :- ::lib.schema.query/test-breakout-spec]
  (let [column (find-column query stage-number columns breakout-spec)
        column (cond
                 unit (let [temporal-buckets (lib.temporal-bucket/available-temporal-buckets query stage-number column)
                            temporal-bucket  (find-temporal-bucket query stage-number temporal-buckets breakout-spec)]
                        (lib.temporal-bucket/with-temporal-bucket column temporal-bucket))
                 :else column)]
    (lib.breakout/breakout query stage-number column)))

(mu/defn- append-breakouts :- ::lib.schema/query
  [query          :- ::lib.schema/query
   stage-number   :- :int
   breakout-specs :- [:sequential ::lib.schema.query/test-breakout-spec]]
  (let [columns (lib.breakout/breakoutable-columns query stage-number)]
    (reduce #(append-breakout %1 stage-number columns %2)
            query
            breakout-specs)))

(mu/defn- expression-spec->expression-parts
  [query             :- ::lib.schema/query
   stage-number      :- :int
   available-columns :- [:sequential ::lib.schema.metadata/column]
   expression-spec   :- ::lib.schema.query/test-expression-spec]
  (case (:type expression-spec)
    :literal  (:value expression-spec)
    :column   (find-column query stage-number available-columns expression-spec)
    :operator {:lib/type :mbql/expression-parts
               :operator (:operator expression-spec)
               :options {}
               :args (mapv #(expression-spec->expression-parts query stage-number available-columns %)
                           (:args expression-spec))}))

(mu/defn- expression-spec->expression-clause :- ::lib.schema.expression/expression
  [query             :- ::lib.schema/query
   stage-number      :- :int
   available-columns :- [:sequential ::lib.schema.metadata/column]
   expression-spec   :- [:or ::lib.schema.query/test-expression-spec ::lib.schema.query/test-named-expression-spec]]
  (if (:value expression-spec)
    (lib.expression/with-expression-name (expression-spec->expression-clause query stage-number available-columns (:value expression-spec)) (:name expression-spec))
    (lib.fe-util/expression-clause
     (expression-spec->expression-parts query
                                        stage-number
                                        available-columns
                                        expression-spec))))

(mu/defn- append-expression :- ::lib.schema/query
  [query                :- ::lib.schema/query
   stage-number         :- :int
   available-columns    :- [:sequential ::lib.schema.metadata/column]
   {:keys [name value]} :- ::lib.schema.query/test-named-expression-spec]
  (let [expression-clause (expression-spec->expression-clause query stage-number available-columns value)]
    (lib.expression/expression query stage-number name expression-clause)))

(mu/defn- append-expressions :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   available-columns :- [:sequential ::lib.schema.metadata/column]
   expression-specs  :- [:sequential ::lib.schema.query/test-named-expression-spec]]
  (reduce #(append-expression %1 stage-number available-columns %2)
          query
          expression-specs))

(mu/defn- matches-strategy? :- :boolean
  [name :- string?
   {:keys [strategy]} :- ::lib.schema.join/strategy.option]
  (= name strategy))

(mu/defn- find-join-strategy :- ::lib.schema.join/strategy
  [query :- ::lib.schema/query
   stage-number :- :int
   strategy :- string?]
  (let [available-strategies (lib.join/available-join-strategies query stage-number)
        found-strategy (first (filter #(matches-strategy? strategy %) available-strategies))]
    (if (nil? found-strategy)
      (throw (ex-info "No join strategy found" {:available-strategies available-strategies, :strategy strategy}))
      found-strategy)))

(mu/defn- join-condition-spec->join-condition :- ::lib.schema.join/condition
  [query :- ::lib.schema/query
   stage-number :- :int
   target :- [:or ::lib.schema.metadata/table ::lib.schema.metadata/card]
   {:keys [operator left right]} :- ::lib.schema.query/test-join-condition-spec]
  (let [lhs (expression-spec->expression-clause query stage-number (lib.join/join-condition-lhs-columns query stage-number nil nil) left)
        rhs (expression-spec->expression-clause query stage-number (lib.join/join-condition-rhs-columns query stage-number target lhs nil) right)]
    (lib.fe-util/join-condition-clause operator lhs rhs)))

(mu/defn- append-join :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   {:keys [source strategy conditions]} :- ::lib.schema.query/test-join-spec]
  (let [join-target (find-source query source)
        join-strategy (find-join-strategy query stage-number strategy)
        join-conditions (if (nil? conditions)
                          (lib.join/suggested-join-conditions query stage-number join-target)
                          (mapv #(join-condition-spec->join-condition query stage-number join-target %) conditions))
        join-clause (lib.join/join-clause join-target join-conditions join-strategy)]
    (lib.join/join query stage-number join-clause)))

(mu/defn- append-joins :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   join-specs  :- [:sequential ::lib.schema.query/join-spec]]
  (reduce #(append-join %1 stage-number %2)
          query
          join-specs))

(mu/defn- append-filter :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   filter-spec  :- [:sequential ::lib.schema.query/expression-spec]]
  (let [filter-clause (expression-spec->expression-clause query stage-number (lib.filter/filterable-columns query stage-number) filter-spec)]
    (lib.filter/filter query stage-number filter-clause)))

(mu/defn- append-filters :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   filter-specs  :- [:sequential ::lib.schema.query/expression-spec]]
  (reduce #(append-filter %1 stage-number %2)
          query
          filter-specs))

(mu/defn- append-aggregation :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   aggregation-spec  :- [:sequential ::lib.schema.query/aggregation-spec]]
  (let [aggregation-clause (expression-spec->expression-clause query stage-number (lib.aggregation/aggregable-columns query stage-number) aggregation-spec)]
    (lib.aggregation/aggregate query stage-number aggregation-clause)))

(mu/defn- append-aggregations  :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   aggregation-specs  :- [:sequential ::lib.schema.query/aggregation-spec]]
  (reduce #(append-aggregation %1 stage-number %2)
          query
          aggregation-specs))

(mu/defn- append-order-by :- ::lib.schema/query
  [query               :- ::lib.schema/query
   stage-number        :- :int
   orderable-columns   :- [:sequential ::lib.schema.metadata/column]
   {:keys [direction]
    :as order-by-spec} :- ::lib.schema.query/test-order-by-spec]
  (let [column (find-column query stage-number orderable-columns order-by-spec)]
    (lib.order-by/order-by query column direction)))

(mu/defn- append-order-bys :- ::lib.schema/query
  [query          :- ::lib.schema/query
   stage-number   :- :int
   order-by-specs :- [:sequential ::lib.schema.query/test-order-by-spec]]
  (let [orderable-columns (lib.order-by/orderable-columns query stage-number)]
    (reduce #(append-order-by %1 stage-number orderable-columns %2)
            query
            order-by-specs)))

(mu/defn- append-stage-clauses :- ::lib.schema/query
  [query                         :- ::lib.schema/query
   stage-number                  :- :int
   {:keys [expressions filters joins aggregations breakouts order-bys limit]} :- ::lib.schema.query/test-stage-spec]
  (cond-> query
    expressions (append-expressions stage-number (lib.metadata.calculation/visible-columns query stage-number) expressions)
    joins (append-joins stage-number joins)
    filters (append-filters stage-number filters)
    aggregations (append-aggregations stage-number aggregations)
    breakouts (append-breakouts stage-number breakouts)
    order-bys (append-order-bys stage-number order-bys)
    limit (lib.limit/limit stage-number limit)))

(mu/defn test-query :- ::lib.schema/query
  "Creates a query from a test query spec."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [stages]}      :- ::lib.schema.query/test-query-spec]
  (let [source (->> stages first :source (find-source metadata-providerable))
        query  (lib.query/query metadata-providerable source)]
    (reduce-kv #(append-stage-clauses %1 %2 %3) query stages)))
