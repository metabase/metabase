(ns metabase.lib.test-util.metadata-providers.mock
  (:require
   [clojure.core.protocols]
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
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
   [:database {:optional true} [:maybe (with-optional-lib-type ::lib.schema.metadata/database :metadata/database)]]
   [:tables   {:optional true} [:maybe [:sequential (with-optional-lib-type ::lib.schema.metadata/table         :metadata/table)]]]
   [:fields   {:optional true} [:maybe [:sequential (with-optional-lib-type ::lib.schema.metadata/column        :metadata/column)]]]
   [:cards    {:optional true} [:maybe [:sequential (with-optional-lib-type ::lib.schema.metadata/card          :metadata/card)]]]
   [:segments {:optional true} [:maybe [:sequential (with-optional-lib-type ::lib.schema.metadata/segment       :metadata/segment)]]]
   [:settings {:optional true} [:maybe [:map-of :keyword any?]]]])

(defn- mock-database [metadata]
  (some-> (:database metadata)
          (assoc :lib/type :metadata/database)
          (dissoc :tables)))

(defn- mock-metadatas [metadata metadata-type ids]
  (let [k   (case metadata-type
              :metadata/table         :tables
              :metadata/column        :fields
              :metadata/card          :cards
              :metadata/segment       :segments)
        ids (set ids)]
    (into []
          (keep (fn [object]
                  (when (contains? ids (:id object))
                    (cond-> (assoc object :lib/type metadata-type)
                      (= metadata-type :metadata/table) (dissoc :fields)))))
          (get metadata k))))

(defn- mock-tables [metadata]
  (for [table (:tables metadata)]
    (-> (assoc table :lib/type :metadata/table)
        (dissoc :fields))))

(defn- mock-metadatas-for-table [metadata metadata-type table-id]
  (let [k (case metadata-type
            :metadata/column        :fields
            :metadata/metric        :cards
            :metadata/segment       :segments)]
    (into []
          (keep (fn [object]
                  (when (and (= (:table-id object) table-id)
                             (if (= metadata-type :metadata/metric)
                               (and (= (:type object) :metric)
                                    (not (:archived object)))
                               true))
                    (assoc object :lib/type metadata-type))))
          (get metadata k))))

(defn- mock-metadatas-for-card [metadata metadata-type card-id]
  (let [k (case metadata-type
            :metadata/metric :cards)]
    (into []
          (keep (fn [object]
                  (when (and (= (:source-card-id object) card-id)
                             (if (= metadata-type :metadata/metric)
                               (and (= (:type object) :metric)
                                    (not (:archived object)))
                               true))
                    (assoc object :lib/type metadata-type))))
          (get metadata k))))

(defn- mock-setting [metadata setting-key]
  (get-in metadata [:settings (keyword setting-key)]))

(deftype MockMetadataProvider [metadata]
  metadata.protocols/MetadataProvider
  (database [_this]
    (mock-database metadata))
  (metadatas [_this metadata-type ids]
    (mock-metadatas metadata metadata-type ids))
  (tables [_this]
    (mock-tables metadata))
  (metadatas-for-table [_this metadata-type table-id]
    (mock-metadatas-for-table metadata metadata-type table-id))
  (metadatas-for-card [_this metadata-type card-id]
    (mock-metadatas-for-card metadata metadata-type card-id))
  (setting [_this setting-key]
    (mock-setting metadata setting-key))

  #?(:clj Object :cljs IEquiv)
  (#?(:clj equals :cljs -equiv) [_this another]
    (and (instance? MockMetadataProvider another)
         (= metadata
            (#?(:clj .metadata :cljs .-metadata) ^MockMetadataProvider another))))

  clojure.core.protocols/Datafiable
  (datafy [_this]
    (list `mock-metadata-provider metadata)))

(mu/defn mock-metadata-provider :- ::lib.schema.metadata/metadata-provider
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
