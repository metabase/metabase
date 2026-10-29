(ns metabase-enterprise.dependencies.analysis-finding-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.dependencies.analysis :as deps.analysis]
   [metabase-enterprise.dependencies.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.hooks :as deps.hooks]
   [metabase-enterprise.dependencies.models.analysis-finding :as models.analysis-finding]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as models.analysis-finding-error]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- run-jobs!
  "Run the dependency job, whose current dependencies the analysis job waits for, then the analysis job, until each has
  nothing left to do."
  []
  (deps.test/synchronously-run-dependency-job!)
  (mt/with-premium-features #{:dependencies}
    (deps.test/run-analysis-finding-job!)))

(defn- backfill-all-entity-analyses! []
  (run-jobs!))

(defn- status [entity-type entity-id]
  (t2/select-one :model/AnalysisFindingStatus :entity_type entity-type :entity_id entity-id))

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
        (run-jobs!)
        (is (= #{models.analysis-finding/*current-analysis-finding-version*}
               (t2/select-fn-set :analysis_version
                                 :model/AnalysisFindingStatus
                                 :entity_id [:in [card-id other-card-id]]
                                 :entity_type :card)))))))

(deftest ^:synchronized does-not-repeatedly-analyze-entities-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products-id (mt/id :products)
        orders-id (mt/id :orders)
        products (lib.metadata/table mp products-id)
        orders (lib.metadata/table mp orders-id)]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (is (= #{card-id other-card-id} (set (filter #{card-id other-card-id} (analyzed-ids! run-jobs!)))))
        (is (empty? (filter #{card-id other-card-id} (analyzed-ids! run-jobs!))))))))

(deftest ^:synchronized re-analyze-entities-when-analysis-version-bumped-test
  (backfill-all-entity-analyses!)
  (let [mp (mt/metadata-provider)
        products (lib.metadata/table mp (mt/id :products))
        orders (lib.metadata/table mp (mt/id :orders))]
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                     :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
        (run-jobs!)
        (is (empty? (filter #{card-id other-card-id} (analyzed-ids! run-jobs!))))
        (binding [models.analysis-finding/*current-analysis-finding-version* (inc models.analysis-finding/*current-analysis-finding-version*)]
          (is (= #{card-id other-card-id} (set (filter #{card-id other-card-id} (analyzed-ids! run-jobs!))))))))))

(deftest ^:synchronized does-analyze-native-entities-test
  (testing "failed analysis result is appropriately stored in the appdb"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "utter nonsense")}]
          (run-jobs!)
          (is (= models.analysis-finding/*current-analysis-finding-version*
                 (:analysis_version (status :card card-id))))
          (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                        :entity_id card-id
                                        :entity_type :card))))))))

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
          (run-jobs!)
          (is (= models.analysis-finding/*current-analysis-finding-version*
                 (:analysis_version (status :card card-id))))
          (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                        :entity_id card-id
                                        :entity_type :card))))))))

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

(deftest ^:synchronized analyze-batch-picks-up-missing-analyses-test
  (testing "analyze-batch! picks up entities with no pre-existing AnalysisFinding"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
          (testing "card has no analysis finding initially"
            (is (not (t2/exists? :model/AnalysisFinding
                                 :entity_type :card
                                 :entity_id card-id))))
          (testing "the jobs create the analysis of the card"
            (run-jobs!))
          (testing "card now has an analysis finding"
            (is (t2/exists? :model/AnalysisFinding
                            :entity_type :card
                            :entity_id card-id))))))))

(deftest ^:synchronized failed-analysis-waits-for-change-test
  (testing "an entity whose analysis keeps throwing records a failed finding, and is given up on until it changes"
    (backfill-all-entity-analyses!)
    (let [mp       (mt/metadata-provider)
          products (lib.metadata/table mp (mt/id :products))]
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/AnalysisFindingError]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}]
            (with-redefs-fn {#'deps.analysis-finding/entity-db-id (fn [_] (throw (ex-info "Broken" {})))}
              run-jobs!)
            (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                          :entity_type :card :entity_id card-id)))
            (is (empty? (filter #{card-id} (analyzed-ids! run-jobs!))))))))))

(deftest ^:synchronized analysis-re-analyzes-changed-entity-and-direct-dependents-test
  (testing "after a card's query changes, the analysis finding job re-analyzes it and the cards directly depending on
           it, and nothing for a question's rename"
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
            (run-jobs!)
            (t2/update! :model/Card gp-id {:name "Renamed"})
            (is (empty? (filter #{gp-id p-id c-id} (analyzed-ids! run-jobs!))))
            (t2/update! :model/Card gp-id {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))})
            (is (= #{gp-id p-id}
                   (set (filter #{gp-id p-id c-id} (analyzed-ids! run-jobs!)))))))))))

(deftest ^:synchronized analysis-follows-table-field-write-test
  (testing "a write of a field of a table re-analyzes the entities depending on the table"
    (backfill-all-entity-analyses!)
    (let [mp (mt/metadata-provider)]
      (mt/test-helpers-set-global-values!
        (mt/with-premium-features #{:dependencies}
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                         :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                              :to_entity_type :table :to_entity_id (mt/id :products)}]
            (run-jobs!)
            (is (not (deps.test/analysis-finding-pending? :card card-id)))
            (mt/with-temp-vals-in-db :model/Field (mt/id :products :title) {:description "Changed"}
              (is (deps.test/analysis-finding-pending? :table (mt/id :products)))
              (is (some #{card-id} (analyzed-ids! run-jobs!))))))))))

(deftest ^:synchronized cyclic-dependency-drain-terminates-test
  (testing "the analysis finding job terminates on a cyclic dependency graph"
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
          (let [done (future (run-jobs!))]
            (is (not= ::timeout (deref done 30000 ::timeout))
                "the analysis finding job must terminate on a cyclic graph")
            (is (not (deps.test/run-analysis-finding-job!)) "and leave nothing to do")))))))

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
                  (t2/select-one :model/AnalysisFinding :entity_type :transform :entity_id transform-id)))
          (is (empty? (models.analysis-finding-error/errors-for-entity :transform transform-id))))))))

(deftest ^:synchronized unanalyzable-entity-records-error-test
  (testing "an entity whose database can't be resolved records an error finding instead of no-oping forever"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/AnalysisFindingError]
        (mt/with-temp [:model/Card card {:dataset_query (mt/native-query {:query "SELECT 1"})
                                         :database_id   (mt/id)}]
          (let [cid (:id card)]
            (with-redefs-fn {#'deps.analysis-finding/entity-db-id (constantly nil)}
              (fn []
                (lib-be/with-metadata-provider-cache
                  (deps.analysis-finding/upsert-analysis! (t2/instance :model/Card card)))))
            (is (false? (t2/select-one-fn :result :model/AnalysisFinding
                                          :entity_type :card :entity_id cid)))
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
              (with-redefs-fn {#'deps.analysis-finding/entity-db-id (constantly nil)}
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
                                        (fn [entity & args]
                                          (when (wanted (:id entity))
                                            (swap! providers conj (:lib/metadata (:dataset_query entity))))
                                          (apply upsert-analysis! entity args))]
              (run-jobs!)))
          (testing "both cards were selected, so the assertion below is meaningful"
            (is (= 2 (count @providers))))
          (testing "and they carry the same provider instance"
            ;; Identity, not equality: providers compare equal when they wrap the same database id, so `=` would be
            ;; satisfied by two separate caches and would not detect the regression.
            (is (every? #(identical? (first @providers) %) @providers))))))))

(defn- analyzed-by-job!
  "The entities, as `[entity-type entity-id]`, that running the analysis finding job now analyzes, after the dependency
  job it waits for."
  []
  (deps.test/synchronously-run-dependency-job!)
  (let [analyzed (atom #{})
        upsert!  (mt/original-fn #'models.analysis-finding/upsert-analysis!)]
    (mt/with-dynamic-fn-redefs [models.analysis-finding/upsert-analysis!
                                (fn [entity-type entity-id & args]
                                  (swap! analyzed conj [entity-type entity-id])
                                  (apply upsert! entity-type entity-id args))]
      (deps.test/run-analysis-finding-job!))
    @analyzed))

(defn- analyzed-among!
  "Which of the entities `nodes`, `[entity-type entity-id]`, running the analysis finding job now analyzes."
  [& nodes]
  (into #{} (filter (set nodes)) (analyzed-by-job!)))

(defn- assert-has-analyses
  "Asserts that a given set of entities have the appropriate analysis version.

  Format is `{entity-type {entity-id analysis-version}}`.

  Use -1 for analysis-version if you want to check that an analysis exists without asserting a specific version.

  Use nil for analysis-version if you want to check that no analysis exists."
  [spec]
  (doseq [[entity-type ids-and-versions] spec]
    (let [analyses-map (->> (t2/select [:model/AnalysisFindingStatus :entity_id :analysis_version]
                                       :entity_type entity-type)
                            (into {} (map (juxt :entity_id :analysis_version))))]
      (doseq [[id expected-version] ids-and-versions]
        (testing (str "Checking " entity-type " " id)
          (if (= expected-version -1)
            (is (contains? analyses-map id))
            (is (= expected-version (analyses-map id)))))))))

(deftest ^:synchronized card-update-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Card updates should mark the card stale and trigger the background job"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id} {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))})
           (assert-has-analyses
            {:card {parent-card-id nil}})
           (is (nil? (t2/select-one-fn :analysis_version :model/AnalysisFindingStatus
                                       :entity_type :card
                                       :entity_id child-card-id))
               "an update writes no analysis record")))))))

(deftest ^:synchronized card-update-updates-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "changing a card's query has the job re-analyze it and its dependents"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {child-card-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp parent-card-id))}
                        :model/Dependency _ {:from_entity_type :card
                                             :from_entity_id child-card-id
                                             :to_entity_type :card
                                             :to_entity_id parent-card-id}]
           (analyzed-by-job!)
           (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp orders)})
           (deps.test/synchronously-run-dependency-job!)
           (is (= #{[:card parent-card-id] [:card child-card-id]}
                  (analyzed-among! [:card parent-card-id] [:card child-card-id])))))))))

(deftest ^:synchronized card-update-triggers-native-cards-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a native card's update with new run metadata has the job re-analyze it and its direct dependents"
       (mt/with-temp [:model/Card {parent-id :id} {:dataset_query (lib/native-query mp "select * from products")}
                      :model/Card {child-id :id}  {:dataset_query (lib/query mp (lib.metadata/card mp parent-id))}
                      :model/Dependency _ {:from_entity_type :card :from_entity_id child-id
                                           :to_entity_type :card :to_entity_id parent-id}]
         (analyzed-by-job!)
         (t2/update! :model/Card parent-id {:dataset_query   (lib/native-query mp "select * from orders")
                                            :result_metadata (get-in (qp/process-query (lib/native-query mp "select * from orders"))
                                                                     [:data :results_metadata :columns])})
         (deps.test/synchronously-run-dependency-job!)
         (is (= #{[:card parent-id] [:card child-id]}
                (analyzed-among! [:card parent-id] [:card child-id]))))))))

(deftest ^:synchronized card-update-analyzes-dependents-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a card update has the job re-analyze the card and its dependents, transforms included"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {parent-card-id :id} {:dataset_query (lib/query mp products)}]
           (mt/with-temp [:model/Transform {transform-id :id} {:source {:type  :query
                                                                        :query (lib/query mp (lib.metadata/card
                                                                                              (mt/metadata-provider)
                                                                                              parent-card-id))}
                                                               :name   "transform_sample"
                                                               :target {:schema "public"
                                                                        :name   "sample"
                                                                        :type   :table}}
                          :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}]
             (analyzed-by-job!)
             (t2/update! :model/Card parent-card-id {:dataset_query (lib/query mp orders)})
             (is (= #{[:card parent-card-id] [:transform transform-id]}
                    (analyzed-among! [:card parent-card-id] [:transform transform-id] [:card other-card-id]))))))))))

(deftest ^:synchronized transform-update-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform update does not error when no analyses exist yet"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}]
           (is (= 1 (t2/update! :model/Transform transform-id
                                {:source {:type :query
                                          :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}})))))))))

(deftest ^:synchronized transform-update-updates-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a transform update has the job re-analyze it"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                      :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public"
                                                                      :name "sample"
                                                                      :type :table}}]
           (analyzed-by-job!)
           (t2/update! :model/Transform transform-id {:source {:type :query
                                                               :query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}})
           (is (= #{[:transform transform-id]} (analyzed-among! [:transform transform-id])))))))))

(deftest ^:synchronized transform-update-triggers-native-transforms-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Native transform updates do not error"
       (mt/with-temp [:model/Transform {transform-id :id} {:source {:type :query
                                                                    :query (lib/native-query mp "select * from products")}
                                                           :name "transform_sample"
                                                           :target {:schema "public"
                                                                    :name "sample"
                                                                    :type :table}}]
         (is (= 1 (t2/update! :model/Transform transform-id
                              {:source {:type :query
                                        :query (lib/native-query mp "select * from orders")}}))))))))

(deftest ^:synchronized transform-run-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Transform run completes without error when no analyses exist"
       (let [products (lib.metadata/table mp (mt/id :products))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public" :name "sample" :type :table}}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (is (nil? (deps.hooks/after-transform-run transform-id nil)))))))))

(deftest ^:synchronized transform-run-without-table-analyzes-nothing-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a transform run re-analyzes nothing by itself, since the sync of its output table marks what reads that table"
       (let [products (lib.metadata/table mp (mt/id :products))
             orders   (lib.metadata/table mp (mt/id :orders))]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Transform {transform-id :id} {:source {:type :query :query (lib/query mp products)}
                                                             :name "transform_sample"
                                                             :target {:schema "public" :name "sample" :type :table}}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :transform :to_entity_id transform-id}]
           (analyzed-by-job!)
           (deps.hooks/after-transform-run transform-id nil)
           (is (= #{}
                  (analyzed-among! [:card card-id] [:transform transform-id] [:card other-card-id])))))))))

(deftest ^:synchronized segment-update-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [_]
     (testing "Segment update does not error when no analyses exist yet"
       (let [products-id (mt/id :products)
             price-field-id (mt/id :products :price)]
         (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                         :definition {:filter [:> [:field price-field-id nil] 50]}}]
           (is (= 1 (t2/update! :model/Segment segment-id
                                {:definition {:filter [:< [:field price-field-id nil] 50]}})))))))))

(deftest ^:synchronized segment-update-analyzes-segment-and-dependents-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a segment update has the job re-analyze the segment and the cards using it"
       (let [products-id    (mt/id :products)
             price-field-id (mt/id :products :price)
             products       (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Segment {segment-id :id} {:table_id products-id
                                                         :definition {:filter [:> [:field price-field-id nil] 50]}}]
           (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/filter (lib/query mp products)
                                                                                (lib.metadata/segment (mt/metadata-provider)
                                                                                                      segment-id))}]
             (analyzed-by-job!)
             (t2/update! :model/Segment segment-id {:definition {:filter [:< [:field price-field-id nil] 50]}})
             (is (= #{[:segment segment-id] [:card card-id]}
                    (analyzed-among! [:segment segment-id] [:card card-id]))))))))))

(deftest ^:synchronized table-metadata-update-triggers-dependent-analysis-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a table metadata update has the job re-analyze the table's dependents, not unrelated cards"
       (let [products-id (mt/id :products)
             orders      (lib.metadata/table mp (mt/id :orders))
             products    (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (analyzed-by-job!)
           (mt/with-temp [:model/TableUserSettings _ {:table_id products-id :display_name "Products renamed"}]
             (is (= #{[:card card-id]} (analyzed-among! [:card card-id] [:card other-card-id]))))))))))

(deftest ^:synchronized table-metadata-update-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Table metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (mt/with-temp [:model/TableUserSettings _ {:table_id products-id :display_name "Products renamed"}]
             (assert-has-analyses {:card {card-id nil}}))))))))

(deftest ^:synchronized field-metadata-update-triggers-dependent-analysis-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "a field metadata update has the job re-analyze the dependents of the field's table"
       (let [products-id (mt/id :products)
             orders      (lib.metadata/table mp (mt/id :orders))
             products    (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Card {other-card-id :id} {:dataset_query (lib/query mp orders)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (analyzed-by-job!)
           (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :products :category)
                                                      :display_name "Category renamed"}]
             (is (= #{[:card card-id]} (analyzed-among! [:card card-id] [:card other-card-id]))))))))))

(deftest ^:synchronized field-metadata-update-works-with-no-analyses-test
  (deps.test/run-with-dependencies-setup!
   (fn [mp]
     (testing "Field metadata update does not error when no findings exist yet"
       (let [products-id (mt/id :products)
             products (lib.metadata/table mp products-id)]
         (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/query mp products)}
                        :model/Dependency _ {:from_entity_type :card :from_entity_id card-id
                                             :to_entity_type :table :to_entity_id products-id}]
           (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :products :category) :display_name "Category renamed"}]
             (assert-has-analyses {:card {card-id nil}}))))))))
