(ns ^:mb/driver-tests metabase.transforms-inspector.lens-output-test
  "Tests for lens card output validation and trigger flow."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.transforms-inspector.core :as inspector.core]
   [metabase.transforms-inspector.lens.core :as lens.core]
   [metabase.transforms.util :as transforms.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Test context helpers --------------------------------------------------

(defn- collect-field-metadata
  "Collect field metadata from the database for a table."
  [table-id]
  (mapv (fn [field]
          (cond-> (select-keys field [:id :name :display_name :base_type :semantic_type])
            (:fingerprint field)
            (assoc :stats (not-empty
                           (merge (when-let [dc (get-in field [:fingerprint :global :distinct-count])]
                                    {:distinct_count dc})
                                  (when (some? (get-in field [:fingerprint :global :nil%]))
                                    {:nil_percent (get-in field [:fingerprint :global :nil%])}))))))
        (t2/select :model/Field :table_id table-id :active true)))

(defn- build-table-info
  "Build a table info map with fields from a real table."
  [table-id]
  (let [table  (t2/select-one :model/Table table-id)
        fields (collect-field-metadata table-id)]
    {:table_id     table-id
     :table_name   (:name table)
     :schema       (:schema table)
     :db_id        (:db_id table)
     :column_count (count fields)
     :fields       fields}))

(defn- preprocess-join-query
  "Preprocess a LEFT JOIN query between orders and products."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :products))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                               (-> (lib.metadata/field mp (mt/id :products :id))
                                   (lib/with-join-alias "Products")))])
                      (lib/with-join-alias "Products")
                      (lib/with-join-fields :all)))
        transforms.util/massage-sql-query
        qp.preprocess/preprocess)))

(defn- extract-join-structure
  "Extract join structure from a preprocessed query."
  [preprocessed]
  (when-let [joins (get-in preprocessed [:stages 0 :joins])]
    (mapv (fn [join]
            {:strategy     (or (:strategy join) :left-join)
             :alias        (:alias join)
             :source-table (get-in join [:stages 0 :source-table])
             :conditions   (:conditions join)})
          joins)))

(defn- build-joined-context
  "Build a test context using real test dataset tables with a LEFT JOIN.
   Uses products as a fake 'target' to avoid running a transform."
  []
  (let [orders-info   (build-table-info (mt/id :orders))
        products-info (build-table-info (mt/id :products))
        preprocessed  (preprocess-join-query)
        join-structure (extract-join-structure preprocessed)]
    {:transform           {}
     :source-type         :mbql
     :sources             [orders-info products-info]
     :target              products-info  ;; use products as fake target
     :db-id               (mt/id)
     :preprocessed-query  preprocessed
     :from-clause-sql     nil
     :has-joins?          true
     :join-structure      join-structure
     :visited-fields      {:join_fields #{(mt/id :orders :product_id) (mt/id :products :id)}
                           :filter_fields #{}
                           :group_by_fields #{}
                           :order_by_fields #{}
                           :all #{(mt/id :orders :product_id) (mt/id :products :id)}}
     :has-column-matches? true
     :column-matches      [{:output-column  (:name (t2/select-one :model/Field (mt/id :products :price)))
                            :output-field   {:name (:name (t2/select-one :model/Field (mt/id :products :price)))
                                             :id   (mt/id :products :price)
                                             :base_type :type/Float}
                            :input-columns  [{:source-table-id   (mt/id :orders)
                                              :source-table-name (:name (t2/select-one :model/Table (mt/id :orders)))
                                              :name              "TOTAL"
                                              :id                (mt/id :orders :total)}]}]}))

(defn- build-simple-context
  "Build a test context for a simple query (no joins) using orders table."
  []
  (let [orders-info  (build-table-info (mt/id :orders))
        mp           (mt/metadata-provider)
        preprocessed (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         transforms.util/massage-sql-query
                         qp.preprocess/preprocess)]
    {:transform           {}
     :source-type         :mbql
     :sources             [orders-info]
     :target              orders-info  ;; use same table as fake target
     :db-id               (mt/id)
     :preprocessed-query  preprocessed
     :from-clause-sql     nil
     :has-joins?          false
     :join-structure      nil
     :visited-fields      {:join_fields #{} :filter_fields #{} :group_by_fields #{} :order_by_fields #{} :all #{}}
     :has-column-matches? false
     :column-matches      nil}))

;;; -------------------------------------------------- Generic Summary --------------------------------------------------

(deftest generic-summary-cards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "generic-summary lens with simple query"
      (let [ctx  (build-simple-context)
            lens (lens.core/make-lens :generic-summary ctx nil)]
        (testing "has correct metadata"
          (is (= "generic-summary" (:id lens)))
          (is (= "Data Summary" (:display_name lens))))
        (testing "has row-counts section with comparison layout"
          (is (= 1 (count (:sections lens))))
          (is (= :comparison (:layout (first (:sections lens))))))
        (testing "cards are scalar display"
          (is (every? #(= :scalar (:display %)) (:cards lens))))
        (testing "has input and output cards"
          (is (some #(= :input (get-in % [:metadata :group_role])) (:cards lens)))
          (is (some #(= :output (get-in % [:metadata :group_role])) (:cards lens))))
        (testing "cards have dedup_key"
          (is (every? #(some? (get-in % [:metadata :dedup_key])) (:cards lens))))
        (testing "cards have valid dataset_query"
          (is (every? #(map? (:dataset_query %)) (:cards lens))))))
    (testing "generic-summary with joined query has source cards for each table"
      (let [ctx  (build-joined-context)
            lens (lens.core/make-lens :generic-summary ctx nil)]
        (testing "has input cards for both source tables"
          (let [input-cards (filter #(= :input (get-in % [:metadata :group_role])) (:cards lens))]
            (is (= 2 (count input-cards)))))))))

;;; -------------------------------------------------- Join Analysis --------------------------------------------------

(deftest join-analysis-cards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (let [ctx  (build-joined-context)
          lens (lens.core/make-lens :join-analysis ctx nil)]
      (testing "has correct metadata"
        (is (= "join-analysis" (:id lens)))
        (is (= "Join Analysis" (:display_name lens))))
      (testing "has join-stats section with flat layout"
        (is (= 1 (count (:sections lens))))
        (is (= :flat (:layout (first (:sections lens))))))
      (testing "has base-count card"
        (let [base (some #(when (= "base-count" (:id %)) %) (:cards lens))]
          (is (some? base))
          (is (= :scalar (:display base)))
          (is (= :base_count (get-in base [:metadata :card_type])))))
      (testing "has join-step card(s)"
        (let [step-cards (filter #(re-matches #"join-step-\d+" (:id %)) (:cards lens))]
          (is (= 1 (count step-cards)))
          (let [step (first step-cards)]
            (is (= :table (:display step)))
            (is (= :join_step (keyword (get-in step [:metadata :card_type]))))
            (is (= 1 (get-in step [:metadata :join_step])))
            (is (= "Products" (get-in step [:metadata :join_alias]))))))
      (testing "has table count card(s)"
        (let [table-cards (filter #(re-matches #"table-\d+-count" (:id %)) (:cards lens))]
          (is (= 1 (count table-cards)))
          (let [tc (first table-cards)]
            (is (= :scalar (:display tc)))
            (is (= :table_count (keyword (get-in tc [:metadata :card_type])))))))
      (testing "all cards have dataset_query"
        (is (every? #(map? (:dataset_query %)) (:cards lens))))
      (testing "summary includes join count"
        (is (some #(= "Joins" (:label %)) (get-in lens [:summary :highlights])))))))

(deftest join-analysis-triggers-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (let [ctx  (build-joined-context)
          lens (lens.core/make-lens :join-analysis ctx nil)]
      (testing "has alert triggers for outer join"
        (is (seq (:alert_triggers lens)))
        (let [alert (first (:alert_triggers lens))]
          (is (= :warning (:severity alert)))
          (is (= :high-null-rate (get-in alert [:condition :name])))
          (is (string? (get-in alert [:condition :card_id])))))
      (testing "has drill lens triggers for outer join"
        (is (seq (:drill_lens_triggers lens)))
        (let [drill (first (:drill_lens_triggers lens))]
          (is (= "unmatched-rows" (:lens_id drill)))
          (is (= :has-unmatched-rows (get-in drill [:condition :name])))
          (is (some? (:params drill)))))
      (testing "trigger card_id references an actual card"
        (let [card-ids (set (map :id (:cards lens)))
              alert-card-ids (map #(get-in % [:condition :card_id]) (:alert_triggers lens))
              drill-card-ids (map #(get-in % [:condition :card_id]) (:drill_lens_triggers lens))]
          (is (every? card-ids alert-card-ids))
          (is (every? card-ids drill-card-ids)))))))

;;; -------------------------------------------------- Column Comparison --------------------------------------------------

(deftest column-comparison-cards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (let [ctx  (build-joined-context)
          lens (lens.core/make-lens :column-comparison ctx nil)]
      (testing "has correct metadata"
        (is (= "column-comparison" (:id lens)))
        (is (= "Column Distributions" (:display_name lens))))
      (testing "has comparisons section with comparison layout"
        (is (= 1 (count (:sections lens))))
        (is (= :comparison (:layout (first (:sections lens))))))
      (testing "cards have group metadata for comparison"
        (is (every? #(some? (get-in % [:metadata :group_id])) (:cards lens)))
        (is (every? #(contains? #{:input :output} (get-in % [:metadata :group_role])) (:cards lens))))
      (testing "cards have valid display type"
        (is (every? #(contains? #{:bar :row :line :area :pie} (:display %)) (:cards lens))))
      (testing "cards have dataset_query"
        (is (every? #(map? (:dataset_query %)) (:cards lens))))
      (testing "summary has matched columns count"
        (is (some #(= "Matched Columns" (:label %))
                  (get-in lens [:summary :highlights])))))))

;;; -------------------------------------------------- Unmatched Rows --------------------------------------------------

(deftest unmatched-rows-cards-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (let [ctx  (build-joined-context)
          lens (lens.core/make-lens :unmatched-rows ctx nil)]
      (testing "has correct metadata"
        (is (= "unmatched-rows" (:id lens)))
        (is (= "Unmatched Rows" (:display_name lens))))
      (testing "has samples section with flat layout"
        (is (= 1 (count (:sections lens))))
        (is (= :flat (:layout (first (:sections lens))))))
      (testing "has truly-unmatched card(s)"
        (let [unmatched (filter #(re-matches #"truly-unmatched-\d+" (:id %)) (:cards lens))]
          (is (seq unmatched))
          (let [card (first unmatched)]
            (is (= :table (:display card)))
            (is (= :truly_unmatched (keyword (get-in card [:metadata :card_type]))))
            (is (some? (get-in card [:metadata :join_step])))
            (is (= :left-join (get-in card [:metadata :join_strategy]))))))
      (testing "has null-source-key card(s)"
        (let [null-key (filter #(re-matches #"null-source-key-\d+" (:id %)) (:cards lens))]
          (is (seq null-key))
          (let [card (first null-key)]
            (is (= :table (:display card)))
            (is (= :null_source_key (keyword (get-in card [:metadata :card_type])))))))
      (testing "cards have filter clauses in dataset_query"
        (doseq [card (:cards lens)]
          (is (seq (get-in card [:dataset_query :stages 0 :filters]))))))))

(deftest unmatched-rows-with-params-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "params filter to specific join step"
      (let [ctx  (build-joined-context)
            lens (lens.core/make-lens :unmatched-rows ctx {:join_step 1})]
        (testing "all cards are for join step 1"
          (is (every? #(= 1 (get-in % [:metadata :join_step])) (:cards lens))))
        (testing "card IDs include params suffix"
          (is (every? #(re-matches #".*@join_step=1" (:id %)) (:cards lens))))))))

;;; -------------------------------------------------- Trigger Evaluation Flow --------------------------------------------------

(deftest trigger-evaluation-flow-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "full flow: join-analysis triggers → evaluate → drill to unmatched-rows"
      (let [ctx  (build-joined-context)
            ja-lens (lens.core/make-lens :join-analysis ctx nil)
            ;; Get the card_id from the first drill lens trigger
            drill-trigger (first (:drill_lens_triggers ja-lens))
            step-card-id (get-in drill-trigger [:condition :card_id])]
        (testing "step 1: join-analysis produces triggers"
          (is (some? drill-trigger))
          (is (= "unmatched-rows" (:lens_id drill-trigger))))
        (testing "step 2: simulate high null rate card result"
          (let [card-results {step-card-id {"output_count"  100
                                            "matched_count" 70
                                            "null_count"    30
                                            "null_rate"     0.3}}
                eval-result (inspector.core/evaluate-triggers ja-lens card-results)]
            (testing "alerts fire for high null rate (>0.2)"
              (is (= 1 (count (:alerts eval-result)))))
            (testing "drill lens fires for unmatched rows (>0.05)"
              (is (= 1 (count (:drill_lenses eval-result))))
              (let [triggered-drill (first (:drill_lenses eval-result))]
                (is (= "unmatched-rows" (:lens_id triggered-drill)))
                (is (some? (:params triggered-drill)))
                (testing "step 3: drill lens is accessible with triggered params"
                  (let [ur-lens (lens.core/get-lens ctx "unmatched-rows"
                                                    (:params triggered-drill))]
                    (is (= "unmatched-rows" (:id ur-lens)))
                    (is (seq (:cards ur-lens)))))))))
        (testing "step 2b: low null rate does not trigger"
          (let [card-results {step-card-id {"output_count"  100
                                            "matched_count" 99
                                            "null_count"    1
                                            "null_rate"     0.01}}
                eval-result (inspector.core/evaluate-triggers ja-lens card-results)]
            (is (empty? (:alerts eval-result)))
            (is (empty? (:drill_lenses eval-result)))))))))

(deftest trigger-evaluation-no-data-test
  (testing "triggers don't fire when card results have no data"
    (let [lens {:alert_triggers       [{:id "a1"
                                        :condition {:name :high-null-rate :card_id "step-1"}
                                        :severity :warning
                                        :message "test"}]
                :drill_lens_triggers  [{:lens_id "unmatched-rows"
                                        :condition {:name :has-unmatched-rows :card_id "step-1"}
                                        :params {:join_step 1}
                                        :reason "test"}]}
          card-results {"step-1" {"no_data" true}}
          eval-result (inspector.core/evaluate-triggers lens card-results)]
      (is (empty? (:alerts eval-result)))
      (is (empty? (:drill_lenses eval-result))))))
