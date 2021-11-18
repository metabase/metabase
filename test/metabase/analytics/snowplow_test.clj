(ns metabase.analytics.snowplow-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.models.setting :refer [Setting]]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import java.util.LinkedHashMap))

(def ^:dynamic ^:private *snowplow-collector*
  "Fake Snowplow collector"
  (atom []))

(defn- normalize-map
  "Normalizes and returns the data in a LinkedHashMap extracted from a Snowplow object"
  [^LinkedHashMap m]
  (->> m (into {}) walk/keywordize-keys))

(defn- fake-track-event-impl!
  "A function that can be used in place of track-event-impl! which pulls and decodes the payload, context and subject ID
  from an event and adds it to the in-memory [[*snowplow-collector*]] queue."
  [_ event]
  (let [payload (-> event .getPayload .getMap normalize-map)
        properties (-> (or (:ue_pr payload)
                           (u/decode-base64 (:ue_px payload)))
                       json/parse-string
                       walk/keywordize-keys)
        subject (when-let [subject (.getSubject event)]
                  (-> subject .getSubject normalize-map))
        context (->> event .getContext first .getMap normalize-map)]
    (swap! *snowplow-collector* conj {:properties properties, :subject subject, :context context})))

(defn- do-with-fake-snowplow-collector
  "Impl for `with-fake-snowplow-collector` macro; prefer using that rather than calling this directly."
  [f]
  (binding [*snowplow-collector* (atom [])]
    (with-redefs [snowplow/track-event-impl! fake-track-event-impl!]
      (f))))

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

(defn- pop-event-data-and-user-id!
  "Returns a vector containing the event data from each tracked event in the Snowplow collector as well as the user ID
  of the profile associated with each event, and clears the collector."
  []
  (let [events @*snowplow-collector*]
    (clear-snowplow-collector!)
    (map (fn [events] {:data    (-> events :properties :data :data)
                       :user-id (-> events :subject :uid)})
         events)))

(deftest custom-content-test
  (testing "Snowplow events include a custom context that includes the instnace ID, version and token features"
    (with-fake-snowplow-collector
      (snowplow/track-event! :new_instance_created)
      (is (= {:schema "iglu:com.metabase/instance/jsonschema/1-0-0",
              :data {:id             (snowplow/analytics-uuid)
                     :version        {:tag (:tag (public-settings/version))},
                     :token-features (public-settings/token-features)}}
             (:context (first @*snowplow-collector*)))))))

(deftest track-event-test
  (testing "Data sent into [[snowplow/track-event!]] for each event type is propagated to the Snowplow collector"
    (with-fake-snowplow-collector
      (snowplow/track-event! :new_instance_created)
      (is (= [{:data    {:event "new_instance_created"}
               :user-id nil}]
             (pop-event-data-and-user-id!)))

      (snowplow/track-event! :new_user_created 1)
      (is (= [{:data    {:event "new_user_created"}
               :user-id "1"}]
             (pop-event-data-and-user-id!))))))

(deftest instance-creation-test
  (let [original-value (db/select-one-field :value Setting :key "instance-creation")]
    (try
      (testing "Instance creation timestamp is set only once when setting is first fetched"
        (db/delete! Setting {:key "instance-creation"})
        (with-redefs [snowplow/first-user-creation (constantly nil)]
          (let [first-value (snowplow/instance-creation)]
            (Thread/sleep 10) ;; short sleep since java.time.Instant is not necessarily monotonic
            (is (= first-value
                   (snowplow/instance-creation))))))

      (testing "If a user already exists, we should use the first user's creation timestamp"
        (db/delete! Setting {:key "instance-creation"})
        (mt/with-test-user :crowberto
          (let [first-user-creation (:min (db/select-one [User [:%min.date_joined :min]]))
                instance-creation   (snowplow/instance-creation)]
            (is (= (java-time/local-date-time first-user-creation)
                   (java-time/local-date-time instance-creation))))))
      (finally
        (db/update-where! Setting {:key "instance-creation"} :value original-value)))))
