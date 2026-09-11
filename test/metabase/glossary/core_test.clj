(ns metabase.glossary.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.glossary.core :as glossary.core]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- with-captured-events!
  "Call `f` with event publishing captured. Returns `{:result (f) :events [{:topic :event} ...]}`."
  [f]
  (let [events (atom [])]
    (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic event]
                                                        (swap! events conj {:topic topic :event event}))]
      {:result (f)
       :events @events})))

(deftest create-entry-test
  (mt/with-model-cleanup [:model/Glossary]
    (let [user-id                        (mt/user->id :rasta)
          {entry :result events :events} (with-captured-events!
                                           #(glossary.core/create-entry! user-id {:term       "ARR"
                                                                                  :definition "Annual recurring revenue"}))]
      (testing "the row is inserted with the creator and returned"
        (is (=? {:term "ARR" :definition "Annual recurring revenue" :creator_id user-id} entry))
        (is (= entry (t2/select-one :model/Glossary :id (:id entry)))))
      (testing "exactly one create event is published with the new entry and the user"
        (is (= [{:topic :event/glossary-create
                 :event {:object entry :user-id user-id}}]
               events))))))

(deftest update-entry-test
  (let [user-id (mt/user->id :rasta)]
    (mt/with-temp [:model/Glossary {id :id} {:term "ARR" :definition "old"}]
      (let [{entry :result events :events} (with-captured-events!
                                             #(glossary.core/update-entry! user-id id {:term "NRR" :definition "new"}))]
        (testing "the row is updated and returned"
          (is (=? {:id id :term "NRR" :definition "new"} entry))
          (is (= entry (t2/select-one :model/Glossary :id id))))
        (testing "exactly one update event is published with the new and previous entries"
          (is (= 1 (count events)))
          (is (=? {:topic :event/glossary-update
                   :event {:object          entry
                           :previous-object {:id id :term "ARR" :definition "old"}
                           :user-id         user-id}}
                  (first events))))))
    (testing "a missing id returns nil and publishes nothing"
      (is (= {:result nil :events []}
             (with-captured-events!
               #(glossary.core/update-entry! user-id Integer/MAX_VALUE {:term "x" :definition "y"})))))))

(deftest delete-entry-test
  (let [user-id (mt/user->id :rasta)]
    (mt/with-temp [:model/Glossary {id :id :as entry} {:term "ARR" :definition "Annual recurring revenue"}]
      (let [{deleted :result events :events} (with-captured-events! #(glossary.core/delete-entry! user-id id))]
        (testing "the row is deleted and returned"
          (is (= entry deleted))
          (is (nil? (t2/select-one :model/Glossary :id id))))
        (testing "exactly one delete event is published with the deleted entry"
          (is (= [{:topic :event/glossary-delete
                   :event {:object entry :user-id user-id}}]
                 events)))))
    (testing "a missing id returns nil and publishes nothing"
      (is (= {:result nil :events []}
             (with-captured-events! #(glossary.core/delete-entry! user-id Integer/MAX_VALUE)))))))
