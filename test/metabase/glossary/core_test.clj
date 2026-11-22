(ns metabase.glossary.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.glossary.core :as glossary.core]
   [metabase.glossary.models.glossary :as glossary]
   [metabase.test :as mt]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; `publish-event!` is a methodical multimethod, so capture events with a handler on a test-only parent topic
;; rather than by redefining the var (see the docstring of [[metabase.events.impl/publish-event!]]).

(def ^:private ^:dynamic *events* nil)

(events/derive! ::glossary-test-event :metabase/event)
(events/derive! :event/glossary-create ::glossary-test-event)
(events/derive! :event/glossary-update ::glossary-test-event)
(events/derive! :event/glossary-delete ::glossary-test-event)

(methodical/defmethod events/publish-event! ::glossary-test-event
  [topic event]
  (when *events*
    (swap! *events* conj {:topic topic :event event})))

(defn- with-captured-events!
  "Call `f` as `user-id` with glossary events captured. Returns `{:result (f) :events [{:topic :event} ...]}`."
  [user-id f]
  (binding [*events* (atom [])]
    {:result (mt/with-current-user user-id (f))
     :events @*events*}))

(deftest create-entry-test
  (mt/with-model-cleanup [:model/Glossary]
    (let [user-id                        (mt/user->id :rasta)
          {entry :result events :events} (with-captured-events!
                                           user-id
                                           #(first (glossary/create-glossaries! [{:term       "ARR"
                                                                                  :definition "Annual recurring revenue"
                                                                                  :creator_id user-id}])))]
      (testing "the row is inserted with the creator and returned"
        (is (=? {:term "ARR" :definition "Annual recurring revenue" :creator_id user-id} entry))
        (is (= entry (t2/select-one :model/Glossary :id (:id entry)))))
      (testing "exactly one create event is published with the new entry and the user"
        (is (= [{:topic :event/glossary-create
                 :event {:changes [{:object entry}] :user-id user-id}}]
               events))))))

(deftest update-entry-test
  (let [user-id (mt/user->id :rasta)]
    (mt/with-temp [:model/Glossary {id :id} {:term "ARR" :definition "old"}]
      (let [{rows :result events :events} (with-captured-events!
                                            user-id
                                            #(glossary/update-glossaries! [id] {:term "NRR" :definition "new"}))
            entry                         (t2/select-one :model/Glossary :id id)]
        (testing "the row is updated and nothing is returned"
          (is (nil? rows))
          (is (=? {:id id :term "NRR" :definition "new"} entry)))
        (testing "exactly one update event is published with the new and previous entries"
          (is (= 1 (count events)))
          (is (=? {:topic :event/glossary-update
                   :event {:changes [{:object          (dissoc entry :updated_at)
                                      :previous-object {:id id :term "ARR" :definition "old"}}]
                           :user-id user-id}}
                  (first events))))))
    (testing "a missing id returns nothing and publishes nothing"
      (is (= {:result nil :events []}
             (with-captured-events!
               user-id
               #(glossary/update-glossaries! [Integer/MAX_VALUE] {:term "x" :definition "y"})))))))

(deftest delete-entry-test
  (let [user-id (mt/user->id :rasta)]
    (mt/with-temp [:model/Glossary {id :id :as entry} {:term "ARR" :definition "Annual recurring revenue"}]
      (let [{events :events} (with-captured-events! user-id #(glossary/delete-glossaries! [id]))]
        (testing "the row is deleted"
          (is (nil? (t2/select-one :model/Glossary :id id))))
        (testing "exactly one delete event is published with the deleted entry"
          (is (= [{:topic :event/glossary-delete
                   :event {:changes [{:previous-object entry}] :user-id user-id}}]
                 events)))))
    (testing "a missing id publishes nothing"
      (is (= {:result nil :events []}
             (with-captured-events! user-id #(glossary/delete-glossaries! [Integer/MAX_VALUE])))))))

(deftest entries-test
  (mt/with-temp [:model/Glossary _ {:term "Churn" :definition "Customers lost"}
                 :model/Glossary _ {:term "ARR" :definition "Annual recurring revenue"}]
    (testing "every entry is returned, in term order"
      (is (= ["ARR" "Churn"]
             (filter #{"ARR" "Churn"} (map :term (glossary.core/entries))))))))
