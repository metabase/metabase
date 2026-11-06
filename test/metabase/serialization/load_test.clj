(ns metabase.serialization.load-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- export-all [model objects]
  (into [] (serialization/export model objects)))

(defn- load-all [entities & opts]
  (apply serialization/load-all
         (map serialization/key-of entities)
         (partial mapv (into {} (map (juxt serialization/key-of identity)) entities))
         opts))

(defn- eid [c]
  (apply str (repeat 21 c)))

(deftest import-order-test
  (testing "every entity loads after what it depends on, and a cycle loads stripped first"
    (let [coll      {:serdes/meta [{:model "Collection"}] :entity_id (eid \a)}
          dashboard {:serdes/meta   [{:model "Dashboard"}]
                     :entity_id     (eid \b)
                     :collection_id (eid \a)
                     :dashcards     [{:entity_id (eid \d) :card_id (eid \c)}]}
          card      {:serdes/meta   [{:model "Card"}]
                     :entity_id     (eid \c)
                     :collection_id (eid \a)
                     :dashboard_id  (eid \b)}
          by-key    (into {} (map (juxt serialization/key-of identity)) [card dashboard coll])
          order     (serialization/load-order (keys by-key) (partial mapv by-key))]
      (is (= :model/Collection (:model (first order))))
      (is (=? [{:model :model/Collection}
               {:model :model/Card :strip #{:dashboard_id :document_id :parameters}}
               {:model :model/Dashboard :strip nil}
               {:model :model/Card :strip nil}]
              order))
      (is (= [[:model/Card (eid \c)]] (:keys (second order)))))))

(deftest import-all-round-trip-test
  (testing "a collection with a dashboard and its card exports and imports back into one transaction"
    (mt/with-temp [:model/Collection    {coll-id :id :as coll} {:name "serdes load"}
                   :model/Card          {card-id :id :as card} {:collection_id coll-id :name "card"}
                   :model/Dashboard     {dash-id :id :as dash} {:collection_id coll-id :name "dash"}
                   :model/DashboardCard _                      {:dashboard_id dash-id :card_id card-id}]
      (let [exported (concat (export-all :model/Collection [coll])
                             (export-all :model/Card [card])
                             (export-all :model/Dashboard [dash]))]
        (t2/update! :model/Card :id card-id {:name "changed"})
        (t2/delete! :model/DashboardCard :dashboard_id dash-id)
        (is (= [] (load-all exported)))
        (is (= "card" (t2/select-one-fn :name :model/Card :id card-id)))
        (is (= [card-id] (t2/select-fn-vec :card_id :model/DashboardCard :dashboard_id dash-id)))))))

(deftest import-all-continue-on-error-test
  (testing "an entity that fails to load is left out with its error, and the rest loads"
    (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "serdes load"}
                   :model/Card       card                   {:collection_id coll-id :name "card"}]
      (let [[exported-card] (export-all :model/Card [card])
            broken          (-> exported-card
                                (assoc :entity_id (eid \x) :serdes/meta [{:model "Card"}])
                                (assoc :dataset_query {:lib/type :mbql/query :stages "not stages"}))]
        (t2/update! :model/Card :id (:id card) {:name "changed"})
        (let [errors (load-all [exported-card broken] :continue-on-error true)]
          (is (= 1 (count errors)))
          (is (= "card" (t2/select-one-fn :name :model/Card :id (:id card))))
          (is (not (t2/exists? :model/Card :entity_id (eid \x))))))
      (testing "and without continue-on-error, the whole import rolls back"
        (let [[exported-card] (export-all :model/Card [card])]
          (t2/update! :model/Card :id (:id card) {:name "changed again"})
          (is (thrown? Exception (load-all [exported-card (assoc exported-card :entity_id (eid \y)
                                                                 :serdes/meta [{:model "Card"}]
                                                                 :dataset_query {:lib/type :mbql/query
                                                                                 :stages   "x"})])))
          (is (= "changed again" (t2/select-one-fn :name :model/Card :id (:id card)))))
        (is (some? coll))))))

(deftest local-rows-test
  (testing "finds the local row each exported entity matches, without creating what it refers to"
    (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "serdes local rows"}]
      (let [[exported] (export-all :model/Collection [coll])
            missing    (assoc exported :entity_id (eid \z) :personal_owner_id "nobody@example.com")]
        (is (= [coll-id nil] (map :id (serialization/local-rows :model/Collection [exported missing]))))
        (is (not (t2/exists? :model/User :email "nobody@example.com")))))))

(deftest stripped-load-keeps-stripped-columns-test
  (testing "loading an entity without the keys that close a cycle leaves those columns of its local row as they are"
    (mt/with-temp [:model/Collection {coll-id :id :as coll} {:name "serdes stripped"}
                   :model/Dashboard  {dash-id :id :as dash} {:collection_id coll-id
                                                             :name          "dash"
                                                             :parameters    [{:id "p1" :name "Category" :slug "category"
                                                                              :type "string/="}]}]
      (let [[exported] (export-all :model/Dashboard [dash])
            stripped   (-> exported
                           (dissoc :parameters :dashcards)
                           (assoc :name "renamed" :serdes/stripped #{:parameters :dashcards}))]
        (serialization/load :model/Dashboard [stripped])
        (is (=? {:name "renamed" :parameters [{:id "p1"}]} (t2/select-one :model/Dashboard :id dash-id)))
        (is (some? coll))))))
