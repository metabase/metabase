(ns metabase.lib.test-util.macros
  (:require
   [clojure.test :refer [testing]]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros.impl :as lib.tu.macros.impl]
   [metabase.test.data.mbql-query-impl :as mbql-query-impl]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- do-with-bindings [thunk]
  (binding [mbql-query-impl/*id-fn-symb*              'metabase.lib.test-metadata/id
            mbql-query-impl/*field-name-fn-symb*      `lib.tu.macros.impl/field-name
            mbql-query-impl/*field-base-type-fn-symb* `lib.tu.macros.impl/field-base-type]
    (thunk)))

(defmacro $ids
  "MLv2 version of [[metabase.test/$ids]] that uses the [[metabase.lib.test-metadata]] rather than the application
  database."
  {:style/indent :defn}
  ([form]
   `($ids nil ~form))

  ([table-name & body]
   (do-with-bindings #(mbql-query-impl/parse-tokens table-name `(do ~@body)))))

;;; TODO (Cam 6/13/25) -- rename this `mbql-4-query` or something so it's clear that it returns a legacy MBQL query and
;;; not MBQL 5
(defmacro mbql-query
  "MLv2 version of [[metabase.test/mbql-query]] that uses the [[metabase.lib.test-metadata]] rather than the application
  database."
  {:style/indent :defn}
  ([table-name]
   `(mbql-query ~table-name {}))

  ([table-name inner-query]
   {:pre [(map? inner-query)]}
   (do-with-bindings
    #(as-> inner-query <>
       (mbql-query-impl/parse-tokens table-name <>)
       (mbql-query-impl/maybe-add-source-table <> table-name)
       (mbql-query-impl/wrap-inner-query <>)))))

(mu/defn- maybe-add-source-table-mbql5 :- :map
  [query :- :map
   table-name]
  (cond
    ;; `table-name` is not specified: return query as is
    (not table-name)
    query

    ;; already has source table/card in the first stage: return query as is
    ((some-fn :source-table :source-card) (get-in query [:stages 0]))
    query

    ;; query is missing `:stages`: add empty vector and recur
    (not (:stages query))
    (recur (assoc query :stages [])
           table-name)

    ;; query is missing first stage: add empty first stage and recur
    (not (first (:stages query)))
    (recur (update query :stages #(conj (vec %) {:lib/type :mbql.stage/mbql}))
           table-name)

    ;; otherwise we're good to go. Add `(meta/id ...)` form for `:source-table` to the first stage
    :else
    (assoc-in query [:stages 0 :source-table] (list 'metabase.lib.test-metadata/id (keyword table-name)))))

(defmacro mbql-5-query
  "Like [[mbql-query]] but for use with MBQL 5 queries. Currently experimental, and maybe need bugfixes!"
  {:style/indent :defn}
  ([table-name]
   `(mbql-5-query ~table-name {}))

  ([table-name query]
   {:pre [(map? query)]}
   (do-with-bindings
    (fn []
      (binding [mbql-query-impl/*mbql-version* 5]
        (as-> query $query
          (mbql-query-impl/parse-tokens table-name $query)
          (u/assoc-default $query
                           :lib/type :mbql/query, :database '(metabase.lib.test-metadata/id))
          (maybe-add-source-table-mbql5 $query table-name)
          `(lib.query/query
            meta/metadata-provider
            ~$query)))))))

(defmacro with-testing-against-standard-queries
  "Tests against a number of named expressions that all produce the same columns through different methods."
  [sym & body]
  `(let [queries# [:query-with-implicit-joins
                   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/append-stage))
                   :query-with-explicit-table-joins
                   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join (meta/table-metadata :people))
                       (lib/join (meta/table-metadata :products))
                       (lib/append-stage))
                   :query-with-explicit-sub-query-joins
                   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :people))))
                       (lib/join (lib/join-clause (lib/query meta/metadata-provider (meta/table-metadata :products))))
                       (lib/append-stage))
                   :query-with-table-joins-from-cards
                   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                       (lib/join (lib/join-clause (lib.tu/query-with-stage-metadata-from-card
                                                   meta/metadata-provider
                                                   (:people (lib.tu/mock-cards)))
                                                  [(lib/= (meta/field-metadata :orders :user-id)
                                                          (meta/field-metadata :people :id))]))
                       (lib/join (lib/join-clause (lib.tu/query-with-stage-metadata-from-card
                                                   meta/metadata-provider
                                                   (:products (lib.tu/mock-cards)))
                                                  [(lib/= (meta/field-metadata :orders :product-id)
                                                          (meta/field-metadata :products :id))]))
                       (lib/append-stage))
                   :query-with-source-card-joins
                   (-> (lib/query (lib.tu/metadata-provider-with-mock-cards) (meta/table-metadata :orders))
                       (lib/join (lib/join-clause (:people (lib.tu/mock-cards))
                                                  [(lib/= (meta/field-metadata :orders :user-id)
                                                          (meta/field-metadata :people :id))]))
                       (lib/join (lib/join-clause (:products (lib.tu/mock-cards))
                                                  [(lib/= (meta/field-metadata :orders :product-id)
                                                          (meta/field-metadata :products :id))]))
                       (lib/append-stage))]]
     (testing "Against set of standard queries."
       (doseq [[idx# [query-name# q#]] (map-indexed vector (partition-all 2 queries#))
               :let [~(symbol sym) q#]]
         (testing (str query-name# " (" idx# ")")
           ~@body)))))
