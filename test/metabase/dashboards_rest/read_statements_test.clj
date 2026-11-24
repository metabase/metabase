(ns metabase.dashboards-rest.read-statements-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- statements
  "The number of app-DB statements `thunk` runs."
  [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- cards! [coll-id n]
  (let [mp (mt/metadata-provider)]
    (vec (t2/insert-returning-pks! :model/Card
                                   (mapv (fn [i]
                                           {:name                   (str "card " i)
                                            :creator_id             (mt/user->id :crowberto)
                                            :database_id            (mt/id)
                                            :display                :table
                                            :visualization_settings {}
                                            :collection_id          coll-id
                                            :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id :venues)))})
                                         (range n))))))

(defn- dashcards! [dashboard-id k dashcards]
  (t2/insert! :model/DashboardCard
              (map-indexed (fn [i dashcard]
                             (merge {:dashboard_id dashboard-id :row (* 4 (+ k i)) :col 0 :size_x 4 :size_y 4
                                     :visualization_settings {} :parameter_mappings []}
                                    dashcard))
                           dashcards)))

(defn- link-dashcards! [dashboard-id k model ids]
  (dashcards! dashboard-id k (map (fn [id] {:visualization_settings {:link {:entity {:id id :model model}}
                                                                     :virtual_card {:display "link"}}})
                                  ids)))

(defn- check-statements-equal [user path add-rows!]
  (let [request #(mt/user-http-request user :get 200 path)
        _       (request)
        _       (add-rows! 4)
        small   (min (statements request) (statements request))
        _       (add-rows! 10)
        large   (min (statements request) (statements request))]
    (is (= small large) (str "as " user " on " path))))

(deftest dashboard-statements-do-not-grow-with-virtual-dashcards-test
  (search.tu/with-index-disabled
    (mt/with-temp [:model/Collection {coll-id :id}      {}
                   :model/Dashboard  {dashboard-id :id} {:collection_id coll-id}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (doseq [user [:crowberto :rasta]
              path [(str "dashboard/" dashboard-id) (str "dashboard/" dashboard-id "/query_metadata")]]
        (check-statements-equal user path
                                (fn [n]
                                  (dashcards! dashboard-id 0 (repeat n {:visualization_settings {:virtual_card {:display "text"}
                                                                                                 :text         "hello"}}))))))))

(deftest dashboard-statements-do-not-grow-with-link-cards-test
  (search.tu/with-index-disabled
    (mt/with-temp [:model/Collection {coll-id :id}      {}
                   :model/Dashboard  {dashboard-id :id} {:collection_id coll-id}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (doseq [user  [:crowberto :rasta]
              model ["card" "dashboard" "collection"]]
        (check-statements-equal user (str "dashboard/" dashboard-id)
                                (fn [n]
                                  (link-dashcards! dashboard-id 0 model
                                                   (case model
                                                     "card"       (cards! coll-id n)
                                                     "dashboard"  (mapv :id (t2/insert-returning-instances! :model/Dashboard
                                                                                                            (repeat n {:name "linked" :creator_id (mt/user->id :crowberto) :collection_id coll-id})))
                                                     "collection" (mapv :id (t2/insert-returning-instances! :model/Collection
                                                                                                            (repeat n {:name "linked"})))))))))))

(deftest link-card-info-answers-each-link-test
  (mt/with-temp [:model/Collection {readable-id :id}   {}
                 :model/Collection {unreadable-id :id} {}
                 :model/Dashboard  {dashboard-id :id}  {:collection_id readable-id}]
    (perms/grant-collection-read-permissions! (perms/all-users-group) readable-id)
    (let [[readable-card] (cards! readable-id 1)
          [unreadable-card] (cards! unreadable-id 1)]
      (link-dashcards! dashboard-id 0 "card" [readable-card unreadable-card])
      (let [dashcards (:dashcards (mt/user-http-request :rasta :get 200 (str "dashboard/" dashboard-id)))
            entities  (map #(get-in % [:visualization_settings :link :entity]) dashcards)]
        (is (= 1 (count (filter :restricted entities))))
        (is (= [readable-card] (map :id (remove :restricted entities))))))))

(deftest related-statements-do-not-grow-with-dashcards-test
  (search.tu/with-index-disabled
    (mt/with-temp [:model/Collection {coll-id :id}      {}
                   :model/Dashboard  {dashboard-id :id} {:collection_id coll-id}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
      (doseq [user [:crowberto :rasta]]
        (check-statements-equal user (str "dashboard/" dashboard-id "/related")
                                (fn [n]
                                  (dashcards! dashboard-id 0 (map (fn [id] {:card_id id}) (cards! coll-id n)))))))))
