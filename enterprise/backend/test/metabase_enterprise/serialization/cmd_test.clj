(ns metabase-enterprise.serialization.cmd-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.cmd.core :as cmd]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest dump-readonly-dir-test
  (testing "command exits early when destination is not writable"
    (mt/with-premium-features #{:serialization}
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (.mkdirs (io/file dump-dir))
        (.setWritable (io/file dump-dir) false)
        (with-redefs [v2.extract/extract (fn [& _args]
                                           (throw (ex-info "Do not call me!" {})))]
          (is (thrown-with-msg? Exception #"Destination path is not writeable: "
                                (cmd/export dump-dir))))))))

(deftest snowplow-events-test
  (testing "Snowplow events are correctly sent"
    (mt/with-premium-features #{:serialization}
      (mt/with-empty-h2-app-db!
        (snowplow-test/with-fake-snowplow-collector
          (ts/with-random-dump-dir [dump-dir "serdesv2-"]
            (let [coll (ts/create! :model/Collection :name "coll")
                  card (ts/create! :model/Card :name "card" :collection_id (:id coll))]
              (cmd/export dump-dir "--collection" (str (:id coll)) "--no-data-model")
              (testing "Snowplow export event was sent"
                (is (=? {"event"           "serialization"
                         "direction"       "export"
                         "collection"      (str (:id coll))
                         "all_collections" false
                         "data_model"      false
                         "settings"        true
                         "field_values"    false
                         "duration_ms"     pos?
                         "count"           12
                         "source"          "cli"
                         "secrets"         false
                         "success"         true
                         "error_message"   nil}
                        (->> (map :data (snowplow-test/pop-event-data-and-user-id!))
                             (filter #(= "serialization" (get % "event")))
                             first))))

              (testing "Snowplow import event was sent"
                (cmd/import dump-dir)
                (is (=? {"event"         "serialization"
                         "direction"     "import"
                         "duration_ms"   pos?
                         "source"        "cli"
                         "models"        "Card,Collection,PythonLibrary,Setting,TransformJob,TransformTag"
                         "count"         12
                         "success"       true
                         "error_message" nil}
                        (-> (snowplow-test/pop-event-data-and-user-id!) first :data))))

              (with-redefs [v2.storage/store-settings! (fn [_opts _settings]
                                                         (throw (Exception. "Cannot load settings")))]
                (is (thrown? Exception
                             (cmd/export dump-dir "--collection" (str (:id coll)) "--no-data-model")))
                (testing "Snowplow export event about error was sent"
                  (is (=? {"event"           "serialization"
                           "direction"       "export"
                           "collection"      (str (:id coll))
                           "all_collections" false
                           "data_model"      false
                           "settings"        true
                           "field_values"    false
                           "duration_ms"     pos?
                           "count"           0
                           "source"          "cli"
                           "secrets"         false
                           "success"         false
                           "error_message"   "Cannot load settings"}
                          (->> (map :data (snowplow-test/pop-event-data-and-user-id!))
                               (filter #(= "serialization" (get % "event")))
                               first)))))

              (let [ingest-file @#'v2.ingest/ingest-file]
                ;; overriding ingest-file is weird, but ingest-one is a protocol function and with-redefs won't
                ;; override that reliably
                (with-redefs [v2.ingest/ingest-file (fn [file]
                                                      (cond-> (ingest-file file)
                                                        (str/includes? (.getName file) (:entity_id card))
                                                        (assoc :collection_id "DoesNotExist")))]
                  (is (thrown? Exception
                               (cmd/import dump-dir)))
                  (testing "Snowplow import event about error was sent"
                    (is (=? {"event"         "serialization"
                             "direction"     "import"
                             "duration_ms"   pos?
                             "source"        "cli"
                             "models"        ""
                             "count"         0
                             "success"       false
                             ;; t2/with-transactions re-wraps errors with data about toucan connections
                             "error_message" "Failed to read file {:path \"Collection DoesNotExist\"}"}
                            (-> (snowplow-test/pop-event-data-and-user-id!) first :data)))))))))))))
