(ns metabase.search.appdb.index-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.db :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- index-hits [term]
  (count (search.index/search term)))

(defn- now []
  ;; Truncate to milliseconds as precision may be lost when roundtripping to the database.
  (t/truncate-to (t/offset-date-time) :millis))

(defmacro with-fulltext-filtering [& body]
  `(case (mdb/db-type)
     :postgres
     (do ~@body)
     :h2
     ;; Fulltext features not supported
     nil))

;; These helpers only mutate the temp local AppDb.
#_{:clj-kondo/ignore [:metabase/test-helpers-use-non-thread-safe-functions]}
;; TODO make this a :once fixture so that we avoid so much setup and tear down
(defmacro with-index
  "Ensure a clean, small index."
  [& body]
  `(search.tu/with-temp-index-table
     (binding [search.ingestion/*force-sync* true]
       (mt/dataset ~(symbol "test-data")
         ;; Sneaky trick so make sure we have a user with ID 1
         (mt/with-temp [:model/User       {}            (when-not (t2/exists? :model/User 1) {:id 1})
                        :model/Collection {col-id# :id} {:name "Collection"}
                        :model/Card       {}            {:name "Customer Satisfaction"          :collection_id col-id#}
                        :model/Card       {}            {:name "The Latest Revenue Projections" :collection_id col-id#}
                        :model/Card       {}            {:name "Projected Revenue"              :collection_id col-id#}
                        :model/Card       {}            {:name "Employee Satisfaction"          :collection_id col-id#}
                        :model/Card       {}            {:name "Projected Satisfaction"         :collection_id col-id#}
                        :model/Database   {db-id# :id}  {:name "Indexed Database"}
                        :model/Table      {}            {:name "Indexed Table", :db_id db-id#}]
           (search.index/reset-index!)
           (search.ingestion/populate-index! :search.engine/appdb)
           ~@body)))))

(deftest idempotent-test
  (with-index
    (let [count-rows  (fn [] (t2/count (search.index/active-table)))
          rows-before (count-rows)]
      (search.ingestion/populate-index! :search.engine/appdb)
      (is (= rows-before (count-rows))))))

(deftest incremental-update-test
  (let [fulltext? (= :postgres (mdb/db-type))]
    (with-index
      (testing "The index is updated when models change"
       ;; Has a second entry is "Revenue Project(ions)", when using English dictionary
        (is (= (if fulltext? 2 1) (count (search.index/search "Projected Revenue"))))
        (is (= 0 (count (search.index/search "Protected Avenue"))))
        (t2/update! :model/Card {:name "Projected Revenue"} {:name "Protected Avenue"})
        (is (= (if fulltext? 1 0) (count (search.index/search "Projected Revenue"))))
        (is (= 1 (count (search.index/search "Protected Avenue"))))

       ;; Delete hooks are remove for now, over performance concerns.
       ;(t2/delete! :model/Card :name "Protected Avenue")
        #_(is (= 0 #_1 (count (search.index/search "Projected Revenue"))))
        #_(is (= 0 (count (search.index/search "Protected Avenue"))))))))

(deftest related-update-test
  (with-index
    (testing "The index is updated when model dependencies change"
      (let [index-table    (search.index/active-table)
            table-id       (t2/select-one-pk :model/Table :name "Indexed Table")
            legacy-input   #(-> (t2/select-one [index-table :legacy_input] :model "table" :model_id table-id)
                                :legacy_input
                                json/decode+kw)
            db-id          (t2/select-one-fn :db_id :model/Table table-id)
            db-name-fn     (comp :database_name legacy-input)
            alternate-name (str (random-uuid))]
        (is (= "Indexed Database" (db-name-fn)))
        (t2/update! :model/Database db-id {:name alternate-name})
        (is (= alternate-name (db-name-fn)))))))

(deftest partial-word-test
  (with-index
    (with-fulltext-filtering
      (testing "It does not match partial words"
      ;; does not include revenue
        (is (= #{"venues"} (into #{} (comp (map second) (map u/lower-case-en)) (search.index/search "venue")))))

    ;; no longer works without using the english dictionary
      (testing "Unless their lexemes are matching"
        (doseq [[a b] [["revenue" "revenues"]
                       ["collect" "collection"]]]
          (is (= (search.index/search a)
                 (search.index/search b)))))

      (testing "Or we match a completion of the final word"
        (is (seq (search.index/search "sat")))
        (is (seq (search.index/search "satisf")))
        (is (seq (search.index/search "employee sat")))
        (is (seq (search.index/search "satisfaction empl")))
        (is (empty? (search.index/search "sat employee")))
        (is (empty? (search.index/search "emp satisfaction")))))))

(deftest either-test
  (with-index
    (with-fulltext-filtering
      (testing "We get results for both terms"
        (is (= 3 (index-hits "satisfaction")))
        (is (<= 1 (index-hits "user"))))
      (testing "But stop words are skipped"
        (is (= 0 (index-hits "or")))
      ;; stop words depend on a dictionary
        (is (= #_0 3 (index-hits "its the satisfaction of it"))))
      (testing "We can combine the individual results"
        (is (= (+ (index-hits "satisfaction")
                  (index-hits "user"))
               (index-hits "satisfaction or user")))))))

(deftest negation-test
  (with-index
    (with-fulltext-filtering
      (testing "We can filter out results"
        (is (= 3 (index-hits "satisfaction")))
        (is (= 1 (index-hits "customer")))
        (is (= 1 (index-hits "satisfaction and customer")))
        (is (= 2 (index-hits "satisfaction -customer")))))))

(deftest phrase-test
  (with-index
    (with-fulltext-filtering
    ;; Less matches without an english dictionary
      (is (= #_2 3 (index-hits "projected")))
      (is (= 2 (index-hits "revenue")))
      (is (= #_1 2 (index-hits "projected revenue")))
      (testing "only sometimes do these occur sequentially in a phrase"
        (is (= 1 (index-hits "\"projected revenue\"")))))))

(defn ingest!
  [model where-clause]
  (#'search.engine/consume!
   :search.engine/appdb
   (#'search.ingestion/query->documents
    (#'search.ingestion/spec-index-reducible model where-clause))))

(defn ingest-then-fetch!
  [model entity-name]
  (ingest! model [:= :this.name entity-name])
  (t2/query-one {:select [:*]
                 :from   [(search.index/active-table)]
                 :where  [:and
                          [:= :name entity-name]
                          [:= :model model]]}))

(def default-index-entity
  {:model               nil
   :model_id            nil
   :name                nil
   :official_collection nil
   :database_id         nil
   :pinned              nil
   :view_count          nil
   :collection_id       nil
   :last_viewed_at      nil
   :model_created_at    nil
   :model_updated_at    nil
   :dashboardcard_count nil
   :last_edited_at      nil
   :last_editor_id      nil
   :verified            nil})

(defn- index-entity
  [entity]
  (merge default-index-entity entity))

(deftest card-complex-ingestion-test
  (search.tu/with-temp-index-table
    (doseq [[model-type card-type] [["card" "question"] ["dataset" "model"] ["metric" "metric"]]]
      (testing (format "simple %s" model-type)
        (let [card-name (mt/random-name)
              yesterday (t/- (now) (t/days 1))]
          (mt/with-temp [:model/Card {card-id :id} {:name         card-name
                                                    :type         card-type
                                                    :created_at   yesterday
                                                    :updated_at   yesterday
                                                    :last_used_at yesterday}]
            (is (=? (index-entity
                     {:model                    model-type
                      :model_id                 card-id
                      :name                     card-name
                      :official_collection      nil
                      :database_id              (mt/id)
                      :pinned                   false
                      :view_count               0
                      :collection_id            nil
                      :dashboardcard_count      0
                      :model_created_at         yesterday
                      :model_updated_at         yesterday
                      :last_viewed_at           yesterday
                      :last_edited_at           nil
                      :last_editor_id           nil
                      :verified                 nil})
                    (ingest-then-fetch! model-type card-name))))))

      (testing (format "everything %s" model-type)
        (let [card-name    (mt/random-name)
              yesterday    (t/- (now) (t/days 1))
              two-days-ago (t/- yesterday (t/days 1))]
          (mt/with-temp
            [:model/Collection    {coll-id :id}      {:name            "My collection"
                                                      ;; :official_collection = true
                                                      :authority_level "official"}
             :model/Card          {card-id :id}      {:name                card-name
                                                      :type                card-type
                                                      :query_type          "query"
                                                      ;; :database_id = (mt/id)
                                                      :database_id         (mt/id)
                                                      ;; :pinned = true
                                                      :collection_position 1
                                                      ;; :view_count = 42
                                                      :view_count          42
                                                      ;; :collection_id = coll-id
                                                      :collection_id       coll-id
                                                      ;; :last_viewed_at = yesterday
                                                      :last_used_at        yesterday
                                                      ;; :model_created_at = two-days-ago
                                                      :created_at          two-days-ago
                                                      ;; :model_updated_at = two-days-ago
                                                      :updated_at          two-days-ago}

             ;; :dashboardcard_count = 2
             :model/Dashboard     {dashboard-id :id} {}
             :model/DashboardCard _                  {:dashboard_id dashboard-id :card_id card-id}
             :model/DashboardCard _                  {:dashboard_id dashboard-id :card_id card-id}

             ;; :last_edited_at = yesterday
             ;; :last_editor_id = rasta-id
             :model/Revision      _                 {:model_id    card-id
                                                     :model       "Card"
                                                     :user_id     (mt/user->id :rasta)
                                                     :most_recent true
                                                     :timestamp   yesterday
                                                     :object      {}}
             ;; :verified = true
             :model/ModerationReview _              {:moderated_item_type "card"
                                                     :moderated_item_id   card-id
                                                     :most_recent         true
                                                     :status              "verified"
                                                     :moderator_id        (mt/user->id :crowberto)}]
            (is (=? (index-entity
                     {:model                    model-type
                      :model_id                 card-id
                      :name                     card-name
                      :official_collection      true
                      :database_id              (mt/id)
                      :pinned                   true
                      :view_count               42
                      :collection_id            coll-id
                      :last_viewed_at           yesterday
                      :model_created_at         two-days-ago
                      :model_updated_at         two-days-ago
                      :dashboardcard_count      2
                      :last_edited_at           yesterday
                      :last_editor_id           (mt/user->id :rasta)
                      :verified                 true})
                    (ingest-then-fetch! model-type card-name)))))))))

(deftest database-ingestion-test
  (search.tu/with-temp-index-table
    (let [db-name (mt/random-name)
          yesterday (t/- (now) (t/days 1))]
      (mt/with-temp [:model/Database {db-id :id} {:name       db-name
                                                  :created_at yesterday
                                                  :updated_at yesterday}]
        (is (=? (index-entity
                 {:model            "database"
                  :model_id         db-id
                  :name             db-name
                  :model_created_at yesterday
                  :model_updated_at yesterday})
                (ingest-then-fetch! "database" db-name)))))))

(deftest table-ingestion-test
  (search.tu/with-temp-index-table
    (let [table-name (mt/random-name)
          yesterday  (t/- (now) (t/days 1))]
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {table-id :id} {:name       table-name
                                                  ;; :view_count = 42
                                                  :view_count 42
                                                  ;; :database_id = db-id
                                                  :db_id      db-id
                                                  ;; :model_created_at = yesterday
                                                  :created_at yesterday
                                                  ;; :model_updated_at = yesterday
                                                  :updated_at yesterday}]
        (is (=? (index-entity
                 {:model            "table"
                  :model_id         table-id
                  :name             table-name
                  :view_count       42
                  :database_id      db-id
                  :model_created_at yesterday
                  :model_updated_at yesterday})
                (ingest-then-fetch! "table" table-name)))))))

(deftest collection-ingestion-test
  (search.tu/with-temp-index-table
    (let [collection-name (mt/random-name)
          yesterday       (t/- (now) (t/days 1))]
      (mt/with-temp [:model/Collection {coll-id :id} {:name collection-name
                                                      ;; :authority_level = "official"
                                                      :authority_level "official"
                                                      ;; :archived = true
                                                      :archived true
                                                      ;; :type = "collection"
                                                      :type "collection"
                                                      ;; :model_created_at = yesterday
                                                      :created_at yesterday}]
        (is (=? (index-entity
                 {:model            "collection"
                  :model_id         coll-id
                  :collection_id    coll-id
                  :name             collection-name
                  :archived         true
                  :model_created_at yesterday})
                (ingest-then-fetch! "collection" collection-name)))))))

(deftest action-ingestion-test
  (search.tu/with-temp-index-table
    (let [action-name (mt/random-name)
          yesterday   (t/- (now) (t/days 1))]
      (mt/with-temp [:model/Database   {db-id :id}     {}
                     :model/Collection {coll-id :id}   {}
                     :model/Card       {model-id :id}  {:type "model"
                                                        ;; :collection_id = coll-id
                                                        :collection_id coll-id}
                     :model/Action     {action-id :id} {:name       action-name
                                                        :type       "query"
                                                        :model_id   model-id
                                                        ;; :model_created_at = yesterday
                                                        :created_at yesterday
                                                        ;; :model_updated_at = yesterday
                                                        ;; :last_edited_at = yesterday
                                                        :updated_at yesterday
                                                        ;; :archived = true
                                                        :archived true}
                     :model/QueryAction _               {:dataset_query (mt/native-query "select * from metabase")
                                                         ;; :database_id = db-id
                                                         :database_id   db-id
                                                         :action_id     action-id}]
        (is (=? (index-entity
                 {:model            "action"
                  :model_id         action-id
                  :name             action-name
                  :collection_id    coll-id
                  :model_created_at yesterday
                  :model_updated_at yesterday
                  :last_edited_at   yesterday
                  :database_id      db-id})
                (ingest-then-fetch! "action" action-name)))))))

(deftest dashboard-ingestion-test
  (search.tu/with-temp-index-table
    (let [dashboard-name (mt/random-name)
          yesterday      (t/- (now) (t/days 1))
          two-days-ago   (t/- yesterday (t/days 1))]
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name       dashboard-name
                                                          ;; :model_created_at = yesterday
                                                          :created_at yesterday
                                                          ;; :model_updated_at = yesterday
                                                          :updated_at yesterday
                                                          ;; :last_viewed_at = yesterday
                                                          :last_viewed_at yesterday
                                                          ;; :view_count = 42
                                                          :view_count 42
                                                          ;; :pinned = true
                                                          :collection_position 2}
                     :model/Revision  _                 {:model_id    dashboard-id
                                                         :model       "Dashboard"
                                                         ;; :last_editor_id = rasta-id
                                                         :user_id     (mt/user->id :rasta)
                                                         ;; :last_edited_at = two-days-ago
                                                         :timestamp   two-days-ago
                                                         :most_recent true
                                                         :object      {}}]

        (is (=? (index-entity
                 {:model            "dashboard"
                  :model_id         dashboard-id
                  :name             dashboard-name
                  :model_created_at yesterday
                  :model_updated_at yesterday
                  :last_viewed_at   yesterday
                  :view_count       42
                  :pinned           true
                  :last_editor_id   (mt/user->id :rasta)
                  :last_edited_at   two-days-ago})
                (ingest-then-fetch! "dashboard" dashboard-name)))))))

(deftest segment-ingestion-test
  (search.tu/with-temp-index-table
    (let [segment-name (mt/random-name)
          yesterday    (t/- (now) (t/days 1))]
      (mt/with-temp [:model/Database   {db-id :id}      {}
                     :model/Table      {table-id :id}   {:db_id db-id}
                     :model/Segment    {segment-id :id} {:name       segment-name
                                                         ;; :table_id = table-id
                                                         :table_id   table-id
                                                         ;; :model_updated_at = yesterday
                                                         :updated_at yesterday}]
        (is (=? (index-entity
                 {:model            "segment"
                  :model_id         segment-id
                  :name             segment-name
                  :database_id      db-id
                  :model_updated_at yesterday})
                (ingest-then-fetch! "segment" segment-name)))))))

(deftest indexed-entity-ingestion-test
  (search.tu/with-temp-index-table
    (let [entity-name (mt/random-name)]
      (mt/with-temp [:model/Collection      {coll-id :id}        {}
                     :model/Card            {model-id :id}       {:type        "model"
                                                                  ;; :database_id = (mt/id)
                                                                  :database_id (mt/id)
                                                                  ;; :collection_id = coll-id
                                                                  :collection_id coll-id}
                     :model/ModelIndex      {model-index-id :id} {:model_id   model-id
                                                                  :pk_ref     (mt/$ids :products $id)
                                                                  :value_ref  (mt/$ids :products $title)
                                                                  :schedule   "0 0 0 * * *"
                                                                  :state      "initial"
                                                                  :creator_id (mt/user->id :rasta)}]
        ;; :model/ModelIndexValue does not have id column so does not work nicely with with-temp
        (t2/insert! :model/ModelIndexValue {:name       entity-name
                                            :model_index_id model-index-id
                                            ;; :model_id = model-id
                                            :model_pk   42})
        (is (=? (index-entity
                 {:model            "indexed-entity"
                  :model_id         42
                  :name             entity-name
                  :database_id      (mt/id)
                  :collection_id    coll-id})
                (ingest-then-fetch! "indexed-entity" entity-name)))))))

(deftest ^:synchronized update-metadata!-test
  (mt/with-temporary-setting-values [search-engine-appdb-index-state nil]
    (testing "Clearing the setting clears the tracking atoms"
      (is (nil? (search.index/active-table)))
      (is (nil? (#'search.index/pending-table))))
    (testing "Updating the setting updates the tracking atoms"
      (#'search.index/update-metadata! {:active-table :active, :pending-table :pending})
      (is (= :active (search.index/active-table)))
      (is (= :pending (#'search.index/pending-table))))
    (testing "We can update to a newer version"
      (binding [search.index/*index-version-id* "newer-version"]
        (#'search.index/update-metadata! {:active-table :activer, :pending-table :pendinger})
        (is (= :activer (search.index/active-table)))
        (is (= :pendinger (#'search.index/pending-table)))))
    (testing "We keep the previous version around"
      (is (= #{:newer-version (keyword @#'search.index/*index-version-id*)}
             (set (keys (:versions (search.index/search-engine-appdb-index-state)))))))
    (testing "We can update to an ever newer version"
      (binding [search.index/*index-version-id* "newest-version"]
        (#'search.index/update-metadata! {:active-table :activest, :pending-table :pendingest})
        (is (= :activest (search.index/active-table)))
        (is (= :pendingest (#'search.index/pending-table)))))
    (testing "We only keep the two most recent versions around"
      (is (= #{:newer-version :newest-version}
             (set (keys (:versions (search.index/search-engine-appdb-index-state)))))))))

(deftest ^:synchronized table-cleanup-test
  (when (search/supports-index?)
    ;; this test destroys the actual current index, regrettably
    (let [related-table   :search_index_related_table_that_is_important
          obsolete-tables [:search_index :search_index_next :search_index_retired :search_index__oh_so_random]]
      (try
        (doseq [tn (cons related-table obsolete-tables)]
          (try
            (search.index/create-table! tn)
            ;; They might already exist
            (catch Exception _)))
        (testing "Given various obsolete search indexes"
          (is (every? #'search.index/exists? (cons related-table obsolete-tables))))
        (search.index/reset-index!)
        (testing "We can create new index"
          (is (#'search.index/exists? (search.index/active-table))))
        (testing "... without destroying any related non-index tables"
          (is (#'search.index/exists? related-table)))
        (testing "... and we clear out all the obsolete tables"
          (is (every? (comp not #'search.index/exists?) obsolete-tables)))
        (testing "... and there is no more pending table"
          (is (not (#'search.index/exists? (#'search.index/pending-table)))))
        (finally
          (#'search.index/drop-table! related-table))))))

;; We don't currently track database deletes in realtime in the search index.
;; To do so, we would make use of the following mechanism to find downstream elements deleted by a cascade.
;; For now, as we lack a low-impact way to decorate toucan2 to do such a thing, we simply track the relations as a test.
;; This way we will at least be aware of the implication for staleness in the index whenever we change the specs.

(def ^:private model->deleted-descendants
  ;; Note that these refer to the table names, not the search-model names.
  {"core_user"         #{"action" "collection" "model_index_value" "report_card" "report_dashboard" "segment"}
   "model_index"       #{"model_index_value"}
   "metabase_database" #{"action" "metabase_table" "model_index_value" "report_card" "segment"}
   "metabase_table"    #{"action" "model_index_value" "report_card" "segment"}
   "report_card"       #{"action" "model_index_value" "report_card"}
   "report_dashboard"  #{"action" "model_index_value" "report_card"}})

(defn- transitive*
  "Borrows heavily from clojure.core/derive. Notably, however, this intentionally permits circular dependencies."
  [h child parent]
  (let [td (:descendants h {})
        ta (:ancestors h {})
        tf (fn [source sources target targets]
             (reduce (fn [ret k]
                       (assoc ret k
                              (reduce conj (get targets k #{}) (cons target (targets target)))))
                     targets (cons source (sources source))))]
    {:ancestors   (tf child td parent ta)
     :descendants (tf parent ta child td)}))

(defn transitive
  "Given a mapping from (say) parents to children, return the corresponding mapping from parents to descendants."
  [adj-map]
  (:descendants (reduce-kv (fn [h p children] (reduce #(transitive* %1 %2 p) h children)) nil adj-map)))

(deftest search-model-cascade-text
  (is (= model->deleted-descendants
         (mt/with-empty-h2-app-db
           (let [table->children    (u.conn/app-db-cascading-deletes (mdb/app-db) (map t2/table-name (descendants :metabase/model)))
                 table->sub-tables  (into {} (for [[t cs] table->children] [t (map :child-table cs)]))
                 table->descendants (transitive table->sub-tables)
                 search-model?      (into #{} (map (comp name t2/table-name :model val)) (search.spec/specifications))]
             (into {}
                   (keep (fn [[p ds]]
                           (when-let [ds (not-empty (into (sorted-set) (filter search-model? ds)))]
                             [p ds])))
                   table->descendants))))))
