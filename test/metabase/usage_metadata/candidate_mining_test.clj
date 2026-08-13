(ns metabase.usage-metadata.candidate-mining-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.content-verification.core :as moderation]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users-personal-collections))

(defn- orders-base-query []
  (let [mp (lib-be/application-database-metadata-provider (mt/id))]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- expected-id-batch-sizes
  "Batch sizes candidate-query-batch-size splits `total` ids into, so tests don't restate the
  private batch-size constant as a bare literal."
  [total]
  (mapv count (partition-all @#'candidate-mining/candidate-query-batch-size (range total))))

(deftest ^:parallel referenced-card-ids-support-current-and-legacy-references-test
  (let [referenced-card-ids @#'candidate-mining/referenced-card-ids]
    (is (= #{12 34 56}
           (referenced-card-ids
            {:source-card 12
             :source-table "card__34"
             :stages [{:source-card 56}
                      {:source-card -1}
                      {:source-table "card__not-an-id"}]})))))

(deftest predicate-candidates-canonicalize-source-atom-order-test
  (let [mp          (lib-be/application-database-metadata-provider (mt/id))
        first-field (lib.metadata/field mp (mt/id :orders :subtotal))
        second-field (lib.metadata/field mp (mt/id :orders :product_id))
        first-atom  {:predicate (lib/> first-field 10), :columns [first-field]}
        second-atom {:predicate (lib/= second-field 20), :columns [second-field]}
        predicates  (fn [atoms]
                      (:predicates (last (candidate-mining/predicate-candidates atoms))))]
    (is (= (mapv candidate-mining/canonical-signature (predicates [first-atom second-atom]))
           (mapv candidate-mining/canonical-signature (predicates [second-atom first-atom]))))
    (is (= (sort [(candidate-mining/canonical-signature (:predicate first-atom))
                  (candidate-mining/canonical-signature (:predicate second-atom))])
           (mapv candidate-mining/canonical-signature (predicates [first-atom second-atom]))))))

(deftest candidate-source-cards-use-curation-or-popularity-test
  (let [query (orders-base-query)
        now   (t/offset-date-time)]
    (mt/with-temp [:model/Collection {official-collection-id :id} {:authority_level "official"}
                   :model/Card {plain-id :id} {:name "candidate mining plain"
                                               :type :question
                                               :dataset_query query
                                               :view_count 1000000}
                   :model/Card {official-id :id} {:name "candidate mining official"
                                                  :type :model
                                                  :dataset_query query
                                                  :collection_id official-collection-id
                                                  :view_count 0}
                   :model/Card {verified-id :id} {:name "candidate mining verified"
                                                  :type :question
                                                  :dataset_query query
                                                  :view_count 0}
                   :model/Card {popular-id :id} {:name "candidate mining popular"
                                                 :type :question
                                                 :dataset_query query
                                                 :view_count 0}
                   :model/Card {stale-id :id} {:name "candidate mining stale"
                                               :type :question
                                               :dataset_query query
                                               :view_count 1000000}]
      (moderation/create-review! {:moderated_item_id   verified-id
                                  :moderated_item_type "card"
                                  :moderator_id        (mt/user->id :crowberto)
                                  :status              "verified"})
      (t2/insert! :model/ViewLog
                  [{:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  popular-id
                    :timestamp now}
                   {:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  popular-id
                    :timestamp (t/minus now (t/days 30))}
                   {:user_id   (mt/user->id :crowberto)
                    :model     "card"
                    :model_id  stale-id
                    :timestamp (t/minus now (t/days 91))}])
      (let [cards (candidate-mining/candidate-source-cards {:min-view-count 2, :view-count-window-days 90})
            by-id (into {} (map (juxt :id identity)) cards)]
        (is (not (contains? by-id plain-id)))
        (is (not (contains? by-id stale-id)))
        (is (true? (:official-collection? (by-id official-id))))
        (is (= :model (:type (by-id official-id))))
        (is (true? (:verified? (by-id verified-id))))
        (is (true? (:popular? (by-id popular-id))))
        (is (= 2 (:view-count (by-id popular-id))))))))

(deftest candidate-source-cards-exclude-personal-collection-subtrees-test
  (let [query       (orders-base-query)
        personal-id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))]
    (mt/with-temp [:model/Collection {personal-child-id :id} {:location (format "/%d/" personal-id)}
                   :model/Collection {shared-id :id} {}
                   :model/Card {personal-card-id :id} {:name          "candidate mining personal root"
                                                       :type          :question
                                                       :dataset_query query
                                                       :collection_id personal-id
                                                       :view_count    1000000}
                   :model/Card {personal-child-card-id :id} {:name          "candidate mining personal child"
                                                             :type          :model
                                                             :dataset_query query
                                                             :collection_id personal-child-id
                                                             :view_count    1000000}
                   :model/Card {shared-card-id :id} {:name          "candidate mining shared collection"
                                                     :type          :question
                                                     :dataset_query query
                                                     :collection_id shared-id
                                                     :view_count    1000000}
                   :model/Card {root-card-id :id} {:name          "candidate mining root collection"
                                                   :type          :question
                                                   :dataset_query query
                                                   :collection_id nil
                                                   :view_count    1000000}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  personal-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  personal-child-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  shared-card-id
                                     :timestamp (t/offset-date-time)}
                   :model/ViewLog _ {:user_id   (mt/user->id :crowberto)
                                     :model     "card"
                                     :model_id  root-card-id
                                     :timestamp (t/offset-date-time)}]
      (let [all-ids      #{personal-card-id personal-child-card-id shared-card-id root-card-id}
            default-ids  (into #{} (map :id)
                               (candidate-mining/candidate-source-cards {:min-view-count 10}))
            explicit-ids (into #{} (map :id)
                               (candidate-mining/candidate-source-cards
                                {:card-ids (apply hash-set all-ids)
                                 :min-view-count 10}))
            qualified-ids (set (candidate-mining/qualified-card-ids 1 90))]
        (doseq [ids [default-ids explicit-ids qualified-ids]]
          (is (contains? ids shared-card-id))
          (is (contains? ids root-card-id))
          (is (not (contains? ids personal-card-id)))
          (is (not (contains? ids personal-child-card-id))))))))

(deftest candidate-source-cards-accept-explicit-card-ids-test
  (let [query (orders-base-query)]
    (mt/with-temp [:model/Card {selected-id :id} {:name          "candidate mining explicitly selected"
                                                  :type          :question
                                                  :dataset_query query
                                                  :view_count    0}
                   :model/Card {unselected-id :id} {:name          "candidate mining not selected"
                                                    :type          :question
                                                    :dataset_query query
                                                    :view_count    1000000}]
      (let [cards  (candidate-mining/candidate-source-cards {:card-ids #{selected-id} :min-view-count 10})
            by-id  (into {} (map (juxt :id identity)) cards)]
        (testing "the explicit IDs control inclusion instead of the default curation/popularity gate"
          (is (contains? by-id selected-id))
          (is (not (contains? by-id unselected-id))))
        (testing "curation and popularity are still recorded as ranking evidence"
          (is (false? (:verified? (by-id selected-id))))
          (is (false? (:official-collection? (by-id selected-id))))
          (is (false? (:popular? (by-id selected-id)))))))))

(deftest candidate-signatures-ignore-clause-presentation-metadata-test
  (is (= (candidate-mining/canonical-signature [:count {:lib/uuid "generic-count"}])
         (candidate-mining/canonical-signature [:count {:lib/uuid     "named-count"
                                                        :name         "Total PV"
                                                        :display-name "Total PV"}])))
  (testing "inferred physical Field metadata does not split one semantic candidate"
    (let [field-id (mt/id :orders :product_id)]
      (is (= (candidate-mining/canonical-signature [:field {:base-type :type/Integer} field-id])
             (candidate-mining/canonical-signature [:field {:base-type      :type/Integer
                                                            :effective-type :type/Integer}
                                                    field-id])
             (candidate-mining/canonical-signature [:field {:base-type                         :type/Integer
                                                            :effective-type                    :type/Integer
                                                            :lib/transformation-added-base-type true}
                                                    field-id])))))
  (testing "semantic physical Field options remain part of the signature"
    (let [field-id (mt/id :orders :product_id)]
      (doseq [[left right] [[{:temporal-unit :month} {:temporal-unit :year}]
                            [{:join-alias "Products"} {:join-alias "Categories"}]
                            [{:source-field 1} {:source-field 2}]
                            [{:base-type :type/Text}
                             {:base-type :type/Text, :effective-type :type/Date}]
                            [{:binning {:strategy :num-bins, :num-bins 10}}
                             {:binning {:strategy :num-bins, :num-bins 20}}]]]
        (is (not= (candidate-mining/canonical-signature [:field left field-id])
                  (candidate-mining/canonical-signature [:field right field-id]))))))
  (testing "map-shaped literal values retain semantically meaningful name keys"
    (is (not= (candidate-mining/canonical-signature [:= {:lib/uuid "a"} [:field {:lib/uuid "b"} 1] {:name "A"}])
              (candidate-mining/canonical-signature [:= {:lib/uuid "c"} [:field {:lib/uuid "d"} 1] {:name "B"}])))))

(deftest qualified-card-ids-match-default-candidate-population-test
  (is (= (set (map :id (candidate-mining/candidate-source-cards {:min-view-count 10, :view-count-window-days 90})))
         (set (candidate-mining/qualified-card-ids 10 90)))))

(deftest candidate-population-selects-only-the-required-card-columns-test
  (let [selected-columns (atom [])]
    (with-redefs-fn {#'candidate-mining/select-candidate-source-cards
                     (fn [_source columns]
                       (swap! selected-columns conj columns)
                       [])}
      #(do
         (candidate-mining/qualified-card-ids 10 90)
         (candidate-mining/candidate-source-cards {:min-view-count 10, :view-count-window-days 90})))
    (is (= [[:model/Card :id :collection_id :view_count]
            [:model/Card :id :name :description :type :database_id :dataset_query :card_schema
             :collection_id :view_count]]
           @selected-columns))))

(deftest qualified-card-ids-bounds-recent-view-log-scan-test
  (let [scanned-card-ids (atom ::not-called)]
    (with-redefs-fn {#'candidate-mining/select-candidate-source-cards
                     (fn [_card-ids _columns]
                       [{:id 900001, :collection_id nil, :view_count 0}
                        {:id 900002, :collection_id nil, :view_count 0}])
                     #'candidate-mining/recent-card-view-counts
                     (fn [card-ids _window-days]
                       (reset! scanned-card-ids card-ids)
                       {})}
      #(candidate-mining/qualified-card-ids 10 90))
    (is (= #{900001 900002} @scanned-card-ids))))

(deftest ^:parallel candidate-id-queries-are-bounded-test
  (let [mapcat-id-batches @#'candidate-mining/mapcat-id-batches
        batches (atom [])
        ids     (range 450)]
    (is (= (vec ids)
           (mapcat-id-batches (fn [batch]
                                (swap! batches conj batch)
                                batch)
                              ids)))
    (is (= (expected-id-batch-sizes 450) (mapv count @batches)))))

(deftest recent-card-view-counts-queries-bounded-id-batches-test
  (let [recent-card-view-counts @#'candidate-mining/recent-card-view-counts
        batch-sizes (atom [])]
    (with-redefs-fn {#'t2/select
                     (fn [_model {:keys [where]}]
                       (let [batch (-> where last last)]
                         (swap! batch-sizes conj (count batch))
                         []))}
      #(recent-card-view-counts (set (range 450)) 90))
    (is (= (expected-id-batch-sizes 450) @batch-sizes))))

(deftest curation-queries-use-bounded-id-batches-test
  (let [verified-card-ids       @#'candidate-mining/verified-card-ids
        official-collection-ids @#'candidate-mining/official-collection-ids
        ids                (set (range 450))
        moderation-batches (atom [])
        collection-batches (atom [])]
    (with-redefs-fn {#'t2/select-fn-set
                     (fn [_field _model & {:keys [moderated_item_id]}]
                       (let [batch (last moderated_item_id)]
                         (swap! moderation-batches conj (count batch))
                         (set batch)))
                     #'t2/select-pks-set
                     (fn [_model & {:keys [id]}]
                       (let [batch (last id)]
                         (swap! collection-batches conj (count batch))
                         (set batch)))}
      #(do
         (is (= ids (verified-card-ids ids)))
         (is (= ids (official-collection-ids ids)))))
    (is (= (expected-id-batch-sizes 450) @moderation-batches))
    (is (= (expected-id-batch-sizes 450) @collection-batches))))
