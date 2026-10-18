(ns metabase-enterprise.dependencies.result-metadata-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.query-processor.db :as qp.db]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table-query deps.test/table-query)

(def ^:private card-query deps.test/card-query)

(def ^:private stale? deps.test/result-metadata-pending?)

(defn- do-with-inference
  "Run `thunk` with the job's inference of a card done by `f`, called with the real inference, the query and the card."
  [f thunk]
  (let [infer (mt/original-fn #'queries/infer-metadata-with-model-overrides)]
    (mt/with-dynamic-fn-redefs [queries/infer-metadata-with-model-overrides (fn [query card] (f infer query card))]
      (thunk))))

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
  "Compute the dependency graph, then re-derive the result metadata of the cards depending on changed entities until
  nothing changed, as the job reruns itself."
  []
  (deps.test/synchronously-run-dependency-job!)
  (mt/with-premium-features #{:dependencies}
    (loop [runs 1]
      (when (and (pos? (deps.result-metadata/update-result-metadata! 1000)) (< runs 10))
        (recur (inc runs))))))

(defn- column [card-id column-name]
  (some #(when (= column-name (:name %)) %)
        (t2/select-one-fn :result_metadata :model/Card :id card-id)))

(defn- rename-column [metadata column-name display-name]
  (mapv #(cond-> % (= column-name (:name %)) (assoc :display_name display-name)) metadata))

(defmacro ^:private with-clean-statuses
  "Run `body` with the dependencies feature, each write committing on its own so that `updated_at` moves between
  them as it does between real requests, and the module's tables cleaned up after."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:dependencies}
       (mt/with-model-cleanup [:model/Dependency :model/DependencyStatus :model/AnalysisFinding
                               :model/AnalysisFindingStatus :model/ResultMetadataStatus]
         ~@body))))

(defn- reprocess!
  "Have the dependents of the entity `entity-type` `entity-id` re-derived again, as if it changed."
  [entity-type entity-id]
  (dependencies.db/clear-status-version! :model/ResultMetadataStatus entity-type entity-id))

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
        (testing "the card depending on the native card is left alone"
          (is (nil? (column after-native-id "Grand total"))))
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
  (testing "editing a model's column overrides re-derives the cards on the model, which take them"
    (with-clean-statuses
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (table-query :orders)}
                     :model/Card {card-id :id}  {:dataset_query (card-query model-id)}]
        (run-jobs!)
        (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card
                                                                                            :id model-id)
                                                                          "TOTAL" "Grand total")})
        (is (stale? :card model-id))
        (run-jobs!)
        (is (= "Grand total" (:display_name (column card-id "TOTAL"))))))))

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
  "Re-derive the dependents of the entity `entity-type` `entity-id` while `write!` runs in the middle of the inference
  of a card depending on it, returning how many entities the job took."
  [entity-type entity-id write!]
  (reprocess! entity-type entity-id)
  (do-with-inference (fn [infer query card]
                       (write!)
                       (infer query card))
                     #(mt/with-premium-features #{:dependencies}
                        (deps.result-metadata/update-result-metadata! 1000))))

(defn- store-run-metadata!
  "Store `metadata` as the result metadata of the Card with `card-id`, as a run of the card does."
  [card-id metadata]
  (#'qp.db/set-card-result-metadata! card-id metadata))

(defn- once!
  "A function running `f` the first time it is called and doing nothing after."
  [f]
  (let [called (atom false)]
    (fn [] (when (compare-and-set! called false true) (f)))))

(deftest user-save-during-rederive-test
  (testing "a user's save of a card during its re-derive is kept, and the card is re-derived again from it right away"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
          (is (= 1 (rederive-during-inference! :table (mt/id :orders)
                                               (once! #(t2/update! :model/Card card-id {:name "Renamed"})))))
          (is (= "Renamed" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= "Order total" (:display_name (column card-id "TOTAL"))))
          (is (not (stale? :table (mt/id :orders)))))))))

(deftest run-write-during-rederive-test
  (testing "a run storing a card's metadata during its re-derive is kept, and the card is re-derived again from it"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (let [run-metadata (-> (t2/select-one-fn :result_metadata :model/Card :id card-id)
                               (rename-column "TOTAL" "Run total")
                               (->> (mapv #(cond-> % (= "ID" (:name %)) (assoc :fingerprint {:global {:distinct-count 7}})))))]
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
            (is (= 1 (rederive-during-inference!
                      :table (mt/id :orders)
                      (once! #(store-run-metadata! card-id run-metadata)))))
            (is (= "Order total" (:display_name (column card-id "TOTAL"))))
            (is (= {:global {:distinct-count 7}} (:fingerprint (column card-id "ID"))))))))))

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
    (let [stored   [{:name "CREATED_AT" :id 36 :base_type "type/DateTime" :fingerprint {:global {:distinct-count 1}}}
                    {:name "CREATED_AT_2" :id 14 :base_type "type/DateTime" :fingerprint {:global {:distinct-count 2}}}]
          inferred [{:name "CREATED_AT" :id 36 :base_type :type/DateTime
                     :lib/desired-column-alias "PRODUCTS__via__PRODUCT_ID__CREATED_AT"}
                    {:name "CREATED_AT_2" :id 14 :base_type :type/DateTime :lib/desired-column-alias "CREATED_AT"}]]
      (is (=? [{:id 36 :fingerprint {:global {:distinct-count 1}}}
               {:id 14 :fingerprint {:global {:distinct-count 2}}}]
              (#'deps.result-metadata/patch-result-metadata stored inferred))))))

(deftest kebab-case-stored-metadata-test
  (testing "stored columns with kebab-case keys compare like snake_case ones"
    (is (= [{:semantic_type "type/FK" :fk_target_field_id 29}]
           (#'deps.result-metadata/comparable-metadata
            (mapv #'deps.result-metadata/normalize-column [{:semantic-type :type/FK :fk-target-field-id 29}]))))))

(deftest failure-waits-for-a-change-test
  (testing "an entity whose dependent failed is not processed again until it changes again, and then is"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (run-jobs!)
        (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
        (do-with-inference (fn [_infer _query _card] (throw (ex-info "Inference failed" {})))
                           run-jobs!)
        (is (nil? (column card-id "Grand total")))
        (is (not (stale? :card source-id)))
        (run-jobs!)
        (is (nil? (column card-id "Grand total")))
        (t2/update! :model/Card source-id {:name "Renamed"})
        (run-jobs!)
        (is (some? (column card-id "Grand total")))))))

(deftest result-metadata-job-before-dependency-job-test
  (testing "a card whose dependencies the dependency job computes after its upstream changed is re-derived once it does"
    (with-clean-statuses
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}]
          (run-jobs!)
          (let [card-id (t2/insert-returning-pk! :model/Card {:name                   "Dependent"
                                                              :display                :table
                                                              :visualization_settings {}
                                                              :creator_id             (mt/user->id :rasta)
                                                              :database_id            (mt/id)
                                                              :dataset_query          (card-query source-id)})]
            (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
            (mt/with-premium-features #{:dependencies}
              (deps.result-metadata/update-result-metadata! 1000))
            (is (nil? (column card-id "Grand total")))
            (run-jobs!)
            (is (some? (column card-id "Grand total")))))))))

(deftest new-edge-to-an-upstream-processed-before-the-save-test
  (testing "a new dependency on an entity processed before the dependent was saved has nothing processed again"
    (with-clean-statuses
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                       :model/Card _               {:dataset_query (card-query source-id)}]
          (run-jobs!)
          (is (not (stale? :card source-id)))
          (Thread/sleep 5)
          (t2/insert! :model/Card {:name                   "Dependent"
                                   :display                :table
                                   :visualization_settings {}
                                   :creator_id             (mt/user->id :rasta)
                                   :database_id            (mt/id)
                                   :dataset_query          (card-query source-id)})
          (deps.test/synchronously-run-dependency-job!)
          (is (not (stale? :card source-id))))))))

(deftest job-reruns-while-it-takes-entities-test
  (testing "the job runs again right away while it took entities, since a card it stored changed in turn"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card _               {:dataset_query (card-query source-id)}]
        (deps.test/synchronously-run-dependency-job!)
        (is (= 1 (#'task.result-metadata/run-batch!)))
        (run-jobs!)
        (is (nil? (#'task.result-metadata/run-batch!)))))))

(deftest record-version-guard-test
  (testing "a version is not recorded over a status cleared meanwhile, nor over one created meanwhile"
    (mt/with-model-cleanup [:model/ResultMetadataStatus]
      (let [card-id Integer/MAX_VALUE
            version (t/offset-date-time)
            status  #(t2/select-one :model/ResultMetadataStatus :entity_type :card :entity_id card-id)]
        (dependencies.db/clear-status-version! :model/ResultMetadataStatus :card card-id)
        (let [{:keys [id updated_at]} (status)]
          (Thread/sleep 5)
          (dependencies.db/clear-status-version! :model/ResultMetadataStatus :card card-id)
          (is (zero? (dependencies.db/record-status-version! :model/ResultMetadataStatus :card card-id
                                                             id updated_at version 0)))
          (is (nil? (:seen_updated_at (status)))))
        (let [{:keys [id updated_at]} (status)]
          (is (= 1 (dependencies.db/record-status-version! :model/ResultMetadataStatus :card card-id
                                                           id updated_at version 0)))
          (is (some? (:seen_updated_at (status)))))
        (testing "a status created by another writer is kept"
          (dependencies.db/clear-status-version! :model/ResultMetadataStatus :card card-id)
          (dependencies.db/record-status-version! :model/ResultMetadataStatus :card card-id nil nil version 0)
          (is (nil? (:seen_updated_at (status)))))))))

(deftest sandboxed-creator-ignored-test
  (testing "a card is re-derived as no user, like a save through the Card model, whatever its creator's sandbox hides"
    (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)]
                                                (lib/with-fields (table-query :venues)
                                                  [(lib.metadata/field mp (mt/id :venues :id))
                                                   (lib.metadata/field mp (mt/id :venues :name))
                                                   (lib.metadata/field mp (mt/id :venues :category_id))]))}}}
      (with-clean-statuses
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)
                                                  :creator_id    (mt/user->id :rasta)
                                                  :result_metadata []}]
          (deps.test/synchronously-run-dependency-job!)
          (reprocess! :table (mt/id :venues))
          (mt/with-premium-features #{:dependencies :sandboxes}
            (deps.result-metadata/update-result-metadata! 1000))
          (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
                 (mapv :name (t2/select-one-fn :result_metadata :model/Card :id card-id)))))))))

(deftest own-edit-rederives-only-dependents-test
  (testing "editing a card's query re-derives the cards depending on it, not the card itself, whose save inferred it"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (run-jobs!)
        (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
        (let [inferred (atom #{})]
          (do-with-inference (fn [infer query card]
                               (swap! inferred conj (:id card))
                               (infer query card))
                             run-jobs!)
          (is (= #{card-id} @inferred))
          (is (some? (column card-id "Grand total"))))))))

(defn- native-run-metadata [sql]
  (get-in (qp/process-query (lib/native-query (mt/metadata-provider) sql)) [:data :results_metadata :columns]))

(deftest native-card-result-metadata-test
  (testing "a write of a native card's run metadata re-derives its dependents"
    (with-clean-statuses
      (mt/with-temp [:model/Card {native-id :id} {:dataset_query   (lib/native-query (mt/metadata-provider)
                                                                                     "SELECT ID, NAME FROM VENUES")
                                                  :result_metadata (native-run-metadata "SELECT ID, NAME FROM VENUES")}
                     :model/Card {card-id :id}   {:dataset_query (card-query native-id)}]
        (run-jobs!)
        (t2/update! :model/Card native-id {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                            "SELECT ID, NAME, PRICE FROM VENUES")})
        (run-jobs!)
        (is (nil? (column card-id "PRICE")))
        (store-run-metadata! native-id (native-run-metadata "SELECT ID, NAME, PRICE FROM VENUES"))
        (is (stale? :card native-id))
        (run-jobs!)
        (is (some? (column card-id "PRICE")))
        (is (not (stale? :card native-id)))))))

(deftest measured-keys-test
  (testing "a re-derived column keeps what a run measured only while its root type and source type are unchanged"
    (let [stored {:name "X" :base_type "type/BigInteger" :database_type "BIGINT" :fingerprint {:type {:type/Number {}}}}
          patch  #(first (#'deps.result-metadata/patch-result-metadata [stored] [%]))]
      (testing "a run's refinement within the root type and source type is kept"
        (is (=? {:base_type "type/BigInteger" :fingerprint {:type {:type/Number {}}}}
                (patch {:name "X" :base_type :type/Integer :database_type "BIGINT"}))))
      (testing "a new root type takes the inferred type and fingerprint"
        (is (= {:name "X" :base_type :type/Text :database_type "VARCHAR" :fingerprint {:type {:type/Text {}}}}
               (patch {:name "X" :base_type :type/Text :database_type "VARCHAR" :fingerprint {:type {:type/Text {}}}}))))
      (testing "a new source type within the root type takes the inferred type"
        (is (= {:name "X" :base_type :type/Decimal :database_type "DECIMAL"}
               (patch {:name "X" :base_type :type/Decimal :database_type "DECIMAL"})))))))

(deftest remapped-column-test
  (testing "a card storing the metadata of a run with remapped columns is not rewritten, since inference adds them too"
    (mt/with-column-remappings [orders.product_id products.title]
      (let [query (table-query :orders)
            run   (get-in (qp/process-query query) [:data :results_metadata :columns])]
        (is (some :remapped_from run))
        (mt/with-temp [:model/Card card {:dataset_query query :result_metadata run}]
          (is (nil? (#'deps.result-metadata/rederived-result-metadata card))))))))

(deftest conflict-fails-test
  (testing "a card that keeps changing during its re-derive is left as the other writer stored it, and other cards proceed"
    (with-clean-statuses
      (mt/with-temp [:model/Card {orders-card-id :id}   {:dataset_query (table-query :orders)}
                     :model/Card {other-card-id :id}  {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (reprocess! :table (mt/id :orders))
        (do-with-inference (fn [infer query card]
                             (u/prog1 (rename-column (infer query card) "TOTAL" "Changed")
                               (when (= orders-card-id (:id card))
                                 (store-run-metadata!
                                  orders-card-id
                                  (rename-column (:result_metadata card) "TOTAL" (str (random-uuid)))))))
                           #(mt/with-premium-features #{:dependencies}
                              (deps.result-metadata/update-result-metadata! 1000)))
        (is (not= "Changed" (:display_name (column orders-card-id "TOTAL"))))
        (is (= "Changed" (:display_name (column other-card-id "TOTAL"))))))))

(deftest store-holds-only-the-card-lock-test
  (testing "storing a re-derived card holds no status lock, so a write marking statuses meanwhile doesn't wait for it"
    (with-clean-statuses
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (reprocess! :table (mt/id :orders))
        (let [store  (mt/original-fn #'dependencies.db/set-unchanged-card-result-metadata!)
              marked (atom nil)]
          (mt/with-dynamic-fn-redefs [dependencies.db/set-unchanged-card-result-metadata!
                                      (fn [& args]
                                        (reset! marked (deref (future (t2/update! :model/ResultMetadataStatus
                                                                                  :entity_type :table
                                                                                  :entity_id (mt/id :orders)
                                                                                  {:seen_count 0}))
                                                              5000 :timed-out))
                                        (apply store args))]
            (do-with-inference (fn [infer query card] (rename-column (infer query card) "TOTAL" "Changed"))
                               #(mt/with-premium-features #{:dependencies}
                                  (deps.result-metadata/update-result-metadata! 1000))))
          (is (= 1 @marked))
          (is (= "Changed" (:display_name (column card-id "TOTAL")))))))))

(deftest failing-dependent-test
  (testing "a card whose re-derive fails doesn't stop its siblings, and its upstream is recorded as processed"
    (with-clean-statuses
      (mt/with-temp [:model/Card {first-id :id}  {:dataset_query (table-query :venues)}
                     :model/Card {failing-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {last-id :id}   {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! :table (mt/id :venues))
        (do-with-inference (fn [infer query card]
                             (if (= failing-id (:id card))
                               (throw (ex-info "Inference failed" {}))
                               (rename-column (infer query card) "NAME" "Changed")))
                           #(mt/with-premium-features #{:dependencies}
                              (deps.result-metadata/update-result-metadata! 1000)))
        (is (= ["Changed" "Changed"] (mapv #(:display_name (column % "NAME")) [first-id last-id])))
        (is (not (stale? :table (mt/id :venues))))))))

(deftest store-updates-parameters-using-dropped-columns-test
  (testing "storing a re-derived card resets the parameters taking values from a column it no longer has"
    (with-clean-statuses
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {card-id :id}   {:dataset_query (table-query :venues)
                                                  :parameters    [{:id                   "price"
                                                                   :type                 :category
                                                                   :name                 "Price"
                                                                   :slug                 "price"
                                                                   :values_source_type   :card
                                                                   :values_source_config {:card_id     source-id
                                                                                          :value_field [:field (mt/id :venues :price) nil]}}]}]
        (run-jobs!)
        (reprocess! :table (mt/id :venues))
        (do-with-inference (fn [infer query card]
                             (cond->> (infer query card)
                               (= source-id (:id card)) (into [] (remove #(= "PRICE" (:name %))))))
                           #(mt/with-premium-features #{:dependencies}
                              (deps.result-metadata/update-result-metadata! 1000)))
        (is (nil? (column source-id "PRICE")))
        (is (=? [{:id "price" :values_source_type nil}]
                (t2/select-one-fn :parameters :model/Card :id card-id)))))))
