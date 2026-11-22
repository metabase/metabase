(ns metabase.timeline.models.timeline-test
  "Tests for the Timeline model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.timeline.models.timeline :as timeline]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest timelines-for-collection-test
  (mt/with-temp [:model/Collection collection {:name "Rasta's Collection"}]
    (let [coll-id  (u/the-id collection)
          event-names (fn [timelines]
                        (into #{} (comp (mapcat :events) (map :name)) timelines))]
      (mt/with-temp [:model/Timeline tl-a {:name "tl-a" :collection_id coll-id}
                     :model/Timeline tl-b {:name "tl-b" :collection_id coll-id}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-a"}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-a) :name "e-b" :archived true}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-c"}
                     :model/TimelineEvent _ {:timeline_id (u/the-id tl-b) :name "e-d" :archived true}]
        (testing "Fetching timelines"
          (testing "don't include events by default"
            (is (= #{}
                   (->> (timeline/timelines-for-collection (u/the-id collection) {})
                        event-names))))
          (testing "include only unarchived events by default"
            (is (= #{"e-a" "e-c"}
                   (->> (timeline/timelines-for-collection (u/the-id collection)
                                                           {:timeline/events? true})
                        event-names))))
          (testing "can load all events if specify `:events/all?`"
            (is (= #{"e-a" "e-b" "e-c" "e-d"}
                   (->> (timeline/timelines-for-collection (u/the-id collection)
                                                           {:timeline/events? true
                                                            :events/all?      true})
                        event-names)))))))))

(deftest balloon-icon-migration-test
  (testing "timelines with icon=balloons should use the default icon instead when selected"
    (mt/with-temp [:model/Timeline a {}
                   :model/Timeline b {:icon "cake"}]
      (t2/query-one {:update :timeline :set {:icon "balloons"} :where [:= :id (u/the-id a)]})
      (is (= timeline-event/default-icon
             (t2/select-one-fn :icon :model/Timeline :id (u/the-id a))))
      (is (= "cake"
             (t2/select-one-fn :icon :model/Timeline :id (u/the-id b)))))))

(deftest hydrate-timeline-test
  (mt/with-temp [:model/Timeline      tl  {:name "tl-a"}
                 :model/TimelineEvent tle {:timeline_id (:id tl) :name "e-a"}]
    (is (= tl (:timeline (t2/hydrate tle :timeline))))))

(deftest icon-test
  (mt/with-temp [:model/Timeline {timeline-id :id} {}]
    (testing "a Timeline without an icon gets the default icon"
      (let [id (t2/insert-returning-pk! :model/Timeline {:name "Icons" :creator_id (mt/user->id :rasta)})]
        (is (= timeline-event/default-icon (t2/select-one-fn :icon :model/Timeline :id id)))
        (t2/delete! :model/Timeline :id id)))
    (testing "the Timeline schema refuses a blank name and an icon outside the allowed set"
      (is (not (mr/validate ::timeline.schema/timeline.update {:id 1 :name ""})))
      (is (not (mr/validate ::timeline.schema/timeline.update {:id 1 :icon "nope"})))
      (is (mr/validate ::timeline.schema/timeline.update {:id 1 :name "Icons" :icon "cake"})))
    (testing "an allowed icon is accepted on update"
      (t2/update! :model/Timeline :id timeline-id {:icon "cake"})
      (is (= "cake" (t2/select-one-fn :icon :model/Timeline :id timeline-id))))))

(deftest collection-namespace-test
  (mt/with-temp [:model/Collection {snippets-id :id} {:namespace :snippets}
                 :model/Collection {other-id :id}    {}
                 :model/Timeline   {timeline-id :id} {:collection_id other-id}]
    (testing "a Timeline cannot go in a Collection of another namespace on insert"
      (is (= 400 (:status-code (ex-data (try (timeline/create-timelines! [{:name "T" :creator_id (mt/user->id :rasta) :collection_id snippets-id}])
                                             (catch clojure.lang.ExceptionInfo e e))))))
      (is (not (t2/exists? :model/Timeline :name "T" :collection_id snippets-id))))
    (testing "a Timeline cannot move to a Collection of another namespace"
      (is (= 400 (:status-code (ex-data (try (timeline/update-timelines! [timeline-id] {:collection_id snippets-id} nil)
                                             (catch clojure.lang.ExceptionInfo e e))))))
      (is (= other-id (t2/select-one-fn :collection_id :model/Timeline :id timeline-id))))))

(deftest update-check-test
  (mt/with-temp [:model/Collection {from-id :id}   {}
                 :model/Collection {to-id :id}     {}
                 :model/Timeline   {timeline-id :id} {:collection_id from-id}]
    (perms/revoke-collection-permissions! (perms/all-users-group) from-id)
    (perms/revoke-collection-permissions! (perms/all-users-group) to-id)
    (perms/grant-collection-readwrite-permissions! (perms/all-users-group) from-id)
    (let [timeline (t2/select-one :model/Timeline :id timeline-id)]
      (mt/with-test-user :rasta
        (testing "a move to a Collection the user cannot write is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                                (api/update-check timeline {:collection_id to-id}))))
        (testing "a change that keeps the Collection is allowed"
          (is (some? (api/update-check timeline {:name "Renamed"}))))
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) to-id)
        (testing "a move to a Collection the user can write is allowed"
          (is (some? (api/update-check timeline {:collection_id to-id}))))))))

(deftest writes-run-fixed-statements-test
  (letfn [(creating [n]
            (mt/with-temp [:model/Collection {coll-id :id} {}]
              (mt/with-model-cleanup [:model/Timeline]
                (t2/with-call-count [call-count]
                  (timeline/create-timelines! (for [i (range n)]
                                                {:name (str "created " i) :collection_id coll-id :creator_id (mt/user->id :rasta)}))
                  (call-count)))))
          (archiving [n]
            (mt/with-temp [:model/Collection {coll-id :id} {}]
              (let [timelines (doall (for [i (range n)]
                                       (t2/insert-returning-instance! :model/Timeline
                                                                      {:name (str "archived " i) :collection_id coll-id
                                                                       :creator_id (mt/user->id :rasta) :icon "star"})))]
                (doseq [{id :id} timelines]
                  (t2/insert! :model/TimelineEvent {:timeline_id id :name "event" :icon "star" :creator_id (mt/user->id :rasta)
                                                    :timestamp (java.time.OffsetDateTime/now) :timezone "UTC" :time_matters true}))
                (try
                  (t2/with-call-count [call-count]
                    (timeline/update-timelines! (mapv :id timelines) {:archived true} nil)
                    (call-count))
                  (finally
                    (t2/delete! :model/Timeline :id [:in (map :id timelines)]))))))]
    (testing "creating Timelines runs one statement count whatever their number"
      (creating 1)
      (is (= (creating 2) (creating 6))))
    (testing "archiving Timelines runs one statement count whatever their number"
      (archiving 1)
      (is (= (archiving 2) (archiving 6))))))

(deftest archiving-timeline-archives-its-events-test
  (mt/with-temp [:model/Timeline      {timeline-id :id} {}
                 :model/TimelineEvent {event-id :id}    {:timeline_id timeline-id}]
    (timeline/update-timelines! [timeline-id] {:archived true} nil)
    (is (true? (t2/select-one-fn :archived :model/TimelineEvent :id event-id)))
    (timeline/update-timelines! [timeline-id] {:archived false} nil)
    (is (false? (t2/select-one-fn :archived :model/TimelineEvent :id event-id)))))

(deftest create-timelines-with-different-columns-test
  (mt/with-model-cleanup [:model/Timeline]
    (let [creator-id (mt/user->id :rasta)
          timelines  (timeline/create-timelines! [{:name "Plain" :creator_id creator-id}
                                                  {:name "Archived" :creator_id creator-id :archived true}])]
      (is (= ["Plain" "Archived"] (map :name timelines)))
      (is (= [false true] (map #(t2/select-one-fn :archived :model/Timeline :id (:id %)) timelines))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/TimelineEvent :model/Timeline :model/Collection]
    (let [user-id  (mt/user->id :rasta)
          live     (t2/insert-returning-pk! :model/Collection (mt/with-temp-defaults :model/Collection))
          other    (t2/insert-returning-pk! :model/Collection (mt/with-temp-defaults :model/Collection))
          archived (t2/insert-returning-pk! :model/Collection (assoc (mt/with-temp-defaults :model/Collection) :archived true))
          rows     (fn [n]
                     (mapv (fn [i]
                             (if (even? i)
                               {:name (mt/random-name) :creator_id user-id :collection_id live}
                               {:name (mt/random-name) :creator_id user-id :collection_id archived :archived true}))
                           (range n)))
          archived-in-live (fn [n]
                             (mapv (fn [i]
                                     (cond-> {:name (mt/random-name) :creator_id user-id :collection_id live}
                                       (odd? i) (assoc :archived true)))
                                   (range n)))
          live-rows (fn [n]
                      (mapv (fn [_] {:name (mt/random-name) :creator_id user-id :collection_id live}) (range n)))
          fresh!   (fn [n & [rows-fn]]
                     (let [timelines (timeline/create-timelines! ((or rows-fn rows) n))]
                       (timeline-event/create-timeline-events!
                        (mapv (fn [{:keys [id]}]
                                {:timeline_id id :name (mt/random-name) :timestamp (java.time.Instant/now)
                                 :creator_id user-id :time_matters false :timezone "UTC"})
                              timelines))
                       (mapv :id timelines)))]
      (testing "creating timelines"
        (events.tu/statement-count! #(timeline/create-timelines! (rows 1)))
        (is (= (events.tu/statement-count! #(timeline/create-timelines! (rows 2)))
               (events.tu/statement-count! #(timeline/create-timelines! (rows 6))))))
      (testing "archiving timelines, some already archived"
        (let [archive! (fn [n]
                         (let [ids (fresh! n)]
                           (events.tu/statement-count!
                            #(timeline/update-timelines! ids {:archived true} nil))))]
          (archive! 2)
          (is (= (archive! 2) (archive! 6)))))
      (testing "restoring timelines, some already live"
        (let [restore! (fn [n]
                         (let [ids (fresh! n archived-in-live)]
                           (events.tu/statement-count!
                            #(timeline/update-timelines! ids {:archived false} nil))))]
          (restore! 2)
          (is (= (restore! 2) (restore! 6)))))
      (testing "moving timelines, some already in the Collection"
        (let [move! (fn [n]
                      (let [ids (fresh! n live-rows)]
                        (timeline/update-timelines! (take-nth 2 ids) {:collection_id other} nil)
                        (events.tu/statement-count!
                         #(timeline/update-timelines! ids {:collection_id other} nil))))]
          (move! 2)
          (is (= (move! 2) (move! 6)))))
      (testing "deleting timelines"
        (let [delete! (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(timeline/delete-timelines! ids))))]
          (delete! 1)
          (is (= (delete! 2) (delete! 6))))))))

(deftest archived-directly-follows-collection-in-the-statement-test
  (mt/with-model-cleanup [:model/Timeline :model/Collection]
    (let [user-id  (mt/user->id :rasta)
          live     (t2/insert-returning-pk! :model/Collection (mt/with-temp-defaults :model/Collection))
          archived (t2/insert-returning-pk! :model/Collection (assoc (mt/with-temp-defaults :model/Collection) :archived true))
          make!    (fn [collection-id n]
                     (mapv :id (timeline/create-timelines!
                                (mapv (fn [_] {:name (mt/random-name) :creator_id user-id :collection_id collection-id}) (range n)))))
          flags    (fn [ids] (mapv #(t2/select-one-fn :archived_directly :model/Timeline :id %) ids))]
      (testing "through the write function"
        (let [ids (make! live 2)]
          (timeline/update-timelines! ids {:archived true} nil)
          (is (= [true true] (flags ids)))
          (timeline/update-timelines! ids {:archived false} nil)
          (is (= [false false] (flags ids)))))
      (testing "through a plain update, a Timeline follows the Collection it is in"
        (let [in-live (make! live 1)
              in-arch (mapv :id (timeline/create-timelines!
                                 [{:name (mt/random-name) :creator_id user-id :collection_id archived
                                   :archived true :archived_directly true}]))
              ids     (concat in-live in-arch)]
          (t2/update! :model/Timeline :id [:in ids] {:archived false})
          (is (= [false false] (flags ids)))
          (t2/update! :model/Timeline :id [:in ids] {:archived true})
          (is (= [true false] (flags ids)))))
      (testing "the event carries the stored value"
        (let [ids       (make! live 1)
              published (atom [])]
          (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
            (timeline/update-timelines! ids {:archived true} nil))
          (is (= [true] (for [[topic event] @published
                              :when         (= :event/timeline-update topic)
                              change        (:changes event)]
                          (:archived_directly (:object change)))))))
      (testing "restoring rows of mixed stored state costs the same statements at two and six rows"
        (let [restore! (fn [n]
                         (let [ids (make! live n)]
                           (timeline/update-timelines! ids {:archived true} nil)
                           (t2/update! :model/Timeline :id (first ids) {:archived_directly false})
                           (events.tu/statement-count!
                            #(timeline/update-timelines! ids {:archived false} nil))))]
          (restore! 2)
          (is (= (restore! 2) (restore! 6))))))))

(deftest refused-write-rolls-back-to-its-savepoint-test
  (mt/with-temp [:model/Collection {snippets-id :id} {:namespace :snippets}]
    (mt/with-model-cleanup [:model/Timeline]
      (let [user-id (mt/user->id :rasta)]
        (t2/with-transaction [_conn]
          (is (= 400 (:status-code (ex-data (try (timeline/create-timelines! [{:name "Refused" :creator_id user-id :collection_id snippets-id}])
                                                 (catch clojure.lang.ExceptionInfo e e))))))
          (timeline/create-timelines! [{:name "Kept" :creator_id user-id}]))
        (is (not (t2/exists? :model/Timeline :name "Refused")))
        (is (t2/exists? :model/Timeline :name "Kept"))))))
