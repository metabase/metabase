(ns metabase-enterprise.dependencies.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as models.analysis-finding-error]
   [metabase-enterprise.dependencies.task.analysis-finding :as task.analysis-finding]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- backfill-all-entity-analyses! []
  (doseq [model [:card :transform :segment]]
    (while (pos? (deps.analysis-finding/analyze-batch! model 100)))))

(deftest ^:synchronized can-analyze-entity-batches-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.analysis-finding/analyze-batch! :card 2)))
        (is (= #{models.analysis-finding/*current-analysis-finding-version*}
               (t2/select-fn-set :analysis_version
                                 :model/AnalysisFinding
                                 :analyzed_entity_id [:in [card-id other-card-id]]
                                 :analyzed_entity_type :card)))))))

(deftest ^:synchronized does-not-repeatedly-analyze-entities-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.analysis-finding/analyze-batch! :card 2)))
        (is (= 0 (deps.analysis-finding/analyze-batch! :card 2)))))))

(deftest ^:synchronized re-analyze-entities-when-analysis-version-bumped-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products (lib.metadata/table mp (mt/id :products))
        orders (lib.metadata/table mp (mt/id :orders))]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card _ {:dataset_query (lib/query mp products)}
                     :model/Card _ {:dataset_query (lib/query mp orders)}]
        (is (= 2 (deps.analysis-finding/analyze-batch! :card 2)))
        (is (= 0 (deps.analysis-finding/analyze-batch! :card 2)))
        (binding [models.analysis-finding/*current-analysis-finding-version* (inc models.analysis-finding/*current-analysis-finding-version*)]
          (is (= 2 (deps.analysis-finding/analyze-batch! :card 2))))))))

(deftest ^:synchronized does-analyze-native-entities-test
  (testing "failed analysis result is appropriately stored in the appdb"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "utter nonsense")}]
          (is (= 1 (deps.analysis-finding/analyze-batch! :card 1)))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

(deftest ^:synchronized does-report-errors-for-missing-refs-in-fields-test
  (testing "missing (not inactive) field refs in :fields are reported as findings (GHY-3157)"
    (backfill-all-entity-analyses!)
    (let [mp      (mt/metadata-provider)
          orders  (lib.metadata/table mp (mt/id :orders))
          base    (lib/query mp orders)
          cols    (vec (take 5 (lib/returned-columns base orders)))
          bad-col (-> (first cols)
                      lib/ref
                      (assoc 2 "bad_column"))
          query   (lib/with-fields base (conj cols bad-col))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
          (is (= 1 (deps.analysis-finding/analyze-batch! :card 1)))
          (is (= [models.analysis-finding/*current-analysis-finding-version* false]
                 (t2/select-one-fn (juxt :analysis_version :result)
                                   :model/AnalysisFinding
                                   :analyzed_entity_id card-id
                                   :analyzed_entity_type :card))))))))

;; TODO: (bshepherdson, 2026-02-05) Add a test like does-not-report-errors-in-removable-refs-test-1-stage-fields for
;; join clause :fields as well. See QUE-3081 and QUE-3044.

(deftest ^:parallel reports-missing-field-in-downstream-card-fields-test
  (testing "Q2 based on Q1 with :fields referencing a column Q1 no longer returns should be reported (GHY-3157)"
    (let [mp          meta/metadata-provider
          q1          (lib/query mp (meta/table-metadata :orders))
          q1-cols     (lib/returned-columns q1)
          removed-col (m/find-first #(= (:name %) "ID") q1-cols)
          ;; Card 101 = Q1 with ID removed from result-metadata (simulates Q1 dropping that field)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 101 q1
                       {:result-metadata (vec (remove #(= (:name %) "ID") q1-cols))})
          ;; Q2: query based on card 101, with :fields including the now-missing ID
          q2-base     (lib/query mp {:lib/type :metadata/card :id 101})
          q2-cols     (lib/returned-columns q2-base)
          q2          (lib/with-fields q2-base (conj (vec q2-cols) (lib/ref removed-col)))
          ;; Card 102 = Q2 (provide result-metadata explicitly since q2 has a bad ref)
          mp          (lib.tu/metadata-provider-with-card-from-query
                       mp 102 q2
                       {:result-metadata (vec q2-cols)})
          results     (deps.analysis/check-entity mp :card 102)]
      (is (seq results)
          "Q2 should have findings for the missing ID column from Q1"))))

(defn- analyzed-ids!
  "The IDs of the cards `thunk` analyzes, in order."
  [thunk]
  (let [analyzed (atom [])
        upsert!  (mt/original-fn #'models.analysis-finding/upsert-analysis!)]
    (mt/with-dynamic-fn-redefs [models.analysis-finding/upsert-analysis!
                                (fn [entity-type entity-id & args]
                                  (when (= :card entity-type)
                                    (swap! analyzed conj entity-id))
                                  (apply upsert! entity-type entity-id args))]
      (thunk))
    @analyzed))

(deftest ^:synchronized analyze-batch-picks-up-missing-analyses-test
  (testing "analyze-batch! picks up entities with no pre-existing AnalysisFinding"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
          (testing "card has no analysis finding initially"
            (is (not (t2/exists? :model/AnalysisFinding
                                 :analyzed_entity_type :card
                                 :analyzed_entity_id card-id))))
          (testing "analyze-batch! creates analysis for the card"
            (lib-be/with-metadata-provider-cache
              (is (pos? (deps.analysis-finding/analyze-batch! :card 10)))))
          (testing "card now has an analysis finding"
            (is (t2/exists? :model/AnalysisFinding
                            :analyzed_entity_type :card
                            :analyzed_entity_id card-id))))))))

(deftest ^:synchronized failed-analysis-waits-for-a-change-test
  (testing "an entity whose analysis throws records a failed finding of its version, and is not analyzed again"
    (backfill-all-entity-analyses!)
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFindingError]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
            (with-redefs-fn {#'deps.analysis-finding/instance-db-id (fn [_] (throw (ex-info "Broken" {})))}
              (fn []
                (deps.analysis-finding/analyze-batch! :card 100000)))
            (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                          :analyzed_entity_type :card :analyzed_entity_id card-id)))
            (is (empty? (filter #{card-id} (analyzed-ids! #(deps.analysis-finding/analyze-batch! :card 100)))))))))))

(deftest ^:synchronized analyze-dependents-batch-test
  (testing "the dependents of changed entities are re-analyzed transitively, each once, not the entities themselves"
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {gp-id :id} {:dataset_query (lib/query mp products)}
                       :model/Card {p-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp gp-id))}
                       :model/Card {c-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp p-id))}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id p-id
                                            :to_entity_type :card :to_entity_id gp-id}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                            :to_entity_type :card :to_entity_id p-id}]
          (let [analyzed (analyzed-ids! #(deps.analysis-finding/analyze-dependents-batch! 100))]
            (is (= [p-id c-id] (filter #{gp-id p-id c-id} (sort analyzed))))
            (is (= (count analyzed) (count (distinct analyzed)))))
          (testing "and not again while nothing changed"
            (is (empty? (filter #{gp-id p-id c-id}
                                (analyzed-ids! #(deps.analysis-finding/analyze-dependents-batch! 100)))))))))))

(deftest ^:synchronized check-entities-re-analyzes-a-changed-subtree-test
  (testing "after an entity changes, the analysis finding job re-analyzes it and its whole transitive subtree"
    (backfill-all-entity-analyses!)
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/test-helpers-set-global-values!
        (mt/with-premium-features #{:dependencies}
          (mt/with-temp [:model/Card {gp-id :id} {:dataset_query (lib/query mp products)}
                         :model/Card {p-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp gp-id))}
                         :model/Card {c-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp p-id))}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id p-id
                                              :to_entity_type :card :to_entity_id gp-id}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id c-id
                                              :to_entity_type :card :to_entity_id p-id}]
            (#'task.analysis-finding/check-entities!)
            (t2/update! :model/Card gp-id {:name "Renamed"})
            (is (= #{gp-id p-id c-id}
                   (set (filter #{gp-id p-id c-id} (analyzed-ids! #(#'task.analysis-finding/check-entities!))))))))))))

(deftest ^:synchronized transitive-analysis-through-non-analyzable-entity-test
  (testing "the dependents of a changed entity are reached beyond non-analyzable intermediaries (e.g., tables)"
    (let [mp          (mt/metadata-provider)
          products    (lib.metadata/table mp (mt/id :products))
          products-id (mt/id :products)]
      (mt/with-premium-features #{:dependencies}
        ;; Chain: card → (depends on) table → (depends on) transform.
        (mt/with-temp [:model/Transform {transform-id :id}
                       {:source {:type :query :query (lib/query mp products)}
                        :name "test_transitive_transform"
                        :target {:schema "public" :name "transitive_test_table" :type :table}}
                       :model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                       :model/Dependency _ {:from_entity_type :table :from_entity_id products-id
                                            :to_entity_type :transform :to_entity_id transform-id}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                            :to_entity_type :table :to_entity_id products-id}]
          (deps.test/record-current-version! :model/AnalysisFindingStatus :table products-id)
          (is (some #{card-id} (analyzed-ids! #(deps.analysis-finding/analyze-dependents-batch! 100)))))))))

(deftest ^:synchronized cyclic-dependency-drain-terminates-test
  (testing "check-entities! terminates on a cyclic dependency graph"
    (backfill-all-entity-analyses!)
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {a-id :id} {:dataset_query (lib/query mp products)}
                       :model/Card {b-id :id} {:dataset_query (lib/query mp products)}
                       ;; cycle: a depends on b, and b depends on a
                       :model/Dependency _ {:from_entity_type :card :from_entity_id a-id
                                            :to_entity_type :card :to_entity_id b-id}
                       :model/Dependency _ {:from_entity_type :card :from_entity_id b-id
                                            :to_entity_type :card :to_entity_id a-id}]
          (let [done (future (#'task.analysis-finding/check-entities!))]
            (is (not= ::timeout (deref done 30000 ::timeout))
                "check-entities! must terminate on a cyclic graph")
            (is (false? @done) "and leave nothing to do")))))))

(deftest ^:synchronized python-transform-records-clean-finding-test
  (testing "GHY-3584: a Python transform has no query, so upsert-analysis! resolves its database from source_database_id and records a clean finding"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingError]
        (mt/with-temp [:model/Transform {transform-id :id} {:source {:type            :python
                                                                     :source-database (mt/id)
                                                                     :source-tables   []
                                                                     :body            "def transform():\n    pass"}}]
          (lib-be/with-metadata-provider-cache
            (deps.analysis-finding/upsert-analysis! (t2/select-one :model/Transform transform-id)))
          (is (=? {:result true}
                  (t2/select-one :model/AnalysisFinding :analyzed_entity_type :transform :analyzed_entity_id transform-id)))
          (is (empty? (models.analysis-finding-error/errors-for-entity :transform transform-id))))))))

(deftest ^:synchronized unanalyzable-entity-records-error-test
  (testing "an entity whose database can't be resolved records an error finding instead of no-oping forever"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingError]
        (mt/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT 1"})
                                         :database_id   (mt/id)}]
          (let [cid (:id card)]
            (with-redefs-fn {#'deps.analysis-finding/instance-db-id (constantly nil)}
              (fn []
                (lib-be/with-metadata-provider-cache
                  (deps.analysis-finding/upsert-analysis! (t2/instance :model/Card card)))))
            (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                          :analyzed_entity_type :card :analyzed_entity_id cid)))
            (is (seq (models.analysis-finding-error/errors-for-entity :card cid))
                "an error finding is recorded explaining why the entity couldn't be analyzed")))))))

(deftest ^:synchronized unanalyzable-entity-rechecks-when-database-resolvable-again-test
  (testing "after a no-database error, the entity is analyzed normally once its database resolves again"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingError]
        (let [mp       (mt/metadata-provider)
              products (lib.metadata/table mp (mt/id :products))]
          (mt/with-temp [:model/Card card {:dataset_query (lib/query mp products)}]
            (let [cid (:id card)]
              (with-redefs-fn {#'deps.analysis-finding/instance-db-id (constantly nil)}
                (fn []
                  (lib-be/with-metadata-provider-cache
                    (deps.analysis-finding/upsert-analysis! (t2/instance :model/Card card)))))
              (is (seq (models.analysis-finding-error/errors-for-entity :card cid)))
              (lib-be/with-metadata-provider-cache
                (deps.analysis-finding/upsert-analysis! (t2/instance :model/Card card)))
              (is (empty? (models.analysis-finding-error/errors-for-entity :card cid))
                  "re-analyzed normally: the database error is replaced by a clean result"))))))))

(deftest ^:synchronized analyze-batch-shares-one-metadata-provider-test
  (testing "Every entity in an analysis batch must share one MetadataProvider per database. Reading an entity attaches
           a provider to its query, so selecting the batch outside the cache gives each entity a private one. Nothing
           reads through those providers today -- upsert-analysis! builds its own from the database id and passes it
           explicitly -- so this is a latent trap rather than a live leak: the moment an entity is analyzed through its
           own query, a batch of 500 retains 500 providers' worth of fetched metadata. upsert-analysis! already throws
           when no cache is bound, so the cache is meant to cover this work; only the select sat outside it."
    (backfill-all-entity-analyses!)
    (let [providers   (atom [])
          native-card (fn [sql] {:database (mt/id) :type :native :native {:query sql}})]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card1-id :id} {:dataset_query (native-card "select id from orders")}
                       :model/Card {card2-id :id} {:dataset_query (native-card "select id from products")}]
          (let [wanted #{card1-id card2-id}
                upsert-analysis! (mt/original-fn #'deps.analysis-finding/upsert-analysis!)]
            (mt/with-dynamic-fn-redefs [deps.analysis-finding/upsert-analysis!
                                        (fn [instance & args]
                                          (when (wanted (:id instance))
                                            (swap! providers conj (:lib/metadata (:dataset_query instance))))
                                          (apply upsert-analysis! instance args))]
              (deps.analysis-finding/analyze-batch! :card 500)))
          (testing "both cards were selected, so the assertion below is meaningful"
            (is (= 2 (count @providers))))
          (testing "and they carry the same provider instance"
            ;; Identity, not equality: providers compare equal when they wrap the same database id, so `=` would be
            ;; satisfied by two separate caches and would not detect the regression.
            (is (every? #(identical? (first @providers) %) @providers))))))))
