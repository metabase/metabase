(ns metabase.lib.test-util
  "Misc test utils for Metabase lib."
  (:require
   [clojure.core.protocols]
   [clojure.test :refer [is]]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.composed-provider
    :as lib.metadata.composed-provider]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def venues-query
  "A mock query against the `VENUES` test data table."
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(defn venues-query-with-last-stage [m]
  (let [query (update-in venues-query [:stages 0] merge m)]
    (is (mc/validate ::lib.schema/query query))
    query))

(defn field-clause
  ([table field]
   (field-clause table field nil))
  ([table field options]
   [:field
    (merge {:base-type (:base-type (meta/field-metadata table field))
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
  [{:keys [database tables fields cards metrics segments] :as m}]
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
                                   (assoc field :lib/type :metadata/field)))

    clojure.core.protocols/Datafiable
    (datafy [_this]
      (list `mock-metadata-provider m))))



(def metadata-provider-with-card
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (lib.metadata.composed-provider/composed-metadata-provider
   meta/metadata-provider
   (mock-metadata-provider
    {:cards [{:name          "My Card"
              :id            1
              :dataset-query {:database (meta/id)
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
   :database     (meta/id)
   :stages       [{:lib/type     :mbql.stage/mbql
                   :source-table "card__1"}]})

(def metadata-provider-with-card-with-result-metadata
  "[[meta/metadata-provider]], but with a Card with results metadata as ID 1."
  (lib.metadata.composed-provider/composed-metadata-provider
   meta/metadata-provider
   (mock-metadata-provider
    {:cards [{:name            "My Card"
              :id              1
              ;; THIS IS A LEGACY STYLE QUERY!
              :dataset-query   {:database (meta/id)
                                :type     :query
                                :query    {:source-table (meta/id :checkins)
                                           :aggregation  [[:count]]
                                           :breakout     [[:field (meta/id :checkins :user-id) nil]]}}
              ;; this is copied directly from a QP response. NOT CONVERTED TO KEBAB-CASE YET, BECAUSE THIS IS HOW IT
              ;; LOOKS IN LEGACY QUERIES!
              :result-metadata [{:description       nil
                                 :semantic_type     :type/FK
                                 :table_id          (meta/id :checkins)
                                 :coercion_strategy nil
                                 :name              "USER_ID"
                                 :settings          nil
                                 :source            :breakout
                                 :field_ref         [:field (meta/id :checkins :user-id) nil]
                                 :effective_type    :type/Integer
                                 :nfc_path          nil
                                 :parent_id         nil
                                 :id                (meta/id :checkins :user-id)
                                 :visibility_type   :normal
                                 :display_name      "User ID"
                                 :fingerprint       {:global {:distinct-count 15, :nil% 0.0}}
                                 :base_type         :type/Integer}
                                {:base_type      :type/Integer
                                 :semantic_type  :type/Quantity
                                 :name           "count"
                                 :display_name   "Count"
                                 :source         :aggregation
                                 :field_ref      [:aggregation 0]
                                 :effective_type :type/BigInteger}]}]})))

(defn query-with-card-source-table-with-result-metadata
  "A query with a `card__<id>` source Table and a metadata provider that has a Card with `:result_metadata`."
  []
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider-with-card-with-result-metadata
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
   :database     (meta/id)
   :stages       [{:lib/type           :mbql.stage/native
                   :lib/stage-metadata {:lib/type :metadata/results
                                        :columns  [{:lib/type      :metadata/field
                                                    :name          "abc"
                                                    :display-name  "another Field"
                                                    :base-type     :type/Integer
                                                    :semantic-type :type/FK}
                                                   {:lib/type      :metadata/field
                                                    :name          "sum"
                                                    :display-name  "sum of User ID"
                                                    :base-type     :type/Integer
                                                    :semantic-type :type/FK}]}
                   :native             "SELECT whatever"}]})
