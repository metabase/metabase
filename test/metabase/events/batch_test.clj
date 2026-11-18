(ns metabase.events.batch-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.app-db.connection :as mdb.connection]
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

(defn- row [nm]
  {:name nm :icon "cake" :creator_id (mt/user->id :rasta)})

(defn- names [] (mapv (comp :name :object :event) @received))

(defmacro ^:private with-timeline-cleanup [& body]
  `(try
     ~@body
     (finally
       (t2/delete! :model/EventsTestTimeline :name [:like "batch-test-%"]))))

(deftest joined-batch-rollback-test
  (testing "a joined batch rolled back with a savepoint of its caller leaves no event behind"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! :model/EventsTestTimeline (row "batch-test-kept"))
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (events/with-batched-events
                         (t2/insert! :model/EventsTestTimeline (row "batch-test-dropped"))
                         (throw (Exception. "boom")))))))
      (is (not (t2/exists? :model/EventsTestTimeline :name "batch-test-dropped")))
      (is (= ["batch-test-kept"] (names))))))

(deftest joined-batch-throw-keeps-rows-and-events-test
  (testing "a joined batch that throws and is caught keeps its rows, which are committed with their events"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! :model/EventsTestTimeline (row "batch-test-outer"))
        (try
          (events/with-batched-events
            (t2/insert! :model/EventsTestTimeline (row "batch-test-joined"))
            (throw (ex-info "boom" {})))
          (catch Exception _ nil)))
      (is (t2/exists? :model/EventsTestTimeline :name "batch-test-joined"))
      (is (= ["batch-test-outer" "batch-test-joined"] (names))))))

(deftest batch-of-writes-opens-no-savepoint-per-write-test
  (testing "the writes of a batch open no savepoint of their own"
    (let [savepoints (fn [n]
                       (let [opened (atom 0)
                             orig   (mt/original-fn #'mdb.connection/set-savepoint!)]
                         (mt/with-dynamic-fn-redefs [mdb.connection/set-savepoint! (fn [conn]
                                                                                     (swap! opened inc)
                                                                                     (orig conn))]
                           (t2/with-transaction [_conn nil {:rollback-only true}]
                             (events/with-batched-events
                               (dotimes [i n]
                                 (t2/insert! :model/EventsTestTimeline (row (str "batch-test-" i)))))))
                         @opened))]
      (is (= (savepoints 1) (savepoints 5))))))

(deftest savepoint-rollback-drops-events-test
  (testing "a write rolled back by a caught nested transaction in a batch has no event delivered"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! :model/EventsTestTimeline (row "batch-test-kept"))
        (try
          (t2/with-transaction [_conn]
            (t2/insert! :model/EventsTestTimeline (row "batch-test-phantom"))
            (throw (ex-info "boom" {})))
          (catch Exception _ nil)))
      (is (not (t2/exists? :model/EventsTestTimeline :name "batch-test-phantom")))
      (is (= ["batch-test-kept"] (names))))))

(deftest savepoint-rollback-restores-sinks-test
  (let [flushed (atom [])]
    (events/register-sink! ::sink #(swap! flushed into %))
    (testing "the items given to a sink in a savepoint that rolls back are not flushed"
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (events/with-batched-events
          (events/add-to-sink! ::sink {:item 1})
          (try
            (t2/with-transaction [_conn]
              (events/add-to-sink! ::sink {:item 2})
              (throw (ex-info "boom" {})))
            (catch Exception _ nil))))
      (is (= [{:item 1}] @flushed)))))

(deftest savepoint-rollback-restores-captures-test
  (let [calls    (atom 0)
        captured (atom [])]
    (events/register-capture! ::capture-once
                              (fn [deleted]
                                (when (= :model/EventsTestTimeline (:model (first deleted)))
                                  (when (= 1 (swap! calls inc))
                                    {:rolled-back true}))))
    (events/register-owned-consumer! ::capture-once
                                     (fn [{:keys [model operation]}]
                                       (when (and (= :model/EventsTestTimeline model) (= :delete operation)) :deletes))
                                     (fn [_owner deletes _all]
                                       (swap! captured into (map :captures deletes))))
    (try
      (with-timeline-cleanup
        (let [id (t2/insert-returning-pk! :model/EventsTestTimeline (row "batch-test-deleted"))]
          (testing "the captures of a delete rolled back to a savepoint are not delivered with a later delete"
            (events/with-batched-events
              (try
                (t2/with-transaction [_conn]
                  (t2/delete! :model/EventsTestTimeline :id id)
                  (throw (ex-info "boom" {})))
                (catch Exception _ nil))
              (t2/delete! :model/EventsTestTimeline :id id))
            (is (= 2 @calls))
            (is (= [nil] @captured)))))
      (finally
        (events/register-capture! ::capture-once (constantly nil))
        (events/register-owned-consumer! ::capture-once (constantly nil) (constantly nil))))))

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
