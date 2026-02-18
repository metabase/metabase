(ns metabase-enterprise.replacement.swap.mbql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

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

(defn- native-card-sourced-from
  "Create a native card map that references `inner-card` via {{#id}}."
  [card-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id inner-card) "}}"))
     :visualization_settings {}}))

;;; ------------------------------------------------ Mixed Chain Tests ------------------------------------------------
;;; These tests cover chains that mix MBQL and native queries

(deftest swap-source-mixed-chain-test
  (testing "swap-source propagates through: MBQL Model → Native Card → MBQL Card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-mixed-chain@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [ ;; Chain: old-model → native-card ({{#id}}) → mbql-card (source-card)
                  old-model   (card/create-card! (card-with-query "Old Model" :products) user)
                  new-model   (card/create-card! (card-with-query "New Model" :products) user)
                  _           (wait-for-result-metadata (:id old-model))
                  native-card (card/create-card! (native-card-sourced-from "Native Card" old-model) user)
                  _           (wait-for-result-metadata (:id native-card))
                  mbql-card   (card/create-card! (card-sourced-from "MBQL Card" native-card) user)]
              ;; Swap the model at the root
              (source-swap/swap-source [:card (:id old-model)] [:card (:id new-model)])
              ;; Native card's {{#old-id}} should be updated to {{#new-id}}
              (let [native-query (t2/select-one-fn :dataset_query :model/Card :id (:id native-card))
                    native-sql   (get-in native-query [:stages 0 :native])]
                (is (str/includes? native-sql (str "{{#" (:id new-model) "}}"))
                    "Native card should reference new model")
                (is (not (str/includes? native-sql (str "{{#" (:id old-model) "}}")))
                    "Native card should not reference old model"))
              ;; MBQL card should still reference native-card (unchanged, it's not a direct dependent)
              (let [mbql-query (t2/select-one-fn :dataset_query :model/Card :id (:id mbql-card))]
                (is (= (:id native-card) (get-in mbql-query [:stages 0 :source-card]))
                    "MBQL card should still reference native card (unchanged)")))))))))
