(ns metabase-enterprise.dependencies.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defn- only-missing-column-errors
  "Filters an error map to only include :missing-column type errors.
  SQLGlot and Macaw produce different :missing-table-alias errors,
  but only :missing-column errors are used in production."
  [errors]
  (-> errors
      (update :card (fn [m]
                      (into {}
                            (keep (fn [[k v]]
                                    (let [filtered (into #{} (filter #(= (:type %) :missing-column) v))]
                                      (when (seq filtered)
                                        [k filtered]))))
                            m)))
      (update :transform (fn [m]
                           (into {}
                                 (keep (fn [[k v]]
                                         (let [filtered (into #{} (filter #(= (:type %) :missing-column) v))]
                                           (when (seq filtered)
                                             [k filtered]))))
                                 m)))))

(defn- testbed
  "A `MetadataProvider` with a chain of MBQL cards and transforms for testing."
  []
  (let [mp            (deps.tu/default-metadata-provider)
        query1        (-> (lib/query mp (meta/table-metadata :orders))
                          (lib/expression "Tax Rate" (lib// (meta/field-metadata :orders :tax)
                                                            (meta/field-metadata :orders :subtotal))))
        mp            (lib.tu/metadata-provider-with-card-from-query mp 101 query1)
        card1         (lib.metadata/card mp 101)
        card1-query   (lib/query mp card1)
        card1-cols    (lib/returned-columns card1-query)
        tax-rate      (m/find-first #(= (:lib/desired-column-alias %) "Tax Rate") card1-cols)
        query2        (-> card1-query
                          (lib/filter (lib/> tax-rate 0.06)))
        mp            (lib.tu/metadata-provider-with-card-from-query mp 102 query2)

        ;; A transform that depends on card1
        tf1-query     (lib/query mp card1)
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
        mp            (lib.tu/mock-metadata-provider mp {:tables     [tf1-output]
                                                         :fields     tf1-cols
                                                         :transforms [transform1]})

        ;; An MBQL card that consumes the output table of transform1.
        ;; References some fields but does not change the output columns.
        tf1-consumer  (-> (lib/query mp (lib.metadata/table mp 1234567))
                          (lib/filter (lib/= (m/find-first #(= (:name %) "Tax Rate") tf1-cols)
                                             101)))
        mp            (lib.tu/metadata-provider-with-card-from-query mp 301 tf1-consumer)

        ;; SQL cards and snippets
        ;; Card 7 from [[deps.tu/default-metadata-provider]] uses the "outer" snippet (2).
        ;; This adds a SQL transform that consumes card 7, and a card that selects from that transform.
        tf2-query     (lib/native-query mp "SELECT * FROM {{#7}}")
        transform2    {:id      31
                       :name    "SQL transform"
                       :source {:query (lib/->legacy-MBQL tf2-query)}
                       :target {:schema "Transformed"
                                :name   "output_tf31"}}
        tf2-output    (-> (meta/table-metadata :orders)
                          (assoc :id           1234568
                                 :schema       "Transformed"
                                 :name         "output_tf31"
                                 :display-name "Transform 31 Output"))
        ;; Output columns for transform2 are derived from card 7. That's "SELECT * FROM {{snippet: outer}}";
        ;; the outer snippet references {{snippet: inner}}; the inner snippet is {{#card-ref}} to card 1;
        ;; card 1 is a basic MBQL query of products.
        card7         (-> (lib.metadata/card mp 7)
                          (assoc :result-metadata (:result-metadata (:products/native (lib.tu/mock-cards)))))
        mp            (lib.tu/mock-metadata-provider mp {:cards [card7]})
        tf2-cols      (->> card7
                           (lib/query mp)
                           lib/returned-columns
                           (map-indexed (fn [i col]
                                          (assoc col
                                                 :id         (+ 123456800 i)
                                                 :table-id   1234568
                                                 :lib/source :source/table-defaults))))
        mp            (lib.tu/mock-metadata-provider mp {:tables     [tf2-output]
                                                         :fields     tf2-cols
                                                         :transforms [transform2]})

        ;; MBQL card consuming tf2-output.
        query3        (-> (lib/query mp tf2-output)
                          (lib/filter (lib/< (m/find-first #(= (:name %) "RATING") tf2-cols)
                                             3)))
        ;; SQL card consuming tf2-output.
        query4        (lib/native-query mp "SELECT * FROM Transformed.output_tf31")
        mp            (-> mp
                          (lib.tu/metadata-provider-with-card-from-query 303 query3)
                          (lib.tu/metadata-provider-with-card-from-query 304 query4))]
    {:provider                mp
     ;; NOTE: This is a *downstream* graph! So it's a map of keys to those entities which depend on them.
     :graph                   (graph/in-memory {[:card 101]      #{[:card 102]
                                                                   [:transform 30]}
                                                [:transform 30]  #{[:table 1234567]}
                                                [:table 1234567] #{[:card 301]}

                                                [:snippet 1]     #{[:snippet   2]}
                                                [:snippet 2]     #{[:card      7]}
                                                [:card 7]        #{[:transform 31]}
                                                [:transform 31]  #{[:table     1234568]}
                                                [:table 1234568] #{[:card      303]
                                                                   [:card      304]}})
     :mbql-base                   card1
     :mbql-dependent              (lib.metadata/card mp 102)
     :mbql-transform              transform1
     :mbql-transform-output       tf1-output
     :mbql-transform-cols         (m/index-by :name tf1-cols)
     :mbql-transform-consumer     (lib.metadata/card mp 301)

     :snippet-inner               (lib.metadata/native-query-snippet mp 1)
     :snippet-outer               (lib.metadata/native-query-snippet mp 2)
     :sql-base                    (lib.metadata/card mp 7)
     :sql-transform               transform2
     :sql-transform-output        tf2-output
     :sql-transform-mbql-consumer (lib.metadata/card mp 303)
     :sql-transform-sql-consumer  (lib.metadata/card mp 304)}))

(comment
  *e
  (:mbql-dependent (testbed))
  (:mbql-transform-consumer (testbed)))

(deftest ^:parallel basic-mbql-card-test
  (testing "when changing an MBQL card with dependents"
    (let [{:keys [provider graph mbql-base]
           {downstream-card-id  :id} :mbql-dependent
           {transformed-card-id :id} :mbql-transform-consumer} (testbed)]
      (testing "a column that no longer exists will cause errors when referenced"
        (let [card'  (-> mbql-base
                         (assoc :dataset-query
                                (-> (lib/query provider (meta/table-metadata :orders))
                                    ;; ridiculous
                                    (lib/expression "Sales Taxes" (lib// (meta/field-metadata :orders :tax)
                                                                         (meta/field-metadata :orders :subtotal)))))
                         (dissoc :result-metadata))
              errors (dependencies/errors-from-proposed-edits {:card [card']}
                                                              :base-provider provider
                                                              :graph graph)]
          (is (=? {:card {downstream-card-id  #{{:type              :missing-column
                                                 :name              "Tax Rate"
                                                 :source-entity-type :card
                                                 :source-entity-id  101}}
                          transformed-card-id #{{:type              :missing-column
                                                 :name              "Tax Rate"
                                                 :source-entity-type :table
                                                 :source-entity-id  1234567}}}}
                  errors))
          (is (= [:card] (keys errors)))
          (is (= #{downstream-card-id transformed-card-id} (set (keys (:card errors)))))))
      (testing "changing something unrelated will cause no errors"
        (let [card' (-> mbql-base
                        (update :dataset-query lib/filter (lib/> (meta/field-metadata :orders :quantity)
                                                                 100))
                        (dissoc :result-metadata))]
          (is (= {} (dependencies/errors-from-proposed-edits {:card [card']}
                                                             :base-provider provider
                                                             :graph graph))))))))
(deftest ^:parallel sql-snippet->card->transform->cards-test
  (testing "changing a snippet correctly finds downstream errors when asked"
    (let [{:keys [provider graph sql-transform snippet-inner]
           {direct-sql-card-id       :id} :sql-base
           {transformed-sql-card-id  :id} :sql-transform-sql-consumer
           {transformed-mbql-card-id :id} :sql-transform-mbql-consumer} (testbed)]
      (testing "when breaking the inner snippet with a nonexistent table"
        (let [snippet' (assoc snippet-inner
                              :content       "nonexistent_table"
                              :template-tags {})
              errors   (dependencies/errors-from-proposed-edits {:snippet [snippet']}
                                                                :base-provider provider
                                                                :graph graph
                                                                :include-native? true)]
          (is (= #{:card :transform} (set (keys errors))))
          ;; That breaks (1) the SQL card which uses the snippets, (2) the transforms, (3) both the MBQL and (4) SQL
          ;; queries that consume the transform's table.
          ;; We only check :missing-column errors since SQLGlot and Macaw produce different
          ;; :missing-table-alias errors, and only :missing-column errors are used in production.
          (is (= {:card      {transformed-mbql-card-id #{{:type              :missing-column
                                                          :name              "RATING"
                                                          :source-entity-type :table
                                                          :source-entity-id  1234568}}}
                  :transform {}}
                 (only-missing-column-errors errors))))))))

(deftest ^:parallel sql-snippet-without-including-native-test
  (testing "changing a snippet correctly ignores downstream errors"
    (let [{:keys [provider graph snippet-inner]} (testbed)]
      (testing "when breaking the inner snippet with a nonexistent table"
        (let [snippet' (assoc snippet-inner
                              :content       "nonexistent_table"
                              :template-tags {})
              errors   (dependencies/errors-from-proposed-edits {:snippet [snippet']}
                                                                :base-provider provider
                                                                :graph graph)]
          ;; Because we are changing a snippet, don't check anything downstream
          (is (= {} errors)))))))
