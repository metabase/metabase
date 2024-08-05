(ns ^:mb/once metabase-enterprise.serialization.v2.e2e-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.serialization.cmd :as cmd]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.models :refer [Card
                            Collection
                            Dashboard
                            DashboardCard
                            Database
                            Field
                            ParameterCard
                            Table]]
   [metabase.models.action :as action]
   [metabase.models.serialization :as serdes]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.generate :as test-gen]
   [metabase.util.yaml :as yaml]
   [reifyhealth.specmonstah.core :as rs]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.io File)
   (java.nio.file Path)))

(set! *warn-on-reflection* true)

(defn- dir->contents-set [p ^File dir]
  (->> dir
       .listFiles
       (filter p)
       (map #(.getName ^File %))
       set))

(defn- dir->file-set [^File dir]
  (dir->contents-set #(.isFile ^File %) dir))

(defn- dir->dir-set [^File dir]
  (dir->contents-set #(.isDirectory ^File %) dir))

(defn- subdirs [^File dir]
  (->> dir
       .listFiles
       (remove #(.isFile ^File %))))

(defn- by-model [entities model-name]
  (filter #(-> % :serdes/meta last :model (= model-name))
          entities))

(defn- collections [dir]
  (for [coll-dir (subdirs dir)
        :when (->> ["cards" "dashboards" "timelines"]
                   (map #(io/file coll-dir %))
                   (filter #(= % coll-dir))
                   empty?)]
    coll-dir))

(defn- file-set [^File dir]
  (let [^Path base (.toPath dir)]
    (set (for [^File file (file-seq dir)
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
 (dissoc entity :created_at :result_metadata :metadata_sync_schedule :cache_field_values_schedule))

#_{:clj-kondo/ignore [:metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]}
(deftest e2e-storage-ingestion-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (let [extraction (atom nil)
          entities   (atom nil)]
      (ts/with-dbs [source-db dest-db]
        ;; TODO Generating some nested collections would make these tests more robust, but that's difficult.
        ;; There are handwritten tests for storage and ingestion that check out the nesting, at least.
        (ts/with-db source-db
          (testing "insert"
            (test-gen/insert!
              {;; Actions are special case where there is a 1:1 relationship between an action and an action subtype (query, implicit, or http)
               ;; We generate 10 actions for each subtype, and 10 of each subtype.
               ;; actions 0-9 are query actions, 10-19 are implicit actions, and 20-29 are http actions.
               :action                  (apply concat
                                               (for [type [:query :implicit :http]]
                                                 (many-random-fks 10
                                                                  {:spec-gen {:type type}}
                                                                  {:model_id   [:sm 10]
                                                                   :creator_id [:u 10]})))
               :query-action            (map-indexed
                                         (fn [idx x]
                                           (assoc-in x [1 :refs :action_id] (keyword (str "action" idx))))
                                         (many-random-fks 10 {} {:database_id [:db 10]}))
               :implicit-action         (map-indexed
                                         (fn [idx x]
                                           (update-in x [1 :refs]
                                                      (fn [refs]
                                                        (assoc refs :action_id (keyword (str "action" (+ 10 idx)))))))
                                         (many-random-fks 10 {} {}))
               :http-action             (map-indexed
                                         (fn [idx x]
                                           (update-in x [1 :refs]
                                                      (fn [refs]
                                                        (assoc refs :action_id (keyword (str "action" (+ 20 idx)))))))
                                         (many-random-fks 10 {} {}))
               :collection              [[100 {:refs     {:personal_owner_id ::rs/omit}}]
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
                                                                           :type     :native
                                                                           :native   {:query "SELECT * FROM whatever;"}}
                                                           :type          :model}}
                                               {:table_id      [:t    100]
                                                :collection_id [:coll 100]
                                                :creator_id    [:u    10]}))
               ;; Simple model is primary used for actions.
               ;; We can't use :card for actions because implicit actions require the model's query to contain
               ;; nothing but a source table
               :simple-model            (mapv #(update-in % [1 :refs] table->db)
                                               (many-random-fks
                                                10
                                                {:spec-gen {:dataset_query {:database 1
                                                                            :query {:source-table 3}
                                                                            :type :query}
                                                            :type          :model}}
                                                {:table_id      [:t    10]
                                                 :collection_id [:coll 10]
                                                 :creator_id    [:u    10]}))
               :dashboard               (concat (many-random-fks 100 {} {:collection_id [:coll 100]
                                                                         :creator_id    [:u    10]})
                                                ;; create some root collection dashboards
                                                (many-random-fks 50 {} {:creator_id    [:u 10]}))
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

          (is (= 101 (count (t2/select-fn-set :email 'User)))) ; +1 for the internal user

          (testing "extraction"
            (reset! extraction (serdes/with-cache (into [] (extract/extract {}))))
            (reset! entities   (reduce (fn [m entity]
                                         (update m (-> entity :serdes/meta last :model)
                                                 (fnil conj []) entity))
                                       {} @extraction))
            ;; +1 for the Trash collection
            (is (= 110 (-> @entities (get "Collection") count))))

          (testing "storage"
            (storage/store! (seq @extraction) dump-dir)

            (testing "for Actions"
              (is (= 30 (count (dir->file-set (io/file dump-dir "actions"))))))

            (testing "for Collections"
              ;; +1 for the Trash collection
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
              ;; 100 from card, and 10 from simple-model
              (is (= 110 (->> (io/file dump-dir "collections")
                              collections
                              (map (comp count dir->file-set #(io/file % "cards")))
                              (reduce +)))))

            (testing "for dashboards"
              (is (= 150 (->> (io/file dump-dir "collections")
                              collections
                              (map (comp count dir->file-set #(io/file % "dashboards")))
                              (reduce +)))))

            (testing "for timelines"
              (is (= 10 (->> (io/file dump-dir "collections")
                             collections
                             (map (comp count dir->file-set #(io/file % "timelines")))
                             (reduce +)))))

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
            (ts/with-db dest-db
              (testing "ingested set matches extracted set"
                (let [extracted-set (set (map (comp #'ingest/strip-labels serdes/path) @extraction))]
                  (is (= (count extracted-set)
                         (count @extraction)))
                  (is (= extracted-set
                         (set (ingest/ingest-list (ingest/ingest-yaml dump-dir)))))))

              (testing "doing ingestion"
                (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
                    "successful"))

              (testing "for Actions"
                (doseq [{:keys [entity_id] :as coll} (get @entities "Action")]
                  (is (= (clean-entity coll)
                         (->> (t2/select-one 'Action :entity_id entity_id)
                              (@#'action/hydrate-subtype)
                              (serdes/extract-one "Action" {})
                              clean-entity)))))

              (testing "for Collections"
                (doseq [{:keys [entity_id] :as coll} (get @entities "Collection")]
                  (is (= (clean-entity coll)
                         (->> (t2/select-one 'Collection :entity_id entity_id)
                              (serdes/extract-one "Collection" {})
                              clean-entity)))))

              (testing "for Databases"
                (doseq [{:keys [name] :as db} (get @entities "Database")]
                  (is (= (assoc (clean-entity db) :initial_sync_status "complete")
                         (->> (t2/select-one 'Database :name name)
                              (serdes/extract-one "Database" {})
                              clean-entity)))))

              (testing "for Tables"
                (doseq [{:keys [db_id name] :as coll} (get @entities "Table")]
                  (is (= (clean-entity coll)
                         (->> (t2/select-one-fn :id 'Database :name db_id)
                              (t2/select-one 'Table :name name :db_id)
                              (serdes/extract-one "Table" {})
                              clean-entity)))))

              (testing "for Fields"
                (doseq [{[db schema table] :table_id name :name :as coll} (get @entities "Field")]
                  (is (nil? schema))
                  (is (= (clean-entity coll)
                         (->> (t2/select-one-fn :id 'Database :name db)
                              (t2/select-one-fn :id 'Table :schema schema :name table :db_id)
                              (t2/select-one 'Field :name name :table_id)
                              (serdes/extract-one "Field" {})
                              clean-entity)))))

              (testing "for cards"
                (doseq [{:keys [entity_id] :as card} (get @entities "Card")]
                  (is (= (clean-entity card)
                         (->> (t2/select-one 'Card :entity_id entity_id)
                              (serdes/extract-one "Card" {})
                              clean-entity)))))

              (testing "for dashboards"
                (doseq [{:keys [entity_id] :as dash} (get @entities "Dashboard")]
                  (is (= (clean-entity dash)
                         (->> (t2/select-one 'Dashboard :entity_id entity_id)
                              (serdes/extract-one "Dashboard" {})
                              clean-entity)))))

              (testing "for dashboard cards"
                (doseq [{:keys [entity_id] :as dashcard} (get @entities "DashboardCard")]
                  (is (= (clean-entity dashcard)
                         (->> (t2/select-one 'DashboardCard :entity_id entity_id)
                              (serdes/extract-one "DashboardCard" {})
                              clean-entity)))))

              (testing "for dimensions"
                (doseq [{:keys [entity_id] :as dim} (get @entities "Dimension")]
                  (is (= (clean-entity dim)
                         (->> (t2/select-one 'Dimension :entity_id entity_id)
                              (serdes/extract-one "Dimension" {})
                              clean-entity)))))

              (testing "for segments"
                (doseq [{:keys [entity_id] :as segment} (get @entities "Segment")]
                  (is (= (clean-entity segment)
                         (->> (t2/select-one 'Segment :entity_id entity_id)
                              (serdes/extract-one "Segment" {})
                              clean-entity)))))

              (testing "for native query snippets"
                (doseq [{:keys [entity_id] :as snippet} (get @entities "NativeQuerySnippet")]
                  (is (= (clean-entity snippet)
                         (->> (t2/select-one 'NativeQuerySnippet :entity_id entity_id)
                              (serdes/extract-one "NativeQuerySnippet" {})
                              clean-entity)))))

              (testing "for timelines and events"
                (doseq [{:keys [entity_id] :as timeline} (get @entities "Timeline")]
                  (is (= (clean-entity timeline)
                         (->> (t2/select-one 'Timeline :entity_id entity_id)
                              (serdes/extract-one "Timeline" {})
                              clean-entity)))))

              (testing "for settings"
                (let [settings (get @entities "Setting")]
                  (is (every? @#'setting/export?
                              (set (map (comp symbol :key) settings))))
                  (is (= (into {} (for [{:keys [key value]} settings]
                                    [key value]))
                         (yaml/from-file (io/file dump-dir "settings.yaml")))))))))))))

;; This is a seperate test instead of a `testing` block inside `e2e-storage-ingestion-test`
;; because it's quite tricky to set up the generative test to generate parameters with source is card
(deftest card-and-dashboard-has-parameter-with-source-is-card-test
  (testing "Dashboard and Card that has parameter with source is a card must be deserialized correctly"
    (ts/with-random-dump-dir [dump-dir "serdesv2-"]
      (ts/with-dbs [source-db dest-db]
        (ts/with-db source-db
          ;; preparation
          (mt/test-helpers-set-global-values!
            (mt/with-temp
              [Database   db1s {:name "my-db"}
               Collection coll1s {:name "My Collection"}
               Table      table1s {:name  "CUSTOMERS"
                                   :db_id (:id db1s)}
               Field      field1s {:name     (mt/random-name)
                                   :table_id (:id table1s)}
               Card       card1s  {:name (mt/random-name)}
               Card       card2s  {:name          "Card with parameter"
                                   :database_id   (:id db1s)
                                   :table_id      (:id table1s)
                                   :collection_id (:id coll1s)
                                   :parameters    [{:id                   "abc"
                                                    :type                 "category"
                                                    :name                 "CATEGORY"
                                                    :values_source_type   "card"
                                                    ;; card_id is in a different collection with dashboard's collection
                                                    :values_source_config {:card_id     (:id card1s)
                                                                           :value_field [:field (:id field1s) nil]}}]}
               Dashboard  dash1s {:name          (mt/random-name)
                                  :collection_id (:id coll1s)
                                  :parameters    [{:id                   "abc"
                                                   :type                 "category"
                                                   :name                 "CATEGORY"
                                                   :values_source_type   "card"
                                                   ;; card_id is in a different collection with dashboard's collection
                                                   :values_source_config {:card_id     (:id card1s)
                                                                          :value_field [:field (:id field1s) nil]}}]}]

              (testing "make sure we insert ParameterCard when insert Dashboard/Card"
                ;; one for parameter on card card2s, and one for parmeter on dashboard dash1s
                (is (= 2 (t2/count ParameterCard))))

              (testing "extract and store"
                (let [extraction (serdes/with-cache (into [] (extract/extract {})))]
                  (is (= [{:id                   "abc",
                           :name                 "CATEGORY",
                           :type                 :category,
                           :values_source_config {:card_id     (:entity_id card1s),
                                                  :value_field [:field
                                                                ["my-db" nil "CUSTOMERS" (:name field1s)]
                                                                nil]},
                           :values_source_type   "card"}]
                         (:parameters (first (by-model extraction "Dashboard")))))

                  ;; card1s has no parameters, card2s does.
                  (is (= #{[]
                           [{:id                   "abc",
                             :name                 "CATEGORY",
                             :type                 :category,
                             :values_source_config {:card_id     (:entity_id card1s),
                                                    :value_field [:field
                                                                  ["my-db" nil "CUSTOMERS" (:name field1s)]
                                                                  nil]},
                             :values_source_type   "card"}]}
                         (set (map :parameters (by-model extraction "Card")))))

                  (storage/store! (seq extraction) dump-dir)))

             (testing "ingest and load"
               (ts/with-db dest-db
                 ;; ingest
                 (testing "doing ingestion"
                   (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
                       "successful"))

                 (let [dash1d  (t2/select-one Dashboard :name (:name dash1s))
                       card1d  (t2/select-one Card :name (:name card1s))
                       card2d  (t2/select-one Card :name (:name card2s))
                       field1d (t2/select-one Field :name (:name field1s))]
                   (testing "parameter on dashboard is loaded correctly"
                     (is (= {:card_id     (:id card1d),
                             :value_field [:field (:id field1d) nil]}
                            (-> dash1d
                                :parameters
                                first
                                :values_source_config)))
                     (is (some? (t2/select-one 'ParameterCard :parameterized_object_type "dashboard" :parameterized_object_id (:id dash1d)))))

                   (testing "parameter on card is loaded correctly"
                     (is (= {:card_id     (:id card1d),
                             :value_field [:field (:id field1d) nil]}
                            (-> card2d
                                :parameters
                                first
                                :values_source_config)))
                     (is (some? (t2/select-one 'ParameterCard :parameterized_object_type "card" :parameterized_object_id (:id card2d)))))))))))))))

(deftest dashcards-with-link-cards-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-dbs [source-db dest-db]
      (ts/with-db source-db
        (let [link-card-viz-setting (fn [model id]
                                      {:virtual_card {:display "link"}
                                       :link         {:entity {:id    id
                                                               :model model}}})
              dashboard->link-cards (fn [dashboard]
                                      (map #(get-in % [:visualization_settings :link :entity]) (:dashcards dashboard)))]
          (t2.with-temp/with-temp
            [Collection    {coll-id   :id
                            coll-name :name
                            coll-eid  :entity_id}    {:name        "Link collection"
                                                      :description "Linked Collection"}
             Database      {db-id   :id
                            db-name :name}           {:name        "Linked database"
                                                      :description "Linked database desc"}
             Table         {table-id   :id
                            table-name :name}        {:db_id        db-id
                                                      :schema      "Public"
                                                      :name        "Linked table"
                                                      :description "Linked table desc"}
             Card          {card-id   :id
                            card-name :name
                            card-eid  :entity_id}    {:name          "Linked card"
                                                      :description   "Linked card desc"
                                                      :display       "bar"}

             Card          {model-id   :id
                            model-name :name
                            model-eid  :entity_id}   {:type          :model
                                                      :name          "Linked model"
                                                      :description   "Linked model desc"
                                                      :display       "table"}

             Dashboard     {dash-id   :id
                            dash-name :name
                            dash-eid  :entity_id}    {:name          "Linked Dashboard"
                                                      :collection_id coll-id
                                                      :description   "Linked Dashboard desc"}
             Dashboard     {dashboard-id   :id
                            dashboard-name :name}    {:name          "Test Dashboard"
                                                      :collection_id coll-id}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "collection" coll-id)}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "database" db-id)}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "table" table-id)}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "dashboard" dash-id)}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "card" card-id)}
             DashboardCard _                         {:dashboard_id           dashboard-id
                                                      :visualization_settings (link-card-viz-setting "dataset" model-id)}]
            (testing "extract and store"
              (let [extraction          (serdes/with-cache (into [] (extract/extract {})))
                    extracted-dashboard (first (filter #(= (:name %) "Test Dashboard") (by-model extraction "Dashboard")))]
                (is (= [{:model "collection" :id coll-eid}
                        {:model "database"   :id "Linked database"}
                        {:model "table"      :id ["Linked database" "Public" "Linked table"]}
                        {:model "dashboard"  :id dash-eid}
                        {:model "card"       :id card-eid}
                        {:model "dataset"    :id model-eid}]
                       (dashboard->link-cards extracted-dashboard)))

               (is (= #{[{:id dash-eid          :model "Dashboard"}]
                        [{:id coll-eid          :model "Collection"}]
                        [{:id model-eid         :model "Card"}]
                        [{:id card-eid          :model "Card"}]
                        [{:id "Linked database" :model "Database"}]
                        [{:model "Database" :id "Linked database"}
                         {:model "Schema"   :id "Public"}
                         {:model "Table"    :id "Linked table"}]}
                    (set (serdes/dependencies extracted-dashboard))))

               (storage/store! (seq extraction) dump-dir)))

            (testing "ingest and load"
              ;; ingest
              (ts/with-db dest-db
                (testing "doing ingestion"
                  (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
                      "successful"))

                (doseq [[name model]
                        [[db-name    'Database]
                         [table-name 'Table]
                         [card-name  'Card]
                         [model-name 'Card]
                         [dash-name  'Dashboard]]]
                  (testing (format "model %s from link cards are loaded properly" model)
                   (is (some? (t2/select model :name name)))))

                (testing "linkcards are loaded with correct fk"
                  (let [new-db-id    (t2/select-one-pk Database :name db-name)
                        new-table-id (t2/select-one-pk Table :name table-name)
                        new-card-id  (t2/select-one-pk Card :name card-name)
                        new-model-id (t2/select-one-pk Card :name model-name)
                        new-dash-id  (t2/select-one-pk Dashboard :name dash-name)
                        new-coll-id  (t2/select-one-pk Collection :name coll-name)]
                    (is (= [{:id new-coll-id  :model "collection"}
                            {:id new-db-id    :model "database"}
                            {:id new-table-id :model "table"}
                            {:id new-dash-id  :model "dashboard"}
                            {:id new-card-id  :model "card"}
                            {:id new-model-id :model "dataset"}]
                           (-> (t2/select-one Dashboard :name dashboard-name)
                               (t2/hydrate :dashcards)
                               dashboard->link-cards)))))))))))))

(deftest dashcards-with-series-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (ts/with-dbs [source-db dest-db]
      (ts/with-db source-db
        (mt/with-temp
          [:model/Collection {coll-id :id} {:name "Some Collection"}
           :model/Card {c1-id :id :as c1} {:name "Some Question", :collection_id coll-id}
           :model/Card {c2-id :id :as c2} {:name "Series Question A", :collection_id coll-id}
           :model/Card {c3-id :id :as c3} {:name "Series Question B", :collection_id coll-id}
           :model/Dashboard {dash-id :id :as dash} {:name "Shared Dashboard", :collection_id coll-id}
           :model/DashboardCard {dc1-id :id} {:card_id c1-id, :dashboard_id dash-id}
           :model/DashboardCard {dc2-id :id} {:card_id c2-id, :dashboard_id dash-id}
           :model/DashboardCardSeries _ {:card_id c3-id, :dashboardcard_id dc1-id, :position 1}
           :model/DashboardCardSeries _ {:card_id c2-id, :dashboardcard_id dc1-id, :position 0}]
          (testing "sense check what hydrated dashcards look like on the source DB"
            (let [hydrated-dashcards (-> (t2/select-one :model/Dashboard :name (:name dash))
                                         (t2/hydrate [:dashcards :series])
                                         :dashcards
                                         (->> (m/index-by :id)))]
              (is (=? {dc1-id {:series [{:id c2-id}
                                        {:id c3-id}]}
                       dc2-id {:series []}}
                      hydrated-dashcards))))
          (testing "extract and store"
            (let [extraction (serdes/with-cache (into [] (extract/extract {})))]
              (storage/store! (seq extraction) dump-dir)))
          (testing "ingest and load"
            (ts/with-db dest-db
              (testing "doing ingestion"
                (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
                    "successful"))
              (testing "Series are loaded correctly"
                (let [new-c1-id  (t2/select-one-pk :model/Card :name (:name c1))
                      new-c2-id  (t2/select-one-pk :model/Card :name (:name c2))
                      new-c3-id  (t2/select-one-pk :model/Card :name (:name c3))
                      new-dc1-id (t2/select-one-pk :model/DashboardCard :card_id new-c1-id)
                      new-dc2-id (t2/select-one-pk :model/DashboardCard :card_id new-c2-id)
                      new-hydrated-dashcards (-> (t2/select-one :model/Dashboard :name (:name dash))
                                                 (t2/hydrate [:dashcards :series])
                                                 :dashcards
                                                 (->> (m/index-by :id)))]
                  (is (some? new-c1-id))
                  (is (some? new-c2-id))
                  (is (some? new-c3-id))
                  (is (some? new-dc1-id))
                  (is (some? new-dc2-id))
                  (testing "Series hydrate on the dashboard correctly"
                    (is (=? {new-dc1-id {:series [{:id new-c2-id}
                                                  {:id new-c3-id}]}
                             new-dc2-id {:series []}}
                            new-hydrated-dashcards))))))))))))

(deftest dashboard-with-tabs-test
  (testing "Dashboard with tabs must be deserialized correctly"
    (ts/with-random-dump-dir [dump-dir "serdesv2-"]
     (ts/with-dbs [source-db dest-db]
       (ts/with-db source-db
         ;; preparation
         (t2.with-temp/with-temp
           [Dashboard           {dashboard-id :id
                                 dashboard-eid :entity_id} {:name "Dashboard with tab"}
            Card                {card-id-1 :id
                                 card-eid-1 :entity_id}    {:name "Card 1"}
            Card                {card-id-2 :id
                                 card-eid-2 :entity_id}    {:name "Card 2"}
            :model/DashboardTab {tab-id-1 :id
                                 tab-eid-1 :entity_id}     {:name "Tab 1" :position 0 :dashboard_id dashboard-id}
            :model/DashboardTab {tab-id-2 :id
                                 tab-eid-2 :entity_id}     {:name "Tab 2" :position 1 :dashboard_id dashboard-id}
            DashboardCard       _                          {:dashboard_id     dashboard-id
                                                            :card_id          card-id-1
                                                            :dashboard_tab_id tab-id-1}
            DashboardCard       _                          {:dashboard_id     dashboard-id
                                                            :card_id          card-id-2
                                                            :dashboard_tab_id tab-id-1}
            DashboardCard       _                          {:dashboard_id     dashboard-id
                                                            :card_id          card-id-1
                                                            :dashboard_tab_id tab-id-2}
            DashboardCard       _                          {:dashboard_id     dashboard-id
                                                            :card_id          card-id-2
                                                            :dashboard_tab_id tab-id-2}]
           (let [extraction (serdes/with-cache (into [] (extract/extract {})))]
             (storage/store! (seq extraction) dump-dir))

           (testing "ingest and load"
             (ts/with-db dest-db
               ;; ingest
               (testing "doing ingestion"
                 (is (serdes/with-cache (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir)))
                     "successful"))
               (let [new-dashboard (-> (t2/select-one Dashboard :entity_id dashboard-eid)
                                       (t2/hydrate :tabs :dashcards))
                     new-tab-id-1  (t2/select-one-pk :model/DashboardTab :entity_id tab-eid-1)
                     new-tab-id-2  (t2/select-one-pk :model/DashboardTab :entity_id tab-eid-2)
                     new-card-id-1 (t2/select-one-pk Card :entity_id card-eid-1)
                     new-card-id-2 (t2/select-one-pk Card :entity_id card-eid-2)]

                 (is (=? [{:id           new-tab-id-1
                           :dashboard_id (:id new-dashboard)
                           :name         "Tab 1"
                           :position     0}
                          {:id           new-tab-id-2
                           :dashboard_id (:id new-dashboard)
                           :name         "Tab 2"
                           :position     1}]
                         (:tabs new-dashboard)))
                 (is (=? [{:card_id          new-card-id-1
                           :dashboard_id     (:id new-dashboard)
                           :dashboard_tab_id new-tab-id-1}
                          {:card_id          new-card-id-2
                           :dashboard_id     (:id new-dashboard)
                           :dashboard_tab_id new-tab-id-1}
                          {:card_id          new-card-id-1
                           :dashboard_id     (:id new-dashboard)
                           :dashboard_tab_id new-tab-id-2}
                          {:card_id          new-card-id-2
                           :dashboard_id     (:id new-dashboard)
                           :dashboard_tab_id new-tab-id-2}]
                         (:dashcards new-dashboard))))))))))))

(deftest premium-features-test
  (testing "with :serialization enabled on the token"
    (ts/with-random-dump-dir [dump-dir "serdesv2-"]
      (mt/with-premium-features #{:serialization}
        (ts/with-dbs [source-db dest-db]
          (ts/with-db source-db
            ;; preparation
            (mt/with-temp [Dashboard _ {:name "some dashboard"}]
              (testing "export (v2-dump) command"
                (is (cmd/v2-dump! dump-dir {})
                    "works"))

              (testing "import (v2-load) command"
                (ts/with-db dest-db
                  (testing "doing ingestion"
                    (mt/with-temp [:model/User _ {}]
                      (is (cmd/v2-load! dump-dir {})
                          "works")))))))))))

  (testing "without :serialization feature enabled"
    (ts/with-random-dump-dir [dump-dir "serdesv2-"]
      (mt/with-premium-features #{}
        (ts/with-dbs [source-db dest-db]
          (ts/with-db source-db
            ;; preparation
            (t2.with-temp/with-temp [Dashboard _ {:name "some dashboard"}]
              (testing "export (v2-dump) command"
                (is (thrown-with-msg? Exception #"Please upgrade"
                                      (cmd/v2-dump! dump-dir {}))
                    "throws"))

              (testing "import (v2-load) command"
                (ts/with-db dest-db
                  (testing "doing ingestion"
                    (mt/with-temp [:model/User _ {}]
                      (is (thrown-with-msg? Exception #"Please upgrade"
                                            (cmd/v2-load! dump-dir {}))
                          "throws"))))))))))))

(deftest pivot-export-test
  (testing "Pivot table export and load correctly"
    (let [old-ids (atom nil)
          card1s  (atom nil)]
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (ts/with-dbs [source-db dest-db]
          (ts/with-db source-db
            (mt/dataset test-data
              ;; ensuring field ids are stable by loading dataset in db first
              (mt/db)
              (mt/$ids nil
                (t2.with-temp/with-temp
                  [Collection {coll-id :id}  {:name "Pivot Collection"}
                   Card       card           {:name          "Pivot Card"
                                              :collection_id coll-id
                                              :dataset_query {:type     :query
                                                              :database (mt/id)
                                                              :query    {:source-table $$orders
                                                                         :aggregation  [:sum [:field %orders.id nil]]
                                                                         :breakout     [[:field %orders.user_id nil]]}}
                                              :visualization_settings
                                              {:pivot_table.column_split
                                               {:rows    [[:field %people.name {:base-type    :type/Text
                                                                                :source-field %orders.user_id}]]
                                                :columns [[:field %products.title {:base-type    :type/Text
                                                                                   :source-field %orders.product_id}]]
                                                :values  [[:aggregation 0]]}
                                               :column_settings
                                               {(format "[\"ref\",[\"field\",%s,null]]" %people.name)
                                                {:pivot_table.column_sort_order "descending"}}}}]
                  (reset! old-ids {:people.name       %people.name
                                   :orders.user_id    %orders.user_id
                                   :products.title    %products.title
                                   :orders.product_id %orders.product_id})
                  (reset! card1s card)
                  (storage/store! (extract/extract {}) dump-dir)))))

          (ts/with-db dest-db
            ;; ensure there is something in db so that test-data gets different field ids for sure
            (mt/dataset office-checkins
              (mt/db))

            (mt/dataset test-data
              ;; ensuring field ids are stable by loading dataset in db first
              (mt/db)
              (mt/$ids nil
                (testing "Column ids are different in different dbs")
                (is (not= @old-ids
                          {:people.name       %people.name
                           :orders.user_id    %orders.user_id
                           :products.title    %products.title
                           :orders.product_id %orders.product_id}))

                (serdes.load/load-metabase! (ingest/ingest-yaml dump-dir))

                (let [viz (t2/select-one-fn :visualization_settings Card :entity_id (:entity_id @card1s))]
                  (testing "column ids inside pivot table transferred"
                    (is (= [[:field %people.name {:base-type    :type/Text
                                                  :source-field %orders.user_id}]]
                           (get-in viz [:pivot_table.column_split :rows])))
                    (is (= [[:field %products.title {:base-type    :type/Text
                                                     :source-field %orders.product_id}]]
                           (get-in viz [:pivot_table.column_split :columns]))))
                  (testing "column sort order restored"
                    (is (= "descending"
                           (get-in viz [:column_settings
                                        (format "[\"ref\",[\"field\",%s,null]]" %people.name)
                                        :pivot_table.column_sort_order])))))))))))))

(deftest extra-files-test
  (testing "Adding some extra files does not break deserialization"
    (ts/with-random-dump-dir [dump-dir "serdesv2-"]
      (mt/with-empty-h2-app-db
        (let [coll (ts/create! Collection :name "coll")
              _    (ts/create! Card :name "card" :collection_id (:id coll))]
          (storage/store! (extract/extract {:no-settings   true
                                            :no-data-model true}) dump-dir)

          (spit (io/file dump-dir "collections" ".hidden.yaml") "serdes/meta: [{do-not: read}]")
          (spit (io/file dump-dir "collections" "unreadable.yaml") "\0")

          (testing "No exceptions when loading despite unreadable files"
            (let [logs (mt/with-log-messages-for-level ['metabase-enterprise :error]
                         (let [files (->> (#'ingest/ingest-all (io/file dump-dir))
                                          (map (comp second second))
                                          (map #(.getName %))
                                          set)]
                           (testing "Hidden YAML wasn't read even though it's not throwing errors"
                             (is (not (contains? files ".hidden.yaml"))))))]
              (testing ".yaml files not containing valid yaml are just logged and do not break ingestion process"
                (is (=? [[:error Throwable "Error reading file unreadable.yaml"]]
                        logs))))))))))
