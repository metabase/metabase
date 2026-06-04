(ns metabase.metabot.models.metabot-conversation-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(deftest metabot-thread-search-and-permissions-test
  (testing "Metabot conversations are searchable as the \"metabot-thread\" model, scoped to owner/superuser"
    (search.tu/with-new-search-if-available-without-fallback
      (let [token (mt/random-name)]
        (mt/with-temp
          ;; Rows are inserted inside the synchronous-indexing body, so the after-insert
          ;; search hook indexes them into the temp index table immediately.
          [:model/MetabotConversation {rasta-thread :id} {:user_id (mt/user->id :rasta)
                                                          :title   (str "Rasta " token " thread")}
           :model/MetabotConversation {lucky-thread :id} {:user_id (mt/user->id :lucky)
                                                          :title   (str "Lucky " token " thread")}
           :model/MetabotConversation {untitled :id}     {:user_id (mt/user->id :rasta)
                                                          :title   nil}]
          (letfn [(thread-ids [user]
                    (->> (mt/user-http-request user :get 200 "search" :q token :models "metabot-thread")
                         :data
                         (map :id)
                         set))]
            (testing "results carry the metabot-thread model and the conversation UUID as :id"
              (let [results (:data (mt/user-http-request :crowberto :get 200 "search"
                                                         :q token :models "metabot-thread"))]
                (is (every? #(= "metabot-thread" (:model %)) results))
                (is (contains? (set (map :id results)) rasta-thread))))
            (testing "each owner sees only their own thread"
              (is (= #{rasta-thread} (thread-ids :rasta)))
              (is (= #{lucky-thread} (thread-ids :lucky))))
            (testing "a superuser sees every matching thread"
              (is (= #{rasta-thread lucky-thread} (thread-ids :crowberto))))
            (testing "an untitled conversation is not indexed"
              (is (not (contains? (thread-ids :rasta) untitled)))
              (is (not (contains? (thread-ids :crowberto) untitled))))))))))
