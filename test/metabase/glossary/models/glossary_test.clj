(ns metabase.glossary.models.glossary-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
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

(deftest glossary-schema-test
  (testing "the Glossary schema refuses a blank or missing term or definition"
    (is (not (mr/validate ::glossary.schema/glossary.update {:term " "})))
    (is (not (mr/validate ::glossary.schema/glossary.update {:definition nil})))
    (is (mr/validate ::glossary.schema/glossary.update {:term "Kept" :definition "Kept definition"}))))

(deftest write-permission-test
  (mt/with-temp [:model/Glossary entry {:term "Checked" :definition "Permission checked"}]
    (testing "superuser can create and update entries"
      (mt/with-test-user :crowberto
        (is (true? (api/create-check :model/Glossary {:term "New" :definition "Entry"})))
        (is (true? (api/update-check entry {:term "Renamed"})))
        (is (true? (:can_write (t2/hydrate entry :can_write))))))
    (testing "regular user cannot create or update entries"
      (mt/with-test-user :rasta
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                              (api/create-check :model/Glossary {:term "New" :definition "Entry"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You don't have permissions to do that"
                              (api/update-check entry {:term "Renamed"})))
        (is (false? (:can_write (t2/hydrate entry :can_write))))))
    (testing "every user can read entries"
      (mt/with-test-user :rasta
        (is (= [true] (map mi/can-read? (t2/hydrate [entry] :can_read))))))))
