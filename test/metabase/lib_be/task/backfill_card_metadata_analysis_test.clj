(ns metabase.lib-be.task.backfill-card-metadata-analysis-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-be.task.backfill-card-metadata-analysis :as analysis]
   [metabase.lib.core :as lib]
   [metabase.models.card :as card]
   [metabase.task-history.models.task-history :as task-history]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- strip-idents [cols]
  (mapv #(dissoc % :ident :model/inner_ident) cols))

(defn- idents-only [col]
  (select-keys col [:ident :model/inner_ident]))

(defn- check-inference-on-query
  ([proto-card]
   (check-inference-on-query proto-card nil))

  ([proto-card extra-fn]
   (let [base      (mt/card-with-metadata proto-card)
         metadata  (:result_metadata base)
         no-idents (update base :result_metadata strip-idents)]
     (is (every? :ident metadata))
     (mt/with-temp [:model/Card card no-idents]
       (is (= (:result_metadata no-idents)
              (:result_metadata card))
           "Card was stored without idents")
       (let [inferred (#'analysis/infer-idents-for-result-metadata (:result_metadata card) card)]
         (is (=? (map idents-only metadata)
                 (map idents-only inferred))
             "Inference puts them back")
         (is (card/all-idents-valid? card inferred)
             "And all the idents are valid.")
         (when extra-fn
           (extra-fn card inferred)))))))

(deftest ^:synchronized inference-test-1-plain-mbql
  (check-inference-on-query {:dataset_query (mt/mbql-query orders)}))

(deftest ^:synchronized inference-test-2-mbql-model-without-deps
  (check-inference-on-query {:dataset_query (mt/mbql-query orders)
                             :type          :model}))

(deftest ^:synchronized inference-test-3-mbql-with-source-card-with-idents
  (testing "a source card with idents populated"
    (mt/with-temp [:model/Card source (mt/card-with-metadata
                                       {:dataset_query           (mt/mbql-query orders
                                                                   {:filter [:< $subtotal 100]})
                                        :metadata_analysis_state :analyzed})]
      (check-inference-on-query {:dataset_query (mt/mbql-query orders
                                                  {:source-table (str "card__" (:id source))
                                                   :expressions  {"tax rate" [:/ $tax $subtotal]}})}))))

(deftest ^:synchronized inference-test-4-mbql-with-source-card-no-idents
  (testing "a source card with idents missing - downstream card still has idents because of the field IDs"
    (mt/with-temp [:model/Card source (-> {:dataset_query (mt/mbql-query orders
                                                            {:filter [:< $subtotal 100]})}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))]
      (check-inference-on-query {:dataset_query (mt/mbql-query orders
                                                  {:source-table (str "card__" (:id source))
                                                   :expressions  {"tax rate" [:/ $tax $subtotal]}})}))))

(deftest ^:synchronized inference-test-5-mbql-with-source-card-no-idents-and-expression
  (testing "a source card with idents missing - downstream card does not get ident for expression"
    (mt/with-temp [:model/Card source (-> {:dataset_query (mt/mbql-query orders
                                                            {:filter      [:< $subtotal 100]
                                                             :expressions {"tax_rate" [:/ $tax $subtotal]}})}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))
                   :model/Card card   {:dataset_query (mt/mbql-query orders
                                                        {:source-table (str "card__" (:id source))
                                                         :filter [:> *tax_rate/Float 0.05]})}]
      (is (empty? (keep :ident (:result_metadata source))))
      (is (=? [{:name  "tax_rate"
                :ident (symbol "nil #_\"key is not present.\"")}]
              (remove :ident (:result_metadata card)))))))

(deftest ^:synchronized inference-test-6-mbql-with-source-card-no-idents-aggregated
  (testing "a source card with idents missing - downstream card with aggregations/breakouts doesn't need source idents"
    (mt/with-temp [:model/Card source (-> {:dataset_query (mt/mbql-query orders
                                                            {:filter [:< $subtotal 100]
                                                             :expressions {"tax_rate" [:/ $tax $subtotal]}})}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))
                   :model/Card card   {:dataset_query (mt/mbql-query orders
                                                        {:source-table (str "card__" (:id source))
                                                         :aggregation  [[:min *tax_rate/Float]]
                                                         :breakout     [!month.$created_at]})}]
      (is (empty? (keep :ident (:result_metadata source))))
      (is (every? :ident (:result_metadata card))))))

(deftest ^:synchronized inference-test-7-mbql-with-source-model-with-idents
  (testing "a source model with idents - downstream card has idents too"
    (mt/with-temp [:model/Card source (mt/card-with-metadata
                                       {:dataset_query (mt/mbql-query orders
                                                         {:filter [:< $subtotal 100]})
                                        :type          :model})]
      (check-inference-on-query {:dataset_query (mt/mbql-query orders
                                                  {:source-table (str "card__" (:id source))
                                                   :expression {"tax rate" [:/ $tax $subtotal]}})}))))

(deftest ^:synchronized inference-test-8-mbql-with-source-model-no-idents
  (testing "a source model with no idents - downstream card has missing idents"
    (mt/with-temp [:model/Card source (-> {:dataset_query (mt/mbql-query orders
                                                            {:aggregation [[:count]]
                                                             :breakout    [!month.$created_at]})
                                           :type          :model}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))
                   :model/Card card   {:dataset_query (mt/mbql-query orders
                                                        {:source-table (str "card__" (:id source))
                                                         :filter       [:> *count/Integer 10]})}]
      (is (empty? (keep :ident (:result_metadata source))))
      ;; TODO: Currently the inference can figure out the breakout's ident even when it's not present in the
      ;; result_metadata, but it can't figure out the aggregation's ident? That seems strange and might indicate a bug.
      (let [brk-ident (get-in source [:dataset_query :query :breakout-idents 0])]
        (is (=? [{:name              "CREATED_AT"
                  :model/inner_ident brk-ident
                  :ident             (lib/model-ident brk-ident (:entity_id source))}
                 {:name              "count"
                  :ident             (symbol "nil #_\"key is not present.\"")}]
                (#'analysis/infer-idents-for-result-metadata (:result_metadata card) card)))))))

(deftest ^:synchronized inference-test-9-mbql-with-source-model-no-idents-summaries
  (testing "a source model with no idents - downstream card has summaries"
    (mt/with-temp [:model/Card source (-> {:dataset_query (mt/mbql-query orders
                                                            {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                           :type          :model}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))
                   :model/Card card   (-> {:dataset_query (mt/mbql-query orders
                                                            {:source-table (str "card__" (:id source))
                                                             :aggregation  [[:count]]
                                                             :breakout     [!week.*CREATED_AT/DateTimeWithLocalTZ]})}
                                          mt/card-with-metadata
                                          (update :result_metadata strip-idents))]
      (is (empty? (keep :ident (:result_metadata source))))
      (is (empty? (keep :ident (:result_metadata card))))
      (is (=? [{:name     "CREATED_AT"
                :ident    (get-in card [:dataset_query :query :breakout-idents 0])}
               {:name     "count"
                :ident    (get-in card [:dataset_query :query :aggregation-idents 0])}]
              (#'analysis/infer-idents-for-result-metadata (:result_metadata card) card))))))

(deftest ^:synchronized inference-test-10-native-query
  (testing "a native query"
    (let [metadata [{:name      "foo"
                     :base_type :type/Integer
                     :field_ref [:field "foo" {:base-type :type/Integer}]}
                    {:name      "foo"
                     :base_type :type/Integer
                     :field_ref [:field "foo_2" {:base-type :type/Integer}]}
                    {:name      "bar"
                     :base_type :type/Integer}]]
      (mt/with-temp [:model/Card card {:dataset_query   (mt/native-query {:query "SELECT foo, foo_2, bar FROM Table"})
                                       :result_metadata metadata}]
        (is (empty? (keep :ident (:result_metadata card))))
        (is (=? [{:ident (lib/native-ident "foo"   (:entity_id card))}
                 {:ident (lib/native-ident "foo_2" (:entity_id card))}
                 {:ident (lib/native-ident "bar"   (:entity_id card))}]
                (#'analysis/infer-idents-for-result-metadata (:result_metadata card) card)))))))

(deftest ^:synchronized inference-test-11-native-model
  (testing "a native model"
    (let [metadata [{:name      "foo"
                     :base_type :type/Integer
                     :field_ref [:field "foo" {:base-type :type/Integer}]}
                    {:name      "foo"
                     :base_type :type/Integer
                     :field_ref [:field "foo_2" {:base-type :type/Integer}]}
                    {:name      "bar"
                     :base_type :type/Integer}]]
      (mt/with-temp [:model/Card card {:dataset_query   (mt/native-query {:query "SELECT foo, foo_2, bar FROM Table"})
                                       :type            :model
                                       :result_metadata metadata}]
        (is (empty? (keep :ident (:result_metadata card))))
        (is (=? (for [col-name ["foo" "foo_2" "bar"]]
                  {:ident (-> col-name
                              (lib/native-ident (:entity_id card))
                              (lib/model-ident  (:entity_id card)))})
                (#'analysis/infer-idents-for-result-metadata (:result_metadata card) card)))))))

(deftest ^:synchronized backfill-idents-for-card!-test-1-all-valid
  (mt/with-temp [:model/Card card (-> {:dataset_query (mt/mbql-query orders)}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :analyzed (#'analysis/backfill-idents-for-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           [{:ident (mt/ident :orders :id)}
                                           {:ident (mt/ident :orders :user_id)}
                                           {:ident (mt/ident :orders :product_id)}
                                           {:ident (mt/ident :orders :subtotal)}
                                           {:ident (mt/ident :orders :tax)}
                                           {:ident (mt/ident :orders :total)}
                                           {:ident (mt/ident :orders :discount)}
                                           {:ident (mt/ident :orders :created_at)}
                                           {:ident (mt/ident :orders :quantity)}]
               :metadata_analysis_state   :analyzed
               :metadata_analysis_blocker nil}
              backfilled)))))

(deftest ^:synchronized backfill-idents-for-card!-test-2-source-card-with-idents
  (mt/with-temp [:model/Card src  (-> {:dataset_query (mt/mbql-query orders)}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))
                 :model/Card card (-> {:dataset_query (mt/mbql-query orders
                                                        {:source-table (str "card__" (:id src))
                                                         :filter       [:> *SUBTOTAL/Float 100]})}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata src))))
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :analyzed (#'analysis/backfill-idents-for-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           [{:ident (mt/ident :orders :id)}
                                           {:ident (mt/ident :orders :user_id)}
                                           {:ident (mt/ident :orders :product_id)}
                                           {:ident (mt/ident :orders :subtotal)}
                                           {:ident (mt/ident :orders :tax)}
                                           {:ident (mt/ident :orders :total)}
                                           {:ident (mt/ident :orders :discount)}
                                           {:ident (mt/ident :orders :created_at)}
                                           {:ident (mt/ident :orders :quantity)}]
               :metadata_analysis_state   :analyzed
               :metadata_analysis_blocker nil}
              backfilled)))))

(deftest ^:synchronized backfill-idents-for-card!-test-2b-source-card-no-idents
  (mt/with-temp [:model/Card src  (-> {:dataset_query (mt/mbql-query orders
                                                        {:expressions {"tax_rate" [:/ $tax $subtotal]}})}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))
                 :model/Card card (-> {:dataset_query (mt/mbql-query orders
                                                        {:source-table (str "card__" (:id src))
                                                         :filter       [:> *SUBTOTAL/Float 100]})}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata src))))
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :blocked (#'analysis/backfill-idents-for-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   :blocked
               :metadata_analysis_blocker (:id src)}
              backfilled)))))

(deftest ^:synchronized backfill-idents-for-card!-test-3-malformed-idents
  ;; This is a bit of a hack, since the idents aren't malformed normally.
  ;; This overrides [[infer-idents-for-result-metadata]] to product a broken ident, missing the card's entity_id.
  (mt/with-temp [:model/Card card {:dataset_query           (mt/native-query {:query "SELECT * FROM some_table"})
                                   :result_metadata         [{:name      "foo"
                                                              :base_type :type/Integer
                                                              :field_ref [:field "foo" {:base-type :type/Integer}]}
                                                             {:name      "bar"
                                                              :base_type :type/Integer
                                                              :field_ref [:field "bar" {:base-type :type/Integer}]}]
                                   :metadata_analysis_state :not-started}]
    (is (empty? (keep :ident (:result_metadata card))))
    (with-redefs [analysis/infer-idents-for-result-metadata
                  (fn [metadata _card]
                    (mapv #(assoc % :ident (lib/native-ident (:name %) ""))
                          metadata))]
      ;; Concurrently edit the card.
      (t2/update! :model/Card (:id card) {:name "something else"})
      ;; Then pass the previously fetched `card` into the backfill function: since the updated_at has changed, the
      ;; backfill is :skipped.
      (is (= :skipped (#'analysis/backfill-idents-for-card! card))))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? (assoc card :name "something else" :updated_at #(not= % (:updated_at card)))
              backfilled)))))

(deftest ^:synchronized analyze-card!-test-1-not-started-all-valid
  (mt/with-temp [:model/Card card (-> {:dataset_query           (mt/mbql-query orders)
                                       :metadata_analysis_state :not-started}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :analyzed (#'analysis/analyze-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           [{:ident (mt/ident :orders :id)}
                                           {:ident (mt/ident :orders :user_id)}
                                           {:ident (mt/ident :orders :product_id)}
                                           {:ident (mt/ident :orders :subtotal)}
                                           {:ident (mt/ident :orders :tax)}
                                           {:ident (mt/ident :orders :total)}
                                           {:ident (mt/ident :orders :discount)}
                                           {:ident (mt/ident :orders :created_at)}
                                           {:ident (mt/ident :orders :quantity)}]
               :metadata_analysis_state   :analyzed
               :metadata_analysis_blocker nil}
              backfilled)))))

(deftest ^:synchronized analyze-card!-test-2a-not-started-source-card-with-idents
  (mt/with-temp [:model/Card src  (-> {:dataset_query           (mt/mbql-query orders)
                                       :metadata_analysis_state :not-started}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))
                 :model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                  {:source-table (str "card__" (:id src))
                                                                   :filter       [:> *SUBTOTAL/Float 100]})
                                       :metadata_analysis_state :not-started}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata src))))
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :analyzed (#'analysis/analyze-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           [{:ident (mt/ident :orders :id)}
                                           {:ident (mt/ident :orders :user_id)}
                                           {:ident (mt/ident :orders :product_id)}
                                           {:ident (mt/ident :orders :subtotal)}
                                           {:ident (mt/ident :orders :tax)}
                                           {:ident (mt/ident :orders :total)}
                                           {:ident (mt/ident :orders :discount)}
                                           {:ident (mt/ident :orders :created_at)}
                                           {:ident (mt/ident :orders :quantity)}]
               :metadata_analysis_state   :analyzed
               :metadata_analysis_blocker nil}
              backfilled)))))

(deftest ^:synchronized analyze-card!-test-2b-not-started-source-card-no-idents
  (mt/with-temp [:model/Card src  (-> {:dataset_query           (mt/mbql-query orders
                                                                  {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                       :metadata_analysis_state :not-started}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))
                 :model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                  {:source-table (str "card__" (:id src))
                                                                   :filter       [:> *SUBTOTAL/Float 100]})
                                       :metadata_analysis_state :not-started}
                                      mt/card-with-metadata
                                      (update :result_metadata strip-idents))]
    (is (empty? (keep :ident (:result_metadata src))))
    (is (empty? (keep :ident (:result_metadata card))))
    (is (= :blocked (#'analysis/analyze-card! card)))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   :blocked
               :metadata_analysis_blocker (:id src)}
              backfilled)))))

(deftest ^:synchronized analyze-card!-test-3-not-started-malformed-idents
  ;; This is a bit of a hack, since the idents aren't malformed normally.
  ;; This overrides [[infer-idents-for-result-metadata]] to product a broken ident, missing the card's entity_id.
  (mt/with-temp [:model/Card card {:dataset_query           (mt/native-query {:query "SELECT * FROM some_table"})
                                   :result_metadata         [{:name      "foo"
                                                              :base_type :type/Integer
                                                              :field_ref [:field "foo" {:base-type :type/Integer}]}
                                                             {:name      "bar"
                                                              :base_type :type/Integer
                                                              :field_ref [:field "bar" {:base-type :type/Integer}]}]
                                   :metadata_analysis_state :not-started}]
    (is (empty? (keep :ident (:result_metadata card))))
    (with-redefs [analysis/infer-idents-for-result-metadata
                  (fn [metadata _card]
                    (mapv #(assoc % :ident (lib/native-ident (:name %) ""))
                          metadata))]
      (is (= :failed (#'analysis/analyze-card! card))))
    (let [backfilled (t2/select-one :model/Card (:id card))]
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   :failed
               :metadata_analysis_blocker nil}
              backfilled)))))

(deftest ^:synchronized analyze-card!-test-4a-already-done-and-valid
  (doseq [state [:analyzed :executed]]
    (mt/with-temp [:model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                    {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                         :metadata_analysis_state state}
                                        mt/card-with-metadata)]
      (is (every? :ident (:result_metadata card)))
      (t2/with-call-count [call-count]
        (is (= state (#'analysis/analyze-card! card)))
        (is (= 0 (call-count))
            "no updates are made for valid, already completed cards"))
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   state
               :metadata_analysis_blocker nil}
              (t2/select-one :model/Card (:id card)))))))

(deftest ^:synchronized analyze-card!-test-4b-already-done-but-invalid
  (doseq [state [:analyzed :executed]]
    (mt/with-temp [:model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                    {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                         :metadata_analysis_state state}
                                        mt/card-with-metadata
                                        (assoc-in [:result_metadata 0 :ident] ""))]
      (t2/with-call-count [call-count]
        (is (= :failed (#'analysis/analyze-card! card)))
        (is (pos? (call-count))))
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   :failed
               :metadata_analysis_blocker nil}
              (t2/select-one :model/Card (:id card)))))))

(deftest ^:synchronized analyze-card!-test-4c-already-done-but-invalid-with-concurrent-edit
  (doseq [state [:analyzed :executed]]
    (mt/with-temp [:model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                    {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                         :metadata_analysis_state state}
                                        mt/card-with-metadata
                                        (assoc-in [:result_metadata 0 :ident] ""))]
      (with-redefs [t2/update! (constantly 0)]
        (is (= :skipped (#'analysis/analyze-card! card))))
      (is (=? card
              (t2/select-one :model/Card (:id card)))))))

(deftest ^:synchronized analyze-card!-test-5-skip-failed-and-blocked
  (doseq [state [:failed :blocked]]
    (mt/with-temp [:model/Card card (-> {:dataset_query           (mt/mbql-query orders
                                                                    {:expressions {"tax_rate" [:/ $tax $subtotal]}})
                                         :metadata_analysis_state state}
                                        mt/card-with-metadata
                                        (update :result_metadata strip-idents))]
      (t2/with-call-count [call-count]
        (is (= :skipped (#'analysis/analyze-card! card)))
        (is (zero? (call-count))))
      (is (=? {:result_metadata           (:result_metadata card) ; Unchanged
               :metadata_analysis_state   state
               :metadata_analysis_blocker nil}
              (t2/select-one :model/Card (:id card)))))))

(defn- call-with-task-history!
  "Call `f` with [[task-history/update-task-history!]] redef'd.

  Returns what `f` returns, but with `:task-history-ids` in its metadata."
  [f]
  (let [created-task-history-ids (atom [])
        original-update-th!      @#'task-history/update-task-history!]
    (with-redefs [task-history/update-task-history! (fn [th-id startime-ms info]
                                                      (swap! created-task-history-ids conj th-id)
                                                      (original-update-th! th-id startime-ms info))]
      (vary-meta (f) assoc :task-history-ids @created-task-history-ids))))

(deftest ^:synchronized batched-metadata-analysis!-test-1-mark-priority
  (mt/with-temp [:model/Card c1 {:metadata_analysis_state :not-started}
                 :model/Card c2 {:metadata_analysis_state :not-started}
                 :model/Card c3 {:metadata_analysis_state :analyzed}
                 :model/Card c4 {:metadata_analysis_state :unknown}
                 :model/Card c5 {:metadata_analysis_state :not-started}
                 :model/Card c6 {:metadata_analysis_state :priority}]
    (let [analyzed (atom #{})]
      (with-redefs [analysis/analyze-card! (fn [card]
                                             (swap! analyzed conj (:id card))
                                             (if (= (:id card) (:id c3))
                                               :skipped
                                               :analyzed))]
        (reset! card/cards-for-priority-analysis #{(:id c1) (:id c2) (:id c3)})
        (binding [analysis/*batch-size* 4]
          (let [analysis-result (call-with-task-history! @#'analysis/batched-metadata-analysis!)]
            (is (=? {:card_results {(:id c1) :analyzed
                                    (:id c2) :analyzed
                                    (:id c6) :analyzed}
                     :state_counts {:analyzed #(>= % 3)}}
                    analysis-result))
            (is (=? {:task-history-ids seq}
                    (meta analysis-result)))
            (is (=? [{:task "card_metadata_analysis"
                      :db_id nil
                      :started_at some?
                      :ended_at   some?
                      :duration   number?
                      :task_details {:card_ids     (every-pred sequential?
                                                               #(= (count %) 4)
                                                               #(some #{(:id c1)} %)
                                                               #(some #{(:id c2)} %)
                                                               #(some #{(:id c6)} %))
                                     :card_results {(keyword (str (:id c1))) "analyzed"
                                                    (keyword (str (:id c2))) "analyzed"
                                                    (keyword (str (:id c6))) "analyzed"}
                                     :state_counts {:analyzed #(>= % 3)}}}]
                    (t2/select :model/TaskHistory :id [:in (:task-history-ids (meta analysis-result))])))))
        (testing "c1, c2 and c3 were noted as needing priority analysis"
          (testing "c1 and c2 were set to :priority state"
            (is (= :priority (t2/select-one-fn :metadata_analysis_state :model/Card (:id c1))))
            (is (= :priority (t2/select-one-fn :metadata_analysis_state :model/Card (:id c2)))))
          (testing "c3 has been concurrently analyzed; it is left alone"
            (is (= :analyzed (t2/select-one-fn :metadata_analysis_state :model/Card (:id c3)))))
          (testing "c4 and c5 are untouched"
            (is (= :unknown     (t2/select-one-fn :metadata_analysis_state :model/Card (:id c4))))
            (is (= :not-started (t2/select-one-fn :metadata_analysis_state :model/Card (:id c5)))))
          (testing "c6 remained at :priority"
            (is (= :priority (t2/select-one-fn :metadata_analysis_state :model/Card (:id c6))))))

        (testing "c1, c2 and c6 are :priority, c4 and c5 are :not-started"
          (testing "with a batch size of 4, it analyzes all the :priority ones plus one more"
            ;; NOTE: That "one more" might not be c4 or c5 - there are other cards in the database.
            (is (= 4 (count @analyzed)))
            (is (contains? @analyzed (:id c1)))
            (is (contains? @analyzed (:id c2)))
            (is (contains? @analyzed (:id c6)))))))))
