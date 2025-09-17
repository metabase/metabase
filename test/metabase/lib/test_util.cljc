(ns metabase.lib.test-util
  "Misc test utils for Metabase lib."
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.metadata-providers.merged-mock :as providers.merged-mock]
   [metabase.lib.test-util.metadata-providers.mock :as providers.mock]
   [metabase.lib.test-util.metadata-providers.remap :as providers.remap]
   [metabase.lib.test-util.metadata-providers.with-cards-for-queries :as providers.cards-for-queries]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.namespaces :as shared.ns]))

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

(defn venues-query
  "Returns a mock query against the `VENUES` test data table."
  []
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(defn venues-query-with-last-stage [m]
  (let [query (update-in (venues-query) [:stages 0] merge m)]
    (is (mr/validate ::lib.schema/query query))
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
            :entity-id     (u/generate-nano-id)
            :type          :question
            :dataset-query (lib.tu.macros/mbql-query checkins
                             {:aggregation [[:count]]
                              :breakout    [$user-id]})
            :database-id   (meta/id)}]})

(def metadata-provider-with-card
  "[[meta/metadata-provider]], but with a Card with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider cards)))

(def metadata-provider-with-model
  "[[meta/metadata-provider]], but with a Model with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    (assoc-in cards [:cards 0 :type] :model))))

(def metadata-provider-with-metric
  "[[meta/metadata-provider]], but with a Metric with ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    (assoc-in cards [:cards 0 :type] :metric))))

(defn query-with-source-card
  "Returns a query against `:source-card 1`, with a metadata provider that has that Card. Card's name is `My Card`.
  Card 'exports' two columns, `USER_ID` and `count`."
  []
  (lib/query metadata-provider-with-card (lib.metadata/card metadata-provider-with-card 1)))

(defn query-with-source-model
  "Like [[query-with-source-card]], but where the card's type is :model"
  []
  (lib/query metadata-provider-with-model (lib.metadata/card metadata-provider-with-model 1)))

(def ^:private metadata-provider-with-card-with-result-metadata
  "[[meta/metadata-provider]], but with a Card with results metadata as ID 1."
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    {:cards [{:name            "My Card"
              :id              1
              :database-id     (meta/id)
              ;; THIS IS A LEGACY STYLE QUERY!
              :dataset-query   (lib.tu.macros/mbql-query checkins
                                 {:aggregation [[:count]]
                                  :breakout    [$user-id]})
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

(defn query-with-source-card-with-result-metadata
  "Returns a query with a `card__<id>` source Table and a metadata provider that has a Card with `:result_metadata`."
  []
  (lib/query metadata-provider-with-card-with-result-metadata
             {:lib/type    :mbql.stage/mbql
              :source-card 1}))

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

(defn query-with-join
  "Returns a query against `VENUES` with an explicit join against `CATEGORIES`."
  []
  (add-joins (venues-query) "Cat"))

(defn query-with-join-with-explicit-fields
  "A query against `VENUES` with an explicit join against `CATEGORIES`, that includes explicit `:fields` including just
  `CATEGORIES.NAME`."
  []
  (-> (venues-query)
      (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                    (lib/with-join-conditions [(lib/= (meta/field-metadata :venues :category-id)
                                                      (-> (meta/field-metadata :categories :id)
                                                          (lib/with-join-alias "Cat")))])
                    (lib/with-join-alias "Cat")
                    (lib/with-join-fields [(-> (meta/field-metadata :categories :name)
                                               (lib/with-join-alias "Cat"))])))))

(defn query-with-self-join
  "A query against `ORDERS` joined to `ORDERS` by ID."
  []
  (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
      (lib/join (lib/join-clause (meta/table-metadata :orders)
                                 [(lib/= (lib/ref (meta/field-metadata :orders :id))
                                         (lib/ref (meta/field-metadata :orders :id)))]))))

(defn query-with-expression
  "A query with an expression."
  []
  (-> (venues-query)
      (lib/expression "expr" (lib/absolute-datetime "2020" :month))))

(defn native-query
  "A sample native query."
  []
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
                             (let [eid (u/generate-nano-id)]
                               [card-name
                                (merge
                                 {:lib/type      :metadata/card
                                  :id            (inc idx)
                                  :entity-id     eid
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
                                    (cond->> (lib.metadata/fields metadata-provider table-id)
                                      true    (sort-by :id)
                                      native? (mapv #(dissoc % :table-id :id :fk-target-field-id)))}))]))))
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

(defn mock-cards
  "Returns a map of mock MBQL query Card against the test tables. There are three versions of the Card for each table:

  * `:venues`, a Card WITH `:result-metadata`
  * `:venues/no-metadata`, a Card WITHOUT `:result-metadata`
  * `:venues/native`, a Card with `:result-metadata` and a NATIVE query.

  There are also some specialized mock cards used for corner cases:
  * `:model/products-and-reviews`, a model joining products to reviews"
  []
  (merge (make-mock-cards meta/metadata-provider (map (juxt identity (comp :id meta/table-metadata)) (meta/tables)))
         (make-mock-cards-special-cases meta/metadata-provider)))

(defn metadata-provider-with-mock-card
  ([card]
   (metadata-provider-with-mock-card meta/metadata-provider card))
  ([metadata-provider card]
   (lib/composed-metadata-provider
    metadata-provider
    (mock-metadata-provider
     {:cards [card]}))))

(defn metadata-provider-with-card-from-query
  "A metadata provider with a card created from query and given id."
  ([id query]
   (metadata-provider-with-card-from-query meta/metadata-provider id query))
  ([metadata-provider id query & [card-details]]
   (metadata-provider-with-mock-card
    metadata-provider
    (merge {:lib/type        :metadata/card
            :id              id
            :database-id     (:id (lib.metadata/database metadata-provider))
            :dataset-query   (lib.convert/->legacy-MBQL query)
            :name            (str (gensym))
            :result-metadata (->> (lib/returned-columns query)
                                  (sort-by :id))}
           card-details))))

(defn metadata-provider-with-mock-cards
  "A metadata provider with all of the [[mock-cards]]. Composed with the normal [[meta/metadata-provider]]."
  []
  (lib/composed-metadata-provider
   meta/metadata-provider
   (providers.mock/mock-metadata-provider
    {:cards (vals (mock-cards))})))

(defn as-model
  "Given a mock card, make it a model.

  This sets the `:type` of the card to `:model`."
  [card]
  (assoc card :type :model))

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
                                                :result-metadata (get-in (mock-cards) [:venues :result-metadata])}))))
