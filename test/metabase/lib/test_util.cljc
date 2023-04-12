(ns metabase.lib.test-util
  "Misc test utils for Metabase lib."
  (:require
   [clojure.test :refer [is]]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]))

(def venues-query
  {:lib/type     :mbql/query
   :lib/metadata meta/metadata-provider
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type     :mbql.stage/mbql
                   :source-table (meta/id :venues)}]})

(defn venues-query-with-last-stage [m]
  (let [query (update-in venues-query [:stages 0] merge m)]
    (is (mc/validate ::lib.schema/query query))
    query))

(defn field-clause
  ([table field]
   (field-clause table field nil))
  ([table field options]
   [:field
    (merge {:base-type (:base_type (meta/field-metadata table field))
            :lib/uuid  (str (random-uuid))}
           options)
    (meta/id table field)]))

(defn mock-metadata-provider
  "Create a mock metadata provider to facilitate writing tests. All keys except `:database` should be a sequence of maps
  e.g.

    {:database <some-database>, :tables [<table-1> <table-2>], ...}

  Normally you can probably get away with using [[metabase.lib.test-metadata/metadata-provider]] instead of using
  this; but this is available for situations when you need to test something not covered by the default test metadata,
  e.g. nested Fields."
  [{:keys [database tables fields cards metrics segments]}]
  (reify
    metadata.protocols/MetadataProvider
    (database [_this]            (some-> database
                                         (assoc :lib/type :metadata/database)
                                         (dissoc :tables)))
    (table    [_this table-id]   (some-> (m/find-first #(= (:id %) table-id) tables)
                                         (assoc :lib/type :metadata/table)
                                         (dissoc :fields)))
    (field    [_this field-id]   (some-> (m/find-first #(= (:id %) field-id) fields)
                                         (assoc :lib/type :metadata/field)))
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
                                       :when (= (:table_id field) table-id)]
                                   (assoc field :lib/type :metadata/field)))))

(defn composed-metadata-provider
  "A metadata provider composed of several different `metadata-providers`. Methods try each constituent provider in
  turn from left to right until one returns a truthy result."
  [& metadata-providers]
  (reify metadata.protocols/MetadataProvider
    (database [_this]            (some metadata.protocols/database                metadata-providers))
    (table    [_this table-id]   (some #(metadata.protocols/table   % table-id)   metadata-providers))
    (field    [_this field-id]   (some #(metadata.protocols/field   % field-id)   metadata-providers))
    (card     [_this card-id]    (some #(metadata.protocols/card    % card-id)    metadata-providers))
    (metric   [_this metric-id]  (some #(metadata.protocols/metric  % metric-id)  metadata-providers))
    (segment  [_this segment-id] (some #(metadata.protocols/segment % segment-id) metadata-providers))
    (tables   [_this]            (some metadata.protocols/tables                  metadata-providers))
    (fields   [_this table-id]   (some #(metadata.protocols/fields  % table-id)   metadata-providers))))

(def metadata-provider-with-card
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (composed-metadata-provider
   meta/metadata-provider
   (mock-metadata-provider
    {:cards [{:name          "My Card"
              :id            1
              :dataset_query {:database (meta/id)
                              :type     :query
                              :query    {:source-table (meta/id :checkins)
                                         :aggregation  [[:count]]
                                         :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}]})))

(defn query-with-card-source-table
  "A query with a `card__<id>` source Table, and a metadata provider that has that Card. Card's name is `My Card`. Card
  'exports' two columns, `USER_ID` and `count`."
  []
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider-with-card
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type     :mbql.stage/mbql
                   :source-table "card__1"}]})

(defn query-with-join
  "A query against `VENUES` with an explicit join against `CATEGORIES`."
  []
  (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
      (lib/join (-> (lib/join-clause
                     (meta/table-metadata :categories)
                     [(lib/=
                       (lib/field "VENUES" "CATEGORY_ID")
                       (lib/with-join-alias (lib/field "CATEGORIES" "ID") "Cat"))])
                    (lib/with-join-alias "Cat")
                    (lib/with-join-fields :all)))))

(defn query-with-expression
  "A query with an expression."
  []
  (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
      (lib/expression "expr" (lib/absolute-datetime "2020" :month))))

(defn native-query
  "A sample native query."
  []
  {:lib/type     :mbql/query
   :lib/metadata meta/metadata-provider
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type           :mbql.stage/native
                   :lib/stage-metadata {:lib/type :metadata/results
                                        :columns  [{:lib/type      :metadata/field
                                                    :name          "abc"
                                                    :display_name  "another Field"
                                                    :base_type     :type/Integer
                                                    :semantic_type :type/FK}
                                                   {:lib/type      :metadata/field
                                                    :name          "sum"
                                                    :display_name  "sum of User ID"
                                                    :base_type     :type/Integer
                                                    :semantic_type :type/FK}]}
                   :native             "SELECT whatever"}]})
