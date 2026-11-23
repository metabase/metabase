(ns metabase.glossary.models.glossary-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.glossary.models.glossary :as glossary]
   [metabase.glossary.schema :as glossary.schema]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
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
    (is (not (mr/validate ::glossary.schema/glossary.update {:id 1 :term " "})))
    (is (not (mr/validate ::glossary.schema/glossary.update {:id 1 :definition nil})))
    (is (mr/validate ::glossary.schema/glossary.update {:id 1 :term "Kept" :definition "Kept definition"}))))

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

(def ^:private published (atom []))

(doseq [topic [:event/glossary-create :event/glossary-update :event/glossary-delete]]
  (events/derive! topic ::published))

(methodical/defmethod events/publish-event! ::published
  [topic event]
  (swap! published conj [topic event]))

(deftest write-functions-publish-events-test
  (reset! published [])
  (mt/with-current-user (mt/user->id :rasta)
    (let [{:keys [id]} (first (glossary/create-glossaries! [{:term "Published" :definition "Definition" :creator_id (mt/user->id :rasta)}]))]
      (try
        (glossary/update-glossaries! [{:id id :definition "Changed"}])
        (glossary/delete-glossaries! [id])
        (is (=? [[:event/glossary-create {:changes [{:object {:id id :term "Published"}}]
                                          :user-id (mt/user->id :rasta)}]
                 [:event/glossary-update {:changes [{:object          {:definition "Changed"}
                                                     :previous-object {:definition "Definition"}}]}]
                 [:event/glossary-delete {:changes [{:previous-object {:id id}}]}]]
                @published))
        (testing "a plain Toucan write publishes nothing"
          (reset! published [])
          (let [plain-id (t2/insert-returning-pk! :model/Glossary {:term "Plain" :definition "Definition"})]
            (t2/delete! :model/Glossary :id plain-id))
          (is (empty? @published)))
        (finally
          (t2/delete! :model/Glossary :id id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Glossary]
    (let [create! (fn [n]
                    (let [rows (mapv (fn [_] {:term (mt/random-name) :definition "Definition" :creator_id (mt/user->id :rasta)}) (range n))]
                      (events.tu/statement-count! #(glossary/create-glossaries! rows))))
          fresh!  (fn [n]
                    (let [ids (mapv :id (glossary/create-glossaries!
                                         (mapv (fn [_] {:term (mt/random-name) :definition "Definition" :creator_id (mt/user->id :rasta)}) (range n))))]
                      (glossary/update-glossaries! (mapv (fn [id] {:id id :definition "Same"}) (take-nth 2 ids)))
                      ids))
          update! (fn [n]
                    (let [ids (fresh! n)]
                      (events.tu/statement-count! #(glossary/update-glossaries! (mapv (fn [id] {:id id :definition "Same"}) ids)))))
          delete! (fn [n]
                    (let [ids (fresh! n)]
                      (events.tu/statement-count! #(glossary/delete-glossaries! ids))))]
      (testing "creating entries"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "updating entries, some already holding the new value"
        (update! 1)
        (is (= (update! 2) (update! 6))))
      (testing "deleting entries"
        (delete! 1)
        (is (= (delete! 2) (delete! 6)))))))
