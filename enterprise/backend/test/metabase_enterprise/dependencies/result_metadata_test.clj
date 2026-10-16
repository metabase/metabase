(ns metabase-enterprise.dependencies.result-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- table-query [table]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table)))))

(defn- card-query [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- measure-query [measure-id]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/aggregate (lib.metadata/measure mp measure-id)))))

(defn- native-card-query [card-id]
  (let [tag (str "#" card-id)]
    (-> (lib/native-query (mt/metadata-provider) (str "SELECT * FROM {{" tag "}}"))
        (lib/with-template-tags {tag {:type         :card
                                      :card-id      card-id
                                      :name         tag
                                      :display-name tag
                                      :id           (str (random-uuid))}}))))

(defn- run-jobs!
  "Compute the dependency graph, then re-derive the result metadata of the cards depending on stale entities."
  []
  (deps.test/synchronously-run-backfill!)
  (mt/with-premium-features #{:dependencies}
    (deps.result-metadata/update-result-metadata! 1000 60)))

(defn- column [card-id column-name]
  (some #(when (= column-name (:name %)) %)
        (t2/select-one-fn :result_metadata :model/Card :id card-id)))

(defn- stale? [entity-type entity-id]
  (t2/exists? :model/ResultMetadataStatus :entity_type entity-type :entity_id entity-id :stale true))

(defn- rename-column [metadata column-name display-name]
  (mapv #(cond-> % (= column-name (:name %)) (assoc :display_name display-name)) metadata))

(defmacro ^:private with-clean-statuses [& body]
  `(mt/with-premium-features #{:dependencies}
     (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/AnalysisFinding
                             :model/ResultMetadataStatus]
       (deps.test/do-with-immediate-hook-writes (fn [] ~@body)))))

(defn- add-grand-total [query]
  (lib/expression query "Grand total" (lib/* (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total)) 2)))

(deftest model-query-edit-test
  (testing "editing a model's query re-derives the MBQL cards depending on it transitively, but not past a native card"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id}        {:type :model :dataset_query (table-query :orders)}
                     :model/Card {question-id :id}     {:dataset_query (card-query model-id)}
                     :model/Card {nested-id :id}       {:dataset_query (card-query question-id)}
                     :model/Card {native-id :id}       {:dataset_query (native-card-query model-id)}
                     :model/Card {after-native-id :id} {:dataset_query (card-query native-id)}]
        (run-jobs!)
        (is (nil? (column question-id "Grand total")))
        (t2/update! :model/Card model-id {:dataset_query (add-grand-total (table-query :orders))})
        (is (stale? :card model-id))
        (run-jobs!)
        (is (some? (column question-id "Grand total")))
        (is (some? (column nested-id "Grand total")))
        (testing "the native card and the card depending on it are left alone"
          (is (not (t2/exists? :model/ResultMetadataStatus :entity_type :card :entity_id [:in [native-id after-native-id]]))))
        (is (not-any? #(stale? :card %) [model-id question-id nested-id]))
        (testing "a column no longer inferred is removed"
          (t2/update! :model/Card model-id {:dataset_query (table-query :orders)})
          (run-jobs!)
          (is (nil? (column question-id "Grand total")))
          (is (nil? (column nested-id "Grand total"))))))))

(deftest run-metadata-test
  (testing "re-deriving a card keeps the fingerprints and types its run stored for the columns it still has"
    (with-clean-statuses
      (let [mp    (mt/metadata-provider)
            query (-> (table-query :orders)
                      (lib/aggregate (lib/count))
                      (lib/breakout (lib.metadata/field mp (mt/id :orders :product_id))))]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (mt/with-test-user :crowberto
            (qp/process-query (qp/userland-query query {:card-id card-id})))
          (let [run-count (column card-id "count")]
            (is (some? (:fingerprint run-count)))
            (run-jobs!)
            (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :product_id) :display_name "Item"}]
              (run-jobs!)
              (is (= "Item" (:display_name (column card-id "PRODUCT_ID"))))
              (is (= (select-keys run-count [:base_type :fingerprint])
                     (select-keys (column card-id "count") [:base_type :fingerprint]))))))))))

(deftest native-parent-test
  (testing "a card depending on a changed model directly is re-derived even when it also depends on a native card"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id}  {:type :model :dataset_query (table-query :orders)}
                     :model/Card {native-id :id} {:dataset_query   (native-card-query model-id)
                                                  :result_metadata (t2/select-one-fn :result_metadata :model/Card
                                                                                     :id model-id)}]
        (let [mp       (mt/metadata-provider)
              query    (card-query model-id)
              native   (lib.metadata/card mp native-id)
              joined   (lib/join query (lib/join-clause native [(lib/= (lib/ref (lib.metadata/field mp (mt/id :orders :id)))
                                                                       (lib/ref (lib.metadata/field mp (mt/id :orders :id))))]))]
          (mt/with-temp [:model/Card {joined-id :id} {:dataset_query joined}]
            (run-jobs!)
            (t2/update! :model/Card model-id {:dataset_query (add-grand-total (table-query :orders))})
            (run-jobs!)
            (is (some? (column joined-id "Grand total")))))))))

(deftest metadata-edit-test
  (testing "editing only a card's result metadata, like a model's column overrides, doesn't mark the card"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (table-query :orders)}]
        (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card
                                                                                            :id model-id)
                                                                          "TOTAL" "Grand total")})
        (is (not (stale? :card model-id)))))))

(deftest model-overrides-test
  (testing "re-deriving a model after its table changed keeps the model's column overrides"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (table-query :orders)}]
        (run-jobs!)
        (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card
                                                                                            :id model-id)
                                                                          "TOTAL" "Grand total")})
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
          (is (stale? :table (mt/id :orders)))
          (run-jobs!)
          (is (not (stale? :table (mt/id :orders))))
          (is (= "Grand total" (:display_name (column model-id "TOTAL")))))))))

(deftest field-user-settings-test
  (testing "renaming a field re-derives the MBQL cards reading its table"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Grand total"}]
          (is (stale? :table (mt/id :orders)))
          (run-jobs!)
          (is (= "Grand total" (:display_name (column card-id "TOTAL"))))
          (is (not (stale? :table (mt/id :orders)))))))))

(deftest measure-chain-test
  (testing "changing a measure's definition re-derives a card using it through another measure"
    (with-clean-statuses
      (mt/with-temp [:model/Measure {inner-id :id} {:name       "Inner"
                                                    :table_id   (mt/id :orders)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (-> (table-query :orders) (lib/aggregate (lib/count)))}
                     :model/Measure {outer-id :id} {:name       "Outer"
                                                    :table_id   (mt/id :orders)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-query inner-id)}
                     :model/Card    {card-id :id}  {:dataset_query (measure-query outer-id)}]
        (run-jobs!)
        (let [column-name #(:name (first (t2/select-one-fn :result_metadata :model/Card :id card-id)))]
          (is (= "count" (column-name)))
          (t2/update! :model/Measure inner-id
                      {:definition (-> (table-query :orders)
                                       (lib/aggregate (lib/avg (lib.metadata/field (mt/metadata-provider)
                                                                                   (mt/id :orders :total)))))})
          (is (stale? :measure inner-id))
          (run-jobs!)
          (is (= "avg" (column-name))))))))

(defn- rederive-during-inference!
  "Re-derive the stale card with `card-id` while `write!` runs in the middle of its inference, returning the result."
  [card-id write!]
  (let [infer (mt/original-fn #'queries/infer-metadata-with-model-overrides)]
    (mt/with-dynamic-fn-redefs [queries/infer-metadata-with-model-overrides
                                (fn [& args]
                                  (write!)
                                  (apply infer args))]
      (#'deps.result-metadata/process-status-or-record-failure!
       (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)
       60))))

(deftest user-save-during-rederive-test
  (testing "a user's save of a card during its re-derive wins, and the card is retried without a failure"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (deps.result-metadata-status/mark-stale! {:card #{card-id}})
        (let [stored (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
            (is (= :conflict (rederive-during-inference! card-id #(t2/update! :model/Card card-id {:name "Renamed"}))))
            (is (= "Renamed" (t2/select-one-fn :name :model/Card :id card-id)))
            (is (= stored (t2/select-one-fn :result_metadata :model/Card :id card-id)))
            (is (=? {:stale true :fail_count 0}
                    (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)))))))))

(deftest run-write-during-rederive-test
  (testing "a run storing a card's metadata during its re-derive wins, though it keeps the card's updated_at"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (deps.result-metadata-status/mark-stale! {:card #{card-id}})
        (let [run-metadata (rename-column (t2/select-one-fn :result_metadata :model/Card :id card-id) "TOTAL" "Run total")]
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
            (is (= :conflict (rederive-during-inference!
                              card-id
                              #(dependencies.db/set-card-result-metadata! card-id run-metadata))))
            (is (= "Run total" (:display_name (column card-id "TOTAL"))))))))))

(deftest parameters-update-marks-no-result-metadata-test
  (testing "a write of a card's parameters alone, like the cleanup a column removal causes, re-derives nothing"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (t2/update! :model/Card card-id {:parameters [{:id "p" :type :category :slug "p" :name "P"}]})
        (is (t2/exists? :model/DependencyStatus :entity_type :card :entity_id card-id :stale true))
        (is (not (t2/exists? :model/ResultMetadataStatus :entity_type :card :entity_id card-id)))))))

(deftest card-on-card-temporal-unit-test
  (testing "a card on a card takes the new temporal unit with the new display name"
    (with-clean-statuses
      (let [mp      (mt/metadata-provider)
            by-unit #(-> (table-query :orders)
                         (lib/aggregate (lib/count))
                         (lib/breakout (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at)) %)))]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (by-unit :month)}
                       :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
          (run-jobs!)
          (t2/update! :model/Card source-id {:dataset_query (by-unit :year)})
          (run-jobs!)
          (is (=? {:display_name "Created At: Year" :unit :year}
                  (column card-id "CREATED_AT"))))))))

(deftest card-on-card-type-test
  (testing "a card on a card takes the new type of a column whose type changed upstream"
    (with-clean-statuses
      (let [total (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total))
            with  #(lib/expression (table-query :orders) "X" %)]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (with (lib/* total 2))}
                       :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
          (run-jobs!)
          (is (isa? (:base_type (column card-id "X")) :type/Number))
          (t2/update! :model/Card source-id {:dataset_query (with (lib/concat total "!"))})
          (run-jobs!)
          (is (= :type/Text (:base_type (column card-id "X")))))))))

(deftest alias-less-stored-metadata-test
  (testing "stored columns without aliases are matched by name, so an alias equal to another column's name merges
           nothing"
    (let [stored   [{:name "CREATED_AT" :id 36 :fingerprint {:global {:distinct-count 1}}}
                    {:name "CREATED_AT_2" :id 14 :fingerprint {:global {:distinct-count 2}}}]
          inferred [{:name "CREATED_AT" :id 36 :lib/desired-column-alias "PRODUCTS__via__PRODUCT_ID__CREATED_AT"}
                    {:name "CREATED_AT_2" :id 14 :lib/desired-column-alias "CREATED_AT"}]]
      (is (=? [{:id 36 :fingerprint {:global {:distinct-count 1}}}
               {:id 14 :fingerprint {:global {:distinct-count 2}}}]
              (#'deps.result-metadata/patch-result-metadata stored inferred))))))

(deftest kebab-case-stored-metadata-test
  (testing "stored columns with kebab-case keys compare like snake_case ones"
    (is (= [{:semantic_type "type/FK" :fk_target_field_id 29}]
           (#'deps.result-metadata/comparable-metadata
            (mapv #'deps.result-metadata/normalize-column [{:semantic-type :type/FK :fk-target-field-id 29}]))))))

(deftest terminal-dependent-test
  (testing "a dependent that reached the retry limit is re-derived again when its upstream changes again"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (run-jobs!)
        (t2/insert! :model/ResultMetadataStatus {:entity_type :card :entity_id card-id :stale true
                                                 :fail_count 6 :terminal true})
        (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
        (run-jobs!)
        (is (some? (column card-id "Grand total")))
        (is (not (stale? :card card-id)))))))

(deftest job-before-backfill-test
  (testing "a card whose dependencies the backfill computes after its upstream changed is re-derived once it does"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (card-query source-id)}]
          (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
          (mt/with-premium-features #{:dependencies}
            (deps.result-metadata/update-result-metadata! 1000 60))
          (is (nil? (column card-id "Grand total")))
          (run-jobs!)
          (is (some? (column card-id "Grand total"))))))))

(deftest failure-after-user-mark-test
  (testing "a failure is not recorded over a mark made while the status was processed"
    (mt/with-model-cleanup [:model/ResultMetadataStatus]
      (let [card-id Integer/MAX_VALUE]
        (deps.result-metadata-status/mark-stale! {:card #{card-id}})
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (Thread/sleep 5)
          (deps.result-metadata-status/mark-stale! {:card #{card-id}})
          (is (zero? (deps.result-metadata-status/record-failure! status 5 60)))
          (is (=? {:stale true :fail_count 0 :next_retry_at nil}
                  (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id))))))))

(deftest failure-without-status-test
  (testing "a failure of a status deleted meanwhile leaves no row waiting for a retry"
    (mt/with-model-cleanup [:model/ResultMetadataStatus]
      (let [card-id Integer/MAX_VALUE]
        (deps.result-metadata-status/mark-stale! {:card #{card-id}})
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (t2/delete! :model/ResultMetadataStatus :id (:id status))
          (deps.result-metadata-status/record-failure! status 5 60)
          (is (not (t2/exists? :model/ResultMetadataStatus :entity_type :card :entity_id card-id)))
          (is (not (deps.result-metadata-status/has-pending-retries?))))))))

(deftest sandboxed-creator-test
  (testing "a sandboxed user's card is re-derived as that user, so the columns the sandbox hides stay out"
    (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)]
                                                (lib/with-fields (table-query :venues)
                                                  [(lib.metadata/field mp (mt/id :venues :id))
                                                   (lib.metadata/field mp (mt/id :venues :name))
                                                   (lib.metadata/field mp (mt/id :venues :category_id))]))}}}
      (with-clean-statuses
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)
                                                  :creator_id    (mt/user->id :rasta)
                                                  :result_metadata []}]
          (deps.result-metadata-status/mark-stale! {:card #{card-id}})
          (mt/with-premium-features #{:dependencies :sandboxes}
            (deps.result-metadata/update-result-metadata! 1000 60))
          (is (= ["ID" "NAME" "CATEGORY_ID"]
                 (mapv :name (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))))

(deftest clear-if-unchanged-test
  (testing "a status marked again while it was processed stays stale"
    (mt/with-model-cleanup [:model/ResultMetadataStatus]
      (let [card-id Integer/MAX_VALUE]
        (deps.result-metadata-status/mark-stale! {:card #{card-id}})
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (deps.result-metadata-status/mark-stale! {:card #{card-id}})
          (is (zero? (deps.result-metadata-status/clear-stale-if-unchanged! status)))
          (is (stale? :card card-id)))
        (let [status (t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
          (is (= 1 (deps.result-metadata-status/clear-stale-if-unchanged! status)))
          (is (not (stale? :card card-id))))))))
