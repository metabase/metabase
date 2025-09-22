(ns metabase-enterprise.dependencies.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defn- testbed
  "A `MetadataProvider` with a chain of MBQL cards and transforms for testing."
  []
  (let [query1        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                          (lib/expression "Tax Rate" (lib// (meta/field-metadata :orders :tax)
                                                            (meta/field-metadata :orders :subtotal))))
        mp1           (lib.tu/metadata-provider-with-card-from-query 1 query1)
        card1         (lib.metadata/card mp1 1)
        card1-query   (lib/query mp1 card1)
        card1-cols    (lib/returned-columns card1-query)
        tax-rate      (m/find-first #(= (:lib/desired-column-alias %) "Tax Rate") card1-cols)
        query2        (-> card1-query
                          (lib/filter (lib/> tax-rate 0.06)))
        base-mp       (lib.tu/metadata-provider-with-card-from-query mp1 2 query2)

        ;; A transform that depends on card1
        tf1-query     (-> (lib/query base-mp card1)
                          lib/->legacy-MBQL)
        transform1    {:id     30
                       :name   "MBQL Transform"
                       :source {:query tf1-query}
                       :target {:schema "Transformed"
                                :name   "output_tf30"}}
        tf1-output    (-> (meta/table-metadata :orders)
                          (assoc :id           1234567
                                 :schema       "Transformed"
                                 :name         "output_tf30"
                                 :display-name "Transform 30 Output"))
        tf1-cols      (map-indexed (fn [i col]
                                     (assoc col
                                            :id         (+ 123456700 i)
                                            :table-id   1234567
                                            :lib/source :source/table-defaults))
                                   card1-cols)
        tf1-mp        (lib.tu/mock-metadata-provider base-mp {:tables     [tf1-output]
                                                              :fields     tf1-cols
                                                              :transforms [transform1]})

        ;; An MBQL card that consumes the output table of transform1.
        ;; References some fields but does not change the output columns.
        tf1-consumer  (-> (lib/query tf1-mp (lib.metadata/table tf1-mp 1234567))
                          (lib/filter (lib/= (m/find-first #(= (:name %) "Tax Rate") tf1-cols)
                                             1)))
        mp            (lib.tu/metadata-provider-with-card-from-query tf1-mp 301 tf1-consumer)]
    {:provider                mp
     :graph                   (graph/in-memory {[:card 1]        #{[:card 2]
                                                                   [:transform 30]}
                                                [:transform 30]  #{[:table 1234567]}
                                                [:table 1234567] #{[:card 301]}})
     :mbql-base               card1
     :mbql-dependent          (lib.metadata/card mp 2)
     :mbql-transform          transform1
     :mbql-transform-output   tf1-output
     :mbql-transform-cols     (m/index-by :name tf1-cols)
     :mbql-transform-consumer tf1-consumer}))

(deftest ^:parallel basic-mbql-card-test
  (testing "when changing an MBQL card with dependents"
    (let [{:keys [provider graph mbql-base]
           {tax-rate "Tax Rate"} :mbql-transform-cols} (testbed)]
      (testing "a column that no longer exists will cause errors when referenced"
        (let [card'  (-> mbql-base
                         (update-in [:dataset-query :query :expressions]
                                    update-keys (constantly "Sales Taxes"))
                         (dissoc :result-metadata))
              errors (dependencies/errors-from-proposed-edits provider graph {:card [card']})]
          (is (=? {:card {2   [[:field {} "Tax Rate"]]
                          301 [[:field {} (:id tax-rate)]]}}
                  errors))
          (is (= [:card] (keys errors)))
          (is (= #{2 301} (set (keys (:card errors)))))))

      (testing "changing something unrelated will cause no errors"
        (let [card' (-> mbql-base
                        (assoc-in [:dataset-query :query :filter]
                                  [:> [:field (meta/id :orders :quantity) nil] 100])
                        (dissoc :result-metadata))]
          (is (= {} (dependencies/errors-from-proposed-edits provider graph {:card [card']}))))))))
