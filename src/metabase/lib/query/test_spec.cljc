(ns metabase.lib.query.test-spec
  (:refer-clojure :exclude [mapv name empty?])
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.schema.test-spec :as lib.schema.test-spec]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]))

(mu/defn- find-source :- [:or ::lib.schema.metadata/table ::lib.schema.metadata/card]
  [metadata-providerable         :- ::lib.schema.metadata/metadata-providerable
   {spec-id :id spec-type :type} :- ::lib.schema.test-spec/test-source-spec]
  (case spec-type
    :table (lib.metadata/table metadata-providerable spec-id)
    :card  (lib.metadata/card metadata-providerable spec-id)))

(mu/defn- matches-column? :- :boolean
  [query                                   :- ::lib.schema/query
   _stage-number                           :- :int
   {:keys [name source-name display-name]} :- ::lib.schema.test-spec/test-column-spec
   column                     :- ::lib.schema.metadata/column]
  (cond-> (= name (:name column))
    (some? source-name) (and (= source-name (some->> column :table-id (lib.metadata/table query) :name)))
    (some? display-name) (and (= display-name (:display-name column)))))

(mu/defn- find-column :- ::lib.schema.metadata/column
  [query             :- ::lib.schema/query
   stage-number      :- :int
   available-columns :- [:sequential ::lib.schema.metadata/column]
   column-spec       :- ::lib.schema.test-spec/test-column-spec]
  (let [columns (filterv (partial matches-column? query stage-number column-spec) available-columns)]
    (case (count columns)
      0 (throw (ex-info "No column found" {:columns available-columns, :column-spec column-spec}))
      1 (first columns)
      (throw (ex-info "Multiple columns found" {:columns columns, :column-spec column-spec})))))

(mu/defn- append-fields :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-specs  :- [:sequential ::lib.schema.test-spec/test-column-spec]]
  (let [visible (lib.metadata.calculation/visible-columns query stage-number)]
    (->> field-specs
         (mapv (partial find-column query stage-number visible))
         (lib.field/with-fields query stage-number))))

(mu/defn- matches-temporal-bucket? :- :boolean
  [unit   :- ::lib.schema.temporal-bucketing/unit
   option :- ::lib.schema.temporal-bucketing/option]
  (= unit (:unit option)))

(mu/defn- find-temporal-bucket :- ::lib.schema.temporal-bucketing/option
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]
   unit         :- ::lib.schema.temporal-bucketing/unit]
  (let [temporal-buckets (lib.temporal-bucket/available-temporal-buckets query stage-number column)
        matches (filterv (partial matches-temporal-bucket? unit) temporal-buckets)]
    (case (count matches)
      0 (throw (ex-info "No temporal bucket found" {:temporal-buckets temporal-buckets, :unit unit}))
      1 (first matches)
      (throw (ex-info "Multiple temporal buckets found" {:matches matches, :unit unit})))))

(mu/defn- add-temporal-bucket :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]
  [query        :- ::lib.schema/query
   stage-number :- :int
   unit         :- ::lib.schema.temporal-bucketing/unit
   column       :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]]
  (->> (find-temporal-bucket query stage-number column unit)
       (lib.temporal-bucket/with-temporal-bucket column)))

(mu/defn- matches-binning? :- :boolean
  [strategy       :- ::lib.schema.binning/strategy
   value          :- [:or ::lib.schema.binning/num-bins ::lib.schema.binning/bin-width]
   {:keys [mbql]} :- ::lib.schema.binning/binning-option]
  (and
   (= strategy (:strategy mbql))
   (== value (strategy mbql))))

(mu/defn- find-binning-strategy :- ::lib.schema.binning/binning-option
  [query        :- ::lib.schema/query
   stage-number :- :int
   strategy     :- ::lib.schema.binning/strategy
   value        :- [:or ::lib.schema.binning/num-bins ::lib.schema.binning/bin-width]
   column       :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]]
  (let [binning-strategies (lib.binning/available-binning-strategies query stage-number column)
        matches (filterv (partial matches-binning? strategy value) binning-strategies)]
    (case (count matches)
      0 (throw (ex-info "No binning strategy found" {:binning-strategies binning-strategies strategy value}))
      1 (first matches)
      (throw (ex-info "Multiple binning strategies found" {:matches matches strategy value})))))

(mu/defn- add-binning :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]
  [query        :- ::lib.schema/query
   stage-number :- :int
   strategy     :- ::lib.schema.binning/strategy
   value        :- [:or ::lib.schema.binning/num-bins ::lib.schema.binning/bin-width]
   column       :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]]
  (->> (find-binning-strategy query stage-number strategy value column)
       (lib.binning/with-binning column)))

(mu/defn- apply-binning :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]
  [query                         :- ::lib.schema/query
   stage-number                  :- :int
   {:keys [unit bins bin-width]} :- ::lib.schema.test-spec/test-column-with-binning-spec
   column                       :- [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]]
  (cond->> column
    unit      (add-temporal-bucket query stage-number unit)
    bins      (add-binning query stage-number :num-bins bins)
    bin-width (add-binning query stage-number :bin-width bin-width)))

(mu/defn- append-breakout :- ::lib.schema/query
  [query               :- ::lib.schema/query
   stage-number        :- :int
   columns             :- [:sequential ::lib.schema.metadata/column]
   breakout-spec       :- ::lib.schema.test-spec/test-breakout-spec]
  (->> (find-column query stage-number columns breakout-spec)
       (apply-binning query stage-number breakout-spec)
       (lib.breakout/breakout query stage-number)))

(mu/defn- append-breakouts :- ::lib.schema/query
  [query          :- ::lib.schema/query
   stage-number   :- :int
   breakout-specs :- [:sequential ::lib.schema.test-spec/test-breakout-spec]]
  (let [columns (lib.breakout/breakoutable-columns query stage-number)]
    (reduce #(append-breakout %1 stage-number columns %2)
            query
            breakout-specs)))

(mu/defn- expression-spec->expression-parts
  [query             :- ::lib.schema/query
   stage-number      :- :int
   expression-spec   :- ::lib.schema.test-spec/test-expression-spec
   available-columns :- [:sequential ::lib.schema.metadata/column]]
  (case (:type expression-spec)
    :literal  (:value expression-spec)
    :column   (find-column query stage-number available-columns expression-spec)
    :operator {:lib/type :mbql/expression-parts
               :operator (:operator expression-spec)
               :options {}
               :args (mapv #(expression-spec->expression-parts query stage-number % available-columns)
                           (:args expression-spec))}))

(mu/defn- named-expression-spec? :- :boolean
  [expression-spec :- [:or ::lib.schema.test-spec/test-expression-spec ::lib.schema.test-spec/test-named-expression-spec]]
  (and
   (contains? expression-spec :name)
   (contains? expression-spec :value)
   (not (contains? expression-spec :type))))

(mu/defn- expression-spec->expression-clause :- ::lib.schema.expression/expression
  [query                                    :- ::lib.schema/query
   stage-number                             :- :int
   {:keys [name value] :as expression-spec} :- [:or ::lib.schema.test-spec/test-expression-spec ::lib.schema.test-spec/test-named-expression-spec]
   available-columns                        :- [:sequential ::lib.schema.metadata/column]]
  (if (named-expression-spec? expression-spec)
    (-> (expression-spec->expression-clause query stage-number value available-columns)
        (lib.expression/with-expression-name name))
    (-> (expression-spec->expression-parts query stage-number expression-spec available-columns)
        lib.fe-util/expression-clause)))

(mu/defn- append-expression :- ::lib.schema/query
  [query                :- ::lib.schema/query
   stage-number         :- :int
   {:keys [name value]} :- ::lib.schema.test-spec/test-named-expression-spec]
  ;; NOTE: expressionable-columns needs to calculated inside the loop
  ;; able to reference each other.
  (->> (lib.expression/expressionable-columns query stage-number nil)
       (expression-spec->expression-clause query stage-number value)
       (lib.expression/expression query stage-number name)))

(mu/defn- append-expressions :- ::lib.schema/query
  [query            :- ::lib.schema/query
   stage-number     :- :int
   expression-specs :- [:sequential ::lib.schema.test-spec/test-named-expression-spec]]
  (reduce #(append-expression %1 stage-number %2)
          query
          expression-specs))

(mu/defn- matches-strategy? :- :boolean
  [strategy-name      :- ::lib.schema.join/strategy
   {:keys [strategy]} :- ::lib.schema.join/strategy.option]
  (= strategy-name strategy))

(mu/defn- find-join-strategy :- ::lib.schema.join/strategy.option
  [query        :- ::lib.schema/query
   stage-number :- :int
   strategy     :- ::lib.schema.join/strategy]
  (let [available-strategies (lib.join/available-join-strategies query stage-number)]
    (if-let [found-strategy (m/find-first (partial matches-strategy? strategy) available-strategies)]
      found-strategy
      (throw (ex-info "No join strategy found" {:available-strategies available-strategies, :strategy strategy})))))

(mu/defn- join-condition-spec->join-condition :- ::lib.schema.join/condition
  [query        :- ::lib.schema/query
   stage-number :- :int
   target       :- [:or ::lib.schema.metadata/table ::lib.schema.metadata/card]
   {:keys [operator left right]} :- ::lib.schema.test-spec/test-join-condition-spec]
  (let [lhs (->> (lib.join/join-condition-lhs-columns query stage-number nil nil nil)
                 (expression-spec->expression-clause query stage-number left)
                 (apply-binning query stage-number left))
        rhs (->> (lib.join/join-condition-rhs-columns query stage-number target lhs nil)
                 (expression-spec->expression-clause query stage-number right)
                 (apply-binning query stage-number right))]
    (lib.fe-util/join-condition-clause operator lhs rhs)))

(mu/defn- append-join :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   {:keys [source strategy conditions]} :- ::lib.schema.test-spec/test-join-spec]
  (let [join-target (find-source query source)
        join-strategy (find-join-strategy query stage-number strategy)
        join-conditions (if conditions
                          (mapv (partial join-condition-spec->join-condition query stage-number join-target) conditions)
                          (lib.join/suggested-join-conditions query stage-number join-target))
        join-clause (lib.join/join-clause join-target join-conditions join-strategy)]
    (lib.join/join query stage-number join-clause)))

(mu/defn- append-joins :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-specs   :- [:sequential ::lib.schema.test-spec/test-join-spec]]
  (reduce #(append-join %1 stage-number %2)
          query
          join-specs))

(mu/defn- append-filter :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   filter-spec  :- ::lib.schema.test-spec/test-expression-spec]
  (->> (lib.filter/filterable-columns query stage-number)
       (expression-spec->expression-clause query stage-number filter-spec)
       (lib.filter/filter query stage-number)))

(mu/defn- append-filters :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   filter-specs :- [:sequential ::lib.schema.test-spec/test-expression-spec]]
  (reduce #(append-filter %1 stage-number %2)
          query
          filter-specs))

(mu/defn- append-aggregation :- ::lib.schema/query
  [query            :- ::lib.schema/query
   stage-number     :- :int
   aggregation-spec :- ::lib.schema.test-spec/test-aggregation-spec]
  (->> (lib.aggregation/aggregable-columns query stage-number)
       (expression-spec->expression-clause query stage-number aggregation-spec)
       (lib.aggregation/aggregate query stage-number)))

(mu/defn- append-aggregations  :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   aggregation-specs :- [:sequential ::lib.schema.test-spec/test-aggregation-spec]]
  (reduce #(append-aggregation %1 stage-number %2)
          query
          aggregation-specs))

(mu/defn- append-order-by :- ::lib.schema/query
  [query               :- ::lib.schema/query
   stage-number        :- :int
   orderable-columns   :- [:sequential ::lib.schema.metadata/column]
   {:keys [direction]
    :as order-by-spec} :- ::lib.schema.test-spec/test-order-by-spec]
  (as-> (find-column query stage-number orderable-columns order-by-spec) column
    (apply-binning query stage-number order-by-spec column)
    (lib.order-by/order-by query column direction)))

(mu/defn- append-order-bys :- ::lib.schema/query
  [query          :- ::lib.schema/query
   stage-number   :- :int
   order-by-specs :- [:sequential ::lib.schema.test-spec/test-order-by-spec]]
  (let [orderable-columns (lib.order-by/orderable-columns query stage-number)]
    (reduce #(append-order-by %1 stage-number orderable-columns %2)
            query
            order-by-specs)))

(mu/defn- append-stage-clauses :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   {:keys [fields expressions filters joins aggregations breakouts order-bys limit]} :- ::lib.schema.test-spec/test-stage-spec]
  (cond-> query
    (> stage-number 0) (lib.stage/append-stage)
    joins              (append-joins stage-number joins)
    expressions        (append-expressions stage-number expressions)
    breakouts          (append-breakouts stage-number breakouts)
    aggregations       (append-aggregations stage-number aggregations)
    order-bys          (append-order-bys stage-number order-bys)
    filters            (append-filters stage-number filters)
    fields             (append-fields stage-number fields)
    limit              (lib.limit/limit stage-number limit)))

(def parse-query-spec
  "Parser for query-spec."
  (mc/decoder [:ref ::lib.schema.test-spec/test-query-spec]
              (mtx/transformer
               mtx/json-transformer
               (mtx/key-transformer {:decode #(-> % u/->kebab-case-en keyword)})
               mtx/strip-extra-keys-transformer
               mtx/default-value-transformer)))

(mu/defn test-query :- ::lib.schema/query
  "Creates a query from a test query spec."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   query-spec            :- :any]
  (let [{:keys [stages]} (parse-query-spec query-spec)
        source (->> stages first :source (find-source metadata-providerable))
        query  (lib.query/query metadata-providerable source)]
    (reduce-kv append-stage-clauses query stages)))
