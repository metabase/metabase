(ns metabase.glossary.models.glossary-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest creator-hydration-test
  (testing "Glossary creator hydration returns user details"
    (let [user1-data {:first_name "Test"
                      :last_name  "Creator"
                      :email      "test.creator@example.com"}
          user2-data {:first_name "Second"
                      :last_name  "User"
                      :email      "second.user@example.com"}]
      (mt/with-temp [:model/User {user1-id :id} user1-data
                     :model/Glossary glossary1 {:term       "API"
                                                :definition "Application Programming Interface"
                                                :creator_id user1-id}
                     :model/User {user2-id :id} user2-data
                     :model/Glossary glossary2 {:term       "REST"
                                                :definition "Representational State Transfer"
                                                :creator_id user2-id}]
        (testing "Single glossary entry hydration"
          (let [hydrated (t2/hydrate (t2/select-one :model/Glossary :id (:id glossary1)) :creator)]
            (is (some? (:creator hydrated)))
            (is (= user1-id (get-in hydrated [:creator :id])))
            (is (= "Test" (get-in hydrated [:creator :first_name])))
            (is (= "Creator" (get-in hydrated [:creator :last_name])))
            (is (= "test.creator@example.com" (get-in hydrated [:creator :email])))))

        (testing "Batch glossary entry hydration"
          (let [glossary-entries (t2/select :model/Glossary :id [:in [(:id glossary1) (:id glossary2)]])
                hydrated (t2/hydrate glossary-entries :creator)]
            (is (= 2 (count hydrated)))
            (is (every? #(some? (:creator %)) hydrated))
            (let [creators-by-id (into {} (map (juxt :id :creator) hydrated))]
              (is (= user1-id (get-in creators-by-id [(:id glossary1) :id])))
              (is (= user2-id (get-in creators-by-id [(:id glossary2) :id])))
              (is (= "Test" (get-in creators-by-id [(:id glossary1) :first_name])))
              (is (= "Second" (get-in creators-by-id [(:id glossary2) :first_name]))))))

        (testing "Glossary created without creator_id defaults to internal user"
          (let [glossary-no-creator (t2/insert-returning-instance! :model/Glossary
                                                                   {:term       "SQL"
                                                                    :definition "Structured Query Language"})]
            (is (= config/internal-mb-user-id (:creator_id glossary-no-creator)))))))))
