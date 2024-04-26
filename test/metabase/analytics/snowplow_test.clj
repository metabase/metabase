(ns metabase.analytics.snowplow-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.models.setting :as setting :refer [Setting]]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [toucan2.core :as t2])
  (:import
   (com.snowplowanalytics.snowplow.tracker.events SelfDescribing)
   (com.snowplowanalytics.snowplow.tracker.payload SelfDescribingJson)
   (java.util LinkedHashMap)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:dynamic *snowplow-collector*
  "Fake Snowplow collector"
  (atom []))

(defn- normalize-map
  "Normalizes and returns the data in a LinkedHashMap extracted from a Snowplow object"
  [^LinkedHashMap m]
  (->> m (into {}) walk/keywordize-keys))

(defn- fake-track-event-impl!
  "A function that can be used in place of track-event-impl! which pulls and decodes the payload, context and subject ID
  from an event and adds it to the in-memory [[*snowplow-collector*]] queue."
  [collector _tracker ^SelfDescribing event]
  (let [payload                            (-> event .getPayload .getMap normalize-map)
        ;; Don't normalize keys in [[properties]] so that we can assert that they are snake-case strings in the test
        ;; cases
        properties                         (-> (or (:ue_pr payload)
                                                   (u/decode-base64 (:ue_px payload)))
                                               json/parse-string)
        subject                            (when-let [subject (.getSubject event)]
                                             (-> subject .getSubject normalize-map))
        [^SelfDescribingJson context-json] (.getContext event)
        context                            (normalize-map (.getMap context-json))]
    (swap! collector conj {:properties properties, :subject subject, :context context})))

(defn do-with-fake-snowplow-collector
  "Impl for `with-fake-snowplow-collector` macro; prefer using that rather than calling this directly."
  [f]
  (mt/with-temporary-setting-values [snowplow-available    true
                                     anon-tracking-enabled true]
    (binding [*snowplow-collector* (atom [])]
      (let [collector *snowplow-collector*] ;; get a reference to the atom
        (with-redefs [snowplow/track-event-impl! (partial fake-track-event-impl! collector)]
          (f))))))

(defmacro with-fake-snowplow-collector
  "Creates a new fake snowplow collector in a dynamic scope, and redefines the track-event! function so that analytics
  events are parsed and added to the fake collector.

  Fetch the contents of the collector by calling [[snowplow-collector-contents]]."
  [& body]
  {:style/indent 0}
  `(do-with-fake-snowplow-collector (fn [] ~@body)))

(defn- clear-snowplow-collector!
  []
  (reset! *snowplow-collector* []))

(defn pop-event-data-and-user-id!
  "Returns a vector containing the event data from each tracked event in the Snowplow collector as well as the user ID
  of the profile associated with each event, and clears the collector."
  []
  (let [events @*snowplow-collector*]
    (clear-snowplow-collector!)
    (map (fn [events] {:data    (-> events :properties (get "data") (get "data"))
                       :user-id (-> events :subject :uid)})
         events)))

(defn valid-datetime-for-snowplow?
  "Check if a datetime string has the format that snowplow accepts.
  The string should have the format yyyy-mm-dd'T'HH:mm:ss.SSXXX which is a RFC3339 format.
  Reference: https://json-schema.org/understanding-json-schema/reference/string.html#dates-and-times"
  [t]
  (try
    (java.time.LocalDate/parse
      t
      (java.time.format.DateTimeFormatter/ofPattern "yyyy-MM-dd'T'HH:mm:ss.SSXXX"))
    true
    (catch Exception _e
      false)))

(deftest custom-content-test
  (testing "Snowplow events include a custom context that includes the schema, instance ID, version, token features
           and creation timestamp"
    (with-fake-snowplow-collector
      (snowplow/track-event! ::snowplow/new-instance-created)
      (is (= {:schema "iglu:com.metabase/instance/jsonschema/1-1-2",
              :data {:id                           (snowplow/analytics-uuid)
                     :version                      {:tag (:tag (public-settings/version))},
                     :token_features               (public-settings/token-features)
                     :created_at                   (snowplow/instance-creation)
                     :application_database         (#'snowplow/app-db-type)
                     :application_database_version (#'snowplow/app-db-version)}}
             (:context (first @*snowplow-collector*))))

      (testing "the created_at should have the format be formatted as RFC3339"
        (is (valid-datetime-for-snowplow?
              (get-in (first @*snowplow-collector*) [:context :data :created_at])))))))

(deftest ip-address-override-test
  (testing "IP address on Snowplow subject is overridden with a dummy value (127.0.0.1)"
    (with-fake-snowplow-collector
      (snowplow/track-event! ::snowplow/dashboard-created 1 {:dashboard-id 1})
      (is (partial= {:uid "1", :ip "127.0.0.1"}
                    (:subject (first @*snowplow-collector*)))))))

(deftest track-event-test
  (with-fake-snowplow-collector
    (testing "Data sent into [[snowplow/track-event!]] for each event type is propagated to the Snowplow collector,
             with keys converted into snake-case strings, and the subject's user ID being converted to a string."
      ;; Trigger instance-creation event by calling the `instance-creation` setting function for the first time
      (t2/delete! Setting :key "instance-creation")
      (snowplow/instance-creation)
      (is (= [{:data    {"event" "new_instance_created"}
               :user-id nil}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/new-user-created 1)
      (is (= [{:data    {"event" "new_user_created"}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/invite-sent 1 {:invited-user-id 2, :source "admin"})
      (is (= [{:data    {"invited_user_id" 2, "event" "invite_sent", "source" "admin"}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/dashboard-created 1 {:dashboard-id 1})
      (is (= [{:data    {"dashboard_id" 1, "event" "dashboard_created"}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/question-added-to-dashboard 1 {:dashboard-id 1, :question-id 2})
      (is (= [{:data    {"dashboard_id" 1, "event" "question_added_to_dashboard", "question_id" 2}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/database-connection-successful
                             1
                             {:database :postgres, :database-id 1, :source :admin, :dbms_version "14.1"})
      (is (= [{:data    {"database" "postgres"
                         "database_id" 1
                         "event" "database_connection_successful"
                         "dbms_version" "14.1"
                         "source" "admin"}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/database-connection-failed 1 {:database :postgres, :source :admin})
      (is (= [{:data    {"database" "postgres", "event" "database_connection_failed", "source" "admin"}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! ::snowplow/new-event-created 1 {:source "question", :question_id 1})
      (is (= [{:data    {"event" "new_event_created", "source" "question", "question_id" 1}
               :user-id "1"}]
             (pop-event-data-and-user-id!)))

      (testing "Snowplow events are not sent when tracking is disabled"
        (mt/with-temporary-setting-values [anon-tracking-enabled false]
          (snowplow/track-event! ::snowplow/new-instance-created)
          (is (= [] (pop-event-data-and-user-id!))))))))

(deftest instance-creation-test
  (let [original-value (t2/select-one-fn :value Setting :key "instance-creation")]
    (try
      (testing "Instance creation timestamp is set only once when setting is first fetched"
        (t2/delete! Setting :key "instance-creation")
        (with-redefs [snowplow/first-user-creation (constantly nil)]
          (let [first-value (snowplow/instance-creation)]
            (Thread/sleep 10) ;; short sleep since java.time.Instant is not necessarily monotonic
            (is (= first-value
                   (snowplow/instance-creation))))))

      (testing "If a user already exists, we should use the first user's creation timestamp"
        (mt/with-test-user :crowberto
          (t2/delete! Setting :key "instance-creation")
          (let [first-user-creation (:min (t2/select-one ['User [:%min.date_joined :min]]))
                instance-creation   (snowplow/instance-creation)]
            (is (= (u.date/format-rfc3339 first-user-creation)
                   instance-creation)))))
      (finally
        (when original-value
          (t2/update! Setting {:key "instance-creation"} {:value original-value}))))))
