(ns metabase-enterprise.replacement.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.api :as replacement.api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- wait-for-result-metadata
  "Poll until `result_metadata` is populated on the card, up to `timeout-ms` (default 5000)."
  ([card-id] (wait-for-result-metadata card-id 5000))
  ([card-id timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
         (if (seq metadata)
           metadata
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 200)
                 (recur))
             (throw (ex-info "Timed out waiting for result_metadata" {:card-id card-id})))))))))

(defmacro with-restored-card-queries
  "Snapshots every card's `dataset_query` before `body` and restores them
  afterwards, so that swap-source side-effects on pre-existing cards don't
  leak between tests."
  [& body]
  `(let [snapshot# (into {} (t2/select-fn->fn :id :dataset_query :model/Card))]
     (try
       ~@body
       (finally
         (doseq [[id# old-query#] snapshot#
                 :let [current# (t2/select-one-fn :dataset_query :model/Card :id id#)]
                 :when (and (some? old-query#) (not= old-query# current#))]
           (t2/update! :model/Card id# {:dataset_query old-query#}))))))

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- native-card-with-query
  "Create a native card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM " (name table-kw) " LIMIT 1"))
     :visualization_settings {}}))

(defn- card-sourced-from
  "Create a card map whose query sources `inner-card`."
  [card-name inner-card]
  (let [mp        (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp card-meta)
     :visualization_settings {}}))

;;; ------------------------------------------------ check-replace-source ------------------------------------------------

(deftest check-replace-source-compatible-test
  (testing "POST /api/ee/replacement/check-replace-source — compatible cards on the same table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b (card-with-query "Card B" :products)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (true? (:success response)))
            (is (empty? (:errors response)))))))))

(deftest check-replace-source-incompatible-test
  (testing "POST /api/ee/replacement/check-replace-source — incompatible cards (different tables)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Products card" :products)
                       :model/Card card-b (card-with-query "Orders card" :orders)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #(= "column-mismatch" (:type %)) (:errors response)))))))))

(deftest check-replace-source-database-mismatch-test
  (testing "POST /api/ee/replacement/check-replace-source — database mismatch short-circuits"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)]
          (with-redefs [replacement.api/fetch-source
                        (fn [entity-type entity-id]
                          ;; Return different database-id values to trigger the mismatch
                          (if (= entity-id (:id card-a))
                            {:mp nil :source nil :database-id 1}
                            {:mp nil :source nil :database-id 999}))]
            (mt/with-temp [:model/Card card-b (card-with-query "Card B" :products)]
              (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                                   {:source_entity_id   (:id card-a)
                                                    :source_entity_type :card
                                                    :target_entity_id   (:id card-b)
                                                    :target_entity_type :card})]
                (is (false? (:success response)))
                (is (some #(= "database-mismatch" (:type %)) (:errors response)))))))))))

(deftest check-replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/check-replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/check-replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))

;;; ------------------------------------------------ replace-source ------------------------------------------------

(deftest replace-source-swaps-card-references-test
  (testing "POST /api/ee/replacement/replace-source — swaps child card references"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            ;; Use create-card! so that dependency events fire and seed the Dependency table
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card})
              ;; The child card's query should now reference new-source
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-card   (get-in updated-query [:stages 0 :source-card])]
                (is (= (:id new-source) source-card))))))))))

(deftest replace-source-card-to-table-test
  (testing "POST /api/ee/replacement/replace-source — card -> table swap"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-card-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (mt/id :products)
                                     :target_entity_type :table})
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-table  (get-in updated-query [:stages 0 :source-table])]
                (is (= (mt/id :products) source-table))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest replace-source-card-to-native-card-test
  (testing "POST /api/ee/replacement/replace-source — MBQL card -> native card swap (same table, no FKs)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-card-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            ;; Use a table without FKs or hidden columns so native card is compatible
            (let [old-source  (card/create-card! (card-with-query "Old source" :products) user)
                  native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id native-card)
                                     :target_entity_type :card})
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-card   (get-in updated-query [:stages 0 :source-card])]
                (is (= (:id native-card) source-card))))))))))

(deftest replace-source-native-card-to-card-test
  (testing "POST /api/ee/replacement/replace-source — native card -> MBQL card swap (same table, no FKs)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-native-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  new-source  (card/create-card! (card-with-query "New source" :products) user)
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id native-card)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card})
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-card   (get-in updated-query [:stages 0 :source-card])]
                (is (= (:id new-source) source-card))))))))))

(deftest replace-source-native-card-to-native-card-test
  (testing "POST /api/ee/replacement/replace-source — native card -> native card swap (same table, no FKs)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-native-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-native (card/create-card! (native-card-with-query "Old native" :products) user)
                  _          (wait-for-result-metadata (:id old-native))
                  new-native (card/create-card! (native-card-with-query "New native" :products) user)
                  _          (wait-for-result-metadata (:id new-native))
                  child      (card/create-card! (card-sourced-from "Child card" old-native) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-native)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-native)
                                     :target_entity_type :card})
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-card   (get-in updated-query [:stages 0 :source-card])]
                (is (= (:id new-native) source-card))))))))))

(deftest replace-source-native-card-to-table-test
  (testing "POST /api/ee/replacement/replace-source — native card -> table swap (same table, no FKs)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-native-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id native-card)
                                     :source_entity_type :card
                                     :target_entity_id   (mt/id :products)
                                     :target_entity_type :table})
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                    source-table  (get-in updated-query [:stages 0 :source-table])]
                (is (= (mt/id :products) source-table))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest replace-source-table-to-card-test
  (testing "POST /api/ee/replacement/replace-source — table -> card swap"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-table-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [new-source (card/create-card! (card-with-query "New source" :products) user)
                    ;; Child card built directly on the products table
                    child      (card/create-card! (card-with-query "Child card" :products) user)]
                (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                      {:source_entity_id   (mt/id :products)
                                       :source_entity_type :table
                                       :target_entity_id   (:id new-source)
                                       :target_entity_type :card})
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      source-card   (get-in updated-query [:stages 0 :source-card])]
                  (is (= (:id new-source) source-card))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest replace-source-table-to-table-test
  (testing "POST /api/ee/replacement/replace-source — table -> table swap (same schema)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-table-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [child (card/create-card! (card-with-query "Child card" :products) user)]
                (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                      {:source_entity_id   (mt/id :products)
                                       :source_entity_type :table
                                       :target_entity_id   (mt/id :products)
                                       :target_entity_type :table})
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      source-table  (get-in updated-query [:stages 0 :source-table])]
                  (is (= (mt/id :products) source-table)))))))))))

(deftest replace-source-table-to-native-card-test
  (testing "POST /api/ee/replacement/replace-source — table -> native card swap (same table, no FKs)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-table-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [native-card (card/create-card! (native-card-with-query "Native target" :products) user)
                    _           (wait-for-result-metadata (:id native-card))
                    child       (card/create-card! (card-with-query "Child card" :products) user)]
                (mt/user-http-request :crowberto :post 204 "ee/replacement/replace-source"
                                      {:source_entity_id   (mt/id :products)
                                       :source_entity_type :table
                                       :target_entity_id   (:id native-card)
                                       :target_entity_type :card})
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      source-card   (get-in updated-query [:stages 0 :source-card])]
                  (is (= (:id native-card) source-card))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest replace-source-incompatible-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — incompatible sources return 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-incompat@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Products card" :products) user)
                  new-source (card/create-card! (card-with-query "Orders card" :orders) user)]
              (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card}))))))))

(deftest replace-source-database-mismatch-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — database mismatch returns 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)]
          (with-redefs [replacement.api/fetch-source
                        (fn [_entity-type entity-id]
                          (if (= entity-id (:id card-a))
                            {:mp nil :source nil :database-id 1}
                            {:mp nil :source nil :database-id 999}))]
            (mt/with-temp [:model/Card card-b (card-with-query "Card B" :products)]
              (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id card-a)
                                     :source_entity_type :card
                                     :target_entity_id   (:id card-b)
                                     :target_entity_type :card}))))))))

(deftest replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))
