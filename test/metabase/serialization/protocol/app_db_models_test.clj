(ns metabase.serialization.protocol.app-db-models-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]
   [metabase.test :as mt]))

(def ^:private store protocol.app-db/store)

(deftest select-by-parent-pks-test
  (testing "selects the children of the parents with the given primary keys"
    (mt/with-temp [:model/Timeline      {timeline-id :id} {}
                   :model/Timeline      {other-id :id}    {}
                   :model/TimelineEvent {event-id :id}    {:timeline_id timeline-id :name "e"
                                                           :timestamp   #t "2024-01-01T00:00:00Z"
                                                           :timezone    "UTC" :time_matters false}
                   :model/TimelineEvent _                 {:timeline_id other-id :name "f"
                                                           :timestamp   #t "2024-01-01T00:00:00Z"
                                                           :timezone    "UTC" :time_matters false}]
      (is (= [{:id event-id :timeline_id timeline-id}]
             (map #(select-keys % [:id :timeline_id])
                  (protocol/select-by-parent-pks store :model/TimelineEvent #{timeline-id} [:id])))))))

(deftest select-by-refs-of-identity-models-test
  (mt/with-temp [:model/Database          {db-id :id}    {:name "serdes-db"}
                 :model/Table             {table-id :id} {:db_id db-id :name "users" :schema "public"}
                 :model/Field             {field-id :id} {:table_id table-id :name "email"}
                 :model/FieldValues       {fv-id :id}    {:field_id field-id :type :full :values ["a"]}
                 :model/TableUserSettings _              {:table_id        table-id
                                                          :description     "Users"
                                                          :description_set true}]
    (testing "of FieldValues, by the ref of their Field and their type"
      (is (= {[["serdes-db" "public" "users" "email"] "full"] fv-id}
             (update-vals (protocol/select-by-refs store :model/FieldValues
                                                   #{[["serdes-db" "public" "users" "email"] "full"]
                                                     [["serdes-db" "public" "users" "email"] "sandbox"]}
                                                   [:id])
                          :id))))
    (testing "of TableUserSettings, by the ref of their Table"
      (is (= #{["serdes-db" "public" "users"]}
             (set (keys (protocol/select-by-refs store :model/TableUserSettings
                                                 #{["serdes-db" "public" "users"]
                                                   ["serdes-db" "public" "missing"]}
                                                 nil)))))))
  (testing "of Settings, by key"
    (mt/with-temporary-raw-setting-values [site-name "SerDes test"]
      (is (= #{"site-name"}
             (set (keys (protocol/select-by-refs store :model/Setting #{"site-name" "no-such-setting"} nil))))))))
