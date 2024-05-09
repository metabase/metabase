(ns metabase.lib.test-util
  "Misc test utils for Metabase lib."
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.merged-mock :as providers.merged-mock]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.lib.test-util.metadata-providers.remap :as providers.remap]
   [metabase.lib.test-util.metadata-providers.with-cards-for-queries :as providers.cards-for-queries]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.namespaces :as shared.ns]
   [metabase.util.malli :as mu]))

(comment providers.cards-for-queries/keep-me
         providers.merged-mock/keep-me
         providers.mock/keep-me
         providers.remap/keep-me)

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(shared.ns/import-fns
 [providers.cards-for-queries metadata-provider-with-cards-for-queries]
 [providers.merged-mock       merged-mock-metadata-provider]
 [providers.mock              mock-metadata-provider]
 [providers.remap             remap-metadata-provider])

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

(def ^:private cards
  {:cards [{:name          "My Card"
            :id            1
            :dataset-query {:database (meta/id)
                            :type     :query
                            :query    {:source-table (meta/id :checkins)
                                       :aggregation  [[:count]]
                                       :breakout     [[:field (meta/id :checkins :user-id) nil]]}}
            :database-id   (meta/id)}]})

(def metadata-provider-with-card
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider cards)))

(def metadata-provider-with-model
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    (assoc-in cards [:cards 0 :type] :model))))

(def query-with-source-card
  "A query against `:source-card 1`, with a metadata provider that has that Card. Card's name is `My Card`. Card
  'exports' two columns, `USER_ID` and `count`."
  {:lib/type     :mbql/query
   :lib/metadata metadata-provider-with-card
   :database     (meta/id)
   :stages       [{:lib/type    :mbql.stage/mbql
                   :source-card 1}]})

(def ^:private metadata-provider-with-card-with-result-metadata
  "[[meta/metadata-provider]], but with a Card with results metadata as ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    {:cards [{:name            "My Card"
              :id              1
              :database-id     (meta/id)
              ;; THIS IS A LEGACY STYLE QUERY!
              :dataset-query   {:database (meta/id)
                                :type     :query
                                :query    {:source-table (meta/id :checkins)
                                           :aggregation  [[:count]]
                                           :breakout     [[:field (meta/id :checkins :user-id) nil]]}}
              ;; this is copied directly from a QP response. NOT CONVERTED TO KEBAB-CASE YET, BECAUSE THIS IS HOW IT
              ;; LOOKS IN LEGACY QUERIES!
              :result-metadata [{:description        nil
                                 :semantic_type      :type/FK
                                 :table_id           (meta/id :checkins)
                                 :coercion_strategy  nil
                                 :name               "USER_ID"
                                 :settings           nil
                                 :source             :breakout
                                 :field_ref          [:field (meta/id :checkins :user-id) nil]
                                 :effective_type     :type/Integer
                                 :nfc_path           nil
                                 :parent_id          nil
                                 :id                 (meta/id :checkins :user-id)
                                 :fk_target_field_id (meta/id :users :id)
                                 :visibility_type    :normal
                                 :display_name       "User ID"
                                 :fingerprint        {:global {:distinct-count 15, :nil% 0.0}}
                                 :base_type          :type/Integer}
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

(def query-with-self-join
  "A query against `ORDERS` joined to `ORDERS` by ID."
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (lib/join-clause (meta/table-metadata :orders)
                                 [(lib/= (lib/ref (meta/field-metadata :orders :id))
                                         (lib/ref (meta/field-metadata :orders :id)))]))))

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

(defn make-mock-cards
  "Create mock cards against a set of tables in meta/metadata-provider. See [[mock-cards]]"
  [metadata-provider table-key-and-ids]
  (into {}
        (comp (mapcat (fn [[table table-id]]
                        [{:table table, :table-id table-id :metadata? true,  :native? false, :card-name table}
                         {:table table, :table-id table-id :metadata? true,  :native? true,  :card-name (keyword (name table) "native")}
                         {:table table, :table-id table-id :metadata? false, :native? false, :card-name (keyword (name table) "no-metadata")}]))
              (map-indexed (fn [idx {:keys [table table-id metadata? native? card-name]}]
                             [card-name
                              (merge
                                {:lib/type      :metadata/card
                                 :id            (inc idx)
                                 :database-id   (:id (lib.metadata/database metadata-provider))
                                 :name          (str "Mock " (name table) " card")
                                 :dataset-query (if native?
                                                  {:database (:id (lib.metadata/database metadata-provider))
                                                   :type     :native
                                                   :native   {:query (str "SELECT * FROM " (name table))}}
                                                  {:database (:id (lib.metadata/database metadata-provider))
                                                   :type     :query
                                                   :query    {:source-table table-id}})}
                                (when metadata?
                                  {:result-metadata
                                   (->> (lib.metadata/fields metadata-provider table-id)
                                        (sort-by :id)
                                        (mapv #(if native? (dissoc % :table-id :id :fk-target-field-id) %)))}))])))
        table-key-and-ids))

(defn- make-mock-cards-special-cases
  [metadata-provider]
  (let [{products "PRODUCTS"
         reviews  "REVIEWS"} (m/index-by :name (lib.metadata/tables metadata-provider))
        {pk "ID"}            (m/index-by :name (lib.metadata/fields metadata-provider (:id products)))
        {fk "PRODUCT_ID"}    (m/index-by :name (lib.metadata/fields metadata-provider (:id reviews)))]
    {:model/products-and-reviews
     {:lib/type      :metadata/card
      :id            1000
      :database-id   (:id (lib.metadata/database metadata-provider))
      :name          "Mock model - Products and Reviews"
      :type          :model
      :dataset-query
      {:database (:id (lib.metadata/database metadata-provider))
       :type     :query
       :query    {:source-table (:id products)
                  :joins        [{:fields       :all
                                  :alias        "Reviews"
                                  :source-table (:id reviews)
                                  :condition    [:=
                                                 [:field (:id pk) {:base-type :type/BigInteger}]
                                                 [:field (:id fk)
                                                  {:base-type :type/Integer
                                                   :join-alias "Reviews"}]]}]}}}}))

(def mock-cards
  "Map of mock MBQL query Card against the test tables. There are three versions of the Card for each table:

  * `:venues`, a Card WITH `:result-metadata`
  * `:venues/no-metadata`, a Card WITHOUT `:result-metadata`
  * `:venues/native`, a Card with `:result-metadata` and a NATIVE query.

  There are also some specialized mock cards used for corner cases:
  * `:model/products-and-reviews`, a model joining products to reviews"
  (merge (make-mock-cards meta/metadata-provider (map (juxt identity (comp :id meta/table-metadata)) (meta/tables)))
         (make-mock-cards-special-cases meta/metadata-provider)))

(defn metadata-provider-with-mock-card [card]
  (lib/composed-metadata-provider
    meta/metadata-provider
    (mock-metadata-provider
      {:cards [card]})))

(def metadata-provider-with-mock-cards
  "A metadata provider with all of the [[mock-cards]]. Composed with the normal [[meta/metadata-provider]]."
  (lib/composed-metadata-provider
    meta/metadata-provider
    (providers.mock/mock-metadata-provider
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
    (lib/ref (cond-> metadata
               ;; This forces a string column in the presence of force-broken-id-refs
               (::lib.card/force-broken-id-refs metadata) (dissoc :id)))))

(mu/defn query-with-stage-metadata-from-card :- ::lib.schema/query
  "Convenience for creating a query that has `:lib/metadata` stage metadata attached to it from a Card. Note that this
  does not create a query with a `:source-card`.

  This is mostly around for historic reasons; consider using [[metabase.lib.core/query]] instead, which is closer to
  real-life usage."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {mbql-query :dataset-query, metadata :result-metadata} :- [:map
                                                              [:dataset-query :map]
                                                              [:result-metadata [:sequential {:min 1} :map]]]]
  (let [mbql-query (cond-> (assoc (lib.convert/->pMBQL mbql-query)
                                  :lib/metadata (lib.metadata/->metadata-provider metadata-providerable))
                     metadata
                     (lib.util/update-query-stage -1 assoc :lib/stage-metadata (lib.util/->stage-metadata (mapv #(dissoc % :id :table-id) metadata))))]
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
