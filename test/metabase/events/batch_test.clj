(ns metabase.events.batch-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.events.models.events-test-timeline]
   [metabase.models.resolution :as models.resolution]
   [metabase.test :as mt]
   [metabase.util.quick-task :as quick-task]
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

(def ^:private topic-names
  [:event/events-test-timeline-create :event/events-test-timeline-update :event/events-test-timeline-delete
   :event/events-test-timeline-update-only-update])

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
      (is (not (contains? update :changes)))
      (is (= (mt/user->id :rasta) (:user-id update)))
      (is (= "u" (:name (:previous-object delete))))
      (is (not (contains? delete :object))))))

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

(deftest create-collected-after-update-test
  (testing "a creation whose own hooks write the row again is still a creation"
    (let [creator (mt/user->id :rasta)]
      (events/with-batched-events
        (let [id (t2/insert-returning-pk! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id creator})]
          (t2/update! :model/EventsTestTimeline :id id {:name "b"})))
      (is (= [:event/events-test-timeline-create] (topics))))))

(deftest batch-rollback-test
  (is (thrown? Exception
               (events/with-batched-events
                 (t2/insert! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id (mt/user->id :rasta)})
                 (throw (Exception. "boom")))))
  (is (empty? @received)))

(deftest joined-batch-rollback-test
  (testing "a joined write that throws and rolls back with a savepoint of its caller leaves no event behind"
    (let [creator (mt/user->id :rasta)]
      (events/with-batched-events
        (t2/insert! :model/EventsTestTimeline {:name "kept" :icon "cake" :creator_id creator})
        (is (thrown? Exception
                     (t2/with-transaction [_conn nil {:nested-transaction-rule :savepoint}]
                       (events/with-batched-events
                         (t2/insert! :model/EventsTestTimeline {:name "dropped" :icon "cake" :creator_id creator})
                         (throw (Exception. "boom")))))))
      (is (= ["kept"] (map (comp :name :object :event) @received))))))

(deftest owned-consumer-test
  (let [calls (atom [])]
    (events/register-owned-consumer! ::owned
                                     (fn [{:keys [object]}] (:creator_id object))
                                     (fn [owner events _all] (swap! calls conj [owner (count events)])))
    (try
      (let [creator (mt/user->id :rasta)]
        (events/with-batched-events
          (t2/insert! :model/EventsTestTimeline {:name "a" :icon "cake" :creator_id creator})
          (t2/insert! :model/EventsTestTimeline {:name "b" :icon "cake" :creator_id creator})))
      (is (= [[(mt/user->id :rasta) 2]] @calls))
      (finally
        (events/register-owned-consumer! ::owned (constantly nil) (constantly nil))))))

(deftest where-clause-writes-publish-per-row-test
  (let [creator (mt/user->id :rasta)
        ids     (mapv #(t2/insert-returning-pk! :model/EventsTestTimeline {:name (str "w" %) :icon "cake" :creator_id creator})
                      (range 3))]
    (reset! received [])
    (t2/update! :model/EventsTestTimeline :id [:in ids] {:name "same"})
    (testing "an update with a where clause publishes one event per changed row"
      (is (= 3 (count (filter #(= :event/events-test-timeline-update (:topic %)) @received)))))
    (reset! received [])
    (t2/delete! :model/EventsTestTimeline :name "same" :id [:in ids])
    (testing "a delete by column publishes one event per row"
      (is (= 3 (count (filter #(= :event/events-test-timeline-delete (:topic %)) @received)))))))

(defn- trait-models
  "The models deriving `:hook/events`, once the namespace of every model has loaded."
  []
  (doseq [[model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    (t2/resolve-model model))
  (filterv #(and (keyword? %) (= "model" (namespace %))) (descendants :hook/events)))

(deftest every-trait-model-has-a-spec-test
  (let [models (trait-models)
        specs  (dissoc (methods events/spec) :default)]
    (testing "every model deriving :hook/events names its topics in events/spec"
      (doseq [model models]
        (is (seq (when-let [f (get specs model)] (f model)))
            (str model " derives :hook/events but has no events/spec method"))))
    (testing "every model with an events/spec method derives :hook/events"
      (doseq [model (keys specs)]
        (is (isa? model :hook/events) (str model " has an events/spec method but does not derive :hook/events"))))
    (testing "no two models share a topic"
      (let [topics (mapcat (fn [[model f]] (vals (f model))) specs)]
        (is (= [] (keep (fn [[topic n]] (when (< 1 n) topic)) (frequencies topics))))))))

(deftest spec-operations-test
  (testing "a model whose spec lists only :update publishes nothing on insert or delete"
    (let [id (t2/insert-returning-pk! :model/EventsTestTimelineUpdateOnly {:name "o" :icon "cake" :creator_id (mt/user->id :rasta)})]
      (t2/update! :model/EventsTestTimelineUpdateOnly :id id {:name "p"})
      (t2/delete! :model/EventsTestTimelineUpdateOnly :id id)
      (is (= [:event/events-test-timeline-update-only-update] (topics))))))

(deftest task-submitted-in-batch-writes-outside-it-test
  (testing "a write of a task submitted in a batch publishes its own event rather than joining the batch"
    (let [done    (promise)
          creator (mt/user->id :rasta)]
      (try
        (events/with-batched-events
          (quick-task/submit-task!
           (fn []
             (deliver done (t2/insert-returning-pk! :model/EventsTestTimeline
                                                    {:name "task" :icon "cake" :creator_id creator})))))
        (is (pos-int? (deref done 60000 ::timeout)))
        (is (= ["task"] (map (comp :name :object :event) @received)))
        (finally
          (t2/delete! :model/EventsTestTimeline :name "task"))))))
