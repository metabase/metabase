(ns metabase.lib.test-util.metadata-providers.mock
  (:require
   [clojure.core.protocols]
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli :as mu]))

(defn- with-optional-lib-type
  "Create a version of `schema` where `:lib/type` is optional rather than required."
  [schema lib-type]
  [:merge
   schema
   [:map
    [:lib/type {:optional true} [:= lib-type]]]])

(def MockMetadata
  "Schema for the mock metadata passed in to [[mock-metadata-provider]]."
  [:map
   {:closed true}
   [:database {:optional true} [:maybe (with-optional-lib-type lib.metadata/DatabaseMetadata :metadata/database)]]
   [:tables   {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/TableMetadata   :metadata/table)]]]
   [:fields   {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/ColumnMetadata  :metadata/column)]]]
   [:cards    {:optional true} [:maybe [:sequential (with-optional-lib-type ::lib.schema.metadata/card   :metadata/card)]]]
   [:metrics  {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/LegacyMetricMetadata  :metadata/metric)]]]
   [:segments {:optional true} [:maybe [:sequential (with-optional-lib-type lib.metadata/SegmentMetadata :metadata/segment)]]]
   [:settings {:optional true} [:maybe [:map-of :keyword any?]]]])

(deftype MockMetadataProvider [metadata]
  metadata.protocols/MetadataProvider
  (database [_this]            (some-> (:database metadata)
                                       (assoc :lib/type :metadata/database)
                                       (dissoc :tables)))
  (table    [_this table-id]   (some-> (m/find-first #(= (:id %) table-id) (:tables metadata))
                                       (assoc :lib/type :metadata/table)
                                       (dissoc :fields)))
  (field    [_this field-id]   (some-> (m/find-first #(= (:id %) field-id) (:fields metadata))
                                       (assoc :lib/type :metadata/column)))
  (card     [_this card-id]    (some-> (m/find-first #(= (:id %) card-id) (:cards metadata))
                                       (assoc :lib/type :metadata/card)))
  (metric   [_this metric-id]  (some-> (m/find-first #(= (:id %) metric-id) (:metrics metadata))
                                       (assoc :lib/type :metadata/metric)))
  (segment  [_this segment-id] (some-> (m/find-first #(= (:id %) segment-id) (:segments metadata))
                                       (assoc :lib/type :metadata/segment)))
  (tables   [_this]            (for [table (:tables metadata)]
                                 (-> (assoc table :lib/type :metadata/table)
                                     (dissoc :fields))))
  (fields   [_this table-id]   (for [field (:fields metadata)
                                     :when (= (:table-id field) table-id)]
                                 (assoc field :lib/type :metadata/column)))
  (metrics  [_this table-id]   (for [metric (:metrics metadata)
                                     :when  (= (:table-id metric) table-id)]
                                 (assoc metric :lib/type :metadata/metric)))
  (segments [_this table-id]   (for [segment (:segments metadata)
                                     :when   (= (:table-id segment) table-id)]
                                 (assoc segment :lib/type :metadata/segment)))

  (setting [_this setting]     (get-in metadata [:settings (keyword setting)]))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? MockMetadataProvider another)
         (= metadata
            (#?(:clj .metadata :cljs .-metadata) ^MockMetadataProvider another))))

  clojure.core.protocols/Datafiable
  (datafy [_this]
    (list `mock-metadata-provider metadata)))

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
  ([m :- MockMetadata]
   (->MockMetadataProvider m))

  ([parent-metadata-provider mock-metadata]
   (lib/composed-metadata-provider
    (mock-metadata-provider mock-metadata)
    parent-metadata-provider)))

(deftest ^:parallel equality-test
  (let [time-field (assoc (meta/field-metadata :people :birth-date)
                          :base-type      :type/Time
                          :effective-type :type/Time)]
    (is (= (mock-metadata-provider
            {:fields [time-field]})
           (mock-metadata-provider
            {:fields [time-field]})))))
