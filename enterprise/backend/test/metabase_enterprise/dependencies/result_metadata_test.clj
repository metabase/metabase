(ns metabase-enterprise.dependencies.result-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.result-metadata :as deps.result-metadata]
   [metabase-enterprise.dependencies.task.result-metadata :as task.result-metadata]
   [metabase-enterprise.dependencies.test-util :as deps.test]
   [metabase-enterprise.test :as met]
   [metabase.batch-processing.core :as grouper]
   [metabase.config.core :as config]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.query-processor :as qp]
   [metabase.query-processor.db :as qp.db]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private table-query deps.test/table-query)

(def ^:private card-query deps.test/card-query)

(def ^:private pending? deps.test/result-metadata-pending?)

(defn- do-with-inference
  "Run `thunk` with the job's inference of a card done by `f`, called with the real inference, the query and the card."
  [f thunk]
  (let [infer (mt/original-fn #'queries/infer-metadata-with-model-overrides)]
    (mt/with-dynamic-fn-redefs [queries/infer-metadata-with-model-overrides (fn [query card & _] (f infer query card))]
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
  "Run the dependency job, whose current dependencies the result metadata job waits for, then the result metadata job,
  as each triggers the other, until neither has anything left to do."
  []
  (mt/with-premium-features #{:dependencies}
    (loop [runs 1]
      (deps.test/synchronously-run-dependency-job!)
      (when (and (pos? (deps.result-metadata/update-result-metadata! 1000)) (< runs 20))
        (recur (inc runs))))))

(defn- column [card-id column-name]
  (some #(when (= column-name (:name %)) %)
        (t2/select-one-fn :result_metadata :model/Card :id card-id)))

(defn- rename-column [metadata column-name display-name]
  (mapv #(cond-> % (= column-name (:name %)) (assoc :display_name display-name)) metadata))

(defmacro ^:private with-dependencies-feature
  "Run `body` with the dependencies feature, each write committing on its own as it does between real requests."
  [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:dependencies}
       ~@body)))

(defn- reprocess!
  "Have the result metadata job process the Cards with `card-ids` again, as if they changed."
  [& card-ids]
  (dependencies.db/delete-result-metadata-statuses! (vec card-ids)))

(defn- rederive!
  "Run one batch of the result metadata job."
  []
  (mt/with-premium-features #{:dependencies}
    (deps.result-metadata/update-result-metadata! 1000)))

(defn- add-grand-total [query]
  (lib/expression query "Grand total" (lib/* (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total)) 2)))

(deftest model-query-edit-test
  (testing "editing a model's query re-derives the MBQL cards depending on it transitively, but not past a native card"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {model-id :id}        {:type :model :dataset_query (table-query :orders)}
                     :model/Card {question-id :id}     {:dataset_query (card-query model-id)}
                     :model/Card {nested-id :id}       {:dataset_query (card-query question-id)}
                     :model/Card {native-id :id}       {:dataset_query (native-card-query model-id)}
                     :model/Card {after-native-id :id} {:dataset_query (card-query native-id)}]
        (run-jobs!)
        (is (nil? (column question-id "Grand total")))
        (t2/update! :model/Card model-id {:dataset_query (add-grand-total (table-query :orders))})
        (is (pending? question-id))
        (run-jobs!)
        (is (some? (column question-id "Grand total")))
        (is (some? (column nested-id "Grand total")))
        (testing "the card depending on the native card is left alone"
          (is (nil? (column after-native-id "Grand total"))))
        (is (not-any? pending? [model-id question-id nested-id]))
        (testing "a column no longer inferred is removed"
          (t2/update! :model/Card model-id {:dataset_query (table-query :orders)})
          (run-jobs!)
          (is (nil? (column question-id "Grand total")))
          (is (nil? (column nested-id "Grand total"))))))))

(deftest run-metadata-test
  (testing "re-deriving a card keeps the fingerprints and types its run stored for the columns it still has"
    (with-dependencies-feature
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

(deftest fingerprints-come-only-from-stored-metadata-test
  (testing "re-deriving a card keeps the stored fingerprints and adds none for a column the stored metadata lacks"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (let [marker {:global {:distinct-count 7}}
              stored (->> (t2/select-one-fn :result_metadata :model/Card :id card-id)
                          (remove #(= "PRICE" (:name %)))
                          (mapv #(cond-> % (= "ID" (:name %)) (assoc :fingerprint marker))))]
          (t2/update! :model/Card card-id {:result_metadata stored})
          (run-jobs!)
          (reprocess! card-id)
          (run-jobs!)
          (is (some? (column card-id "PRICE")))
          (is (nil? (:fingerprint (column card-id "PRICE"))))
          (is (= marker (:fingerprint (column card-id "ID")))))))))

(deftest native-parent-test
  (testing "a card depending on a changed model directly is re-derived even when it also depends on a native card"
    (with-dependencies-feature
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

(deftest internal-card-test
  (testing "the job leaves the result metadata of cards Metabase created itself, such as Usage Analytics, alone"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {model-id :id}    {:type :model :dataset_query (table-query :orders)}
                     :model/Card {card-id :id}     {:dataset_query (card-query model-id)}
                     :model/Card {internal-id :id} {:dataset_query (card-query model-id)
                                                    :creator_id    config/internal-mb-user-id}]
        (run-jobs!)
        (t2/update! :model/Card model-id {:dataset_query (add-grand-total (table-query :orders))})
        (run-jobs!)
        (is (some? (column card-id "Grand total")))
        (is (nil? (column internal-id "Grand total")))))))

(deftest metadata-edit-test
  (testing "editing a model's column overrides re-derives the cards on the model, which take them"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (table-query :orders)}
                     :model/Card {card-id :id}  {:dataset_query (card-query model-id)}]
        (run-jobs!)
        (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card
                                                                                            :id model-id)
                                                                          "TOTAL" "Grand total")})
        (is (pending? card-id))
        (run-jobs!)
        (is (= "Grand total" (:display_name (column card-id "TOTAL"))))))))

(deftest model-overrides-test
  (testing "re-deriving a model after its table changed keeps the model's column overrides"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (table-query :orders)}]
        (run-jobs!)
        (t2/update! :model/Card model-id {:result_metadata (rename-column (t2/select-one-fn :result_metadata :model/Card
                                                                                            :id model-id)
                                                                          "TOTAL" "Grand total")})
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
          (is (pending? model-id))
          (run-jobs!)
          (is (not (pending? model-id)))
          (is (= "Grand total" (:display_name (column model-id "TOTAL")))))))))

(deftest field-user-settings-test
  (testing "renaming a field re-derives the MBQL cards reading its table"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Grand total"}]
          (is (pending? card-id))
          (run-jobs!)
          (is (= "Grand total" (:display_name (column card-id "TOTAL"))))
          (is (not (pending? card-id))))))))

(deftest measure-edit-test
  (testing "changing a measure's definition re-derives a card using it"
    (with-dependencies-feature
      (mt/with-temp [:model/Measure {measure-id :id} {:name       "Measure"
                                                      :table_id   (mt/id :orders)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (-> (table-query :orders) (lib/aggregate (lib/count)))}
                     :model/Card    {card-id :id}    {:dataset_query (measure-query measure-id)}]
        (run-jobs!)
        (let [column-name #(:name (first (t2/select-one-fn :result_metadata :model/Card :id card-id)))]
          (is (= "count" (column-name)))
          (t2/update! :model/Measure measure-id
                      {:definition (-> (table-query :orders)
                                       (lib/aggregate (lib/avg (lib.metadata/field (mt/metadata-provider)
                                                                                   (mt/id :orders :total)))))})
          (run-jobs!)
          (is (= "avg" (column-name))))))))

(deftest measure-chain-edit-test
  (testing "changing a measure's definition re-derives a card using a measure built on it"
    (with-dependencies-feature
      (mt/with-temp [:model/Measure {inner-id :id} {:name       "Inner"
                                                    :table_id   (mt/id :orders)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (-> (table-query :orders) (lib/aggregate (lib/count)))}]
        (mt/with-temp [:model/Measure {outer-id :id} {:name       "Outer"
                                                      :table_id   (mt/id :orders)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-query inner-id)}
                       :model/Card    {card-id :id}  {:dataset_query (measure-query outer-id)}]
          (run-jobs!)
          (let [base-type #(:base_type (first (t2/select-one-fn :result_metadata :model/Card :id card-id)))]
            (is (isa? (base-type) :type/Integer))
            (t2/update! :model/Measure inner-id
                        {:definition (-> (table-query :orders)
                                         (lib/aggregate (lib/avg (lib.metadata/field (mt/metadata-provider)
                                                                                     (mt/id :orders :total)))))})
            (run-jobs!)
            (is (isa? (base-type) :type/Float))))))))

(defn- rederive-during-inference!
  "Re-derive the Card with `card-id` while `write!` runs in the middle of its inference, returning how many entities the
  job took."
  [card-id write!]
  (reprocess! card-id)
  (do-with-inference (fn [infer query card]
                       (write!)
                       (infer query card))
                     rederive!))

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
  (testing "a user's save of a card's query during its re-derive is kept, and the card is re-derived again from it"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
          (is (pos? (rederive-during-inference!
                     card-id
                     (once! #(t2/update! :model/Card card-id {:dataset_query (add-grand-total (table-query :orders))})))))
          (is (some? (column card-id "Grand total")))
          (is (pending? card-id))
          (run-jobs!)
          (is (= "Order total" (:display_name (column card-id "TOTAL"))))
          (is (some? (column card-id "Grand total")))
          (is (not (pending? card-id))))))))

(deftest run-write-during-rederive-test
  (testing "a run storing a card's metadata during its re-derive is kept, and the card is re-derived again from it"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (let [run-metadata (-> (t2/select-one-fn :result_metadata :model/Card :id card-id)
                               (rename-column "TOTAL" "Run total")
                               (->> (mapv #(cond-> % (= "ID" (:name %)) (assoc :fingerprint {:global {:distinct-count 7}})))))]
          (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
            (is (pos? (rederive-during-inference! card-id (once! #(store-run-metadata! card-id run-metadata)))))
            (run-jobs!)
            (is (= "Order total" (:display_name (column card-id "TOTAL"))))
            (is (= {:global {:distinct-count 7}} (:fingerprint (column card-id "ID"))))))))))

(deftest card-on-card-temporal-unit-test
  (testing "a card on a card takes the new temporal unit with the new display name"
    (with-dependencies-feature
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
    (with-dependencies-feature
      (let [total (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total))
            with  #(lib/expression (table-query :orders) "X" %)]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (with (lib/* total 2))}
                       :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
          (run-jobs!)
          (is (isa? (:base_type (column card-id "X")) :type/Number))
          (t2/update! :model/Card source-id {:dataset_query (with (lib/concat total "!"))})
          (run-jobs!)
          (is (= :type/Text (:base_type (column card-id "X"))))
          (testing "within one root type too, since no run measured the card's types"
            (t2/update! :model/Card source-id {:dataset_query (with (lib/+ (lib.metadata/field (mt/metadata-provider)
                                                                                               (mt/id :orders :quantity))
                                                                           1))})
            (run-jobs!)
            (is (= :type/Integer (:base_type (column card-id "X"))))
            (t2/update! :model/Card source-id {:dataset_query (with (lib/* total 1.5))})
            (run-jobs!)
            (is (= :type/Float (:base_type (column card-id "X"))))))))))

(deftest alias-less-stored-metadata-test
  (testing "stored columns without aliases are matched by name, so an alias equal to another column's name merges
           nothing"
    (let [stored   [{:name "CREATED_AT" :id 36 :base_type "type/DateTime" :database_type "TIMESTAMP"
                     :fingerprint {:global {:distinct-count 1}}}
                    {:name "CREATED_AT_2" :id 14 :base_type "type/DateTime" :database_type "TIMESTAMP"
                     :fingerprint {:global {:distinct-count 2}}}]
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

(deftest failure-waits-for-change-test
  (testing "a card whose re-derive keeps failing is given up on, not re-derived again until it or an upstream changes
           again, and then is"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (run-jobs!)
        (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
        (do-with-inference (fn [_infer _query _card] (throw (ex-info "Inference failed" {})))
                           run-jobs!)
        (is (nil? (column card-id "Grand total")))
        (is (not (pending? card-id)))
        (run-jobs!)
        (is (nil? (column card-id "Grand total")))
        (mt/with-temp [:model/FieldUserSettings _ {:field_id (mt/id :orders :total) :display_name "Order total"}]
          (run-jobs!)
          (is (some? (column card-id "Grand total"))))))))

(deftest result-metadata-job-before-dependency-job-test
  (testing "a card whose dependencies the dependency job computes after its upstream changed is re-derived once it does"
    (with-dependencies-feature
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
            (run-jobs!)
            (is (some? (column card-id "Grand total")))))))))

(deftest new-edge-to-upstream-processed-before-save-test
  (testing "a new dependency on a card processed before the dependent was saved has the card itself not processed again"
    (with-dependencies-feature
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                       :model/Card _               {:dataset_query (card-query source-id)}]
          (run-jobs!)
          (is (not (pending? source-id)))
          (Thread/sleep 5)
          (t2/insert! :model/Card {:name                   "Dependent"
                                   :display                :table
                                   :visualization_settings {}
                                   :creator_id             (mt/user->id :rasta)
                                   :database_id            (mt/id)
                                   :dataset_query          (card-query source-id)})
          (deps.test/synchronously-run-dependency-job!)
          (is (not (pending? source-id))))))))

(deftest new-dependent-of-upstream-processed-before-its-edges-test
  (testing "a card whose upstream changed and was processed before the card's dependencies existed is re-derived when
           they are computed, even when the card was saved again meanwhile"
    (with-dependencies-feature
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
            (deps.result-metadata/update-result-metadata! 1000)
            (t2/update! :model/Card card-id {:name "Renamed"})
            (run-jobs!)
            (is (some? (column card-id "Grand total")))))))))

(deftest job-reruns-while-it-takes-entities-test
  (testing "the job runs again right away while it took entities, since a card it stored changed in turn"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card _               {:dataset_query (card-query source-id)}]
        (deps.test/synchronously-run-dependency-job!)
        (is (= 1 (#'task.result-metadata/run-batch!)))
        (run-jobs!)
        (is (nil? (#'task.result-metadata/run-batch!)))))))

(deftest storing-card-triggers-jobs-test
  (testing "the job stores a re-derived card through the Card model, so its hooks trigger the jobs, and keeps its
           updated_at"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (deps.test/synchronously-run-dependency-job!)
        (let [submitted (atom [])
              before    (t2/select-one-fn :updated_at :model/Card :id card-id)]
          (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
          (deps.test/synchronously-run-dependency-job!)
          (mt/with-dynamic-fn-redefs [grouper/submit! (fn [_queue write] (swap! submitted conj write))]
            (rederive!)
            (rederive!))
          (is (some? (column card-id "Grand total")))
          (is (= before (t2/select-one-fn :updated_at :model/Card :id card-id)))
          (is (seq @submitted)))))))

(deftest sandboxed-creator-test
  (testing "a card is re-derived as no user, so its creator's sandbox doesn't decide its columns, and the columns its
           stored metadata lacks get no fingerprint"
    (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)]
                                                (lib/with-fields (table-query :venues)
                                                  [(lib.metadata/field mp (mt/id :venues :id))
                                                   (lib.metadata/field mp (mt/id :venues :name))
                                                   (lib.metadata/field mp (mt/id :venues :category_id))]))}}}
      (with-dependencies-feature
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)
                                                  :creator_id    (mt/user->id :rasta)
                                                  :result_metadata []}]
          (deps.test/synchronously-run-dependency-job!)
          (reprocess! card-id)
          (mt/with-premium-features #{:dependencies :sandboxes}
            (deps.result-metadata/update-result-metadata! 1000))
          (let [columns (t2/select-one-fn :result_metadata :model/Card :id card-id)]
            (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"] (mapv :name columns)))
            (is (every? (comp nil? :fingerprint) columns))))))))

(deftest legacy-stored-card-test
  (testing "a card whose stored query is legacy MBQL with a filter is stored once and the job stops, though each read
           gives the converted query new uuids"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (t2/update! (t2/table-name :model/Card) card-id
                    {:dataset_query (json/encode {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (mt/id :venues)
                                                             :filter       [:> [:field (mt/id :venues :price) nil] 1]}})
                     :result_metadata (json/encode [])})
        (run-jobs!)
        (is (seq (column card-id "PRICE")))
        (is (not (pending? card-id)))
        (is (nil? (#'task.result-metadata/run-batch!)))))))

(deftest new-upstream-changed-before-its-edge-test
  (testing "a card changed to read a card that changes before the dependency job stores the new edge is re-derived
           from the changed one"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (t2/update! :model/Card card-id {:dataset_query (card-query source-id)})
        (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
        (run-jobs!)
        (is (some? (column card-id "Grand total")))))))

(deftest failing-store-test
  (testing "a store that throws doesn't stop the other cards of the batch"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {failing-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {other-id :id}   {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! failing-id other-id)
        (let [store (mt/original-fn #'dependencies.db/set-card-result-metadata!)]
          (mt/with-dynamic-fn-redefs [dependencies.db/set-card-result-metadata!
                                      (fn [card-id metadata]
                                        (if (= failing-id card-id)
                                          (throw (ex-info "Store failed" {}))
                                          (store card-id metadata)))]
            (do-with-inference (fn [infer query card] (rename-column (infer query card) "NAME" "Changed"))
                               rederive!)))
        (is (= "Changed" (:display_name (column other-id "NAME"))))))))

(deftest own-edit-rederives-dependents-test
  (testing "editing a card's query re-derives the cards depending on it, not the card, whose save inferred it"
    (with-dependencies-feature
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
    (with-dependencies-feature
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
        (is (pending? native-id))
        (run-jobs!)
        (is (some? (column card-id "PRICE")))
        (is (not (pending? card-id)))))))

(deftest measured-keys-test
  (testing "a re-derived column keeps what a run measured only while its root type and source type are unchanged, and only the stored fingerprint"
    (let [stored {:name "X" :base_type "type/BigInteger" :database_type "BIGINT" :fingerprint {:type {:type/Number {}}}}
          patch  #(first (#'deps.result-metadata/patch-result-metadata [stored] [%]))]
      (testing "a run's refinement within the root type and source type is kept"
        (is (=? {:base_type "type/BigInteger" :fingerprint {:type {:type/Number {}}}}
                (patch {:name "X" :base_type :type/Integer :database_type "BIGINT"}))))
      (testing "a new root type takes the inferred type and keeps the stored fingerprint"
        (is (= {:name "X" :base_type :type/Text :database_type "VARCHAR" :fingerprint {:type {:type/Number {}}}}
               (patch {:name "X" :base_type :type/Text :database_type "VARCHAR" :fingerprint {:type {:type/Text {}}}}))))
      (testing "a new source type within the root type takes the inferred type and keeps the stored fingerprint"
        (is (= {:name "X" :base_type :type/Decimal :database_type "DECIMAL" :fingerprint {:type {:type/Number {}}}}
               (patch {:name "X" :base_type :type/Decimal :database_type "DECIMAL"}))))
      (testing "a column without a stored one gets no fingerprint"
        (is (= {:name "Y" :base_type :type/Text}
               (first (#'deps.result-metadata/patch-result-metadata
                       [stored] [{:name "Y" :base_type :type/Text :fingerprint {:type {:type/Text {}}}}]))))))))

(deftest remapped-column-test
  (testing "a card storing the metadata of a run with remapped columns is not rewritten, since inference adds them too"
    (mt/with-column-remappings [orders.product_id products.title]
      (let [query (table-query :orders)
            run   (get-in (qp/process-query query) [:data :results_metadata :columns])]
        (is (some :remapped_from run))
        (mt/with-temp [:model/Card card {:dataset_query query :result_metadata run}]
          (is (nil? (#'deps.result-metadata/rederived-result-metadata card))))))))

(deftest failed-dependencies-block-rederive-test
  (testing "a card whose dependency computation keeps failing is not re-derived from its old edges until it changes"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {source-id :id} {:dataset_query (table-query :orders)}
                     :model/Card {card-id :id}   {:dataset_query (card-query source-id)}]
        (run-jobs!)
        (let [calculate (mt/original-fn #'deps.calculation/calculate-deps)]
          (mt/with-dynamic-fn-redefs [deps.calculation/calculate-deps
                                      (fn [entity-type entity]
                                        (if (= card-id (:id entity))
                                          (throw (ex-info "Computation failed" {}))
                                          (calculate entity-type entity)))]
            (t2/update! :model/Card card-id {:dataset_query (card-query source-id)
                                             :description   "edited"})
            (dependencies.db/mark-dependency-statuses-stale! {:card #{card-id}})
            (t2/update! :model/Card source-id {:dataset_query (add-grand-total (table-query :orders))})
            (run-jobs!)))
        (is (nil? (column card-id "Grand total")))
        (is (pending? card-id))))))

(deftest crash-leaves-card-pending-test
  (testing "a job that dies between taking a card's status and clearing it leaves the card pending, and the next run
           re-derives it"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! card-id)
        (is (thrown? Error (do-with-inference (fn [_infer _query _card] (throw (Error. "crash"))) rederive!)))
        (is (pending? card-id))
        (do-with-inference (fn [infer query card] (rename-column (infer query card) "NAME" "Changed")) rederive!)
        (is (= "Changed" (:display_name (column card-id "NAME"))))
        (is (not (pending? card-id)))))))

(deftest write-during-rederive-keeps-card-pending-test
  (testing "a write counted on a card while it is re-derived keeps it pending after the job clears what it read"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! card-id)
        (do-with-inference (fn [infer query card]
                             (dependencies.db/mark-result-metadata-statuses-stale! {:card #{card-id}})
                             (infer query card))
                           rederive!)
        (is (pending? card-id))
        (rederive!)
        (is (not (pending? card-id)))))))

(deftest store-compares-same-read-test
  (testing "a card whose full read normalizes its stored metadata away is stored, since both compared reads are alike"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! card-id)
        (let [card (mt/original-fn #'dependencies.db/card)]
          (mt/with-dynamic-fn-redefs [dependencies.db/card (fn [id] (assoc (card id) :result_metadata nil))]
            (do-with-inference (fn [infer query card] (rename-column (infer query card) "NAME" "Changed"))
                               rederive!)))
        (is (= "Changed" (:display_name (column card-id "NAME"))))
        (is (not (pending? card-id)))))))

(deftest conflict-fails-test
  (testing "a card that keeps changing during its re-derive is left as the other writer stored it, and other cards proceed"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {orders-card-id :id}   {:dataset_query (table-query :orders)}
                     :model/Card {other-card-id :id}  {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (reprocess! orders-card-id other-card-id)
        (do-with-inference (fn [infer query card]
                             (u/prog1 (rename-column (infer query card) "TOTAL" "Changed")
                               (when (= orders-card-id (:id card))
                                 (store-run-metadata!
                                  orders-card-id
                                  (rename-column (:result_metadata card) "TOTAL" (str (random-uuid)))))))
                           rederive!)
        (is (not= "Changed" (:display_name (column orders-card-id "TOTAL"))))
        (is (= "Changed" (:display_name (column other-card-id "TOTAL"))))))))

(deftest store-locks-only-dependents-test
  (testing "storing a re-derived card locks only the statuses of its dependents, so a write of another status meanwhile
           doesn't wait for it"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id}  {:dataset_query (table-query :orders)}
                     :model/Card {other-id :id} {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! card-id)
        (let [store  (mt/original-fn #'dependencies.db/set-card-result-metadata!)
              marked (atom nil)]
          (mt/with-dynamic-fn-redefs [dependencies.db/set-card-result-metadata!
                                      (fn [& args]
                                        (reset! marked (deref (future (t2/update! :model/ResultMetadataStatus
                                                                                  :entity_type :card
                                                                                  :entity_id other-id
                                                                                  {:stale 0}))
                                                              5000 :timed-out))
                                        (apply store args))]
            (do-with-inference (fn [infer query card] (rename-column (infer query card) "TOTAL" "Changed"))
                               rederive!))
          (is (= 1 @marked))
          (is (= "Changed" (:display_name (column card-id "TOTAL")))))))))

(deftest store-waits-for-save-in-flight-test
  (testing "a save of the card holding its row lock while the job stores has the job re-derive it after the save"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (table-query :orders)}]
        (run-jobs!)
        (reprocess! card-id)
        (let [locked (promise)
              save   (future
                       (t2/with-transaction [_]
                         (t2/update! :model/Card card-id {:name "Saved"})
                         (deliver locked true)
                         (Thread/sleep 1000)))]
          @locked
          (do-with-inference (fn [infer query card] (rename-column (infer query card) "TOTAL" "Changed"))
                             #(mt/with-premium-features #{:dependencies}
                                (deps.result-metadata/update-result-metadata! 1000)
                                @save
                                (deps.test/synchronously-run-dependency-job!)
                                (deps.result-metadata/update-result-metadata! 1000)))
          (is (= "Saved" (t2/select-one-fn :name :model/Card :id card-id)))
          (is (= "Changed" (:display_name (column card-id "TOTAL")))))))))

(deftest failing-dependent-test
  (testing "a card whose re-derive fails doesn't stop its siblings, and stays pending for the next run"
    (with-dependencies-feature
      (mt/with-temp [:model/Card {first-id :id}  {:dataset_query (table-query :venues)}
                     :model/Card {failing-id :id} {:dataset_query (table-query :venues)}
                     :model/Card {last-id :id}   {:dataset_query (table-query :venues)}]
        (run-jobs!)
        (reprocess! first-id failing-id last-id)
        (do-with-inference (fn [infer query card]
                             (if (= failing-id (:id card))
                               (throw (ex-info "Inference failed" {}))
                               (rename-column (infer query card) "NAME" "Changed")))
                           rederive!)
        (is (= ["Changed" "Changed"] (mapv #(:display_name (column % "NAME")) [first-id last-id])))
        (is (pending? failing-id))))))

(deftest store-updates-parameters-using-dropped-columns-test
  (testing "storing a re-derived card resets the parameters taking values from a column it no longer has"
    (with-dependencies-feature
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
        (reprocess! source-id)
        (do-with-inference (fn [infer query card]
                             (cond->> (infer query card)
                               (= source-id (:id card)) (into [] (remove #(= "PRICE" (:name %))))))
                           rederive!)
        (is (nil? (column source-id "PRICE")))
        (is (=? [{:id "price" :values_source_type nil}]
                (t2/select-one-fn :parameters :model/Card :id card-id)))))))
