(ns metabase.lib.query.util
  (:require
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
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
   {:keys [breakouts order-bys limit]} :- ::lib.schema.query/test-stage-spec]
  (cond-> query
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
