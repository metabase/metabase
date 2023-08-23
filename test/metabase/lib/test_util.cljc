(ns metabase.lib.test-util
  "Misc test utils for Metabase lib."
  (:require
   [clojure.core.protocols]
   [clojure.test :refer [deftest is]]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
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

(defn- with-optional-lib-type
  "Create a version of `schema` where `:lib/type` is optional rather than required."
  [schema lib-type]
  [:merge
   schema
   [:map
    [:lib/type {:optional true} [:= lib-type]]]])

(def ^:private MockMetadata
  [:map
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
  e.g. nested Fields."
  [{:keys [database tables fields cards metrics segments] :as m} :- MockMetadata]
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
                                       :when (= (:table-id metric) table-id)]
                                   (assoc metric :lib/type :metadata/metric)))
    (segments [_this table-id]   (for [segment segments
                                       :when (= (:table-id segment) table-id)]
                                   (assoc segment :lib/type :metadata/segment)))

    clojure.core.protocols/Datafiable
    (datafy [_this]
      (list `mock-metadata-provider m))))

(def metadata-provider-with-card
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (mock-metadata-provider
    {:cards [{:name          "My Card"
              :id            1
              :dataset-query {:database (meta/id)
                              :type     :query
                              :query    {:source-table (meta/id :checkins)
                                         :aggregation  [[:count]]
                                         :breakout     [[:field (meta/id :checkins :user-id) nil]]}}
              :database-id   (meta/id)}]})))

(def query-with-source-card
  "A query against `:source-card 1`, with a metadata provider that has that Card. Card's name is `My Card`. Card
  'exports' two columns, `USER_ID` and `count`."
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider-with-card
   :database     (meta/id)
   :stages       [{:lib/type    :mbql.stage/mbql
                   :source-card 1}]})

(def metadata-provider-with-card-with-result-metadata
  "[[meta/metadata-provider]], but with a Card with results metadata as ID 1."
  (lib/composed-metadata-provider
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

(def query-with-source-card-with-result-metadata
  "A query with a `card__<id>` source Table and a metadata provider that has a Card with `:result_metadata`."
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider-with-card-with-result-metadata
   :type         :pipeline
   :database     (meta/id)
   :stages       [{:lib/type    :mbql.stage/mbql
                   :source-card 1}]})

(defn- add-join
  [query join-alias]
  (-> query
      (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                    (lib/with-join-alias join-alias)
                    (lib/with-join-conditions
                     [(lib/= (meta/field-metadata :venues :category-id)
                             (lib/with-join-alias (meta/field-metadata :categories :id) join-alias))])
                    (lib/with-join-fields :all)))))

(defn add-joins
  "Add joins with `join-aliases` against `CATEGORIES`. Assumes source table is `VENUES`, but that really shouldn't matter
  for most tests."
  [query & join-aliases]
  (reduce add-join query join-aliases))

(def query-with-join
  "A query against `VENUES` with an explicit join against `CATEGORIES`."
  (add-joins venues-query "Cat"))

(def query-with-join-with-explicit-fields
  "A query against `VENUES` with an explicit join against `CATEGORIES`, that includes explicit `:fields` including just
  `CATEGORIES.NAME`."
  (-> venues-query
      (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :category-id)
                                                      (-> (meta/field-metadata :categories :id)
                                                          (lib/with-join-alias "Cat")))])
                    (lib/with-join-alias "Cat")
                    (lib/with-join-fields [(-> (meta/field-metadata :categories :name)
                                               (lib/with-join-alias "Cat"))])))))

(def query-with-expression
  "A query with an expression."
  (-> venues-query
      (lib/expression "expr" (lib/absolute-datetime "2020" :month))))

(def native-query
  "A sample native query."
  {:lib/type     :mbql/query
   :lib/metadata meta/metadata-provider
   :database     (meta/id)
   :stages       [{:lib/type           :mbql.stage/native
                   :lib/stage-metadata {:lib/type :metadata/results
                                        :columns  [{:lib/type      :metadata/column
                                                    :name          "abc"
                                                    :display-name  "another Field"
                                                    :base-type     :type/Integer
                                                    :semantic-type :type/FK}
                                                   {:lib/type      :metadata/column
                                                    :name          "sum"
                                                    :display-name  "sum of User ID"
                                                    :base-type     :type/Integer
                                                    :semantic-type :type/FK}]}
                   :native             "SELECT whatever"}]})

(def mock-cards
  "Map of mock MBQL query Card against the test tables. There are three versions of the Card for each table:

  * `:venues`, a Card WITH `:result-metadata`
  * `:venues/no-metadata`, a Card WITHOUT `:result-metadata`
  * `:venues/native`, a Card with `:result-metadata` and a NATIVE query."
  (into {}
        (comp (mapcat (fn [table]
                        [{:table table, :metadata? true,  :native? false, :card-name table}
                         {:table table, :metadata? true,  :native? true,  :card-name (keyword (name table) "native")}
                         {:table table, :metadata? false, :native? false, :card-name (keyword (name table) "no-metadata")}]))
              (map-indexed (fn [idx {:keys [table metadata? native? card-name]}]
                             [card-name
                              (merge
                               {:lib/type      :metadata/card
                                :id            (inc idx)
                                :name          (str "Mock " (name table) " card")
                                :dataset-query (if native?
                                                 {:database (meta/id)
                                                  :type     :native
                                                  :native   {:query (str "SELECT * FROM " (name table))}}
                                                 {:database (meta/id)
                                                  :type     :query
                                                  :query    {:source-table (meta/id table)}})}
                               (when metadata?
                                 {:result-metadata
                                  (->> (meta/fields table)
                                       (map (partial meta/field-metadata table))
                                       (sort-by :id)
                                       (mapv #(dissoc % :id :table-id)))}))])))
        (meta/tables)))

(def metadata-provider-with-mock-cards
  "A metadata provider with all of the [[mock-cards]]. Composed with the normal [[meta/metadata-provider]]."
  (lib/composed-metadata-provider
    meta/metadata-provider
    (mock-metadata-provider
      {:cards (vals mock-cards)})))

(mu/defn field-literal-ref :- ::lib.schema.ref/field.literal
  "Get a `:field` 'literal' ref (a `:field` ref that uses a string column name rather than an integer ID) for a column
  with `column-name` returned by a `query`. This only makes sense for queries with multiple stages, or ones with a
  source Card."
  [query       :- ::lib.schema/query
   column-name :- ::lib.schema.common/non-blank-string]
  (let [cols     (lib/visible-columns query)
        metadata (or (m/find-first #(= (:name %) column-name)
                                   cols)
                     (let [col-names (vec (sort (map :name cols)))]
                       (throw (ex-info (str "No column named " (pr-str column-name) "; found: " (pr-str col-names))
                                       {:column column-name
                                        :found  col-names}))))]
    (lib/ref metadata)))

(mu/defn query-with-mock-card-as-source-card :- [:and
                                                 ::lib.schema/query
                                                 [:map
                                                  [:stages [:tuple
                                                            [:map
                                                             [:source-card integer?]]]]]]
  "Create a query with one of the [[mock-cards]] as its `:source-card`."
  [table-name :- (into [:enum] (sort (keys mock-cards)))]
  (lib/query metadata-provider-with-mock-cards (mock-cards table-name)))

(mu/defn query-with-stage-metadata-from-card :- ::lib.schema/query
  "Convenience for creating a query that has `:lib/metadata` stage metadata attached to it from a Card. Note that this
  does not create a query with a `:source-card`.

  This is mostly around for historic reasons; consider using either [[metabase.lib.core/query]]
  or [[query-with-mock-card-as-source-card]] instead, which are closer to real-life usage."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   {mbql-query :dataset-query, metadata :result-metadata} :- [:map
                                                              [:dataset-query :map]
                                                              [:result-metadata [:sequential {:min 1} :map]]]]
  (let [mbql-query (cond-> (assoc (lib.convert/->pMBQL mbql-query)
                                  :lib/metadata (lib.metadata/->metadata-provider metadata-providerable))
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata (lib.util/->stage-metadata metadata)))]
    (lib.query/query metadata-providerable mbql-query)))

(deftest ^:parallel card-source-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM VENUES;"}]}
          (query-with-stage-metadata-from-card meta/metadata-provider
                                               {:dataset-query   {:database (meta/id)
                                                                  :type     :native
                                                                  :native   {:query "SELECT * FROM VENUES;"}}
                                                :result-metadata (get-in mock-cards [:venues :result-metadata])}))))

(mu/defn ^:private external-remapped-column :- lib.metadata/ColumnMetadata
  "Add an 'external' 'Human Readable Values' remap from values of `original` Field to values of `remapped` Field."
  [metadata-provider :- lib.metadata/MetadataProvider
   original          :- lib.metadata/ColumnMetadata
   remapped          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]]
  (let [remapped   (if (integer? remapped)
                     (lib.metadata/field metadata-provider remapped)
                     remapped)
        remap-info {:lib/type :metadata.column.remapping/external
                    :id       (* (u/the-id original) 10) ; we just need an ID that will be unique for each Field.
                    :name     (lib.util/format "%s [external remap]" (:display-name original))
                    :field-id (u/the-id remapped)}]
    (assoc original :lib/external-remap remap-info)))

(mu/defn ^:private internal-remapped-column :- lib.metadata/ColumnMetadata
  "Add an 'internal' 'FieldValues' remap from values of `original` Field to hardcoded `remap` values."
  [original :- lib.metadata/ColumnMetadata
   remap    :- [:or
                [:sequential :any]
                :map]]
  (let [original-values (if (sequential? remap)
                          (range 1 (inc (count remap)))
                          (keys remap))
        remapped-values (if (sequential? remap)
                          remap
                          (vals remap))
        remap-info      {:lib/type              :metadata.column.remapping/internal
                         :id                    (* (u/the-id original) 100) ; we just need an ID that will be unique for each Field.
                         :name                  (lib.util/format "%s [internal remap]" (:display-name original))
                         :values                original-values
                         :human-readable-values remapped-values}]
    (assoc original :lib/internal-remap remap-info)))

(mu/defn ^:private remapped-column :- lib.metadata/ColumnMetadata
  "Add a remap to an `original` column metadata. Type of remap added depends of value of `remap`:

    * Field ID: external remap with values of original replaced by values of remapped Field with ID
    * Field metadata: external remap with values of original replaced by values of remapped Field
    * Sequence of values: internal remap with integer values of original replaced by value at the corresponding index
    * Map of original value => remapped value: internal remap with values replaced with corresponding value in map"
  [metadata-provider :- lib.metadata/MetadataProvider
   original          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]
   remap             :- [:or
                         lib.metadata/ColumnMetadata
                         ::lib.schema.id/field
                         [:sequential :any]
                         :map]]
  (let [original (if (integer? original)
                   (lib.metadata/field metadata-provider original)
                   original)]
    (if (or (integer? remap)
            (= (lib.dispatch/dispatch-value remap) :metadata/column))
      (external-remapped-column metadata-provider original remap)
      (internal-remapped-column original remap))))

(mu/defn remap-metadata-provider :- lib.metadata/MetadataProvider
  "Composed metadata provider that adds an internal or external remap for `original` Field with [[remapped-column]]."
  [metadata-provider :- lib.metadata/MetadataProvider
   original          :- [:or lib.metadata/ColumnMetadata ::lib.schema.id/field]
   remap             :- [:or
                         lib.metadata/ColumnMetadata
                         ::lib.schema.id/field
                         [:sequential :any]
                         :map]]
  (let [original' (remapped-column metadata-provider original remap)]
    (lib/composed-metadata-provider
     (mock-metadata-provider
      {:fields [original']})
     metadata-provider)))
