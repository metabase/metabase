(ns metabase.collection-items.core-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.collection-items.core :as collection-items]
   [metabase.collection-items.spec :as collection-items.spec]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.resolution :as models.resolution]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- options
  [& {:as overrides}]
  (merge {:show-dashboard-questions? false
          :archived?                 false}
         overrides))

(deftest model-param-values-match-item-names-test
  (testing "the `?models=` values are the names of the items the specs declare, the models of the Collection items listing"
    (let [enum-values (-> (mc/schema collection-items/Models) mc/children first mc/children set)
          item-names  (set (keys (models.resolution/spec-entries-by-name collection-items.spec/spec)))]
      (is (= (into item-names ["no_models" "measure"])
             enum-values)))))

(deftest every-item-name-has-a-spec-test
  (testing "every type of item resolves to a spec with a fn to list its items"
    (doseq [[item-name [_model spec]] (models.resolution/spec-entries-by-name collection-items.spec/spec)]
      (testing item-name
        (is (ifn? (:items spec)))))))

(deftest items-returning-nil-are-left-out-test
  (mt/with-temp [:model/Collection {collection-id :id} {}
                 :model/Card       {card-id :id}       {:collection_id collection-id}
                 :model/Timeline   {timeline-id :id}   {:collection_id collection-id}
                 :model/Pulse      {pulse-id :id}      {:collection_id collection-id}]
    (let [collection (t2/select-one :model/Collection :id collection-id)
          list-items (fn [options]
                       (mt/with-current-user (mt/user->id :crowberto)
                         (request/with-limit-and-offset 50 0
                           (collection-items/collection-children collection options))))
          models-of  (fn [result]
                       (set (map (juxt :model :id) (:data result))))]
      (testing "every type that lists items in the Collection is listed"
        (let [result (list-items (options :models #{:card :timeline :pulse}))]
          (is (= #{["card" card-id] ["timeline" timeline-id] ["pulse" pulse-id]}
                 (models-of result)))
          (is (= [:card :pulse :timeline] (:models result)))))
      (testing "a type with no creator to restrict on is left out of the items created by a user"
        (let [result (list-items (options :models #{:card :timeline :pulse}
                                          :created-by-id (mt/user->id :crowberto)))]
          (is (= #{} (models-of result)))
          (is (= [:card] (:models result)))))
      (testing "a type that is never pinned is listed, with no item, among the pinned items"
        (let [result (list-items (options :models #{:card :timeline :pulse}
                                          :pinned-state :is_pinned))]
          (is (= #{} (models-of result)))
          (is (= [:card :pulse :timeline] (:models result)))))
      (testing "no type left to list gives an empty page"
        (let [result (list-items (options :models #{:timeline}
                                          :created-by-id (mt/user->id :crowberto)))]
          (is (= {:total 0 :data [] :models []}
                 (select-keys result [:total :data :models])))))
      (testing "the types a Collection of another namespace does not hold are left out"
        (mt/with-temp [:model/Collection {snippets-id :id} {:namespace "snippets"}]
          (let [snippets (t2/select-one :model/Collection :id snippets-id)
                result   (mt/with-current-user (mt/user->id :crowberto)
                           (request/with-limit-and-offset 50 0
                             (collection-items/collection-children snippets (options :models #{:card :timeline :snippet}))))]
            (is (= [:snippet] (:models result)))))))))

(deftest root-collection-models-test
  (let [list-models (fn [options]
                      (mt/with-current-user (mt/user->id :crowberto)
                        (request/with-limit-and-offset 50 0
                          (:models (collection-items/collection-children collection/root-collection options)))))]
    (testing "the plain listing of the Root Collection"
      (is (= [:card :collection :dashboard :dataset :document :exploration :metric :pulse :timeline]
             (list-models (options)))))
    (testing "the pinned items of the Root Collection"
      (is (= [:card :collection :dashboard :dataset :document :exploration :metric :pulse :timeline]
             (list-models (options :pinned-state :is_pinned)))))
    (testing "the items of the Root Collection created by a user"
      (is (= [:card :dashboard :dataset :document :metric]
             (list-models (options :created-by-id (mt/user->id :crowberto))))))))

(deftest root-collection-items-query-count-test
  (testing "listing the Root Collection issues no query per item"
    (let [call-count (fn [n]
                       (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Collection]
                         (doseq [i (range n)]
                           (t2/insert! :model/Card {:name                   (str "root count card " i)
                                                    :type                   :question
                                                    :creator_id             (mt/user->id :crowberto)
                                                    :collection_id          nil
                                                    :database_id            (mt/id)
                                                    :dataset_query          (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))
                                                    :display                "table"
                                                    :visualization_settings {}})
                           (t2/insert! :model/Dashboard {:name          (str "root count dashboard " i)
                                                         :creator_id    (mt/user->id :crowberto)
                                                         :collection_id nil})
                           (t2/insert! :model/Collection {:name     (str "root count collection " i)
                                                          :location "/"}))
                         (mt/user-http-request :crowberto :get 200 "collection/root/items")
                         (t2/with-call-count [cc]
                           (mt/user-http-request :crowberto :get 200 "collection/root/items")
                           (cc))))]
      (is (= (call-count 2) (call-count 6))))))
