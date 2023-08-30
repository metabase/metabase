(ns metabase.lib.test-util.mock-metadata-provider
  (:require
   [clojure.core.protocols]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.util.malli :as mu]))

(defn- with-optional-lib-type
  "Create a version of `schema` where `:lib/type` is optional rather than required."
  [schema lib-type]
  [:merge
   schema
   [:map
    [:lib/type {:optional true} [:= lib-type]]]])

(def MockMetadata
  [:map
   {:closed true}
   [:database {:optional true} [:maybe (with-optional-lib-type lib.metadata/DatabaseMetadata :metadata/database)]]
   [:tables   {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/TableMetadata   :metadata/table)]]]
   [:fields   {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/ColumnMetadata  :metadata/column)]]]
   [:cards    {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/CardMetadata    :metadata/card)]]]
   [:metrics  {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/MetricMetadata  :metadata/metric)]]]
   [:segments {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/SegmentMetadata :metadata/segment)]]]])

(mu/defn mock-metadata-provider :- lib.metadata/MetadataProvider
  "Create a mock metadata provider to facilitate writing tests. All keys except `:database` should be a sequence of maps
  e.g.

    {:database <some-database>, :tables [<table-1> <table-2>], ...}

  Normally you can probably get away with using [[metabase.lib.test-metadata/metadata-provider]] instead of using
  this; but this is available for situations when you need to test something not covered by the default test metadata,
  e.g. nested Fields.

  A 2-arity is offered as a convenience to compose this metadata provider with another:

    (lib.tu/mock-metadata-provider parent-metadata-provider {...})
    =>
    (lib/composed-metadata-provider (lib.tu/mock-metadata-provider {...}) parent-metadata-provider)"
  ([{:keys [database tables fields cards metrics segments] :as m} :- MockMetadata]
   (reify
     metadata.protocols/MetadataProvider
     (database [_this]            (some-> database
                                          (assoc :lib/type :metadata/database)
                                          (dissoc :tables)))
     (table    [_this table-id]   (some-> (m/find-first #(= (:id %) table-id) tables)
                                          (assoc :lib/type :metadata/table)
                                          (dissoc :fields)))
     (field    [_this field-id]   (some-> (m/find-first #(= (:id %) field-id) fields)
                                          (assoc :lib/type :metadata/column)))
     (card     [_this card-id]    (some-> (m/find-first #(= (:id %) card-id) cards)
                                          (assoc :lib/type :metadata/card)))
     (metric   [_this metric-id]  (some-> (m/find-first #(= (:id %) metric-id) metrics)
                                          (assoc :lib/type :metadata/metric)))
     (segment  [_this segment-id] (some-> (m/find-first #(= (:id %) segment-id) segments)
                                          (assoc :lib/type :metadata/segment)))
     (tables   [_this]            (for [table tables]
                                    (-> (assoc table :lib/type :metadata/table)
                                        (dissoc :fields))))
     (fields   [_this table-id]   (for [field fields
                                        :when (= (:table-id field) table-id)]
                                    (assoc field :lib/type :metadata/column)))
     (metrics  [_this table-id]   (for [metric metrics
                                        :when  (= (:table-id metric) table-id)]
                                    (assoc metric :lib/type :metadata/metric)))
     (segments [_this table-id]   (for [segment segments
                                        :when   (= (:table-id segment) table-id)]
                                    (assoc segment :lib/type :metadata/segment)))

     clojure.core.protocols/Datafiable
     (datafy [_this]
       (list `mock-metadata-provider m))))

  ([parent-metadata-provider mock-metadata]
   (lib/composed-metadata-provider
    (mock-metadata-provider mock-metadata)
    parent-metadata-provider)))
