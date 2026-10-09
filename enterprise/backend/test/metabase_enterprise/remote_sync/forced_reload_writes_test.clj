(ns metabase-enterprise.remote-sync.forced-reload-writes-test
  "A forced pull of content identical to what is already local should write nothing.

  Not ^:parallel: it measures with the JVM-wide JDBC counter via [[cost/measure!]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.models.db :as models.db]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
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
