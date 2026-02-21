(ns metabase-enterprise.replacement.acceptance-test
  "End-to-end acceptance test for source replacement.

  Modeled after the real dependency landscape in the stats Metabase instance, where
  the most heavily-used model (card 4523) had:
    - 1,991 direct card dependents (MBQL + native)
    - 25 dashboard dependents
    - 2 transform dependents
    - 454 depth-2 (grandchild) card dependents

  This test creates a miniature version of that graph and replaces the source model
  via the HTTP API, then verifies every dependent was updated."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.runner :as runner]
   [metabase-enterprise.replacement.swap.native]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- card-with-query
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- model-with-query
  [model-name table-kw]
  (assoc (card-with-query model-name table-kw) :type :model))

(defn- card-sourced-from
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
  [card-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id inner-card) "}}"))
     :visualization_settings {}}))

(defn- wait-for-result-metadata
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

(defn- transform-sourced-from-card
  [transform-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:source {:type "query"
              :query (lib/query mp (lib.metadata/card mp (:id inner-card)))}
     :name   transform-name
     :target {:database (mt/id) :table transform-name}}))

;;; ------------------------------------------------ card-slug Tests ------------------------------------------------

(deftest ^:parallel card-slug-test
  (let [card-slug #'metabase-enterprise.replacement.swap.native/card-slug]
    (testing "simple name"
      (is (= "my-cool-query" (card-slug "My Cool Query"))))
    (testing "collapses consecutive hyphens from parentheses (matches frontend slugg behavior)"
      (is (= "monthly-revenue-customer-replacement"
             (card-slug "Monthly Revenue (Customer) (Replacement)"))))
    (testing "trims leading/trailing hyphens"
      (is (= "test" (card-slug "(test)"))))))

;;; ------------------------------------------------ Acceptance Test ------------------------------------------------

(deftest replace-model-acceptance-test
  (testing "Full replacement of a heavily-used model: MBQL children, native children, grandchildren, transforms"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "acceptance-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/ReplacementRun :model/Transform]
            (let [;; ── The model we'll replace ──
                  old-model   (card/create-card! (model-with-query "Old Products Model" :products) user)
                  _           (wait-for-result-metadata (:id old-model))

                  ;; ── The replacement model (same table, different card) ──
                  new-model   (card/create-card! (model-with-query "New Products Model" :products) user)

                  ;; ── MBQL children (direct dependents) ──
                  mbql-child-1 (card/create-card! (card-sourced-from "MBQL Child 1" old-model) user)
                  mbql-child-2 (card/create-card! (card-sourced-from "MBQL Child 2" old-model) user)

                  ;; ── Native child (references via {{#id}}) ──
                  native-child (card/create-card! (native-card-sourced-from "Native Child" old-model) user)
                  _            (wait-for-result-metadata (:id native-child))

                  ;; ── Grandchild: MBQL card sourced from an MBQL child ──
                  grandchild   (card/create-card! (card-sourced-from "Grandchild" mbql-child-1) user)

                  ;; ── Grandchild via native: MBQL card sourced from native child ──
                  grandchild-via-native (card/create-card! (card-sourced-from "Grandchild via Native" native-child) user)]

              (mt/with-temp [;; ── Transform sourced from the model ──
                             :model/Transform {transform-id :id}
                             (transform-sourced-from-card "acceptance_transform" old-model)

                             ;; ── Dashboard with model card and a child card ──
                             :model/Dashboard {dashboard-id :id} {:name "Acceptance Dashboard"}
                             :model/DashboardCard {dashcard-model-id :id}
                             {:dashboard_id dashboard-id
                              :card_id      (:id old-model)}
                             :model/DashboardCard {dashcard-child-id :id}
                             {:dashboard_id dashboard-id
                              :card_id      (:id mbql-child-1)}]

                ;; ── Execute the replacement via runner (synchronous) ──
                (runner/run-swap [:card (:id old-model)] [:card (:id new-model)])

                ;; ── Verify MBQL children point to new model ──
                (testing "MBQL children have updated source-card"
                  (doseq [[label card-id] [["MBQL Child 1" (:id mbql-child-1)]
                                           ["MBQL Child 2" (:id mbql-child-2)]]]
                    (testing label
                      (let [q (t2/select-one-fn :dataset_query :model/Card :id card-id)]
                        (is (= (:id new-model) (get-in q [:stages 0 :source-card])))))))

                ;; ── Verify native child's SQL was updated ──
                (testing "Native child references new model in SQL"
                  (let [q   (t2/select-one-fn :dataset_query :model/Card :id (:id native-child))
                        sql (get-in q [:stages 0 :native])]
                    (is (re-find (re-pattern (str "\\{\\{#" (:id new-model) "[^0-9]")) sql)
                        "Native SQL should contain {{#<new-model-id>}}")
                    (is (not (re-find (re-pattern (str "\\{\\{#" (:id old-model) "[^0-9]")) sql))
                        "Native SQL should not contain {{#<old-model-id>}}")))

                ;; ── Verify grandchildren are unchanged (they don't directly reference the model) ──
                (testing "Grandchild still references its direct parent (MBQL child 1), not the model"
                  (let [q (t2/select-one-fn :dataset_query :model/Card :id (:id grandchild))]
                    (is (= (:id mbql-child-1) (get-in q [:stages 0 :source-card])))))

                (testing "Grandchild via native still references native child"
                  (let [q (t2/select-one-fn :dataset_query :model/Card :id (:id grandchild-via-native))]
                    (is (= (:id native-child) (get-in q [:stages 0 :source-card])))))

                ;; ── Verify transform source query was updated ──
                (testing "Transform's source query references new model"
                  (let [src (t2/select-one-fn :source :model/Transform :id transform-id)]
                    (is (= (:id new-model) (get-in src [:query :stages 0 :source-card])))))

                ;; ── Verify dependencies were updated ──
                (testing "Dependencies point to new model"
                  (let [deps-to-old (t2/select :model/Dependency
                                               :to_entity_type :card
                                               :to_entity_id   (:id old-model))
                        deps-to-new (t2/select :model/Dependency
                                               :to_entity_type :card
                                               :to_entity_id   (:id new-model))]
                    (is (empty? deps-to-old)
                        "No dependencies should remain pointing to old model")
                    (is (seq deps-to-new)
                        "Dependencies should now point to new model")))))))))))
