(ns metabase-enterprise.serialization.v2.e2e.yaml-test
  (:require [clojure.java.io :as io]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as extract]
            [metabase-enterprise.serialization.v2.ingest :as ingest]
            [metabase-enterprise.serialization.v2.ingest.yaml :as ingest.yaml]
            [metabase-enterprise.serialization.v2.storage.yaml :as storage.yaml]
            [metabase-enterprise.serialization.v2.utils.yaml :as u.yaml]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.test.generate :as test-gen]
            [metabase.util.date-2 :as u.date]
            [reifyhealth.specmonstah.core :as rs]
            [yaml.core :as yaml])
  (:import java.time.ZoneId))

(defn- dir->file-set [dir]
  (->> dir
       .listFiles
       (filter #(.isFile %))
       (map #(.getName %))
       set))

(defn- subdirs [dir]
  (->> dir
       .listFiles
       (remove #(.isFile %))))

(defn- strip-labels [path]
  (mapv #(dissoc % :label) path))

(defn- random-keyword
  ([prefix n] (random-keyword prefix n 0))
  ([prefix n floor] (keyword (str prefix (+ floor (rand-int n))))))

(deftest e2e-storage-ingestion-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-empty-h2-app-db
      ;; TODO Generating some nested collections would make these tests more robust.
      (test-gen/insert!
        {:collection              [[100 {:refs {:personal_owner_id ::rs/omit}}]
                                   [10  {:refs     {:personal_owner_id ::rs/omit}
                                         :spec-gen {:namespace :snippets}}]]
         :database                [[10]]
         :table                   (into [] (for [db [:db0 :db1 :db2 :db3 :db4 :db5 :db6 :db7 :db8 :db9]]
                                             [10 {:refs {:db_id db}}]))
         :field                   (into [] (for [n     (range 100)
                                                 :let [table (keyword (str "t" n))]]
                                             [10 {:refs {:table_id table}}]))
         :core-user               [[10]]
         :card                    [[100 {:refs (let [db (rand-int 10)
                                                     t  (rand-int 10)]
                                                 {:database_id   (keyword (str "db" db))
                                                  :table_id      (keyword (str "t" (+ t (* 10 db))))
                                                  :collection_id (random-keyword "coll" 100)
                                                  :creator_id    (random-keyword "u" 10)})}]]
         :dashboard               [[100 {:refs {:collection_id   (random-keyword "coll" 100)
                                                :creator_id      (random-keyword "u" 10)}}]]
         :dashboard-card          [[300 {:refs {:card_id      (random-keyword "c" 100)
                                                :dashboard_id (random-keyword "d" 100)}}]]
         :dimension               [;; 20 with both IDs set
                                   [20 {:refs {:field_id                (random-keyword "field" 1000)
                                               :human_readable_field_id (random-keyword "field" 1000)}}]
                                   ;; 20 with just :field_id
                                   [20 {:refs {:field_id                (random-keyword "field" 1000)
                                               :human_readable_field_id ::rs/omit}}]]
         :metric                  [[30 {:refs {:table_id   (random-keyword "t" 100)
                                               :creator_id (random-keyword "u" 10)}}]]
         :segment                 [[30 {:refs {:table_id   (random-keyword "t" 100)
                                               :creator_id (random-keyword "u" 10)}}]]
         :native-query-snippet    [[10 {:refs {:creator_id    (random-keyword "u" 10)
                                               :collection_id (random-keyword "coll" 10 100)}}]]
         :timeline                [[10 {:refs {:creator_id    (random-keyword "u" 10)
                                               :collection_id (random-keyword "coll" 100)}}]]
         :timeline-event          [[90 {:refs {:timeline_id   (random-keyword "timeline" 10)}}]]
         :pulse                   [[10 {:refs {:collection_id (random-keyword "coll" 100)}}]
                                   [10 {:refs {:collection_id ::rs/omit}}]
                                   [10 {:refs {:collection_id ::rs/omit
                                               :dashboard_id  (random-keyword "d" 100)}}]]
         :pulse-card              [[60 {:refs {:card_id       (random-keyword "c" 100)
                                               :pulse_id      (random-keyword "pulse" 10)}}]
                                   [60 {:refs {:card_id       (random-keyword "c" 100)
                                               :pulse_id      (random-keyword "pulse" 10 20)
                                               :dashboard_card_id (random-keyword "dc" 300)}}]]
         :pulse-channel           [[15 {:refs {:pulse_id      (random-keyword "pulse" 10)}}]
                                   [15 {:refs {:pulse_id      (random-keyword "pulse" 10 20)}}]]
         :pulse-channel-recipient [[40 {:refs {:pulse_channel_id (random-keyword "pulse-channel" 30)
                                               :user_id          (random-keyword "u" 10)}}]]})
      (let [extraction (into [] (extract/extract-metabase {}))
            entities   (reduce (fn [m entity]
                                 (update m (-> entity :serdes/meta last :model)
                                         (fnil conj []) entity))
                               {} extraction)]
        (is (= 110 (-> entities (get "Collection") count)))

        (testing "storage"
          (storage.yaml/store! (seq extraction) dump-dir)
          (testing "for Collections"
            (is (= 110 (count (dir->file-set (io/file dump-dir "Collection")))))
            (doseq [{:keys [entity_id slug] :as coll} (get entities "Collection")
                    :let [filename (#'u.yaml/leaf-file-name entity_id slug)]]
              (is (= (dissoc coll :serdes/meta)
                     (yaml/from-file (io/file dump-dir "Collection" filename))))))

          (testing "for Databases"
            (is (= 10 (count (dir->file-set (io/file dump-dir "Database")))))
            (doseq [{:keys [name] :as coll} (get entities "Database")
                    :let [filename (#'u.yaml/leaf-file-name name)]]
              (is (= (-> coll
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Database" filename))))))

          (testing "for Tables"
            (is (= 100
                   (reduce + (for [db    (get entities "Database")
                                   :let [tables (dir->file-set (io/file dump-dir "Database" (:name db) "Table"))]]
                               (count tables))))
                "Tables are scattered, so the directories are harder to count")

            (doseq [{:keys [db_id name] :as coll} (get entities "Table")]
              (is (= (-> coll
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Database" db_id "Table" (str name ".yaml")))))))

          (testing "for Fields"
            (is (= 1000
                   (reduce + (for [db    (get entities "Database")
                                   table (subdirs (io/file dump-dir "Database" (:name db) "Table"))]
                               (->> (io/file table "Field")
                                    dir->file-set
                                    count))))
                "Fields are scattered, so the directories are harder to count")

            (doseq [{[db schema table] :table_id name :name :as coll} (get entities "Field")]
              (is (nil? schema))
              (is (= (-> coll
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Database" db "Table" table "Field" (str name ".yaml")))))))

          (testing "for cards"
            (is (= 100 (count (dir->file-set (io/file dump-dir "Card")))))
            (doseq [{:keys [entity_id] :as card} (get entities "Card")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> card
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Card" filename))))))

          (testing "for dashboards"
            (is (= 100 (count (dir->file-set (io/file dump-dir "Dashboard")))))
            (doseq [{:keys [entity_id] :as dash} (get entities "Dashboard")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> dash
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Dashboard" filename))))))

          (testing "for dashboard cards"
            (is (= 300
                   (reduce + (for [dash (get entities "Dashboard")
                                   :let [card-dir (io/file dump-dir "Dashboard" (:entity_id dash) "DashboardCard")]]
                               (if (.exists card-dir)
                                 (count (dir->file-set card-dir))
                                 0)))))

            (doseq [{:keys [dashboard_id entity_id]
                     :as   dashcard}                (get entities "DashboardCard")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> dashcard
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Dashboard" dashboard_id "DashboardCard" filename))))))

          (testing "for dimensions"
            (is (= 40 (count (dir->file-set (io/file dump-dir "Dimension")))))
            (doseq [{:keys [entity_id] :as dim} (get entities "Dimension")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> dim
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Dimension" filename))))))

          (testing "for metrics"
            (is (= 30 (count (dir->file-set (io/file dump-dir "Metric")))))
            (doseq [{:keys [entity_id name] :as metric} (get entities "Metric")
                    :let [filename (#'u.yaml/leaf-file-name entity_id name)]]
              (is (= (-> metric
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Metric" filename))))))

          (testing "for segments"
            (is (= 30 (count (dir->file-set (io/file dump-dir "Segment")))))
            (doseq [{:keys [entity_id name] :as segment} (get entities "Segment")
                    :let [filename (#'u.yaml/leaf-file-name entity_id name)]]
              (is (= (-> segment
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Segment" filename))))))

          (testing "for pulses"
            (is (= 30 (count (dir->file-set (io/file dump-dir "Pulse")))))
            (doseq [{:keys [entity_id] :as pulse} (get entities "Pulse")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> pulse
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Pulse" filename))))))

          (testing "for pulse cards"
            (is (= 120 (reduce + (for [pulse (get entities "Pulse")]
                                   (->> (io/file dump-dir "Pulse" (:entity_id pulse) "PulseCard")
                                        dir->file-set
                                        count)))))
            (doseq [{:keys [entity_id pulse_id] :as card} (get entities "PulseCard")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> card
                         (dissoc :serdes/meta))
                     (yaml/from-file (io/file dump-dir "Pulse" pulse_id "PulseCard" filename))))))

          (testing "for pulse channels"
            (is (= 30 (reduce + (for [pulse (get entities "Pulse")]
                                  (->> (io/file dump-dir "Pulse" (:entity_id pulse) "PulseChannel")
                                       dir->file-set
                                       count)))))
            (is (= 40 (reduce + (for [{:keys [recipients]} (get entities "PulseChannel")]
                                  (count recipients)))))
            (doseq [{:keys [entity_id pulse_id] :as channel} (get entities "PulseChannel")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> channel
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Pulse" pulse_id "PulseChannel" filename))))))

          (testing "for native query snippets"
            (is (= 10 (count (dir->file-set (io/file dump-dir "NativeQuerySnippet")))))
            (doseq [{:keys [entity_id name] :as snippet} (get entities "NativeQuerySnippet")
                    :let [filename (#'u.yaml/leaf-file-name entity_id name)]]
              (is (= (-> snippet
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "NativeQuerySnippet" filename))))))

          (testing "for timelines and events"
            (is (= 10 (count (dir->file-set (io/file dump-dir "Timeline")))))
            (doseq [{:keys [entity_id] :as timeline} (get entities "Timeline")
                    :let [filename (#'u.yaml/leaf-file-name entity_id)]]
              (is (= (-> timeline
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Timeline" filename)))))

            (is (= 90 (reduce + (for [timeline (get entities "Timeline")]
                                  (->> (io/file dump-dir "Timeline" (:entity_id timeline) "TimelineEvent")
                                       dir->file-set
                                       count)))))
            (doseq [{:keys [name timeline_id timestamp] :as event} (get entities "TimelineEvent")
                    :let [filename (#'u.yaml/leaf-file-name timestamp name)]]
              (is (= (-> event
                         (dissoc :serdes/meta)
                         (update :created_at u.date/format)
                         (update :updated_at u.date/format))
                     (yaml/from-file (io/file dump-dir "Timeline" timeline_id "TimelineEvent" filename))))))

          (testing "for settings"
            (is (= (into {} (for [{:keys [key value]} (get entities "Setting")]
                              [key value]))
                   (yaml/from-file (io/file dump-dir "settings.yaml"))))))

        (testing "ingestion"
          (let [ingestable (ingest.yaml/ingest-yaml dump-dir)]
            (testing "ingest-list is accurate"
              (is (= (into #{} (comp cat
                                     (map (fn [entity]
                                            (mapv #(cond-> %
                                                     (:label %) (update :label #'u.yaml/truncate-label))
                                                  (serdes.base/serdes-path entity)))))
                           (vals entities))
                     (into #{} (ingest/ingest-list ingestable)))))


            (testing "each entity matches its in-memory original"
              (doseq [entity extraction]
                (let [->utc   #(t/zoned-date-time % (ZoneId/of "UTC"))]
                  (is (= (cond-> entity
                           true                                       (update :serdes/meta strip-labels)
                           ;; TIMESTAMP WITH TIME ZONE columns come out of the database as OffsetDateTime, but read back
                           ;; from YAML as ZonedDateTimes; coerce the expected value to match.
                           (t/offset-date-time? (:created_at entity)) (update :created_at ->utc)
                           (t/offset-date-time? (:updated_at entity)) (update :updated_at ->utc))
                         (ingest/ingest-one ingestable (serdes.base/serdes-path entity)))))))))))))
