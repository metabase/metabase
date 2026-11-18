(ns metabase.api.timeline-event-test
  "Tests for /api/timeline-event endpoints"
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.response :as api.response]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel auth-tests
  (testing "Authentication"
    (is (= (get api.response/response-unauthentic :body)
           (client/client :get 401 "/timeline-event")))
    (is (= (get api.response/response-unauthentic :body)
           (client/client :get 401 "/timeline-event/1")))))

(deftest ^:parallel get-timeline-event-test
  (testing "GET /api/timeline-event/:id"
    (mt/with-temp [:model/Collection    collection {:name "Important Data"}
                   :model/Timeline      timeline   {:name          "Important Events"
                                                    :collection_id (u/the-id collection)}
                   :model/TimelineEvent event      {:name         "Very Important Event"
                                                    :timestamp    (java.time.OffsetDateTime/now)
                                                    :time_matters false
                                                    :timeline_id  (u/the-id timeline)}]
      (testing "check that we get the timeline-event with `id`"
        (is (= {:name "Very Important Event" :entity_id (:entity_id event)}
               (select-keys (mt/user-http-request :rasta :get 200 (str "timeline-event/" (u/the-id event)))
                            [:name :entity_id])))))))

(deftest create-timeline-event-test
  (testing "POST /api/timeline-event"
    (mt/with-temp [:model/Collection    collection {:name "Important Data"}
                   :model/Timeline      timeline   {:name          "Important Events"
                                                    :collection_id (u/the-id collection)}]
      (testing "create a timeline event"
        (let [event (mt/user-http-request :rasta :post 200 "timeline-event"
                                          {:name         "Rasta Migrates to Florida for the Winter"
                                           :timestamp    (java.time.OffsetDateTime/now)
                                           :timezone     "US/Pacific"
                                           :time_matters false
                                           :timeline_id  (u/the-id timeline)})]
          (is (=? {:entity_id #(and (string? %) (= 21 (count %)))} event))
          (is (= (:entity_id event)
                 (t2/select-one-fn :entity_id :model/TimelineEvent :id (:id event))))))
      ;; check the Timeline to see if the event is there
      (is (= "Rasta Migrates to Florida for the Winter"
             (-> (t2/select-one :model/TimelineEvent :timeline_id (u/the-id timeline)) :name))))))

(deftest update-timeline-event-test
  (testing "PUT /api/timeline-event/:id"
    (testing "Can archive the timeline event"
      (mt/with-temp [:model/Collection    collection {:name "Important Data"}
                     :model/Timeline      timeline   {:name          "Important Events"
                                                      :collection_id (u/the-id collection)}
                     :model/TimelineEvent event      {:name         "Very Important Event"
                                                      :timeline_id  (u/the-id timeline)}]
        (testing "check that we can adjust the timestamp for timeline-event with `id`"
          (is (= "2022-01-01T00:00:00Z"
                 (->> (mt/user-http-request :rasta :put 200 (str "timeline-event/" (u/the-id event)) {:timestamp "2022-01-01"})
                      :timestamp))))
        (testing "check that we have archived the timeline-event with `id`"
          (is (true?
               (->> (mt/user-http-request :rasta :put 200 (str "timeline-event/" (u/the-id event)) {:archived true})
                    :archived))))))))

(deftest move-timeline-event-test
  (testing "PUT /api/timeline-event/:id can move an event to another timeline"
    (mt/with-temp [:model/Collection    {coll-id :id} {:name "Important Data"}
                   :model/Timeline      {tl-a :id}    {:name "Timeline A" :collection_id coll-id}
                   :model/Timeline      {tl-b :id}    {:name "Timeline B" :collection_id coll-id}
                   :model/TimelineEvent {ev-id :id}   {:name "Event" :timeline_id tl-a}]
      (is (= tl-b
             (:timeline_id (mt/user-http-request :rasta :put 200 (str "timeline-event/" ev-id)
                                                 {:timeline_id tl-b}))))
      (is (= tl-b (t2/select-one-fn :timeline_id :model/TimelineEvent :id ev-id))))))

(deftest move-timeline-event-permissions-test
  (testing "PUT /api/timeline-event/:id needs write access to the timeline the event moves to"
    (mt/with-temp [:model/Collection    {from-coll :id} {}
                   :model/Collection    {to-coll :id}   {}
                   :model/Timeline      {from-tl :id}   {:collection_id from-coll}
                   :model/Timeline      {to-tl :id}     {:collection_id to-coll}
                   :model/TimelineEvent {ev-id :id}     {:timeline_id from-tl}]
      (perms/revoke-collection-permissions! (perms-group/all-users) from-coll)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-coll)
      (perms/revoke-collection-permissions! (perms-group/all-users) to-coll)
      (perms/grant-collection-read-permissions! (perms-group/all-users) to-coll)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "timeline-event/" ev-id) {:timeline_id to-tl})))
      (is (= from-tl (t2/select-one-fn :timeline_id :model/TimelineEvent :id ev-id)))
      (is (= "Renamed" (:name (mt/user-http-request :rasta :put 200 (str "timeline-event/" ev-id) {:name "Renamed"}))))
      (testing "a missing destination timeline is not found"
        (is (= "Not found."
               (mt/user-http-request :crowberto :put 404 (str "timeline-event/" ev-id) {:timeline_id Integer/MAX_VALUE})))))))

(deftest timeline-event-timezone-must-name-time-zone-test
  (mt/with-temp [:model/Timeline      {tl-id :id} {}
                 :model/TimelineEvent {id :id}    {:timeline_id tl-id}]
    (testing "POST /api/timeline-event"
      (is (= {:errors {:timezone "Invalid Timeline event timezone."}}
             (-> (mt/user-http-request :rasta :post 400 "timeline-event"
                                       {:name "RC1" :timestamp "2027-10-20" :timezone "Nowhere/Land" :timeline_id tl-id})
                 (select-keys [:errors])))))
    (testing "PUT /api/timeline-event/:id"
      (is (= "Invalid Timeline event timezone."
             (mt/user-http-request :rasta :put 400 (str "timeline-event/" id) {:timezone "Nowhere/Land"})))
      (testing "keeps a stored time zone Java does not know when the request repeats it"
        (t2/update! :model/TimelineEvent :id id {:timezone "Nowhere/Land"})
        (is (=? {:name "Renamed" :timezone "Nowhere/Land"}
                (mt/user-http-request :rasta :put 200 (str "timeline-event/" id) {:name "Renamed" :timezone "Nowhere/Land"})))))))

(deftest timeline-event-null-inputs-test
  (mt/with-temp [:model/Timeline {tl-id :id} {:icon "cake"}]
    (testing "POST /api/timeline-event takes a null icon as none"
      (let [event (mt/user-http-request :crowberto :post 200 "timeline-event"
                                        {:name "RC1" :timestamp "2027-10-20" :timezone "UTC" :time_matters false
                                         :icon nil :timeline_id tl-id})]
        (is (= "cake" (:icon event)))
        (testing "PUT /api/timeline-event/:id takes a null time_matters as no change"
          (is (=? {:time_matters false}
                  (mt/user-http-request :crowberto :put 200 (str "timeline-event/" (:id event)) {:time_matters nil}))))))))

(deftest unarchived-event-in-archived-timeline-test
  (testing "an unarchived event may be added to an archived Timeline, as stored data and imports hold such events"
    (mt/with-temp [:model/Timeline {tl-id :id} {:archived true}]
      (let [id (t2/insert-returning-pk! :model/TimelineEvent {:name         "RC1"
                                                              :timeline_id  tl-id
                                                              :timestamp    (java.time.Instant/parse "2027-10-20T00:00:00Z")
                                                              :timezone     "UTC"
                                                              :time_matters false
                                                              :creator_id   (mt/user->id :rasta)})]
        (is (false? (t2/select-one-fn :archived :model/TimelineEvent :id id)))))))

(deftest create-timeline-event-defaults-test
  (testing "POST /api/timeline-event gives an event without an icon the icon of its timeline"
    (mt/with-temp [:model/Timeline {tl-id :id} {:icon "cake"}]
      (let [id (:id (mt/user-http-request :crowberto :post 200 "timeline-event"
                                          {:name "RC1" :timestamp "2027-10-20" :timezone "UTC" :time_matters false :timeline_id tl-id}))]
        (is (= "cake" (t2/select-one-fn :icon :model/TimelineEvent :id id)))))))

(deftest timeline-event-permissions-test
  (testing "read-only users cannot create or edit timeline events"
    (mt/with-temp [:model/Collection    {coll-id :id} {}
                   :model/Timeline      {tl-id :id}   {:collection_id coll-id}
                   :model/TimelineEvent {ev-id :id}   {:timeline_id tl-id}]
      (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
      (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "timeline-event"
                                   {:name "nope" :timestamp "2027-10-20" :timezone "UTC" :timeline_id tl-id})))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 (str "timeline-event/" ev-id) {:name "nope"}))))))

(deftest create-timeline-event-tracks-snowplow-test
  (testing "POST /api/timeline-event fires a snowplow new_event_created event"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Timeline   {tl-id :id}   {:collection_id coll-id}]
        (mt/user-http-request :crowberto :post 200 "timeline-event"
                              {:name "RC1" :timestamp "2027-10-20" :timezone "UTC"
                               :time_matters false :timeline_id tl-id})
        (is (some #(nil? (hawk.approx/=?-diff* {:data {"event" "new_event_created"}} %))
                  (snowplow-test/pop-event-data-and-user-id!)))))))

(deftest create-timeline-event-tracks-dashboard-source-test
  (testing "POST /api/timeline-event reports a dashboard as the source of a new event"
    (snowplow-test/with-fake-snowplow-collector
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Timeline   {tl-id :id}   {:collection_id coll-id}]
        (mt/user-http-request :crowberto :post 200 "timeline-event"
                              {:name "RC1" :timestamp "2027-10-20" :timezone "UTC"
                               :time_matters false :timeline_id tl-id :source "dashboard"})
        (is (some #(nil? (hawk.approx/=?-diff* {:data {"event" "new_event_created" "source" "dashboard"}} %))
                  (snowplow-test/pop-event-data-and-user-id!)))))))

(deftest delete-timeline-event-test
  (testing "DELETE /api/timeline-event/:id"
    (mt/with-temp [:model/Collection    {collection-id :id} {:name "Example Data"}
                   :model/Timeline      {timeline-id :id}   {:name "Some Events"
                                                             :collection_id collection-id}
                   :model/TimelineEvent {event-id :id}      {:name "Example Event"
                                                             :timeline_id timeline-id}]
      (testing "delete an existing timeline-event `id`"
        (is (= nil
               (mt/user-http-request :rasta :delete 204 (str "timeline-event/" event-id))))
        (is (= "Not found."
               (mt/user-http-request :rasta :get 404 (str "timeline-event/" event-id)))))
      (testing "delete a non-existent timeline-event `id`"
        (is (= "Not found."
               (mt/user-http-request :rasta :get 404 (str "timeline-event/" Integer/MAX_VALUE))))))))
