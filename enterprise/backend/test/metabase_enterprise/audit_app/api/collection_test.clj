(ns metabase-enterprise.audit-app.api.collection-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase.config :as config]
   [metabase.models :refer [Collection]]
   [metabase.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest list-collections-instance-analytics-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration
      (t2.with-temp/with-temp [Collection _ {:name "Zippy"}]
        (testing "Instance Analytics Collection should be the last collection."
          (testing "GET /api/collection"
            (is (= "instance-analytics"
                   (->> (mt/user-http-request :crowberto :get 200 "collection")
                        last
                        :type))))
          (testing "GET /api/collection/test"
            (is (= "instance-analytics"
                   (->> (mt/user-http-request :crowberto :get 200 "collection/tree")
                        last
                        :type))))))))
  (mt/with-premium-features #{}
    (audit-test/with-audit-db-restoration
      (t2.with-temp/with-temp [Collection _ {:name "Zippy"}]
        (testing "Instance Analytics Collection should not show up when audit-app isn't enabled."
          (testing "GET /api/collection"
            (is (nil?
                   (->> (mt/user-http-request :crowberto :get 200 "collection")
                        last
                        :type))))
          (testing "GET /api/collection/test"
            (is (= nil
                   (->> (mt/user-http-request :crowberto :get 200 "collection/tree")
                        last
                        :type)))))))))

(defn instance-analytics-collection-names
  "Gather instance-analytic type collections and their children (who may or may-not have type=instance-analytics)."
  []
  (if-not config/ee-available?
    #{}
    (let [colls (->> (t2/select Collection :archived false)
                     (sort-by (fn [{coll-type :type coll-name :name coll-id :id}]
                                [coll-type ((fnil u/lower-case-en "") coll-name) coll-id]))
                     (mapv #(select-keys % [:id :name :location :type])))

          id->coll (m/index-by :id colls)
          collection-tree (collection/collections->tree {} colls)]
      (->> (loop [[tree & coll-tree] collection-tree
                  ia-ids #{}]
             (cond (not tree) ia-ids
                   (= "instance-analytics" (:type tree)) (let [ids (transient #{})]
                                                           (walk/postwalk
                                                            (fn [x] (when (and (map? x) (:id x)) (conj! ids (:id x))) x)
                                                            tree)
                                                           (recur coll-tree (into ia-ids (persistent! ids))))
                   ;; TODO: put my children onto the end of the coll-tree, then recur like normal
                   :else (recur (concat coll-tree (:children tree)) ia-ids)))
           (mapv (comp :name id->coll))))))

(deftest list-collections-visible-collections-test
  (testing "GET /api/collection"
    (testing "You should only see your collection and public collections"
      ;; Set audit-app feature so that we can assert that audit collections are also visible when running EE
      (mt/with-premium-features #{:audit-app}
        (audit-test/with-audit-db-restoration
          (let [admin-user-id  (u/the-id (test.users/fetch-user :crowberto))
                crowberto-root (t2/select-one Collection :personal_owner_id admin-user-id)]
            (t2.with-temp/with-temp [Collection collection          {}
                                     Collection {collection-id :id} {:name "Collection with Items"}
                                     Collection _                   {:name            "subcollection"
                                                                     :location        (format "/%d/" collection-id)
                                                                     :authority_level "official"}
                                     Collection _                   {:name     "Crowberto's Child Collection"
                                                                     :location (collection/location-path crowberto-root)}]
              (let [public-collection-names  #{"Our analytics"
                                               (:name collection)
                                               "Collection with Items"
                                               "subcollection"}
                    luckys                   (set (map :name (mt/user-http-request :lucky :get 200 "collection")))
                    crowbertos               (set (map :name (mt/user-http-request :crowberto :get 200 "collection")))
                    crowbertos-with-excludes (set (map :name (mt/user-http-request :crowberto :get 200 "collection" :exclude-other-user-collections true)))]
                (is (= (into #{}
                             (concat (instance-analytics-collection-names)
                                     public-collection-names
                                     (t2/select-fn-set :name Collection {:where [:and [:= :type nil] [:= :archived false]]})))
                       crowbertos))
                (is (= (into #{"Crowberto Corv's Personal Collection" "Crowberto's Child Collection"}
                             (concat (instance-analytics-collection-names) public-collection-names))
                       crowbertos-with-excludes))
                (is (true? (contains? crowbertos "Lucky Pigeon's Personal Collection")))
                (is (false? (contains? crowbertos-with-excludes "Lucky Pigeon's Personal Collection")))
                (is (= (conj public-collection-names (:name collection) "Lucky Pigeon's Personal Collection")
                       luckys))
                (is (false? (contains? luckys "Crowberto Corv's Personal Collection")))))))))))
