(ns metabase.typed-schemas.api.schema.question-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.test :as mt]
   [metabase.typed-schemas.api.schema.common :as schema.common]
   [metabase.typed-schemas.api.schema.question :as schema.question]))

(deftest question-schema-uses-card-source-discriminator-test
  (is (= {:type    "card"
          :key     "ordersQuestion"
          :id      41
          :name    "Orders question"
          :display "table"
          :columns [{:type "column", :name "count", :displayName "Count", :jsType "number"}]}
         (schema.question/question-schema
          {:id             41
           :name           "Orders question"
           :display        "table"
           :result-columns [{:name "count", :display_name "Count", :type :number}]}))))

(deftest question-schemas-bulk-loads-details-by-database-test
  (let [cards              [{:id 41 :name "Orders question" :type :question :database_id 1 :display "table"}
                            {:id 42 :name "People question" :type :question :database_id 1 :display "table"}]
        bulk-details-calls (atom [])
        report-details-calls (atom [])]
    (mt/with-dynamic-fn-redefs [entity-details/get-report-details
                                (fn [{:keys [report-id] :as options}]
                                  (swap! report-details-calls conj options)
                                  {:structured-output {:id report-id :result-columns []}})]
      (with-redefs [schema.common/select-schema-cards (constantly cards)
                    entity-details/cards-details (fn [card-type database-id selected-cards _options]
                                                   (swap! bulk-details-calls conj [card-type database-id selected-cards])
                                                   (map #(assoc % :fields []) selected-cards))]
        (is (= [41 42]
               (mapv :id (schema.question/question-schemas nil))))
        (is (= [[:question 1 cards]]
               @bulk-details-calls))
        (is (empty? @report-details-calls))))))
