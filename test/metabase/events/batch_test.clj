(ns metabase.events.batch-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private received (atom []))

(events/derive! ::capture :metabase/event)

(methodical/defmethod events/publish-event! ::capture
  [topic event]
  (swap! received conj {:topic       topic
                        :event       event
                        :in-tx?      (mdb/in-transaction?)}))

#_{:clj-kondo/ignore [:metabase/toucan-model-ns]}
(methodical/defmethod t2/table-name :model/EventsTestTimeline [_model] :timeline)

(doto :model/EventsTestTimeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(def ^:private topic-names
  [:event/events-test-timeline-create :event/events-test-timeline-update :event/events-test-timeline-delete])

(doseq [topic topic-names]
  (events/derive! topic ::capture))

(defn- with-capture [thunk]
  (reset! received [])
  (thunk))

(use-fixtures :each with-capture)

(defn- topics [] (mapv :topic @received))

(deftest single-writes-publish-test
  (mt/with-test-user :rasta
    (let [id (t2/insert-returning-pk! :model/EventsTestTimeline {:name "t" :icon "cake" :creator_id (mt/user->id :rasta)})]
      (t2/update! :model/EventsTestTimeline :id id {:name "u"})
      (t2/delete! :model/EventsTestTimeline :id id)))
  (is (= [:event/events-test-timeline-create :event/events-test-timeline-update :event/events-test-timeline-delete] (topics)))
  (testing "every event is delivered inside a transaction"
    (is (every? :in-tx? @received)))
  (testing "the payload"
    (let [[_ update delete] (map :event @received)]
      (is (= "t" (:name (:previous-object update))))
      (is (= "u" (:name (:object update))))
      (is (= {:name "u"} (select-keys (:changes update) [:name])))
      (is (= (mt/user->id :rasta) (:user-id update)))
      (is (= "u" (:name (:previous-object delete)))))))

(deftest no-user-test
  (t2/insert! :model/EventsTestTimeline {:name "t" :icon "cake" :creator_id (mt/user->id :rasta)})
  (is (nil? (:user-id (:event (first @received))))))

(deftest batch-coalesces-test
  (let [creator (mt/user->id :rasta)]
    (events/with-batched-events
      (let [id (t2/insert-returning-pk! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id creator})]
        (t2/update! :model/EventsTestTimeline :id id {:name "b"})
        (let [gone (t2/insert-returning-pk! :model/EventsTestTimeline {:name "c" :icon "cake" :creator_id creator})]
          (t2/delete! :model/EventsTestTimeline :id gone))
        (is (empty? @received) "nothing is delivered before the batch ends")))
    (is (= [:event/events-test-timeline-create] (topics)) (pr-str @received))
    (is (= "b" (:name (:object (:event (first @received))))))))

(deftest batch-rollback-test
  (is (thrown? Exception
               (events/with-batched-events
                 (t2/insert! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id (mt/user->id :rasta)})
                 (throw (Exception. "boom")))))
  (is (empty? @received)))

(deftest owned-consumer-test
  (let [calls (atom [])]
    (events/register-owned-consumer! ::owned
                                     (fn [{:keys [object]}] (:creator_id object))
                                     (fn [owner events] (swap! calls conj [owner (count events)])))
    (try
      (let [creator (mt/user->id :rasta)]
        (events/with-batched-events
          (t2/insert! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id creator})
          (t2/insert! :model/EventsTestTimeline {:name "b" :icon "cake" :creator_id creator})))
      (is (= [[(mt/user->id :rasta) 2]] @calls))
      (finally
        (events/register-owned-consumer! ::owned (constantly nil) (constantly nil))))))
