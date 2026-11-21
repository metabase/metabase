(ns metabase.collections-rest.archive-update-permissions-test
  "A user-by-change table of the answers and statuses of archiving and restoring a Collection with `PUT /api/collection/:id`."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- grant!
  [level collection]
  (case level
    :write (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    :read  (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
    :none  nil))

(deftest archive-collection-test
  (doseq [[user top-level sub-level expected-status]
          [[:rasta     :write :write 200]
           [:rasta     :write :read  403]
           [:rasta     :write :none  403]
           [:rasta     :read  :write 403]
           [:rasta     :none  :none  403]
           [:crowberto :none  :none  200]]]
    (testing (str user " archives a collection with " top-level " that holds one with " sub-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top {}
                       :model/Collection sub {:location (format "/%d/" (:id top))}]
          (grant! top-level top)
          (grant! sub-level sub)
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top)) {:archived true})]
            (if (= 200 expected-status)
              (do (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top))))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id sub)))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (false? (t2/select-one-fn :archived :model/Collection :id (:id top))))
                  (is (false? (t2/select-one-fn :archived :model/Collection :id (:id sub)))))))))))
  (testing "rasta archives a collection whose card another user wrote and whose child he cannot read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection top  {}
                     :model/Collection sub  {:location (format "/%d/" (:id top))}
                     :model/Card       card {:collection_id (:id sub)}]
        (grant! :write top)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "collection/" (:id top)) {:archived true})))
        (is (false? (t2/select-one-fn :archived :model/Card :id (:id card))))))))

(deftest restore-collection-test
  (doseq [[user top-level sub-level expected-status]
          [[:rasta     :write :write 200]
           [:rasta     :write :read  403]
           [:rasta     :read  :write 403]
           [:rasta     :none  :none  403]
           [:crowberto :none  :none  200]]]
    (testing (str user " restores a collection with " top-level " that held one with " sub-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top {}
                       :model/Collection sub {:location (format "/%d/" (:id top))}]
          (grant! top-level top)
          (grant! sub-level sub)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top)) {:archived false})]
            (if (= 200 expected-status)
              (is (false? (t2/select-one-fn :archived :model/Collection :id (:id top))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top)))))))))))
  (doseq [[user target-level expected-status]
          [[:rasta     :write 200]
           [:rasta     :read  403]
           [:rasta     :none  403]
           [:crowberto :none  200]]]
    (testing (str user " restores a collection into another parent with " target-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top    {}
                       :model/Collection target {}]
          (grant! :write top)
          (grant! target-level target)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (let [response (mt/user-http-request user :put expected-status (str "collection/" (:id top))
                                               {:archived false :parent_id (:id target)})]
            (if (= 200 expected-status)
              (is (= (format "/%d/" (:id target)) (t2/select-one-fn :location :model/Collection :id (:id top))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (true? (t2/select-one-fn :archived :model/Collection :id (:id top))))))))))
    (testing "restoring into an archived parent is a 400 whoever asks"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection top    {}
                       :model/Collection target {}]
          (grant! :write top)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id target)) {:archived true})
          (doseq [user [:rasta :crowberto]]
            (mt/user-http-request user :put 400 (str "collection/" (:id top))
                                  {:archived false :parent_id (:id target)}))))))
  (testing "restoring into a parent that does not exist is a 404"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection top {}]
        (grant! :write top)
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
        (mt/user-http-request :rasta :put 404 (str "collection/" (:id top))
                              {:archived false :parent_id Integer/MAX_VALUE})))))

(defn- archived-flags
  "The `archived` flag of each of `rows` of `model`, by id."
  [model rows]
  (t2/select-fn->fn :id :archived model :id [:in (map :id rows)]))

(deftest restore-collection-archived-with-parent-into-new-parent-test
  (testing "moving a Collection archived with its parent out of the Trash restores what was archived with it"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection parent  {}
                     :model/Collection child   {:location (format "/%d/" (:id parent))}
                     :model/Collection grand   {:location (format "/%d/%d/" (:id parent) (:id child))}
                     :model/Collection earlier {:location (format "/%d/%d/" (:id parent) (:id child))}
                     :model/Collection target  {}
                     :model/Card       card    {:collection_id (:id child)}
                     :model/Card       nested  {:collection_id (:id grand)}
                     :model/Card       trashed {:collection_id (:id child)}
                     :model/Dashboard  dash    {:collection_id (:id child)}]
        (doseq [c [parent child grand earlier target]]
          (grant! :write c))
        (mt/user-http-request :rasta :put 200 (str "card/" (:id trashed)) {:archived true})
        (mt/user-http-request :rasta :put 200 (str "collection/" (:id earlier)) {:archived true})
        (mt/user-http-request :rasta :put 200 (str "collection/" (:id parent)) {:archived true})
        (mt/user-http-request :rasta :put 200 (str "collection/" (:id child)) {:archived false :parent_id (:id target)})
        (is (=? {:archived false :location (format "/%d/" (:id target))}
                (t2/select-one :model/Collection :id (:id child))))
        (testing "its items and sub-collections come back with it"
          (is (= {(:id card) false, (:id nested) false} (archived-flags :model/Card [card nested])))
          (is (= {(:id dash) false} (archived-flags :model/Dashboard [dash])))
          (is (= {(:id grand) false} (archived-flags :model/Collection [grand]))))
        (testing "what was archived on its own before stays archived, and so does the parent"
          (is (= {(:id trashed) true} (archived-flags :model/Card [trashed])))
          (is (= {(:id earlier) true, (:id parent) true} (archived-flags :model/Collection [earlier parent]))))))))

(deftest restore-into-new-parent-checks-what-it-restores-test
  (testing "the move is refused, and nothing is restored, for a user who cannot write a sub-collection it restores"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection parent {}
                     :model/Collection child  {:location (format "/%d/" (:id parent))}
                     :model/Collection grand  {:location (format "/%d/%d/" (:id parent) (:id child))}
                     :model/Collection target {}
                     :model/Card       card   {:collection_id (:id child)}]
        (doseq [c [parent child target]]
          (grant! :write c))
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent)) {:archived true})
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "collection/" (:id child)) {:archived false :parent_id (:id target)})))
        (is (= {(:id child) true, (:id grand) true} (archived-flags :model/Collection [child grand])))
        (is (= {(:id card) true} (archived-flags :model/Card [card])))))))

(deftest restore-collection-archived-on-its-own-test
  (testing "a Collection archived on its own is restored with its items in place and into a new parent"
    (doseq [request [{:archived false} {:archived false :parent_id ::target}]]
      (mt/with-temp [:model/Collection top    {}
                     :model/Collection sub    {:location (format "/%d/" (:id top))}
                     :model/Collection target {}
                     :model/Card       card   {:collection_id (:id sub)}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top))
                              (cond-> request (:parent_id request) (assoc :parent_id (:id target))))
        (is (= {(:id top) false, (:id sub) false} (archived-flags :model/Collection [top sub])))
        (is (= {(:id card) false} (archived-flags :model/Card [card])))))))

(deftest restore-collection-without-archive-operation-test
  (testing "a Collection archived without an archive operation is restored with its items in place and into a new parent"
    (doseq [request [{:archived false} {:archived false :parent_id ::target}]]
      (mt/with-temp [:model/Collection top    {}
                     :model/Collection target {}
                     :model/Card       card   {:collection_id (:id top)}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top)) {:archived true})
        (t2/query-one {:update :collection :set {:archive_operation_id nil} :where [:= :id (:id top)]})
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id top))
                              (cond-> request (:parent_id request) (assoc :parent_id (:id target))))
        (is (= {(:id top) false} (archived-flags :model/Collection [top])))
        (is (= {(:id card) false} (archived-flags :model/Card [card])))))))

(deftest archive-and-restore-collection-holding-exploration-test
  (doseq [user [:crowberto :rasta]]
    (testing (str user " archives and restores a Collection holding an Exploration with a Summary card")
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection  coll {}
                       :model/Exploration expl {:name "E" :creator_id (mt/user->id :crowberto) :collection_id (:id coll)}
                       :model/Document    doc  {:name           "Summary"
                                                :collection_id  (:id coll)
                                                :creator_id     (mt/user->id :crowberto)
                                                :exploration_id (:id expl)
                                                :document       {:type "doc" :content []}}
                       :model/Card        card {:collection_id (:id coll) :document_id (:id doc)}]
          (grant! :write coll)
          (mt/user-http-request user :put 200 (str "collection/" (:id coll)) {:archived true})
          (is (= {(:id card) true} (archived-flags :model/Card [card])))
          (is (= {(:id expl) true} (archived-flags :model/Exploration [expl])))
          (mt/user-http-request user :put 200 (str "collection/" (:id coll)) {:archived false})
          (is (= {(:id card) false} (archived-flags :model/Card [card])))
          (is (= {(:id doc) false} (archived-flags :model/Document [doc])))))))
  (testing "a user who reads but cannot write the Collection is refused, and nothing is archived"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection  coll {}
                     :model/Exploration expl {:name "E" :creator_id (mt/user->id :crowberto) :collection_id (:id coll)}
                     :model/Document    doc  {:name           "Summary"
                                              :collection_id  (:id coll)
                                              :creator_id     (mt/user->id :crowberto)
                                              :exploration_id (:id expl)
                                              :document       {:type "doc" :content []}}
                     :model/Card        card {:collection_id (:id coll) :document_id (:id doc)}]
        (grant! :read coll)
        (mt/user-http-request :rasta :put 403 (str "collection/" (:id coll)) {:archived true})
        (is (= {(:id card) false} (archived-flags :model/Card [card])))))))

(deftest archive-and-restore-exploration-with-summary-card-test
  (testing "an Exploration with a Summary card is archived and restored by a user who writes its Collection"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection  coll {}
                     :model/Exploration expl {:name "E" :creator_id (mt/user->id :crowberto) :collection_id (:id coll)}
                     :model/Document    doc  {:name           "Summary"
                                              :collection_id  (:id coll)
                                              :creator_id     (mt/user->id :crowberto)
                                              :exploration_id (:id expl)
                                              :document       {:type "doc" :content []}}
                     :model/Card        card {:collection_id (:id coll) :document_id (:id doc)}]
        (testing "a user who only reads the Collection is refused"
          (grant! :read coll)
          (mt/user-http-request :rasta :put 403 (str "exploration/" (:id expl)) {:archived true})
          (is (= {(:id card) false} (archived-flags :model/Card [card]))))
        (grant! :write coll)
        (mt/user-http-request :rasta :put 200 (str "exploration/" (:id expl)) {:archived true})
        (is (= {(:id doc) true} (archived-flags :model/Document [doc])))
        (is (= {(:id card) true} (archived-flags :model/Card [card])))
        (mt/user-http-request :rasta :put 200 (str "exploration/" (:id expl)) {:archived false})
        (is (= {(:id doc) false} (archived-flags :model/Document [doc])))
        (is (= {(:id card) false} (archived-flags :model/Card [card])))))))

(deftest collection-archive-leaves-timeline-events-test
  (testing "a Collection's archive and restore leave the events of its Timelines as they were"
    (mt/with-temp [:model/Collection    coll    {}
                   :model/Timeline      tl      {:collection_id (:id coll)}
                   :model/TimelineEvent live    {:timeline_id (:id tl)}
                   :model/TimelineEvent trashed {:timeline_id (:id tl)}]
      (mt/user-http-request :crowberto :put 200 (str "timeline-event/" (:id trashed)) {:archived true})
      (mt/user-http-request :crowberto :put 200 (str "collection/" (:id coll)) {:archived true})
      (is (= {(:id tl) true} (archived-flags :model/Timeline [tl])))
      (is (= {(:id live) false, (:id trashed) true} (archived-flags :model/TimelineEvent [live trashed])))
      (mt/user-http-request :crowberto :put 200 (str "collection/" (:id coll)) {:archived false})
      (is (= {(:id tl) false} (archived-flags :model/Timeline [tl])))
      (is (= {(:id live) false, (:id trashed) true} (archived-flags :model/TimelineEvent [live trashed])))))
  (testing "a Timeline's own archive and restore take all its events along"
    (mt/with-temp [:model/Timeline      tl    {}
                   :model/TimelineEvent event {:timeline_id (:id tl)}]
      (mt/user-http-request :crowberto :put 200 (str "timeline/" (:id tl)) {:archived true})
      (is (= {(:id event) true} (archived-flags :model/TimelineEvent [event])))
      (mt/user-http-request :crowberto :put 200 (str "timeline/" (:id tl)) {:archived false})
      (is (= {(:id event) false} (archived-flags :model/TimelineEvent [event]))))))
