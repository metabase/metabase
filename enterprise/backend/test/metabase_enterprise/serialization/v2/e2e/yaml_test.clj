(ns ^:mb/once metabase-enterprise.serialization.v2.e2e.yaml-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest.yaml :as ingest.yaml]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage.yaml :as storage.yaml]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.test.generate :as test-gen]
   [reifyhealth.specmonstah.core :as rs]
   [toucan.db :as db]
   [yaml.core :as yaml]))

(defn- dir->contents-set [p dir]
  (->> dir
       .listFiles
       (filter p)
       (map #(.getName %))
       set))

(defn- dir->file-set [dir]
  (dir->contents-set #(.isFile %) dir))

(defn- dir->dir-set [dir]
  (dir->contents-set #(.isDirectory %) dir))

(defn- subdirs [dir]
  (->> dir
       .listFiles
       (remove #(.isFile %))))

(defn- collections [dir]
  (for [coll-dir (subdirs dir)
        :when (->> ["cards" "dashboards" "timelines"]
                   (map #(io/file coll-dir %))
                   (filter #(= % coll-dir))
                   empty?)]
    coll-dir))

(defn- file-set [dir]
  (let [base (.toPath dir)]
    (set (for [file (file-seq dir)
               :when (.isFile file)
               :let [rel (.relativize base (.toPath file))]]
           (mapv str rel)))))

(defn- random-keyword
  ([prefix n] (random-keyword prefix n 0))
  ([prefix n floor] (keyword (str (name prefix) (+ floor (rand-int n))))))

(defn- random-fks
  "Generates a specmonstah query with the :refs populated with the randomized bindings.
  `(random-fks {:spec-gen {:foo :bar}}
               {:creator_id [:u 10]
                :db_id      [:db 20 15]})`
  this will return a query like:
  `{:spec-gen {:foo :bar}
    :refs {:creator_id :u6  :db_id 17}}`

  The bindings map has the same keys as `:refs`, but the values are `[base-keyword width]` pairs or
  `[base-keyword width floor]` triples. These are passed to [[random-keyword]]."
  [base bindings]
  (update base :refs merge (m/map-vals #(apply random-keyword %) bindings)))

(defn- many-random-fks [n base bindings]
  (vec (repeatedly n #(vector 1 (random-fks base bindings)))))

(defn- table->db [{:keys [table_id] :as refs}]
  (let [table-number (-> table_id
                         name
                         (subs 1)
                         (Integer/parseInt))]
    (assoc refs :database_id (keyword (str "db" (quot table-number 10))))))

(defn- clean-entity
 "Removes any comparison-confounding fields, like `:created_at`."
 [entity]
 (dissoc entity :created_at))

(deftest e2e-storage-ingestion-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (let [extraction (atom nil)
          entities   (atom nil)]
      (ts/with-source-and-dest-dbs
        ;; TODO Generating some nested collections would make these tests more robust, but that's difficult.
        ;; There are handwritten tests for storage and ingestion that check out the nesting, at least.
        (ts/with-source-db
          (testing "insert"
            (test-gen/insert!
              {:collection              [[100 {:refs     {:personal_owner_id ::rs/omit}}]
                                         [10  {:refs     {:personal_owner_id ::rs/omit}
                                               :spec-gen {:namespace :snippets}}]]
               :database                [[10]]
               ;; Tables are special - we define table 0-9 under db0, 10-19 under db1, etc. The :card spec below
               ;; depends on this relationship.
               :table                   (into [] (for [db [:db0 :db1 :db2 :db3 :db4 :db5 :db6 :db7 :db8 :db9]]
                                                   [10 {:refs {:db_id db}}]))
               :field                   (many-random-fks 1000 {} {:table_id [:t 100]})
               :core-user               [[100]]
               :card                    (mapv #(update-in % [1 :refs] table->db)
                                              (many-random-fks
                                                100
                                                {:spec-gen {:dataset_query {:database 1
                                                                            :query {:source-table 3
                                                                                    :aggregation [[:count]]
                                                                                    :breakout [[:field 16 nil]]}
                                                                            :type :query}}}
                                                {:table_id      [:t    100]
                                                 :collection_id [:coll 100]
                                                 :creator_id    [:u    10]}))
               :dashboard               (many-random-fks 100 {} {:collection_id [:coll 100]
                                                                 :creator_id    [:u    10]})
               :dashboard-card          (many-random-fks 300 {} {:card_id      [:c 100]
                                                                 :dashboard_id [:d 100]})
               :dimension               (vec (concat
                                               ;; 20 with both IDs set
                                               (many-random-fks 20 {}
                                                                {:field_id                [:field 1000]
                                                                 :human_readable_field_id [:field 1000]})
                                               ;; 20 with just :field_id
                                               (many-random-fks 20 {:refs {:human_readable_field_id ::rs/omit}}
                                                                {:field_id [:field 1000]})))
               :metric                  (many-random-fks 30 {:spec-gen {:definition {:aggregation  [[:count]]
                                                                                     :source-table 9}}}
                                                         {:table_id   [:t 100]
                                                          :creator_id [:u 10]})
               :segment                 (many-random-fks 30 {:spec-gen {:definition {:filter [:!= [:field 60 nil] 50],
                                                                                     :source-table 4}}}
                                                         {:table_id   [:t 100]
                                                          :creator_id [:u 10]})
               :native-query-snippet    (many-random-fks 10 {} {:creator_id    [:u 10]
                                                                :collection_id [:coll 10 100]})
               :timeline                (many-random-fks 10 {} {:creator_id    [:u 10]
                                                                :collection_id [:coll 100]})
               :timeline-event          (many-random-fks 90 {} {:timeline_id   [:timeline 10]})
               :pulse                   (vec (concat
                                               ;; 10 classic pulses, from collections
                                               (many-random-fks 10 {} {:collection_id [:coll 100]})
                                               ;; 10 classic pulses, no collection
                                               (many-random-fks 10 {:refs {:collection_id ::rs/omit}} {})
                                               ;; 10 dashboard subs
                                               (many-random-fks 10 {:refs {:collection_id ::rs/omit}}
                                                                {:dashboard_id  [:d 100]})))
               :pulse-card              (vec (concat
                                               ;; 60 pulse cards for the classic pulses
                                               (many-random-fks 60 {} {:card_id       [:c 100]
                                                                       :pulse_id      [:pulse 10]})
                                               ;; 60 pulse cards connected to dashcards for the dashboard subs
                                               (many-random-fks 60 {} {:card_id           [:c 100]
                                                                       :pulse_id          [:pulse 10 20]
                                                                       :dashboard_card_id [:dc 300]})))
               :pulse-channel           (vec (concat
                                               ;; 15 channels for the classic pulses
                                               (many-random-fks 15 {} {:pulse_id  [:pulse 10]})
                                               ;; 15 channels for the dashboard subs
                                               (many-random-fks 15 {} {:pulse_id  [:pulse 10 20]})))
               :pulse-channel-recipient (many-random-fks 40 {} {:pulse_channel_id [:pulse-channel 30]
                                                                :user_id          [:u 100]})}))

          (is (= 100 (count (db/select-field :email 'User))))

          (testing "extraction"
            (reset! extraction (into [] (extract/extract-metabase {})))
            (reset! entities   (reduce (fn [m entity]
                                         (update m (-> entity :serdes/meta last :model)
                                                 (fnil conj []) entity))
                                       {} @extraction))
            (is (= 110 (-> @entities (get "Collection") count))))

          (testing "storage"
            (storage.yaml/store! (seq @extraction) dump-dir)

            (testing "for Collections"
              (is (= 110 (count (for [f (file-set (io/file dump-dir))
                                      :when (and (= (first f) "collections")
                                                 (let [[a b] (take-last 2 f)]
                                                   (= b (str a ".yaml"))))]
                                  f)))
                  "which all go in collections/, even the snippets ones"))

            (testing "for Databases"
              (is (= 10 (count (dir->dir-set (io/file dump-dir "databases"))))))

            (testing "for Tables"
              (is (= 100
                     (reduce + (for [db    (get @entities "Database")
                                     :let [tables (dir->dir-set (io/file dump-dir "databases" (:name db) "tables"))]]
                                 (count tables))))
                  "Tables are scattered, so the directories are harder to count"))

            (testing "for Fields"
              (is (= 1000
                     (reduce + (for [db    (get @entities "Database")
                                     table (subdirs (io/file dump-dir "databases" (:name db) "tables"))]
                                 (->> (io/file table "fields")
                                      dir->file-set
                                      count))))
                  "Fields are scattered, so the directories are harder to count"))

            (testing "for cards"
              (is (= 100 (->> (io/file dump-dir "collections")
                              collections
                              (map (comp count dir->file-set #(io/file % "cards")))
                              (reduce +)))))

            (testing "for dashboards"
              (is (= 100 (->> (io/file dump-dir "collections")
                              collections
                              (map (comp count dir->file-set #(io/file % "dashboards")))
                              (reduce +)))))

            (testing "for timelines"
              (is (= 10 (->> (io/file dump-dir "collections")
                             collections
                             (map (comp count dir->file-set #(io/file % "timelines")))
                             (reduce +)))))

            (testing "for metrics"
              (is (= 30 (reduce + (for [db    (dir->dir-set (io/file dump-dir "databases"))
                                        table (dir->dir-set (io/file dump-dir "databases" db "tables"))
                                        :let [metrics-dir (io/file dump-dir "databases" db "tables" table "metrics")]
                                        :when (.exists metrics-dir)]
                                    (count (dir->file-set metrics-dir)))))))

            (testing "for segments"
              (is (= 30 (reduce + (for [db    (dir->dir-set (io/file dump-dir "databases"))
                                        table (dir->dir-set (io/file dump-dir "databases" db "tables"))
                                        :let [segments-dir (io/file dump-dir "databases" db "tables" table "segments")]
                                        :when (.exists segments-dir)]
                                    (count (dir->file-set segments-dir)))))))

            (testing "for native query snippets"
              (is (= 10 (->> (io/file dump-dir "snippets")
                             collections
                             (map (comp count dir->file-set))
                             (reduce +)))))

            (testing "for settings"
              (is (.exists (io/file dump-dir "settings.yaml")))))

         (testing "ingest and load"
           (ts/with-dest-db
             (testing "ingested set matches extracted set"
               (let [extracted-set (set (map (comp #'ingest.yaml/strip-labels serdes.base/serdes-path) @extraction))]
                 (is (= (count extracted-set)
                        (count @extraction)))
                 (is (= extracted-set
                      (set (keys (#'ingest.yaml/ingest-all (io/file dump-dir))))))))

             (testing "doing ingestion"
               (is (serdes.load/load-metabase (ingest.yaml/ingest-yaml dump-dir))
                   "successful"))

             (testing "for Collections"
               (doseq [{:keys [entity_id] :as coll} (get @entities "Collection")]
                 (is (= (clean-entity coll)
                        (->> (db/select-one 'Collection :entity_id entity_id)
                             (serdes.base/extract-one "Collection" {})
                             clean-entity)))))

             (testing "for Databases"
               (doseq [{:keys [name] :as coll} (get @entities "Database")]
                 (is (= (clean-entity coll)
                        (->> (db/select-one 'Database :name name)
                             (serdes.base/extract-one "Database" {})
                             clean-entity)))))

             (testing "for Tables"
               (doseq [{:keys [db_id name] :as coll} (get @entities "Table")]
                 (is (= (clean-entity coll)
                        (->> (db/select-one-field :id 'Database :name db_id)
                             (db/select-one 'Table :name name :db_id)
                             (serdes.base/extract-one "Table" {})
                             clean-entity)))))

             (testing "for Fields"
               (doseq [{[db schema table] :table_id name :name :as coll} (get @entities "Field")]
                 (is (nil? schema))
                 (is (= (clean-entity coll)
                        (->> (db/select-one-field :id 'Database :name db)
                             (db/select-one-field :id 'Table :schema schema :name table :db_id)
                             (db/select-one 'Field :name name :table_id)
                             (serdes.base/extract-one "Field" {})
                             clean-entity)))))

             (testing "for cards"
               (doseq [{:keys [entity_id] :as card} (get @entities "Card")]
                 (is (= (clean-entity card)
                        (->> (db/select-one 'Card :entity_id entity_id)
                             (serdes.base/extract-one "Card" {})
                             clean-entity)))))

             (testing "for dashboards"
               (doseq [{:keys [entity_id] :as dash} (get @entities "Dashboard")]
                 (is (= (clean-entity dash)
                        (->> (db/select-one 'Dashboard :entity_id entity_id)
                             (serdes.base/extract-one "Dashboard" {})
                             clean-entity)))))

             (testing "for dashboard cards"
               (doseq [{:keys [entity_id] :as dashcard} (get @entities "DashboardCard")]
                 (is (= (clean-entity dashcard)
                        (->> (db/select-one 'DashboardCard :entity_id entity_id)
                             (serdes.base/extract-one "DashboardCard" {})
                             clean-entity)))))

             (testing "for dimensions"
               (doseq [{:keys [entity_id] :as dim} (get @entities "Dimension")]
                 (is (= (clean-entity dim)
                        (->> (db/select-one 'Dimension :entity_id entity_id)
                             (serdes.base/extract-one "Dimension" {})
                             clean-entity)))))

             (testing "for metrics"
               (doseq [{:keys [entity_id] :as metric} (get @entities "Metric")]
                 (is (= (clean-entity metric)
                        (->> (db/select-one 'Metric :entity_id entity_id)
                             (serdes.base/extract-one "Metric" {})
                             clean-entity)))))

             (testing "for segments"
               (doseq [{:keys [entity_id] :as segment} (get @entities "Segment")]
                 (is (= (clean-entity segment)
                        (->> (db/select-one 'Segment :entity_id entity_id)
                             (serdes.base/extract-one "Segment" {})
                             clean-entity)))))

             (testing "for native query snippets"
               (doseq [{:keys [entity_id] :as snippet} (get @entities "NativeQuerySnippet")]
                 (is (= (clean-entity snippet)
                        (->> (db/select-one 'NativeQuerySnippet :entity_id entity_id)
                             (serdes.base/extract-one "NativeQuerySnippet" {})
                             clean-entity)))))

             (testing "for timelines and events"
               (doseq [{:keys [entity_id] :as timeline} (get @entities "Timeline")]
                 (is (= (clean-entity timeline)
                        (->> (db/select-one 'Timeline :entity_id entity_id)
                             (serdes.base/extract-one "Timeline" {})
                             clean-entity)))))

             (testing "for settings"
               (is (= (into {} (for [{:keys [key value]} (get @entities "Setting")]
                                 [key value]))
                      (yaml/from-file (io/file dump-dir "settings.yaml"))))))))))))
