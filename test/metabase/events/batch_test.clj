(ns metabase.events.batch-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.events.batch :as events.batch]
   [metabase.events.core :as events]
   [metabase.events.models.events-test-timeline :as events-test-timeline]
   [metabase.events.test-util :as events.tu]
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
   :event/events-test-timeline-update-only-update
   :event/events-test-timeline-self-update-create :event/events-test-timeline-self-update-update])

(doseq [topic topic-names]
  (events/derive! topic ::capture))

(defn- with-capture [thunk]
  (reset! received [])
  (thunk))

(use-fixtures :each with-capture)

(defn- topics [] (mapv :topic @received))

(deftest single-writes-publish-test
  (mt/with-test-user :rasta
    (let [id (t2/insert-returning-pk! ::events-test-timeline/Timeline {:name "t" :icon "cake" :creator_id (mt/user->id :rasta)})]
      (t2/update! ::events-test-timeline/Timeline :id id {:name "u"})
      (t2/delete! ::events-test-timeline/Timeline :id id)))
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
  (t2/insert! ::events-test-timeline/Timeline {:name "t" :icon "cake" :creator_id (mt/user->id :rasta)})
  (is (nil? (:user-id (:event (first @received))))))

(deftest batch-coalesces-test
  (let [creator (mt/user->id :rasta)]
    (events/with-batched-events
      (let [id (t2/insert-returning-pk! ::events-test-timeline/Timeline {:name "a" :icon "cake" :creator_id creator})]
        (t2/update! ::events-test-timeline/Timeline :id id {:name "b"})
        (let [gone (t2/insert-returning-pk! ::events-test-timeline/Timeline {:name "c" :icon "cake" :creator_id creator})]
          (t2/delete! ::events-test-timeline/Timeline :id gone))
        (is (empty? @received) "nothing is delivered before the batch ends")))
    (is (= [:event/events-test-timeline-create] (topics)) (pr-str @received))
    (is (= "b" (:name (:object (:event (first @received))))))))

(deftest update-collected-after-delete-is-deletion-test
  (testing "a row whose delete hooks write it again before it goes is still deleted"
    (let [event (#'events.batch/merge-events
                 [{:operation :delete :topic :event/x-delete :model :model/X :id 1 :previous-object {:id 1 :name "a"}}
                  {:operation       :update
                   :topic           :event/x-update
                   :model           :model/X
                   :id              1
                   :previous-object {:id 1 :name "a"}
                   :object          {:id 1 :name "a" :archived true}}])]
      (is (= :delete (:operation event)))
      (is (= :event/x-delete (:topic event)))
      (is (= {:id 1 :name "a"} (:previous-object event)))
      (is (not (contains? event :object))))))

(deftest create-collected-after-update-test
  (testing "a creation whose own hooks write the row again is still a creation"
    (let [creator (mt/user->id :rasta)]
      (events/with-batched-events
        (let [id (t2/insert-returning-pk! ::events-test-timeline/Timeline {:name "a" :icon "cake" :creator_id creator})]
          (t2/update! ::events-test-timeline/Timeline :id id {:name "b"})))
      (is (= [:event/events-test-timeline-create] (topics))))))

(deftest batch-rollback-test
  (is (thrown? Exception
               (events/with-batched-events
                 (t2/insert! ::events-test-timeline/Timeline {:name "a" :icon "cake" :creator_id (mt/user->id :rasta)})
                 (throw (Exception. "boom")))))
  (is (empty? @received)))

(defn- row [nm]
  {:name nm :icon "cake" :creator_id (mt/user->id :rasta)})

(defn- names [] (mapv (comp :name :object :event) @received))

(defmacro ^:private with-timeline-cleanup [& body]
  `(try
     ~@body
     (finally
       (t2/delete! ::events-test-timeline/Timeline :name [:like "batch-test-%"]))))

(deftest joined-batch-rollback-test
  (testing "a joined batch rolled back with a savepoint of its caller leaves no event behind"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! ::events-test-timeline/Timeline (row "batch-test-kept"))
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (events/with-batched-events
                         (t2/insert! ::events-test-timeline/Timeline (row "batch-test-dropped"))
                         (throw (Exception. "boom")))))))
      (is (not (t2/exists? ::events-test-timeline/Timeline :name "batch-test-dropped")))
      (is (= ["batch-test-kept"] (names))))))

(deftest joined-batch-throw-keeps-rows-and-events-test
  (testing "a joined batch that throws and is caught keeps its rows, which are committed with their events"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! ::events-test-timeline/Timeline (row "batch-test-outer"))
        (try
          (events/with-batched-events
            (t2/insert! ::events-test-timeline/Timeline (row "batch-test-joined"))
            (throw (ex-info "boom" {})))
          (catch Exception _ nil)))
      (is (t2/exists? ::events-test-timeline/Timeline :name "batch-test-joined"))
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
                                 (t2/insert! ::events-test-timeline/Timeline (row (str "batch-test-" i)))))))
                         @opened))]
      (is (= (savepoints 1) (savepoints 5))))))

(deftest savepoint-rollback-drops-events-test
  (testing "a write rolled back by a caught nested transaction in a batch has no event delivered"
    (with-timeline-cleanup
      (events/with-batched-events
        (t2/insert! ::events-test-timeline/Timeline (row "batch-test-kept"))
        (try
          (t2/with-transaction [_conn]
            (t2/insert! ::events-test-timeline/Timeline (row "batch-test-phantom"))
            (throw (ex-info "boom" {})))
          (catch Exception _ nil)))
      (is (not (t2/exists? ::events-test-timeline/Timeline :name "batch-test-phantom")))
      (is (= ["batch-test-kept"] (names))))))

(deftest savepoint-rollback-restores-sinks-test
  (let [flushed (atom [])]
    (events/register-sink! ::sink #(swap! flushed into %))
    (try
      (testing "the items given to a sink in a savepoint that rolls back are not flushed"
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (events/with-batched-events
            (events/add-to-sink! ::sink {:item 1})
            (try
              (t2/with-transaction [_conn]
                (events/add-to-sink! ::sink {:item 2})
                (throw (ex-info "boom" {})))
              (catch Exception _ nil))))
        (is (= [{:item 1}] @flushed)))
      (finally
        (events.tu/unregister! ::sink)))))

(deftest savepoint-rollback-restores-captures-test
  (let [calls    (atom 0)
        captured (atom [])]
    (events/register-capture! ::capture-once
                              (fn [deleted]
                                (when (= ::events-test-timeline/Timeline (:model (first deleted)))
                                  (when (= 1 (swap! calls inc))
                                    {:rolled-back true}))))
    (events/register-owned-consumer! ::capture-once
                                     (fn [{:keys [model operation]}]
                                       (when (and (= ::events-test-timeline/Timeline model) (= :delete operation)) :deletes))
                                     (fn [_owner deletes _all]
                                       (swap! captured into (map :captures deletes))))
    (try
      (with-timeline-cleanup
        (let [id (t2/insert-returning-pk! ::events-test-timeline/Timeline (row "batch-test-deleted"))]
          (testing "the captures of a delete rolled back to a savepoint are not delivered with a later delete"
            (events/with-batched-events
              (try
                (t2/with-transaction [_conn]
                  (t2/delete! ::events-test-timeline/Timeline :id id)
                  (throw (ex-info "boom" {})))
                (catch Exception _ nil))
              (t2/delete! ::events-test-timeline/Timeline :id id))
            (is (= 2 @calls))
            (is (= [nil] @captured)))))
      (finally
        (events.tu/unregister! ::capture-once)))))

(deftest owned-consumer-test
  (let [calls (atom [])]
    (events/register-owned-consumer! ::owned
                                     (fn [{:keys [object]}] (:creator_id object))
                                     (fn [owner events _all] (swap! calls conj [owner (count events)])))
    (try
      (let [creator (mt/user->id :rasta)]
        (events/with-batched-events
          (t2/insert! ::events-test-timeline/Timeline {:name "a" :icon "cake" :creator_id creator})
          (t2/insert! ::events-test-timeline/Timeline {:name "b" :icon "cake" :creator_id creator})))
      (is (= [[(mt/user->id :rasta) 2]] @calls))
      (finally
        (events.tu/unregister! ::owned)))))

(deftest throwing-consumer-fails-write-test
  (let [recorded (atom [])
        owner    (fn [{:keys [model]}] (when (= ::events-test-timeline/Timeline model) :timeline))]
    (events/register-sink! ::recorded #(swap! recorded into %))
    (events/register-owned-consumer! ::records owner (fn [_owner events _all]
                                                       (doseq [event events]
                                                         (events/add-to-sink! ::recorded {:id (:id event)}))))
    (events/register-owned-consumer! ::throws owner (fn [_owner _events _all]
                                                      (throw (ex-info "consumer boom" {}))))
    (try
      (testing "a consumer that throws fails the write that its event belongs to"
        (is (thrown-with-msg? Exception #"consumer boom"
                              (t2/insert! ::events-test-timeline/Timeline (row "batch-test-throws")))))
      (testing "the row is not stored"
        (is (not (t2/exists? ::events-test-timeline/Timeline :name "batch-test-throws"))))
      (testing "no other consumer leaves a record of the write"
        (is (= [] @recorded)))
      (finally
        (events.tu/unregister! ::records)
        (events.tu/unregister! ::throws)
        (events.tu/unregister! ::recorded)))))

(deftest where-clause-writes-publish-per-row-test
  (let [creator (mt/user->id :rasta)
        ids     (mapv #(t2/insert-returning-pk! ::events-test-timeline/Timeline {:name (str "w" %) :icon "cake" :creator_id creator})
                      (range 3))]
    (reset! received [])
    (t2/update! ::events-test-timeline/Timeline :id [:in ids] {:name "same"})
    (testing "an update with a where clause publishes one event per changed row"
      (is (= 3 (count (filter #(= :event/events-test-timeline-update (:topic %)) @received)))))
    (reset! received [])
    (t2/delete! ::events-test-timeline/Timeline :name "same" :id [:in ids])
    (testing "a delete by column publishes one event per row"
      (is (= 3 (count (filter #(= :event/events-test-timeline-delete (:topic %)) @received)))))))

(defn- trait-models
  "The models deriving `:hook/events`, once the namespace of every model has loaded."
  []
  (doseq [[model nspace] models.resolution/model->namespace
          :when (or config/ee-available? (not (str/starts-with? (str nspace) "metabase-enterprise")))]
    (t2/resolve-model model))
  (filterv #(and (keyword? %) (= "model" (namespace %))) (descendants :hook/events)))

(deftest every-trait-model-has-spec-test
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
    (let [id (t2/insert-returning-pk! ::events-test-timeline/TimelineUpdateOnly {:name "o" :icon "cake" :creator_id (mt/user->id :rasta)})]
      (t2/update! ::events-test-timeline/TimelineUpdateOnly :id id {:name "p"})
      (t2/delete! ::events-test-timeline/TimelineUpdateOnly :id id)
      (is (= [:event/events-test-timeline-update-only-update] (topics))))))

(deftest task-submitted-in-batch-writes-outside-it-test
  (testing "a write of a task submitted in a batch publishes its own event rather than joining the batch"
    (let [done    (promise)
          creator (mt/user->id :rasta)]
      (try
        (events/with-batched-events
          (quick-task/submit-task!
           (fn []
             (deliver done (t2/insert-returning-pk! ::events-test-timeline/Timeline
                                                    {:name "task" :icon "cake" :creator_id creator})))))
        (is (pos-int? (deref done 60000 ::timeout)))
        (is (= ["task"] (map (comp :name :object :event) @received)))
        (finally
          (t2/delete! ::events-test-timeline/Timeline :name "task"))))))

(deftest statement-captures-survive-carrier-created-in-batch-test
  (testing "the captures of a DELETE reach a delivered delete when one of its rows was created in the same batch"
    (let [deletes (atom [])]
      (events/register-capture! ::statement-rows
                                (fn [deleted]
                                  (when (= ::events-test-timeline/Timeline (:model (first deleted)))
                                    {:ids (sort (map :id deleted))})))
      (events/register-statement-capture! ::statement-rows
                                          (fn [model _select]
                                            (when (= ::events-test-timeline/Timeline model)
                                              {:statement true})))
      (events/register-owned-consumer! ::statement-rows
                                       (fn [{:keys [model operation]}]
                                         (when (and (= ::events-test-timeline/Timeline model) (= :delete operation)) :deletes))
                                       (fn [_owner events _all]
                                         (swap! deletes into events)))
      (try
        (with-timeline-cleanup
          (let [old   (t2/insert-returning-pk! ::events-test-timeline/Timeline (row "batch-test-old"))
                fresh (events/with-batched-events
                        (let [fresh (t2/insert-returning-pk! ::events-test-timeline/Timeline (row "batch-test-fresh"))]
                          (t2/delete! ::events-test-timeline/Timeline :id [:in [old fresh]])
                          fresh))]
            (is (= [old] (map :id @deletes)))
            (is (= {::statement-rows {:ids (sort [old fresh])}}
                   (select-keys (:captures (first @deletes)) [::statement-rows])))))
        (finally
          (events.tu/unregister! ::statement-rows))))))

(defn- logged-by
  "The `[table row-id action]`s that the change log records while `thunk` runs."
  [thunk]
  (let [top (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:change_log]})) 0)]
    (thunk)
    (mapv (juxt :table_name :row_id :action)
          (t2/query {:select [:table_name :row_id :action] :from [:change_log] :where [:> :id top] :order-by [:id]}))))

(deftest cascade-capture-kept-when-carrier-created-in-batch-test
  (testing "a multi-row delete whose last row was created in the same batch still logs the cascades of the others"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database          db  {}
                       :model/Table             t   {:db_id (:id db)}
                       :model/Field             f1  {:table_id (:id t) :name "a"}
                       :model/FieldUserSettings fus {:field_id (:id f1) :semantic_type :type/Email :semantic_type_set true}]
          (let [logged (set (logged-by #(events/with-batched-events
                                          (t2/insert! :model/Field {:table_id      (:id t)
                                                                    :name          "z"
                                                                    :base_type     :type/Text
                                                                    :database_type "TEXT"})
                                          (t2/delete! :model/Field :table_id (:id t)))))]
            (is (contains? logged ["metabase_field" (:id f1) "delete"]))
            (is (contains? logged ["metabase_field_user_settings" (:id fus) "delete"]))))))))

(deftest create-carries-row-its-own-hooks-wrote-test
  (testing "the create of a row whose after-insert writes it again carries the row as stored"
    (with-timeline-cleanup
      (let [id (t2/insert-returning-pk! ::events-test-timeline/TimelineSelfUpdate (row "batch-test-self"))]
        (is (= [:event/events-test-timeline-self-update-create] (topics)))
        (is (= "set by the hook" (t2/select-one-fn :description ::events-test-timeline/Timeline :id id)))
        (is (= "set by the hook" (:description (:object (:event (first @received))))))))))

(deftest endless-delivery-throws-test
  (testing "consumers that write rows with events on every delivery fail the batch rather than loop"
    (events/register-owned-consumer! ::endless
                                     (fn [{:keys [model operation]}]
                                       (when (and (= ::events-test-timeline/Timeline model) (= :create operation)) :again))
                                     (fn [_owner _events _all]
                                       (t2/insert! ::events-test-timeline/Timeline (row "batch-test-again"))))
    (try
      (with-timeline-cleanup
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"kept writing rows with events for 100 deliveries"
                              (events/with-batched-events
                                (t2/insert! ::events-test-timeline/Timeline (row "batch-test-first")))))
        (is (not (t2/exists? ::events-test-timeline/Timeline :name [:in ["batch-test-first" "batch-test-again"]]))))
      (finally
        (events.tu/unregister! ::endless)))))

(deftest delete-statement-after-batch-ended-leaves-no-batch-test
  (testing "a DELETE statement that outlives the batch it started in, as when another thread ends it, recreates nothing"
    (t2/with-transaction [_conn]
      (let [state (mdb/transaction-state)]
        (events/with-batched-events
          (events.batch/do-with-delete-statement ::events-test-timeline/Timeline :id (constantly [])
                                                 #(swap! state dissoc :metabase.events.batch/batch))
          (is (not (contains? @state :metabase.events.batch/batch))))))))
