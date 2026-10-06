(ns metabase.revisions.revert-events-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.api]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(def ^:private recorded
  "The atom of `[topic event]` pairs that the test listener appends to, or nil when no recording runs."
  (atom nil))

(def ^:private on-record
  "A function that the test listener calls with each recorded `topic` and `event`, or nil."
  (atom nil))

(events/derive! ::recorder :metabase/event)

(methodical/defmethod events/publish-event! ::recorder
  [topic event]
  (when-let [record @recorded]
    (swap! record conj [topic event])
    (when-let [f @on-record]
      (f topic event))))

(def ^:private expected
  "Entity name of the revert API -> the update topic that a revert publishes, whether the event has
  `:previous-object`, and whether a Toucan hook of the model publishes the update itself (then the event has no revert
  key)."
  {"card"      {:topic :event/card-update :previous-object? true}
   "dashboard" {:topic :event/dashboard-update}
   "document"  {:topic :event/document-update :hook? true}
   "segment"   {:topic :event/segment-update}
   "measure"   {:topic :event/measure-update}
   "transform" {:topic :event/transform-update}})

(def ^:private reverts-tested-elsewhere
  "Entity names of the revert API whose revert test is not in this namespace. TransformTest is EE only; its revert test
  is in the transform-testing tests."
  #{"transform-test"})

(defn- update-topics []
  (map :topic (vals expected)))

(defn- do-with-recorded-update-events!
  "Calls `thunk` while a test listener records each event of the update topics in [[expected]]. Returns the recorded
  `[topic event]` pairs."
  [thunk]
  (let [record (atom [])]
    (doseq [topic (update-topics)]
      (events/derive! topic ::recorder))
    (reset! recorded record)
    (try
      (thunk)
      @record
      (finally
        (reset! recorded nil)
        (reset! on-record nil)
        (doseq [topic (update-topics)]
          (events/underive! topic ::recorder))))))

(defn- revisions-of [model id]
  (t2/select :model/Revision :model (name model) :model_id id {:order-by [[:id :asc]]}))

(defn- metadata-provider [table-id]
  (lib-be/application-database-metadata-provider (t2/select-one-fn :db_id :model/Table :id table-id)))

(defn- measure-definition [table-id]
  (let [mp (metadata-provider table-id)]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/aggregate (lib/count)))))

(defn- segment-definition [table-id field-id]
  (let [mp (metadata-provider table-id)]
    (-> (lib/query mp (lib.metadata/table mp table-id))
        (lib/filter (lib/> (lib.metadata/field mp field-id) 0)))))

(defn- with-temp-attributes [entity]
  (case entity
    "measure" {:table_id (mt/id :venues) :definition (measure-definition (mt/id :venues))}
    "segment" {:table_id (mt/id :venues) :definition (segment-definition (mt/id :venues) (mt/id :venues :price))}
    {}))

(defn- revert-round-trip!
  "Creates an entity named \"Name one\", renames it to \"Name two\" with a revision for each state, and reverts it
  through the API to the first revision, two times. Returns the facts that the revert tests check."
  [entity model]
  (mt/with-temp [model {id :id} (assoc (with-temp-attributes entity) :name "Name one")]
    (let [push!        (fn [creation?]
                         (revision/push-revision! {:entity       model
                                                   :id           id
                                                   :object       (t2/select-one model :id id)
                                                   :user-id      (mt/user->id :crowberto)
                                                   :is-creation? creation?}))
          _            (push! true)
          _            (t2/update! model id {:name "Name two"})
          _            (push! false)
          [first-rev]  (revisions-of model id)
          before       (count (revisions-of model id))
          revert!      #(mt/user-http-request :crowberto :post 200 "revision/revert"
                                              {:entity entity :id id :revision_id (:id first-rev)})
          events       (do-with-recorded-update-events! revert!)
          after        (revisions-of model id)
          events-again (do-with-recorded-update-events! revert!)]
      {:id                        id
       :revision-id               (:id first-rev)
       :name                      (t2/select-one-fn :name model :id id)
       :new-revisions             (- (count after) before)
       :last-revision             (last after)
       :events                    events
       :events-no-change          events-again
       :revisions-after           (count after)
       :revisions-after-no-change (count (revisions-of model id))})))

(deftest revert-publishes-one-update-event-and-writes-one-revision-test
  (doseq [[entity model] @#'metabase.revisions.api/entity->model
          :when (contains? expected entity)]
    (testing entity
      (let [{update-topic :topic :keys [previous-object? hook?]} (expected entity)
            {:keys [id revision-id] :as result} (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
                                                  (revert-round-trip! entity model))]
        (testing "the revert restores the entity"
          (is (= "Name one" (:name result))))
        (if hook?
          (testing "a hook of the model publishes the update with no revert key, so the revisions listener adds a second revision"
            (is (= 2 (:new-revisions result)))
            (is (true? (:is_reversion (:last-revision result))))
            (is (=? [[update-topic {:object {:id id :name "Name one"}}]]
                    (:events result)))
            (is (not (contains? (second (first (:events result))) :reverted-to-revision-id))))
          (testing "the revert adds exactly one revision, a reversion, and publishes the update topic once with the revert key"
            (is (= 1 (:new-revisions result)))
            (is (true? (:is_reversion (:last-revision result))))
            (is (=? [[update-topic (cond-> {:object                  {:id id :name "Name one"}
                                            :user-id                 (mt/user->id :crowberto)
                                            :reverted-to-revision-id revision-id}
                                     previous-object? (assoc :previous-object {:id id :name "Name two"}))]]
                    (:events result)))))
        (testing "a revert to the current state publishes nothing and writes no revision"
          (is (= [] (:events-no-change result)))
          (is (= (:revisions-after result) (:revisions-after-no-change result))))))))

(defn- push-names!
  "Sets the name of `model` `id` to each of `entity-names` in order, and records a revision for each name. The first
  revision is a creation revision."
  [model id entity-names]
  (doseq [[i entity-name] (map-indexed vector entity-names)]
    (t2/update! model id {:name entity-name})
    (revision/push-revision! {:entity       model
                              :id           id
                              :object       (t2/select-one model :id id)
                              :user-id      (mt/user->id :crowberto)
                              :is-creation? (zero? i)})))

(defn- revert-after-unrecorded-rename!
  "Creates an entity with a revision for each name of `recorded-names`, then renames it to `unrecorded-name` with no
  revision, as a remote-sync pull does. Reverts it through the API to its first revision. Returns the facts that the
  revert tests check."
  [entity model recorded-names unrecorded-name]
  (mt/with-temp [model {id :id} (assoc (with-temp-attributes entity) :name (first recorded-names))]
    (push-names! model id recorded-names)
    (t2/update! model id {:name unrecorded-name})
    (let [[first-rev] (revisions-of model id)
          before      (count (revisions-of model id))
          events      (do-with-recorded-update-events!
                       #(mt/user-http-request :crowberto :post 200 "revision/revert"
                                              {:entity entity :id id :revision_id (:id first-rev)}))
          after       (revisions-of model id)]
      {:id            id
       :revision-id   (:id first-rev)
       :name          (t2/select-one-fn :name model :id id)
       :new-revisions (- (count after) before)
       :last-revision (last after)
       :events        events})))

(defn- entities-without-update-hook []
  (for [[entity model] @#'metabase.revisions.api/entity->model
        :when (and (contains? expected entity)
                   (not (:hook? (expected entity))))]
    [entity model]))

(deftest revert-of-an-unrecorded-change-publishes-once-test
  (doseq [[entity model] (entities-without-update-hook)]
    (testing entity
      (let [{update-topic :topic :keys [previous-object?]} (expected entity)
            {:keys [id revision-id] :as result}
            (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
              ;; the newest revision equals the target revision; the row does not
              (revert-after-unrecorded-rename! entity model ["Name one" "Name two" "Name one"] "Name remote"))]
        (testing "the revert restores the entity"
          (is (= "Name one" (:name result))))
        (testing "the revert adds one reversion revision"
          (is (= 1 (:new-revisions result)))
          (is (true? (:is_reversion (:last-revision result)))))
        (testing "the revert publishes the update topic once, with the row before the revert as the previous object"
          (is (=? [[update-topic (cond-> {:object                  {:id id :name "Name one"}
                                          :user-id                 (mt/user->id :crowberto)
                                          :reverted-to-revision-id revision-id}
                                   previous-object? (assoc :previous-object {:id id :name "Name remote"}))]]
                  (:events result))))))))

(deftest revert-that-leaves-the-row-unchanged-publishes-nothing-test
  (doseq [[entity model] (entities-without-update-hook)]
    (testing entity
      (let [result (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
                     ;; the row already has the values of the target revision; the newest revision does not
                     (revert-after-unrecorded-rename! entity model ["Name one" "Name two"] "Name one"))]
        (testing "the entity keeps the target values"
          (is (= "Name one" (:name result))))
        (testing "the revert adds one reversion revision, so the history shows the entity as it is"
          (is (= 1 (:new-revisions result)))
          (is (true? (:is_reversion (:last-revision result)))))
        (testing "the revert publishes nothing"
          (is (= [] (:events result))))))))

(events/derive! ::thrower :metabase/event)

(methodical/defmethod events/publish-event! ::thrower
  [_topic _event]
  (throw (ex-info "A test listener fails" {})))

(deftest revert-answers-success-when-a-listener-throws-test
  (mt/with-temp [:model/Card {id :id} {:name "Name one"}]
    (push-names! :model/Card id ["Name one" "Name two"])
    (let [revision-id (:id (first (revisions-of :model/Card id)))
          before      (count (revisions-of :model/Card id))]
      (events/derive! :event/card-update ::thrower)
      (try
        (mt/with-log-messages-for-level [messages [metabase.revisions :error]]
          (let [response (mt/user-http-request :crowberto :post 200 "revision/revert"
                                               {:entity "card" :id id :revision_id revision-id})]
            (testing "the endpoint answers with the committed reversion revision"
              (is (=? {:is_reversion true} response)))
            (testing "the revert is saved"
              (is (= "Name one" (t2/select-one-fn :name :model/Card :id id)))
              (is (= (inc before) (count (revisions-of :model/Card id)))))
            (testing "the listener failure is logged with the topic, the model and the id"
              (is (some (fn [{:keys [level message e]}]
                          (and (= :error level)
                               (some? e)
                               (str/includes? message (str :event/card-update))
                               (str/includes? message "Card")
                               (str/includes? message (str id))))
                        (messages))))))
        (finally
          (events/underive! :event/card-update ::thrower))))))

(deftest every-revertable-model-has-an-update-topic-test
  (doseq [[entity model] @#'metabase.revisions.api/entity->model]
    (testing entity
      (is (some? (:update (get revision/revisioned-models model)))))))

(deftest every-revertable-entity-has-a-revert-test-test
  (doseq [entity (keys @#'metabase.revisions.api/entity->model)]
    (testing entity
      (is (or (contains? expected entity)
              (contains? reverts-tested-elsewhere entity))))))

(deftest update-event-of-another-entity-during-a-revert-gets-its-revision-test
  (mt/with-temp [:model/Card {card-id :id}  {:name "Name one"}
                 :model/Card {other-id :id} {:name "Other one"}]
    (let [push! (fn [id creation?]
                  (revision/push-revision! {:entity       :model/Card
                                            :id           id
                                            :object       (t2/select-one :model/Card :id id)
                                            :user-id      (mt/user->id :crowberto)
                                            :is-creation? creation?}))]
      (push! card-id true)
      (push! other-id true)
      (t2/update! :model/Card card-id {:name "Name two"})
      (push! card-id false)
      (let [first-rev-id (:id (first (revisions-of :model/Card card-id)))
            other-before (count (revisions-of :model/Card other-id))]
        (do-with-recorded-update-events!
         (fn []
           (reset! on-record
                   (fn [_topic event]
                     (when (= card-id (get-in event [:object :id]))
                       (let [other (t2/select-one :model/Card :id other-id)]
                         (t2/update! :model/Card other-id {:name "Other two"})
                         (events/publish-event! :event/card-update
                                                {:object          (t2/select-one :model/Card :id other-id)
                                                 :previous-object other
                                                 :user-id         (mt/user->id :crowberto)})))))
           (mt/user-http-request :crowberto :post 200 "revision/revert"
                                 {:entity "card" :id card-id :revision_id first-rev-id})))
        (is (= (inc other-before) (count (revisions-of :model/Card other-id))))))))

(defn- reversion-count-on-another-connection
  "The count of reversion revisions of `model` `id`, read on a new thread with no bindings, so on a connection that
  sees only committed rows."
  [model id]
  (let [result (promise)]
    (.start (Thread. ^Runnable (fn []
                                 (deliver result (try
                                                   (t2/count :model/Revision :model (name model) :model_id id :is_reversion true)
                                                   (catch Throwable e e))))))
    (deref result 10000 ::timeout)))

(deftest revert-publishes-after-its-transaction-commits-test
  ;; no `mt/with-temp`: its rollback-only transaction would hold the revert, so nothing would commit before the publish
  (doseq [[entity model] [["card" :model/Card] ["dashboard" :model/Dashboard]]]
    (testing entity
      (mt/with-model-cleanup [:model/AuditLog :model/Revision]
        (let [id (t2/insert-returning-pk! model (assoc (t2.with-temp/with-temp-defaults model) :name "Name one"))]
          (try
            (is (nil? t2.connection/*current-connectable*))
            (let [push! (fn [creation?]
                          (revision/push-revision! {:entity       model
                                                    :id           id
                                                    :object       (t2/select-one model :id id)
                                                    :user-id      (mt/user->id :crowberto)
                                                    :is-creation? creation?}))
                  _     (push! true)
                  _     (t2/update! model id {:name "Name two"})
                  _     (push! false)
                  seen  (atom ::not-published)]
              (do-with-recorded-update-events!
               (fn []
                 (reset! on-record (fn [_topic event]
                                     (when (= id (get-in event [:object :id]))
                                       (reset! seen (reversion-count-on-another-connection model id)))))
                 (mt/user-http-request :crowberto :post 200 "revision/revert"
                                       {:entity entity :id id :revision_id (:id (first (revisions-of model id)))})))
              (testing "another connection sees the reversion revision when a listener gets the event"
                (is (= 1 @seen))))
            (finally
              (t2/delete! model :id id))))))))
