(ns metabase.lib.query.util
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::table-source-spec
  [:map
   [:type [:= :table]]
   [:id ::lib.schema.id/table]])

(mr/def ::card-source-spec
  [:map
   [:type [:= :card]]
   [:id ::lib.schema.id/card]])

(mr/def ::source-spec
  [:multi {:dispatch :type}
   [:table ::table-source-spec]
   [:card ::card-source-spec]])

(mr/def ::column-spec
  [:map
   [:name {:optional true} [:maybe string?]]])

(mr/def ::order-by-spec
  [:merge
   ::column-spec
   [:map
    [:direction {:optional true} [:maybe [:enum :asc :desc]]]]])

(mr/def ::stage-spec
  [:map
   [:source    {:optional true} [:maybe ::source-spec]]
   [:order-bys {:optional true} [:maybe [:sequential ::order-by-spec]]]])

(mr/def ::query-spec
  [:map
   [:stages [:sequential ::stage-spec]]])

(mu/defn- find-source :- [:or ::lib.schema.metadata/table ::lib.schema.metadata/card]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [id type]}     :- ::source-spec]
  (case type
    :table (lib.metadata/table metadata-providerable id)
    :card  (lib.metadata/card metadata-providerable id)))

(mu/defn- matches-column? :- :boolean
  [query          :- ::lib.schema/query
   stage-number   :- :int
   column         :- ::lib.schema.metadata/column
   {:keys [name]} :- ::column-spec]
  (cond-> true
    (some? name) (and (= name (:name column)))))

(mu/defn- find-column :- ::lib.schema.metadata/column
  [query        :- ::lib.schema/query
   stage-number :- :int
   columns      :- [:sequential ::lib.schema.metadata/column]
   column-spec  :- ::column-spec]
  (let [columns (filterv #(matches-column? query stage-number % column-spec) columns)]
    (case (count columns)
      0 (throw (ex-info "No column found" {:columns columns, :column-spec column-spec}))
      1 (first columns)
      (throw (ex-info "Multiple columns found" {:columns columns, :column-spec column-spec})))))

(mu/defn- append-order-by :- ::lib.schema/query
  [query                                :- ::lib.schema/query
   stage-number                         :- :int
   orderable-columns                    :- [:sequential ::lib.schema.metadata/column]
   {:keys [direction], :as order-by-spec} :- ::order-by-spec]
  (let [column (find-column query stage-number orderable-columns order-by-spec)]
    (lib.order-by/order-by query column direction)))

(mu/defn- append-order-bys :- ::lib.schema/query
  [query             :- ::lib.schema/query
   stage-number      :- :int
   order-by-specs    :- [:sequential ::order-by-spec]]
  (let [orderable-columns (lib.order-by/orderable-columns query stage-number)]
    (reduce #(append-order-by %1 stage-number orderable-columns %2)
            query
            order-by-specs)))

(mu/defn- append-stage-clauses :- ::lib.schema/query
  [query              :- ::lib.schema/query
   stage-number       :- :int
   {:keys [order-bys]} :- ::stage-spec]
  (cond-> query
    order-bys (append-order-bys stage-number order-bys)))

(mu/defn query-from-spec :- ::lib.schema/query
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [stages]}      :- ::query-spec]
  (let [source (->> stages first :source (find-source metadata-providerable))
        query  (lib.query/query metadata-providerable source)]
    (reduce-kv #(append-stage-clauses %1 %2 %3) query stages)))
