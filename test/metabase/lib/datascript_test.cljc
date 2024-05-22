(ns metabase.lib.datascript-test
  (:require
   #?@(:clj  ([mb.hawk.assert-exprs.approximately-equal :as =?]
              [methodical.core :as methodical])
       :cljs ([datascript.impl.entity :as d.entity]
              [metabase.test-runner.assert-exprs.approximately-equal :as =?]))
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [datascript.core :as d]
   [medley.core :as m]
   [metabase.lib.datascript :as ld]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

;; Adding DataScript's lazily-fetched Entities as a target for `=?`.
(#?@(:clj  (methodical/defmethod =?/=?-diff [clojure.lang.IPersistentMap datascript.impl.entity.Entity])
     :cljs (defmethod            =?/=?-diff [:dispatch-type/map          d.entity/Entity]))
  [exp-map act-entity]
  (first (for [[exp-k exp-v] exp-map
               :let  [act-v (get act-entity exp-k)
                      diff  (if (set? act-v)
                              ;; Sequential - Ignore order, but we want there to exist a mapping from each exp value to
                              ;; some act value.
                              (cond
                                (set?        exp-v) (=?/=?-diff exp-v act-v)
                                (sequential? exp-v) (if (= (count exp-v) (count act-v))
                                                      (=?/=?-diff exp-v act-v)
                                                      ('not= exp-v (d/touch act-v)))
                                :else               (=?/=?-diff exp-v act-v))
                              ;; Scalars - just compare them.
                              (=?/=?-diff exp-v act-v))]
               :when diff]
           {exp-k diff})))

;; We know in this function that every exp has at least one match! This is only to find that there's no possible
;; matching.
(defn- =?-diff-sets-matching [act-set [[exp {:keys [matches]}] & pairs]]
  (let [available (filter act-set matches)]
    (cond
      (empty? available) #{exp}
      (empty? pairs)     nil    ;; Successful match!
      :else (let [tails (for [act available]
                          (=?-diff-sets-matching (disj act-set act) pairs))]
              (if (some nil? tails)
                nil ; Successfully found a matching.
                ;; No matches. Each one returns a set of disappointed exps. Return that union.
                (reduce set/union nil tails))))))

(#?@(:clj  (methodical/defmethod =?/=?-diff [clojure.lang.Sequential   clojure.lang.IPersistentSet])
     :cljs (defmethod            =?/=?-diff [:dispatch-type/sequential :dispatch-type/set]))
  [exps act-set]
  ;; Each exp must be matched with something in the act-set. The order doesn't matter, but there must exist a matching.
  ;; If there are no matching for an exp, we want to show... all the diffs? Just the smallest one?
  (let [;; Results is a parallel list to exps: [exp {:diffs {act diff ...}, :matched true}]
        results (for [exp exps
                      :let [diffs (into {} (map (fn [act]
                                                  [act (=?/=?-diff exp act)]))
                                        act-set)]]
                  [exp {:diffs   (m/filter-vals some? diffs)
                        :matches (set (keys (m/filter-vals nil? diffs)))}])
        unmatched (keep (fn [[_exp {:keys [diffs matches]}]]
                          (when (empty? matches)
                            (set (vals diffs))))
                        results)]
    (if (seq unmatched)
      ;; Returns unmatched with a list of [exp #{diffs...}] pairs.
      ;; TODO: Probably too long?
      (list* 'unmatched unmatched)
      ;; Otherwise try to match everything up consistently.
      (if-let [diff (=?-diff-sets-matching act-set results)]
        (list 'no-matching-among diff)
        nil))))

(def ^:private sample-5-stages
  {:db/id             -10
   :mbql/database     [:metadata.database/id 1]

   :mbql.stage/_query [{:db/id              -1}
                       {:db/id              -2
                        :mbql.stage/source  -1}
                       {:db/id              -3
                        :mbql.stage/source  -2}
                       {:db/id              -4
                        :mbql.stage/source  -3}
                       {:db/id              -5
                        :mbql.stage/source  -4}]
   :mbql.query/stage0 -1
   :mbql.query/stage  -5})

(deftest ^:parallel stage-rules-test
  (let [conn      (ld/fresh-conn)
        tx        (d/transact! conn [sample-5-stages])
        tempids   (:tempids tx)
        query-eid (get tempids -10)
        db        (:db-after tx)
        datalog   '[:find ?stage .
                    :in $ % ?query ?stage-number :where
                    (stage-number ?query ?stage-number ?stage)]]
    (is (= (get tempids -1)
           (d/q datalog db ld/rules-stages query-eid 0)))
    (is (= (get tempids -2)
           (d/q datalog db ld/rules-stages query-eid 1)))
    (is (= (get tempids -3)
           (d/q datalog db ld/rules-stages query-eid 2)))
    (is (= (get tempids -4)
           (d/q datalog db ld/rules-stages query-eid 3)))
    (is (= (get tempids -5)
           (d/q datalog db ld/rules-stages query-eid 4)))
    (is (= (get tempids -5)
           (d/q datalog db ld/rules-stages query-eid -1)))))

(deftest ^:parallel expr-test
  (testing "[= entid literal]"
    (is (=? {:mbql.clause/operator :=
             :mbql.clause/argument [{:mbql/ref    [:metadata.field/id 12]
                                     :mbql/series 0}
                                    {:mbql/lit    7
                                     :mbql/series 1}]}
            (ld/expr := [:metadata.field/id 12] 7))))
  (testing "[= entid Entity]"
    (is (=? {:mbql.clause/operator :=
             :mbql.clause/argument [{:mbql/ref    [:metadata.field/id 12]
                                     :mbql/series 0}
                                    {:mbql/ref    8
                                     :mbql/series 1}]}
            (ld/expr := [:metadata.field/id 12] {:db/id 8, :other/values "here"}))))
  (testing "nesting and multiple arguments"
    (testing "[= entid [= entid 6] 7 8 9]"
      (is (=? {:mbql.clause/operator :=
               :mbql.clause/argument [{:mbql/ref    [:metadata.field/id 12]
                                       :mbql/series 0}
                                      {:mbql/ref    {:mbql.clause/operator :+
                                                     :mbql.clause/argument [{:mbql/ref    [:metadata.field/id 9001]
                                                                             :mbql/series 0}
                                                                            {:mbql/lit    6
                                                                             :mbql/series 1}]}
                                       :mbql/series 1}
                                      {:mbql/lit 7, :mbql/series 2}
                                      {:mbql/lit 8, :mbql/series 3}
                                      {:mbql/lit 9, :mbql/series 4}]}
              (ld/expr := [:metadata.field/id 12]
                       (ld/expr :+ [:metadata.field/id 9001] 6)
                       7 8 9))))))

(deftest ^:parallel query-construction-test
  (testing "basic query"
    (let [query (ld/query meta/metadata-provider (meta/table-metadata :orders))]
      (is (number? (:db/id query)))
      (is (some? (d/entity-db query)))
      (is (d/db? (d/entity-db query)))

      (is (=? {:mbql.query/database {:metadata.database/id (meta/id)}
               :mbql.query/stage0   {:mbql.stage/source {:metadata.table/id   (meta/id :orders)
                                                         :metadata.table/name "ORDERS"}}}
              query))
      (testing "has only one stage"
        (is (= (:mbql.query/stage0 query)
               (:mbql.query/stage  query))))))

  (testing "filters"
    (testing "one filter"
      (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                      (ld/filter -1 (ld/expr :< [:metadata.field/id (meta/id :orders :subtotal)] 100)))
            exp   {:mbql.clause/operator :<
                   :mbql.clause/argument
                   [{:mbql/ref    {:metadata.field/id (meta/id :orders :subtotal)}
                     :mbql/series 0}
                    {:mbql/lit    100
                     :mbql/series 1}]
                   :mbql/series 0}]
        (is (=? {:mbql.query/stage {:mbql.stage/filter [exp]}}
                query))
        (is (=? [exp]
                (ld/filters query -1))))
      (testing "nested expressions"
        (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                        (ld/filter -1 (ld/expr :>
                                               (ld/expr (keyword "/")
                                                        [:metadata.field/id (meta/id :orders :discount)]
                                                        [:metadata.field/id (meta/id :orders :subtotal)])
                                               0.1)))
              exp   {:mbql.clause/operator :>
                     :mbql.clause/argument
                     [{:mbql/ref    {:mbql.clause/operator (keyword "/")
                                     :mbql.clause/argument
                                     ;; Showing that the order here doesn't matter.
                                     [{:mbql/ref {:metadata.field/id (meta/id :orders :subtotal)}
                                       :mbql/series 1}
                                      {:mbql/ref {:metadata.field/id (meta/id :orders :discount)}
                                       :mbql/series 0}]}
                       :mbql/series 0}
                      {:mbql/lit    0.1
                       :mbql/series 1}]
                     :mbql/series 0}]
          (is (=? {:mbql.query/stage {:mbql.stage/filter [exp]}}
                  query))
          (is (=? [exp]
                  (ld/filters query -1))))))
    (testing "multiple filters"
      (let [query            (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                                 (ld/filter -1 (ld/expr :> [:metadata.field/id (meta/id :orders :subtotal)] 100))
                                 ;; START HERE: I need to think about implicit joins a bit more carefully.
                                 ;; Implicit joins are really at the column level and the source level.
                                 ;; They need some indirection.
                                 (ld/filter -1 (ld/expr := [:metadata.field/id (meta/id :products :category)] "Doohickey"))
                                 (ld/filter -1 (ld/expr :< [:metadata.field/id (meta/id :orders :tax)] 20)))
            filter-subtotal  {:mbql.clause/operator :>
                              :mbql.clause/argument
                              [{:mbql/series 0, :mbql/ref {:metadata.field/id (meta/id :orders :subtotal)}}
                               {:mbql/series 1, :mbql/lit 100}]
                              :mbql/series 0}
            filter-category  {:mbql.clause/operator :=
                              :mbql.clause/argument
                              [{:mbql/series 0, :mbql/ref {:metadata.field/id (meta/id :products :category)}}
                               {:mbql/series 1, :mbql/lit "Doohickey"}]
                              :mbql/series 1}
            filter-tax       {:mbql.clause/operator :<
                              :mbql.clause/argument
                              [{:mbql/series 0, :mbql/ref {:metadata.field/id (meta/id :orders :tax)}}
                               {:mbql/series 1, :mbql/lit 20}]
                              :mbql/series 2}
            filters          [filter-subtotal filter-category filter-tax]]
        (testing "undefined order with direct DB access - =? hides the details"
          (doseq [shuffled (take 5 (iterate shuffle filters))]
            (is (=? {:mbql.query/stage {:mbql.stage/filter shuffled}}
                    query))))
        (testing "ld/filters does sort the output"
          (is (=? filters (ld/filters query -1))))))))

(deftest ^:parallel aggregations-test
  (testing "aggregations"
    (testing "individually"
      (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                      (ld/aggregate -1 (ld/agg-count)))
            exp   {:mbql.aggregation/operator :count
                   :mbql/series               0}]
        (is (=? {:mbql.query/stage {:mbql.stage/aggregation [exp]}}
                query))
        (is (=? [exp]
                (ld/aggregations query -1)))))
    (testing "multiple aggregations"
      (let [query            (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                                 (ld/aggregate -1 (ld/agg-count))
                                 (ld/aggregate -1 (ld/agg-sum [:metadata.field/id (meta/id :orders :subtotal)]))
                                 (ld/aggregate -1 (ld/agg-sum-where
                                                    [:metadata.field/id (meta/id :orders :discount)]
                                                    (ld/expr :not-null [:metadata.field/id (meta/id :orders :discount)])))
                                 (ld/aggregate -1 (ld/agg-count-where
                                                    (ld/expr :> [:metadata.field/id (meta/id :products :category)]
                                                             "Doohickey"))))
            agg-count        {:mbql.aggregation/operator :count
                              :mbql/series               0}
            agg-sum          {:mbql.aggregation/operator :sum
                              :mbql.aggregation/column   {:metadata.field/id  (meta/id :orders :subtotal)}
                              :mbql/series               1}
            agg-sum-where    {:mbql.aggregation/operator :sum-where
                              :mbql.aggregation/column   {:metadata.field/id  (meta/id :orders :discount)}
                              :mbql/series               2
                              :mbql.aggregation/filter
                              {:mbql.clause/operator :not-null
                               :mbql.clause/argument [{:mbql/ref    {:metadata.field/id (meta/id :orders :discount)}
                                                       :mbql/series 0}]}}
            agg-count-where  {:mbql.aggregation/operator :count-where
                              :mbql/series               3
                              :mbql.aggregation/filter
                              {:mbql.clause/operator :>
                               :mbql.clause/argument [{:mbql/ref    {:metadata.field/id (meta/id :products :category)}
                                                       :mbql/series 0}
                                                      {:mbql/lit    "Doohickey"
                                                       :mbql/series 1}]}}
            aggs             [agg-count agg-sum agg-sum-where agg-count-where]]
        (testing "undefined order with direct DB access - =? hides the details"
          (doseq [shuffled (take 5 (iterate shuffle aggs))]
            (is (=? {:mbql.query/stage {:mbql.stage/aggregation shuffled}}
                    query))))
        (testing "ld/aggregations does sort the output"
          (is (=? aggs (ld/aggregations query -1))))))))

(deftest ^:parallel expressions-test
  (testing "expressions"
    (testing "individually"
      (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                      (ld/expression -1 "taxes_25p" (ld/expr :* [:metadata.field/id (meta/id :orders :subtotal)]
                                                             0.25)))
            exp   {:mbql.expression/name "taxes_25p"
                   :mbql.clause/operator :*
                   :mbql.clause/argument [{:mbql/ref    {:metadata.field/id (meta/id :orders :subtotal)}
                                           :mbql/series 0}
                                          {:mbql/lit    0.25
                                           :mbql/series 1}]
                   :mbql/series          0}]
        (is (=? {:mbql.query/stage {:mbql.stage/expression [exp]}}
                query))
        (is (=? [exp]
                (ld/expressions query -1)))))
    (testing "multiple expressions"
      (let [query            (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                                 (ld/expression -1 "taxes_25p"
                                                (ld/expr :* [:metadata.field/id (meta/id :orders :subtotal)] 0.25))
                                 (ld/expression -1 "tax_rate"
                                                (ld/expr (keyword "/")
                                                         [:metadata.field/id (meta/id :orders :tax)]
                                                         [:metadata.field/id (meta/id :orders :subtotal)]))
                                 (ld/expression -1 "discount_ratio"
                                                (ld/expr (keyword "/")
                                                         (ld/expr :coalesce
                                                                  [:metadata.field/id (meta/id :orders :discount)]
                                                                  0)
                                                         [:metadata.field/id (meta/id :orders :subtotal)])))
            exp-taxes-25p    {:mbql.expression/name "taxes_25p"
                              :mbql/series          0
                              :mbql.clause/operator :*
                              :mbql.clause/argument
                              [{:mbql/series 0, :mbql/ref {:metadata.field/id (meta/id :orders :subtotal)}}
                               {:mbql/series 1, :mbql/lit 0.25}]}
            exp-tax-rate     {:mbql.expression/name "tax_rate"
                              :mbql/series          1
                              :mbql.clause/operator (keyword "/")
                              :mbql.clause/argument
                              [{:mbql/series 0, :mbql/ref {:metadata.field/id (meta/id :orders :tax)}}
                               {:mbql/series 1, :mbql/ref {:metadata.field/id (meta/id :orders :subtotal)}}]}
            exp-discount     {:mbql.expression/name "discount_ratio"
                              :mbql/series          2
                              :mbql.clause/operator (keyword "/")
                              :mbql.clause/argument
                              [{:mbql/series          0
                                :mbql/ref {:mbql.clause/operator :coalesce
                                           :mbql.clause/argument
                                           [{:mbql/series 0
                                             :mbql/ref    {:metadata.field/id (meta/id :orders :discount)}}
                                            {:mbql/series 1
                                             :mbql/lit    0}]}}
                               {:mbql/series 1, :mbql/ref {:metadata.field/id (meta/id :orders :subtotal)}}]}
            exprs            [exp-taxes-25p exp-tax-rate exp-discount]]
        (testing "undefined order with direct DB access - =? hides the details"
          (doseq [shuffled (take 5 (iterate shuffle exprs))]
            (is (=? {:mbql.query/stage {:mbql.stage/expression shuffled}}
                    query))))
        (testing "ld/expressions does sort the output"
          (is (=? exprs (ld/expressions query -1))))))))

(deftest ^:parallel breakouts-test
  (testing "breakouts"
    (testing "individually"
      (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                      (ld/aggregate -1 (ld/agg-count))
                      ;; TODO: This is an implicit join! I shouldn't be able to add this directly, since there might
                      ;; be multiple FKs pointing at the same table.
                      (ld/breakout -1 [:metadata.field/id (meta/id :products :category)]))
            brk   {:mbql.breakout/origin {:metadata.field/id (meta/id :products :category)}
                   :mbql/series          0}]
        (is (=? {:mbql.query/stage {:mbql.stage/breakout [brk]}}
                query))
        (is (=? [brk]
                (ld/breakouts query -1)))))
    (testing "multiple breakouts"
      (let [query        (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                             (ld/aggregate -1 (ld/agg-count))
                             ;; TODO: This is an implicit join as well!
                             (ld/breakout -1 [:metadata.field/id (meta/id :products :category)])
                             (ld/breakout -1 (ld/with-temporal-bucketing
                                               [:metadata.field/id (meta/id :orders :created-at)]
                                               :month)))
            brk-category {:mbql.breakout/origin        {:metadata.field/id (meta/id :products :category)}
                          :mbql/series                 0}
            brk-month    {:mbql.breakout/origin        {:metadata.field/id (meta/id :orders :created-at)}
                          :mbql.breakout/temporal-unit :month
                          :mbql/series                 1}
            brks         [brk-category brk-month]]
        (testing "undefined order with direct DB access - =? hides the details"
          (doseq [shuffled (take 5 (iterate shuffle brks))]
            (is (=? {:mbql.query/stage {:mbql.stage/breakout shuffled}}
                    query))))
        (testing "ld/breakouts does sort the output"
          (is (=? brks (ld/breakouts query -1))))))))

(defn- expected-fields [table-key]
  (->> (for [field-key (meta/fields table-key)
             :let [field (meta/field-metadata table-key field-key)]]
         {:metadata.field/id      (:id field)
          :metadata.column/name   (:name field)
          :metadata.column/source {:metadata.table/id (:table-id field)}
          :mbql/series            (:position field)})
       (sort-by :mbql/series)))

(defn- expected-join-fields [the-join table-key]
  (->> (for [field-key (meta/fields table-key)
             :let [field  (meta/field-metadata table-key field-key)]]
         {:metadata.column/source the-join
          :metadata.column/name   (:name field)
          :metadata.column/mirror {:metadata.field/id (:id field)}
          :mbql/series            (:position field)})
       (sort-by :mbql/series)))

(deftest ^:parallel returned-columns-test
  (testing "just tables"
    (doseq [table (meta/tables)]
      (is (=? (expected-fields table)
              (-> (ld/query meta/metadata-provider (meta/table-metadata table))
                  (ld/returned-columns -1))))))
  (testing "with expressions"
    (let [expr-query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                         (ld/expression -1 "tax_rate"
                                        (ld/expr (keyword "/")
                                                 [:metadata.field/id (meta/id :orders :tax)]
                                                 [:metadata.field/id (meta/id :orders :subtotal)]))
                         (ld/expression -1 "discount_ratio"
                                        (ld/expr (keyword "/")
                                                 (ld/expr :coalesce
                                                          [:metadata.field/id (meta/id :orders :discount)]
                                                          0)
                                                 [:metadata.field/id (meta/id :orders :subtotal)])))]
      (is (=? (concat (expected-fields :orders)
                      [{:mbql.expression/name "tax_rate"}
                       {:mbql.expression/name "discount_ratio"}])
              (ld/returned-columns expr-query -1)))))
  (testing "with aggregations"
    (let [agg-query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                        (ld/aggregate -1 (ld/agg-count))
                        (ld/aggregate -1 (ld/agg-sum [:metadata.field/id (meta/id :orders :subtotal)]))
                        (ld/aggregate -1 (ld/agg-sum-where
                                           [:metadata.field/id (meta/id :orders :discount)]
                                           (ld/expr :not-null [:metadata.field/id (meta/id :orders :discount)]))))]
      (is (=? [{:mbql.aggregation/operator :count}
               {:mbql.aggregation/operator :sum}
               {:mbql.aggregation/operator :sum-where}]
              (ld/returned-columns agg-query -1)))
      (testing "and breakouts"
        ;; Breakouts come before aggregations
        (is (=? [{:mbql.breakout/origin        {:metadata.field/id (meta/id :orders :created-at)}
                  :mbql.breakout/temporal-unit :month}
                 {:mbql.aggregation/operator :count}
                 {:mbql.aggregation/operator :sum}
                 {:mbql.aggregation/operator :sum-where}]
                (-> agg-query
                    (ld/breakout -1 (ld/with-temporal-bucketing
                                      [:metadata.field/id (meta/id :orders :created-at)]
                                      :month))
                    (ld/returned-columns -1)))))))
  (testing "just breakouts work like 'aggregation mode'"
    ;; TODO: Breakouts are not columns per se, so they don't have sources. Is that the model we want?
    (is (=? [{:mbql.breakout/origin        {:metadata.field/id (meta/id :orders :created-at)}
              :mbql.breakout/temporal-unit :month}]
            (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                (ld/breakout -1 (ld/with-temporal-bucketing
                                  [:metadata.field/id (meta/id :orders :created-at)]
                                  :month))
                (ld/returned-columns -1))))))

(defn- main-group [table-key]
  {:lib/type                              :metadata/column-group
   :metabase.lib.column-group/group-type  :group-type/main
   :metabase.lib.column-group/columns     (expected-fields table-key)
   #_(->> (for [field-key (meta/fields table-key)
              :let [field (meta/field-metadata table-key field-key)]]
          {:metadata.column/source {:metadata.table/id      (meta/id table-key)}
           :metadata.column/name   (:name field)
           :metadata.field/id      (:id field)
           :mbql/series            (:position field)})
        (sort-by :mbql/series))})

(defn- join-group [the-join table-key]
  {:lib/type                             :metadata/column-group
   :metabase.lib.column-group/group-type :group-type/join.explicit
   :metabase.lib.column-group/columns    (expected-join-fields the-join table-key)})

(defn- entity->implicit-join-group [table-key fk-entity]
  {:lib/type                              :metadata/column-group
   :metabase.lib.column-group/group-type  :group-type/join.implicit
   :metabase.lib.column-group/foreign-key fk-entity
   :metabase.lib.column-group/columns
   (->> (for [base-col (expected-fields table-key)]
          {:metadata.column/source {:mbql.join.implicit/fk-column fk-entity}
           :metadata.column/mirror base-col
           :mbql/series            (:mbql/series base-col)})
        (sort-by :mbql/series))})

(defn- metadata->implicit-join-group [fk-field]
  (when-let [target-id (:fk-target-field-id fk-field)]
    (let [foreign-pk    (lib.metadata/field meta/metadata-provider target-id)
          foreign-table (lib.metadata/table meta/metadata-provider (:table-id foreign-pk))
          fk-column     {:metadata.field/id (:id fk-field)}]
      {:lib/type                              :metadata/column-group
       :metabase.lib.column-group/group-type  :group-type/join.implicit
       :metabase.lib.column-group/foreign-key fk-column
       :metabase.lib.column-group/columns
       (->> (for [field (lib.metadata/fields meta/metadata-provider (:id foreign-table))]
              {:metadata.column/source {:mbql.join.implicit/fk-column fk-column}
               :metadata.column/mirror {:metadata.field/id      (:id field)
                                        :metadata.column/name   (:name field)
                                        :metadata.column/source {:metadata.table/id (:table-id field)}}
               :mbql/series            (:position field)})
            (sort-by :mbql/series))})))

(defn- implicit-join-group
  ([fk-field]
   (metadata->implicit-join-group fk-field))
  ([table-key field-key-or-entity]
   (if (keyword? field-key-or-entity)
     (metadata->implicit-join-group (meta/field-metadata table-key field-key-or-entity))
     (entity->implicit-join-group table-key field-key-or-entity))))

(deftest ^:parallel visible-column-groups-test
  (testing "just tables"
    (doseq [table (meta/tables)
            :let []]
      (is (=? (->> (meta/fields table)
                   (map #(meta/field-metadata table %))
                   (sort-by :position)
                   (keep implicit-join-group)
                   (into [{:lib/type                             :metadata/column-group
                           :metabase.lib.column-group/group-type :group-type/main
                           :metabase.lib.column-group/columns    (expected-fields table)}]))
              (-> (ld/query meta/metadata-provider (meta/table-metadata table))
                  (ld/visible-column-groups -1))))))
  (testing "with expressions"
    (let [expr-query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                         (ld/expression -1 "tax_rate"
                                        (ld/expr (keyword "/")
                                                 [:metadata.field/id (meta/id :orders :tax)]
                                                 [:metadata.field/id (meta/id :orders :subtotal)]))
                         (ld/expression -1 "discount_ratio"
                                        (ld/expr (keyword "/")
                                                 (ld/expr :coalesce
                                                          [:metadata.field/id (meta/id :orders :discount)]
                                                          0)
                                                 [:metadata.field/id (meta/id :orders :subtotal)])))]
      (is (=? [{:lib/type                             :metadata/column-group
                :metabase.lib.column-group/group-type :group-type/main
                :metabase.lib.column-group/columns
                (concat (expected-fields :orders)
                        [{:mbql.expression/name "tax_rate"}
                         {:mbql.expression/name "discount_ratio"}])}
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)]
              (ld/visible-column-groups expr-query -1)))
      (testing "and breakouts - does not include the breakouts"
        (is (=? [{:lib/type                             :metadata/column-group
                  :metabase.lib.column-group/group-type :group-type/main
                  :metabase.lib.column-group/columns
                  (concat (expected-fields :orders)
                          [{:mbql.expression/name        "tax_rate"}
                           {:mbql.expression/name        "discount_ratio"}])}
                 (implicit-join-group :orders :user-id)
                 (implicit-join-group :orders :product-id)]
                (-> (ld/breakout expr-query -1 (ld/with-temporal-bucketing
                                                 [:metadata.field/id (meta/id :orders :created-at)]
                                                 :month))
                    (ld/visible-column-groups -1)))))))
  (testing "ignores aggregations"
    (let [agg-query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                        (ld/aggregate -1 (ld/agg-count))
                        (ld/aggregate -1 (ld/agg-sum [:metadata.field/id (meta/id :orders :subtotal)]))
                        (ld/aggregate -1 (ld/agg-sum-where
                                           [:metadata.field/id (meta/id :orders :discount)]
                                           (ld/expr :not-null [:metadata.field/id (meta/id :orders :discount)]))))]
      (is (=? [{:lib/type                             :metadata/column-group
                :metabase.lib.column-group/group-type :group-type/main
                :metabase.lib.column-group/columns
                (expected-fields :orders)}
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)]
              (ld/visible-column-groups agg-query -1)))
      (testing "and breakouts"
        (is (=? [{:lib/type                             :metadata/column-group
                  :metabase.lib.column-group/group-type :group-type/main
                  :metabase.lib.column-group/columns
                  (expected-fields :orders)}
                 (implicit-join-group :orders :user-id)
                 (implicit-join-group :orders :product-id)]
                (-> agg-query
                    (ld/breakout -1 (ld/with-temporal-bucketing
                                      [:metadata.field/id (meta/id :orders :created-at)]
                                      :month))
                    (ld/visible-column-groups -1))))))))

(deftest ^:parallel explicit-joins-test
  (testing "straightforward FK->PK join"
    (let [query    (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                       (ld/join -1 (meta/table-metadata :products)
                                [(ld/expr :=
                                          [:metadata.field/id (meta/id :orders :product-id)]
                                          [:metadata.field/id (meta/id :products :id)])]))
          the-join (-> query :mbql.query/stage :mbql.stage/join first)]
      (testing "has :mbql.join/source to the Products table"
        (is (=? {:metadata.table/id (meta/id :products)}
                (:mbql.join/source the-join))))
      (testing "has :mbql.join/conditions included"
        (is (=? [{:mbql.clause/operator :=
                  :mbql/series          0
                  :mbql.clause/argument
                  [{:mbql/series 0, :mbql/ref {:metadata.field/id      (meta/id :orders :product-id)}}
                   {:mbql/series 1, :mbql/ref {:metadata.column/source the-join
                                               :metadata.column/name   "ID"
                                               :metadata.column/mirror {:metadata.field/id (meta/id :products :id)}}}]}]
                (:mbql.join/condition the-join))))
      (testing "has :mbql/series 0"
        (is (=? 0 (:mbql/series the-join))))

      (testing "output columns"
        (testing "work directly"
          (is (=? (expected-join-fields the-join :products)
                  (ld/returned-columns-method the-join))))
        (testing "are included in the stage's"
          (testing "returned-columns"
            (is (=? (concat (expected-fields :orders)
                            (expected-join-fields the-join :products))
                    (ld/returned-columns query -1))))
          (testing "visible-column-groups"
            (is (=? [{:lib/type                              :metadata/column-group
                      :metabase.lib.column-group/group-type  :group-type/main
                      :metabase.lib.column-group/columns     (expected-fields :orders)}
                     {:lib/type                              :metadata/column-group
                      :metabase.lib.column-group/group-type  :group-type/join.explicit
                      :metabase.lib.column-group/columns     (expected-join-fields the-join :products)}
                     {:lib/type                              :metadata/column-group
                      :metabase.lib.column-group/group-type  :group-type/join.implicit
                      :metabase.lib.column-group/foreign-key {:metadata.field/id (meta/id :orders :user-id)}
                      :metabase.lib.column-group/columns     sequential?}
                     {:lib/type                              :metadata/column-group
                      :metabase.lib.column-group/group-type  :group-type/join.implicit
                      :metabase.lib.column-group/foreign-key {:metadata.field/id (meta/id :orders :product-id)}
                      :metabase.lib.column-group/columns     sequential?}]
                    (ld/visible-column-groups query -1)))))))))

(deftest ^:parallel explicit-joins-test-forked-joins
  (testing "central table joined to two others"
    (let [;; Orders joined to Products on PRODUCT_ID, and to Reviews on Orders.USER_ID
          query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                    (ld/join -1 [:metadata.table/id (meta/id :products)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :product-id)]
                                       [:metadata.field/id (meta/id :products :id)])])
                    ;; Joining reviews on Orders.PRODUCT_ID
                    (ld/join -1 [:metadata.table/id (meta/id :reviews)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :product-id)]
                                       [:metadata.field/id (meta/id :reviews :product-id)])]))
          [products-join
           reviews-join] (ld/joins query -1)
          product-id     (->> reviews-join
                              :metadata.column/_source
                              (m/find-first #(= (:metadata.column/name %) "PRODUCT_ID")))]
      (is (=? (concat (expected-fields :orders)
                      (expected-join-fields products-join :products)
                      (expected-join-fields reviews-join :reviews))
              (ld/returned-columns query -1)))
      (is (=? [(main-group :orders)
               (join-group products-join :products)
               (join-group reviews-join  :reviews)
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)
               ;; Implicit join through an explicitly joined column (Reviews.PRODUCT_ID).
               (implicit-join-group :products product-id)]
              (ld/visible-column-groups query -1))))))

(deftest ^:parallel explicit-joins-test-chained-joins
  (testing "People -> Orders -> Products"
    (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :people))
                    ;; Joining to Orders on Orders.USER_ID
                    (ld/join -1 [:metadata.table/id (meta/id :orders)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :people :id)]
                                       [:metadata.field/id (meta/id :orders :user-id)])])
                    ;; Joining to Products on Orders.PRODUCT_ID
                    (as-> #_query $q
                      (ld/join $q -1 [:metadata.table/id (meta/id :products)]
                               [(ld/expr :=
                                         (ld/stage> $q :mbql.stage/join 0 :mbql.join/column "PRODUCT_ID")
                                         [:metadata.field/id (meta/id :reviews :product-id)])])))
          [orders-join
           products-join] (ld/joins query -1)]
      (is (=? (concat (expected-fields :people)
                      (expected-join-fields orders-join :orders)
                      (expected-join-fields products-join :products))
              (ld/returned-columns query -1)))
      (is (=? [(main-group :people)
               (join-group orders-join :orders)
               (join-group products-join :products)
               (implicit-join-group :people   (ld/in> orders-join :mbql.join/column "USER_ID"))
               (implicit-join-group :products (ld/in> orders-join :mbql.join/column "PRODUCT_ID"))]
              (ld/visible-column-groups query -1))))))

(deftest ^:parallel explicit-joins-test-joining-source-again
  (testing "Orders -> Orders on PK"
    (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                    (ld/join -1 [:metadata.table/id (meta/id :orders)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :id)]
                                       [:metadata.field/id (meta/id :orders :id)])]))
          [orders-join]   (ld/joins query -1)]
      (is (=? (concat (expected-fields :orders)
                      (expected-join-fields orders-join :orders))
              (ld/returned-columns query -1)))
      (is (=? [(main-group :orders)
               (join-group orders-join :orders)
               ;; From the source table
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)
               ;; From the explicitly joined table
               (implicit-join-group :people   (ld/stage> query :mbql.stage/join 0 :mbql.join/column "USER_ID"))
               (implicit-join-group :products (ld/stage> query :mbql.stage/join 0 :mbql.join/column "PRODUCT_ID"))]
              (ld/visible-column-groups query -1)))
      (is (=? {:mbql.clause/operator :=
               :mbql.clause/argument [{:mbql/series 0
                                       :mbql/ref    {:metadata.field/id (meta/id :orders :id)}}
                                      {:mbql/series 1
                                       :mbql/ref
                                       {:metadata.column/source orders-join
                                        :metadata.column/mirror {:metadata.field/id (meta/id :orders :id)}}}]}
              (-> query (ld/joins -1) first :mbql.join/condition first))))))

(deftest ^:parallel explicit-joins-test-double-join
  (testing "Orders -> Products *twice*"
    (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                    (ld/join -1 [:metadata.table/id (meta/id :products)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :product-id)]
                                       [:metadata.field/id (meta/id :products :id)])])
                    (ld/join -1 [:metadata.table/id (meta/id :products)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :product-id)]
                                       [:metadata.field/id (meta/id :products :id)])]))
          [j1 j2] (ld/joins query -1)]
      (is (=? (concat (expected-fields :orders)
                      (expected-join-fields j1 :products)
                      (expected-join-fields j2 :products))
              (ld/returned-columns query -1)))
      (is (=? [(main-group :orders)
               (join-group j1 :products)
               (join-group j2 :products)
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)]
              (ld/visible-column-groups query -1)))
      (doseq [join-clause [j1 j2]]
        (is (=? {:mbql.clause/operator :=
                 :mbql.clause/argument [{:mbql/series 0
                                         :mbql/ref    {:metadata.field/id (meta/id :orders :product-id)}}
                                        {:mbql/series 1
                                         :mbql/ref
                                         {:metadata.column/source join-clause
                                          :metadata.column/mirror {:metadata.field/id (meta/id :products :id)}}}]}
                (-> join-clause :mbql.join/condition first)))))))

(defn- joining [query source-table source-field join-table join-field]
  (ld/join query -1
           [:metadata.table/id (meta/id join-table)]
           [(ld/expr :=
                     [:metadata.field/id (meta/id source-table source-field)]
                     [:metadata.field/id (meta/id join-table join-field)])]))

(deftest ^:parallel explicit-joins-test-indirect-double-join
  (testing "Orders -> Products -> Orders -> People -> People again"
    (let [query (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                    (ld/join -1 ; Orders -> Products
                             [:metadata.table/id (meta/id :products)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :product-id)]
                                       [:metadata.field/id (meta/id :products :id)])])
                    (as-> $q
                      (ld/join $q -1 ; Products -> Orders
                               [:metadata.table/id (meta/id :orders)]
                               [(ld/expr :=
                                         (ld/stage> $q :mbql.stage/join 0 :mbql.join/column "ID")
                                         [:metadata.field/id (meta/id :orders :product-id)])]))
                    (ld/join -1 ; Orders (source) -> People
                             [:metadata.table/id (meta/id :people)]
                             [(ld/expr :=
                                       [:metadata.field/id (meta/id :orders :user-id)]
                                       [:metadata.field/id (meta/id :people :id)])])
                    (as-> $q
                      (ld/join $q -1 ; Orders (joined) -> People
                               [:metadata.table/id (meta/id :people)]
                               [(ld/expr :=
                                         (ld/stage> $q :mbql.stage/join 1 :mbql.join/column "USER_ID")
                                         [:metadata.field/id (meta/id :people :id)])])))
          [products-join
           orders-join
           people-join1
           people-join2] (ld/joins query -1)]
      (is (=? (concat (expected-fields :orders)
                      (expected-join-fields products-join :products)
                      (expected-join-fields orders-join   :orders)
                      (expected-join-fields people-join1  :people)
                      (expected-join-fields people-join2  :people))
              (ld/returned-columns query -1)))
      (is (=? [(main-group :orders)
               (join-group products-join :products)
               (join-group orders-join   :orders)
               (join-group people-join1  :people)
               (join-group people-join2  :people)
               ;; Source Orders
               (implicit-join-group :orders :user-id)
               (implicit-join-group :orders :product-id)
               ;; Joined Orders
               (implicit-join-group :people   (ld/in> orders-join :mbql.join/column "USER_ID"))
               (implicit-join-group :products (ld/in> orders-join :mbql.join/column "PRODUCT_ID"))]
              (ld/visible-column-groups query -1)))
      (testing "first join: Orders.PRODUCT_ID to Products.ID"
        (is (=? {:mbql.clause/operator :=
                 :mbql.clause/argument [{:mbql/series 0
                                         :mbql/ref    {:metadata.field/id (meta/id :orders :product-id)}}
                                        {:mbql/series 1
                                         :mbql/ref
                                         {:metadata.column/source products-join
                                          :metadata.column/mirror
                                          {:metadata.field/id (meta/id :products :id)}}}]}
                (-> products-join :mbql.join/condition first))))
      (testing "second join: Products.ID back to Orders.PRODUCT_ID"
        (is (=? {:mbql.clause/operator :=
                 :mbql.clause/argument [{:mbql/series 0
                                         :mbql/ref
                                         {:metadata.column/source some? #_products-join
                                          :metadata.column/mirror
                                          {:metadata.field/id (meta/id :products :id)}}}
                                        {:mbql/series 1
                                         :mbql/ref
                                         {:metadata.column/source some? #_orders-join
                                          :metadata.column/mirror
                                          {:metadata.field/id (meta/id :orders :product-id)}}}]}
                (-> orders-join :mbql.join/condition first))))
      (testing "third join: Orders.USER_ID from the source table to People.ID"
        (is (=? {:mbql.join/source {:metadata.table/id (meta/id :people)}
                 :mbql.join/condition
                 [{:mbql.clause/operator :=
                   :mbql.clause/argument [{:mbql/series 0
                                           :mbql/ref    {:metadata.field/id (meta/id :orders :user-id)}}
                                          {:mbql/series 1
                                           :mbql/ref
                                           {:metadata.column/source people-join1
                                            :metadata.column/mirror
                                            {:metadata.field/id (meta/id :people :id)}}}]}]}
                people-join1)))
      (testing "fourth join: Orders.USER_ID from joined to People.ID"
        (is (=? {:mbql.join/source {:metadata.table/id (meta/id :people)}
                 :mbql.join/condition
                 [{:mbql.clause/operator :=
                   :mbql.clause/argument [{:mbql/series 0
                                           :mbql/ref
                                           {:metadata.column/source orders-join
                                            :metadata.column/mirror
                                            {:metadata.field/id (meta/id :orders :user-id)}}}
                                          {:mbql/series 1
                                           :mbql/ref
                                           {:metadata.column/source people-join2
                                            :metadata.column/mirror
                                            {:metadata.field/id (meta/id :people :id)}}}]}]}
                people-join2))))))

(deftest ^:parallel multi-stage-test
  (testing "multi-stage query"
    (let [query       (-> (ld/query meta/metadata-provider (meta/table-metadata :orders))
                          (ld/aggregate -1 (ld/agg-count))
                          (ld/breakout -1 (ld/with-temporal-bucketing
                                            [:metadata.field/id (meta/id :orders :created-at)]
                                            :month))
                          ld/append-stage)
          stage0      (:mbql.query/stage0 query)
          stage0-cols [{:metadata.column/source stage0
                        :metadata.column/mirror (-> stage0 :mbql.stage/breakout first)
                        :metadata.column/name   "CREATED_AT"}
                       {:metadata.column/source stage0
                        :metadata.column/mirror (-> stage0 :mbql.stage/aggregation first)
                        :metadata.column/name   "count"}]]
      (testing "stage 0 returned-columns have the stage as their source"
        (is (=? stage0-cols
                (ld/returned-columns query 0))))
      (testing "stage 1 visible-columns has those columns"
        (is (=? [{:lib/type                             :metadata/column-group
                  :metabase.lib.column-group/group-type :group-type/main
                  :metabase.lib.column-group/columns    stage0-cols}]
                (ld/visible-column-groups query -1))))

      (testing "pieces in latter stage"
        (let [[created-at
               count-col] (->> query :mbql.query/stage0 :mbql.stage/returned (sort-by :mbql/series))
              filtered    (ld/filter query -1 (ld/expr :> count-col 100))]
          (is (=? {:mbql.query/stage
                   {:mbql.stage/filter
                    [{:mbql.clause/operator :>
                      :mbql.clause/argument [{:mbql/series 0
                                              :mbql/ref    (->> filtered
                                                                :mbql.query/stage0
                                                                :mbql.stage/returned
                                                                (sort-by :mbql/series)
                                                                last)}
                                             {:mbql/series 1, :mbql/lit 100}]
                      :mbql/series          0}]}}
                  filtered)))))))

;; TODO: Test multiple stages and add a bunch more gnarly double-join cases. Really need to stress-test that column
;; model.

;; TODO: Test implicit joins are correctly captured in visible columns - they either need to be reified in the DB or
;; dynamically wrapped in the visible-columns.
