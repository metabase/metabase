(ns metabase.history.atom-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [malli.core :as mc]
            [malli.core :as mc]
            [metabase.history.atom :as a-history]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan2.core :as t2]))

(use-fixtures :once (fn [f]
                      (reset! a-history/*entity-store a-history/empty-entity-store)
                      (reset! @#'a-history/*id @#'a-history/initial-id)
                      (f)))

(deftest cannot-set-invalid-branch
  (is (thrown-with-msg?
       AssertionError #"Branch does not exist."
       (a-history/set-current-branch! 99) :throws)))

(deftest setting-and-getting-branch
  (is (= (a-history/create-branch! "my-branch-seven" 7) 7))
  (is (= (a-history/set-current-branch! 7) 7))
  (is (= (a-history/set-current-branch! nil) nil))
  (is (= (a-history/current-branch) nil)))

(deftest a-shape-that-conforms
  (let [create-card-data {:description nil,
                          :collection_position nil,
                          :result_metadata nil,
                          :collection_id nil,
                          :name "Orders, 1 row",
                          :model :question,
                          :dataset_query {:database 66, :model "query", :query {:source-table 184, :limit 1}},
                          :display "table",
                          :visualization_settings {}}
        entity-store-ex {:current-branch nil
                         :branches {1 {:id 1 :name "my-branch" :status :not-approved}
                                    2 {:id 2 :name "another-branch" :status :approved}}
                         ;; entities go from
                         ;; [branch-id instance model-id] -> value as it would come in from `card/create-card!`
                         :entities {[1 :model/Card 88] {:model :model/Card :id 88 :op :delete}
                                    [2 :model/Card 88] {:model :model/Card
                                                        :id 88
                                                        :op :update
                                                        :data (-> create-card-data
                                                                  (assoc :name "Branch 2"))}}}]
    (is (true? (mc/validate a-history/EntityStore entity-store-ex)))))

(deftest creating-branches
  (reset! a-history/*entity-store a-history/empty-entity-store)

  (is (= (a-history/create-branch! "my-test-branch") 100001))

  (is (= (a-history/current-branch)  nil))

  (a-history/set-current-branch! nil)
  (is (= (a-history/current-branch)  nil))

  (a-history/set-current-branch! 100001)
  (is (= (a-history/current-branch)  100001)))

(deftest branchify-entity-reading-an-updated-card
  (mt/with-temp [:model/Card {card-id :id :as card} {:name "FOO"}]
    (is (= (a-history/create-branch! "my-test-branch" 100001)  100001))
    (is (= (a-history/set-current-branch! 100001)  100001))

    #_(is (= (:name (a-history/maybe-divert-read :model/Card 88)) (:name card)))

    (a-history/add-delta-to-branch! 100001 :model/Card 88 {:op :update :data {:name "BAR"}})

    (is (= (:name (a-history/maybe-divert-read :model/Card card-id))  "FOO"))))

(deftest delete-a-card-on-a-branch->-user-decides-to-update-a-card-on-a-branch
  (a-history/create-branch! "my-test-branch" 100001)
  (a-history/set-current-branch! 100001)
  (is (= {:current-branch 100001,
          :branches {100001 {:id 100001, :name "my-test-branch", :status :not-approved}},
          :entities {[100001 :model/Card 88] {:id 88, :model :model/Card, :op :update, :data {:name "FFOOOPP"}}}}

         (a-history/add-delta-to-branch! 100001 :model/Card 88 {:op :update :data {:name "FFOOOPP"}}))))

(deftest update-a-card-on-a-branch->-user-decides-to-archive-a-card-on-a-branch
  (is (= {:current-branch 100001
          :branches {100001 {:id 100001, :name "my-test-branch", :status :not-approved}},
          :entities {[100001 :model/Card 88] {:id 88, :model :model/Card, :op :update, :data {:archived true}}}}

         (a-history/add-delta-to-branch! 100001 :model/Card 88 {:op :update :data {:archived true}}))))

(deftest delete-a-card-on-a-branch->-user-decides-to-mark-a-card-on-a-branch
  (is (= {:current-branch 100001,
          :branches {100001 {:id 100001, :name "my-test-branch", :status :not-approved}},
          :entities {[100001 :model/Card 88] {:id 88, :op :delete, :model :model/Card}}}

         (a-history/add-delta-to-branch! 100001 :model/Card 88 {:op :delete}))))



(deftest workflow-1-test
  (mt/with-temp [:model/Card card {}]
    (a-history/set-current-branch!
     (a-history/create-branch! "workflow-1-branch"))
    ;; update name through the api:
    (mt/user-http-request :crowberto :put 200 (format "card/%s" (u/the-id card)) {:name "new name from branch"})
    (is (= "new name from branch"
           (:name (mt/user-http-request :crowberto :get 200 (format "card/%s" (u/the-id card))))))
    (a-history/set-current-branch! nil)
    (is (= (:name card)
           (:name (mt/user-http-request :crowberto :get 200 (format "card/%s" (u/the-id card))))))
    (a-history/publish-branch! (a-history/create-branch! "workflow-1-branch") (mt/user->id :crowberto))
    (is (= "new name from branch"
           (:name (mt/user-http-request :crowberto :get 200 (format "card/%s" (u/the-id card))))))))

;; taken from card-test
(defn mbql-count-query
  ([]
   (mbql-count-query (mt/id) (mt/id :venues)))

  ([db-or-id table-or-id]
   {:database (u/the-id db-or-id)
    :type     :query
    :query    {:source-table (u/the-id table-or-id), :aggregation [[:count]]}}))

;; taken from card-test
(defn card-with-name-and-query
  ([]
   (card-with-name-and-query (mt/random-name)))

  ([card-name]
   (card-with-name-and-query card-name (mbql-count-query)))

  ([card-name query]
   {:name                   card-name
    :display                "scalar"
    :dataset_query          query
    :visualization_settings {:global {:title nil}}}))

(defn normalize [card]
  (->>
   (select-keys card [:cache_ttl :collection_id :collection_position :creator_id :database_id :dataset_query :description
                      :display :id :metabase_version :name :parameter_mappings :parameters :query_type :result_metadata
                      :table_id :type :visualization_settings])
   (walk/postwalk (fn [x] (if (string? x) (keyword x) x)))))

(deftest workflow-2-test
  (let [card-name (mt/random-name)]
    (try
      (mt/with-temp [:model/Collection coll {}]
        (a-history/set-current-branch! (a-history/create-branch! "workflow-2-branch"))
        ;; with temp will not respect branches

        (let [card (mt/user-http-request :crowberto :post 200 "card" {:visualization_settings {},
                                                                      :dataset_query          {:query    {:source-table (mt/id :venues)}
                                                                                               :type     :query
                                                                                               :database (mt/id)},
                                                                      :name card-name,
                                                                      :collection_position nil,
                                                                      :result_metadata nil,
                                                                      :collection_id nil,
                                                                      :type "question",
                                                                      :display "table",
                                                                      :description nil})]

          (a-history/set-current-branch! nil)
          (a-history/publish-branch! (a-history/create-branch! "workflow-2-branch") (mt/user->id :crowberto))

          (is (= (normalize card)
                 (normalize (t2/select-one :model/Card (u/the-id card)))))))
      (finally
        (t2/delete! :model/Card :name card-name)))))



;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; these used a literal card on my db, will need to be updated to use a temp card
#_(deftest delete-a-card-on-a-branch->-branching-off
  (is (= (a-history/maybe-divert-read* nil :model/Card 88 card-88)  card-88)))

#_(deftest delete-a-card-on-a-branch->-set-branching-off
  (a-history/set-current-branch! nil)
  (is (= (a-history/maybe-divert-read :model/Card 88)  card-88)))

#_(deftest can't-use-set-current-branch!-with-a-branch-that-doesn't-exist
  ;; branch d.n.e.
  (is (= (a-history/maybe-divert-read* 999 :model/Card 88 card-88)  card-88))
  (a-history/set-current-branch! nil))

#_(deftest maybe-divert-write-a-card-with-branch-enabled

  (a-history/divert-write 100001 :model/Card 88 :update {:name "FOO"})

  (is (= (a-history/entities-for-branch-id 100001)  [{:id 88, :model :model/Card, :op :update, :data {:name "FOO"}}])))

#_(deftest publishing-a-branch
  (def branched-card (a-history/maybe-divert-read :model/Card 88))

  (binding [api/*current-user-id* 13371338] ;; remember to bind current-user-id when updating a card!
    (a-history/publish-branch! 100001 13371338))

  (is (= (:name (t2/select-one :model/Card 88))  "FOO"))

  (is (= (a-history/branch-by-id 100001)  nil)))
