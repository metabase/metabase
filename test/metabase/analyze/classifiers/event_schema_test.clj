(ns metabase.analyze.classifiers.event-schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.event-schema :as classifiers.event-schema]))

(def ^:private track-fields
  [{:name "created_at" :base_type :type/DateTime}
   {:name "person_id" :base_type :type/Text}
   {:name "session_id" :base_type :type/Text}
   {:name "event_name" :base_type :type/Text}
   {:name "url_path" :base_type :type/Text}])

(deftest ^:parallel detect-pageviews-test
  (testing "a schema's pageview rule is detected when its column exists"
    (is (= {"type" "column_value" "column" "event_type" "value" 1}
           (-> (classifiers.event-schema/detect-event-schema
                (conj track-fields {:name "event_type" :base_type :type/Integer}))
               (get-in ["settings" "pageviews"])))))
  (testing "a column that can't hold the rule's value isn't a pageview rule"
    (is (= {"columns.timestamp"  "created_at"
            "columns.person"     "person_id"
            "columns.session"    "session_id"
            "columns.event_name" "event_name"
            "columns.url_path"   "url_path"}
           (-> (classifiers.event-schema/detect-event-schema
                (conj track-fields {:name "event_type" :base_type :type/Text}))
               (get "settings")))))
  (testing "without its column, the schema still matches, with no pageview rule"
    (is (not (contains? (get (classifiers.event-schema/detect-event-schema track-fields) "settings")
                        "pageviews"))))
  (testing "a rule on the event name column, for a schema without a URL path"
    (is (= {"type" "column_value" "column" "event" "value" "$pageview"}
           (-> (classifiers.event-schema/detect-event-schema
                [{:name "timestamp" :base_type :type/DateTime}
                 {:name "distinct_id" :base_type :type/Text}
                 {:name "event" :base_type :type/Text}
                 {:name "properties" :base_type :type/JSON}])
               (get-in ["settings" "pageviews"]))))))
