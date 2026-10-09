(ns metabase-enterprise.remote-sync.forced-reload-writes-test
  "A forced pull of content identical to what is already local should write nothing.

  Not ^:parallel: it measures with the JVM-wide JDBC counter via [[cost/measure!]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- changed-columns
  "Wraps [[models.db/update-entity!]] so each call records, per model, the columns toucan would actually write
  (the diff between the stored row and the stored row merged with the incoming changes)."
  [calls real]
  (fn [id {:keys [model row] :as entity}]
    (let [local   (t2/select-one model id)
          changed (some-> local (merge row) t2/changes keys set)]
      (when (seq changed)
        (swap! calls update model (fnil conj []) changed)))
    (real id entity)))

(defn- forced-reload-of-unchanged!
  [shape]
  (cost/forced-reload-of-unchanged!
   shape
   (fn [import!]
     (let [before (cost/max-updated-at [:model/Card :model/Dashboard :model/DashboardCard])
           calls  (atom {})
           ;; no sleep here: measure! sleeps after this read of `before`
           m      (mt/with-dynamic-fn-redefs [models.db/update-entity!
                                              (changed-columns calls (mt/original-fn #'models.db/update-entity!))]
                    (cost/measure! import!))]
       (assoc m
              :rewritten (cost/rewritten-since before)
              :changed-columns (update-vals @calls frequencies))))))

(deftest forced-reload-of-unchanged-content-rewrites-nothing-test
  (testing "A forced pull of content identical to local rewrites no Card, Dashboard or DashboardCard rows"
    (let [m (forced-reload-of-unchanged! {:cards 10 :dashboards 2 :dashcards 5})]
      (is (= :success (get-in m [:result :status])))
      (is (= {} (:changed-columns m))
          "no update issued by the load would change any column")
      (is (= {:model/Card 0 :model/Dashboard 0 :model/DashboardCard 0}
             (:rewritten m))))))

(deftest forced-reload-still-repairs-local-drift-test
  (testing "A forced pull still overwrites a local row that drifted from the repo without the ledger seeing it"
    (search.tu/with-index-disabled
      (cost/do-with-content!
       {:cards 2}
       (fn [tree]
         (let [src     (rs.test/versioned-source :trees {"v0" tree} :current "v0")
               card-id (t2/select-one-pk :model/Card :name "Cost card 001")
               synced  (t2/select-one [:model/Card :display :dataset_query :created_at] card-id)]
           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
           ;; a direct DB edit: no events, so the ledger still says synced
           (t2/query {:update :report_card
                      :set    {:display "table" :created_at #t "2001-01-01T00:00Z"}
                      :where  [:= :id card-id]})
           (t2/update! :model/Card card-id {:dataset_query (assoc-in (:dataset_query synced)
                                                                     [:stages 0 :filters 0 3] 99)})
           (is (= {:display :table :filter-value 99}
                  (let [c (t2/select-one [:model/Card :display :dataset_query] card-id)]
                    {:display (:display c) :filter-value (get-in c [:dataset_query :stages 0 :filters 0 3])}))
               "drift is in place before the pull")
           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "forced pull")
           (let [after (t2/select-one [:model/Card :display :dataset_query :created_at] card-id)]
             (is (= :line (:display after)))
             (is (= (.toInstant ^java.time.OffsetDateTime (:created_at synced))
                    (.toInstant ^java.time.OffsetDateTime (:created_at after))))
             (is (= 1 (get-in after [:dataset_query :stages 0 :filters 0 3]))))))))))

(deftest forced-reload-repairs-drift-in-derived-card-columns-test
  (testing "A forced pull restores the card columns that derive from dataset_query and that the file does not carry"
    (mt/with-temp [:model/Database {other-db :id} {:engine :h2 :details {}}]
      (search.tu/with-index-disabled
        (cost/do-with-content!
         {:cards 2}
         (fn [tree]
           (let [src     (rs.test/versioned-source :trees {"v0" tree} :current "v0")
                 card-id (t2/select-one-pk :model/Card :name "Cost card 001")
                 derived #(into {} (t2/query-one {:select [:database_id :table_id]
                                                  :from   [:report_card]
                                                  :where  [:= :id card-id]}))]
             (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
             (let [synced (derived)]
               (is (= {:database_id (mt/id) :table_id (mt/id :venues)} synced))
               ;; a direct DB edit: no hooks derive the columns again, and no events reach the ledger
               (t2/query {:update :report_card :set {:database_id other-db :table_id nil} :where [:= :id card-id]})
               (is (= {:database_id other-db :table_id nil} (derived)) "drift is in place before the pull")
               (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "forced pull")
               (is (= synced (derived)))))))))))

(defn- stored-card-row
  "The stored `card_schema`, `dataset_query` and `updated_at` of `card-id`, read without the after-select schema
  upgrade, which would report the current schema version whether or not the row holds it."
  [card-id]
  (t2/query-one {:select [:card_schema :dataset_query :updated_at] :from [:report_card] :where [:= :id card-id]}))

(defn- age-card!
  "Store an old `card_schema` for `card-id`. A raw UPDATE runs no Card hook, so it changes only this column."
  [card-id schema-version]
  (t2/query {:update :report_card :set {:card_schema schema-version} :where [:= :id card-id]}))

(deftest forced-reload-of-unchanged-card-keeps-old-card-schema-test
  (testing "A forced pull of an unchanged card with an old stored card_schema leaves the stored row as it is:
            reads upgrade the card in memory, so the pull finds no change and writes nothing"
    (search.tu/with-index-disabled
      (cost/do-with-content!
       {:cards 2}
       (fn [tree]
         (let [src     (rs.test/versioned-source :trees {"v0" tree} :current "v0")
               card-id (t2/select-one-pk :model/Card :name "Cost card 001")]
           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
           (age-card! card-id 20)
           (let [before (stored-card-row card-id)]
             (is (= 20 (:card_schema before)) "precondition: the stored card_schema is old")
             (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "forced pull")
             (is (= before (stored-card-row card-id))))))))))

(deftest load-that-changes-a-query-upgrades-old-card-schema-test
  (testing "A load that changes dataset_query of a card with an old stored card_schema writes the current
            card_schema with the new query, so the governed columns and card_schema stay together"
    (search.tu/with-index-disabled
      (cost/do-with-content!
       {:cards 2}
       (fn [tree]
         (let [src            (rs.test/versioned-source :trees {"v0" tree} :current "v0")
               card-id        (t2/select-one-pk :model/Card :name "Cost card 001")
               current-schema (:card_schema (stored-card-row (t2/select-one-pk :model/Card :name "Cost card 000")))
               synced-query   (t2/select-one-fn :dataset_query :model/Card card-id)]
           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
           ;; local drift in the query, then an old card_schema: the next pull writes the repo query back
           (t2/update! :model/Card card-id {:dataset_query (assoc-in synced-query [:stages 0 :filters 0 3] 99)})
           (age-card! card-id 20)
           (is (= 20 (:card_schema (stored-card-row card-id))) "precondition: the stored card_schema is old")
           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "forced pull")
           (is (= current-schema (:card_schema (stored-card-row card-id)))
               "the load writes the current card_schema")
           (is (= 1 (get-in (t2/select-one-fn :dataset_query :model/Card card-id) [:stages 0 :filters 0 3]))
               "the load writes the repo query")))))))

(defn- venues-query
  "An MBQL query of the venues table, with a filter on its price when `filter?`, and a count when `count?`."
  [& {:keys [filter? count?]}]
  (let [mp (mt/metadata-provider)]
    (cond-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
      filter? (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1))
      count?  (lib/aggregate (lib/count)))))

(defn- do-with-synced-cards!
  "Insert one Card for each attribute map of `cards` into a remote-synced collection, then call `f` with their ids.
  Sets `remote-sync-type` to `:read-write` and `remote-sync-transforms` to false for the duration, and deletes the
  content that it created afterwards."
  [cards f]
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [coll (t2/insert-returning-pk! :model/Collection {:name "Synced cards" :is_remote_synced true :location "/"})]
          (f (mapv #(t2/insert-returning-pk! :model/Card (merge {:collection_id          coll
                                                                 :creator_id             (mt/user->id :rasta)
                                                                 :display                :table
                                                                 :visualization_settings {}}
                                                                %))
                   cards)))))))

(defn- card-writes!
  "Run a forced pull of `src` at `version`. Returns the column sets of the Card rows that the load sends to the app DB,
  one for each update."
  [src version]
  (let [writes (atom [])]
    (mt/with-dynamic-fn-redefs [models.db/update-entity!
                                (let [real (mt/original-fn #'models.db/update-entity!)]
                                  (fn [id {:keys [model row] :as entity}]
                                    (when (= :model/Card model)
                                      (swap! writes conj (set (keys row))))
                                    (real id entity)))]
      (is (= :success (:status (rs.test/import-at! src version :force? true))) "forced pull"))
    @writes))

(defn- stored-metric-row
  "The stored `card_schema` and `dimension_mappings` of `card-id`, read without the after-select, which upgrades the
  schema and computes the dimensions of a metric that stores none."
  [card-id]
  (t2/query-one {:select [:card_schema :dimension_mappings] :from [:report_card] :where [:= :id card-id]}))

(deftest forced-reload-of-unchanged-metric-writes-nothing-test
  (testing "A forced pull of unchanged metrics writes no Card row, although each import makes new :lib/uuid values in
            the dimension mapping targets"
    (do-with-synced-cards!
     [{:name "Metric with stored dimensions" :type :metric :dataset_query (venues-query :count? true)}
      {:name "Old metric" :type :metric :dataset_query (venues-query :count? true)}]
     (fn [[stored-id old-id]]
       ;; two metrics from before dimensions: an old card_schema, and no stored dimensions
       (t2/query {:update :report_card
                  :set    {:card_schema 23 :dimensions nil :dimension_mappings nil}
                  :where  [:in :id [stored-id old-id]]})
       ;; store the dimensions that a read of the first one computes
       (t2/update! :model/Card stored-id (select-keys (t2/select-one :model/Card stored-id)
                                                      [:dimensions :dimension_mappings]))
       (is (some? (:dimension_mappings (stored-metric-row stored-id))) "precondition: the metric stores its mappings")
       (let [src (rs.test/versioned-source :trees {"v0" (rs.test/synced-tree)} :current "v0")]
         (is (= [] (card-writes! src "v0")) "first forced pull")
         (is (= [] (card-writes! src "v0")) "second forced pull")
         (is (= 23 (:card_schema (stored-metric-row old-id)))
             "the old metric keeps its stored card_schema"))))))

(defn- typed-columns?
  "True when each stored result column of `card-id` has a field id and a base type other than `:type/*`, as an inference
  gives. The model overrides of a file alone have neither."
  [card-id]
  (let [cols (:result_metadata (t2/select-one :model/Card card-id))]
    (boolean (and (seq cols)
                  (every? #(and (:id %) (not= :type/* (keyword (:base_type %)))) cols)))))

(defn- edit-card-file
  "`tree` with `f` applied to the parsed file of the Card with `entity-id`."
  [tree entity-id f]
  (let [path (some (fn [[path content]]
                     (when (= entity-id (:entity_id (yaml/parse-string content)))
                       path))
                   tree)]
    (assert path (str "no file for card " entity-id))
    (update tree path #(yaml/generate-string (f (yaml/parse-string %))))))

(deftest forced-reload-of-unchanged-mbql-model-keeps-column-types-test
  (testing "A forced pull of an unchanged MBQL model writes no Card row, and the model keeps its inferred column types"
    (doseq [[label query] [["whole table" (venues-query)]
                           ["with a filter" (venues-query :filter? true)]]]
      (testing label
        (do-with-synced-cards!
         [{:name "Model" :type :model :dataset_query query}]
         (fn [[model-id]]
           (is (typed-columns? model-id) "precondition: the model has inferred column types")
           (let [src (rs.test/versioned-source :trees {"v0" (rs.test/synced-tree)} :current "v0")]
             (is (= [] (card-writes! src "v0")))
             (is (typed-columns? model-id)))))))))

(deftest forced-reload-of-model-override-change-keeps-column-types-test
  (testing "A forced pull that changes one column display name of an MBQL model writes the query with the columns, so
            the before-update hook infers the column types with the new display name"
    ;; The query has a filter. For a whole-table query, the write of the file query does not reach the hook: the file
    ;; query equals the stored query, so Toucan drops it from the changes, and the hook stores the file columns as
    ;; they are, as on master.
    (do-with-synced-cards!
     [{:name "Model" :type :model :dataset_query (venues-query :filter? true)}]
     (fn [[model-id]]
       (let [tree      (rs.test/synced-tree)
             entity-id (t2/select-one-fn :entity_id :model/Card model-id)
             changed   (edit-card-file tree entity-id #(assoc-in % [:result_metadata 1 :display_name] "Changed name"))
             src       (rs.test/versioned-source :trees {"v1" changed} :current "v1")]
         (is (= [#{:dataset_query :result_metadata}] (card-writes! src "v1")))
         (is (= "Changed name" (:display_name (second (t2/select-one-fn :result_metadata :model/Card model-id)))))
         (is (typed-columns? model-id)))))))

(deftest forced-reload-of-question-that-the-file-makes-a-model-keeps-column-types-test
  (testing "A forced pull whose file makes a stored question an MBQL model stores inferred column types"
    (do-with-synced-cards!
     [{:name "Model" :type :model :dataset_query (venues-query :filter? true)}]
     (fn [[card-id]]
       (let [src (rs.test/versioned-source :trees {"v0" (rs.test/synced-tree)} :current "v0")]
         ;; the target instance holds the card as a question
         (t2/query {:update :report_card :set {:type "question"} :where [:= :id card-id]})
         (card-writes! src "v0")
         (is (= :model (t2/select-one-fn :type :model/Card card-id)))
         (is (typed-columns? card-id)))))))
