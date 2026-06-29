(ns metabase.sample-data.example-content-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.query-processor :as qp]
   [metabase.sample-data.example-content :as example-content]
   [metabase.sample-data.impl]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest remap-blob-parameters-preserves-order-test
  (testing "remap-blob keeps a card/dashboard's parameters in their designed order rather than re-sorting by :id"
    (let [blob (json/encode [{:id "zzzz" :name "Date Range" :type "string/="}
                             {:id "aaaa" :name "Vendor"     :type "string/="}])
          out  (json/decode+kw (#'example-content/remap-blob {} :parameters blob))]
      (is (= ["Date Range" "Vendor"] (mapv :name out))
          "parameters must stay in original order, not be alphabetized by :id"))))

(deftest remap-collection-location-test
  (let [remap #'example-content/remap-collection-location]
    (testing "root location is unchanged"
      (is (= "/" (remap {2 20} "/"))))
    (testing "each path segment is remapped independently"
      (is (= "/20/" (remap {2 20} "/2/")))
      (is (= "/20/30/" (remap {2 20, 3 30} "/2/3/"))))
    (testing "a new id colliding with a still-pending old id does not double-substitute"
      ;; old reduce-of-str/replace would turn \"/5/12/\" into \"/99/99/\"; per-segment remapping keeps them distinct
      (is (= "/12/99/" (remap {5 12, 12 99} "/5/12/"))))
    (testing "segments without a mapping keep their original id"
      (is (= "/2/7/" (remap {2 2} "/2/7/"))))))

(defn- sample-database-db []
  {:details (#'metabase.sample-data.impl/try-to-extract-sample-database! :sqlite)
   :engine  :sqlite
   :name    "Sample Database"})

(defn- field-ids-in-query
  "All numeric field ids referenced anywhere in a (pMBQL) dataset_query."
  [query]
  (let [ids (volatile! #{})]
    (walk/postwalk
     (fn [x]
       (when (and (vector? x) (= :field (first x)))
         (let [id (last x)]
           (when (number? id) (vswap! ids conj id))))
       x)
     query)
    @ids))

(defn- table-ids-in-query
  "All numeric :source-table ids referenced anywhere in a (pMBQL) dataset_query."
  [query]
  (let [ids (volatile! #{})]
    (walk/postwalk
     (fn [x]
       (when (and (map? x) (number? (:source-table x)))
         (vswap! ids conj (:source-table x)))
       x)
     query)
    @ids))

(deftest example-card-queries-run-after-id-bumping-upgrade-test
  (testing "After an upgrade that bumped app-db ids past the EDN-hardcoded range, every recreated example card runs.
           Cards that build on another example card carry a `\"card__N\"` :source-table; export-mbql only remaps a
           *numeric* :source-table, so these stay pinned to the EDN card id and now point at an unrelated/missing card."
    (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard :model/DashboardCard
                            :model/Dimension :model/Permissions]
      ;; Bump table/field ids past the EDN range (8 tables, 71 fields).
      (mt/with-temp [:model/Database other {}
                     :model/Table    ot {:db_id (:id other)}]
        (doseq [i (range 200)]
          (t2/insert! :model/Field {:table_id (:id ot) :name (str "filler_" i) :base_type :type/Integer
                                    :database_type "INT" :position i}))
        ;; Bump card ids past the EDN range (39 cards) so the EDN card ids (e.g. card__1) are taken by these
        ;; unrelated filler cards rather than by the recreated example cards.
        (dotimes [_ 60]
          (t2/insert! :model/Card (mt/with-temp-defaults :model/Card)))
        (mt/with-temp [:model/Database db (sample-database-db)]
          (sync/sync-database! db)
          (example-content/recreate-example-content! (:id db))
          (let [cards (->> (t2/select :model/Card :database_id (:id db))
                           (filter (comp #{:question :model :metric} :type))
                           (sort-by :id))]
            (is (seq cards) "example cards were recreated")
            (doseq [card cards]
              (testing (format "%s %s (card %s)" (:type card) (pr-str (:name card)) (:id card))
                (let [result (try (qp/process-query (:dataset_query card))
                                  (catch Throwable e {:error (ex-message e)}))]
                  (is (= nil (:error result))
                      (format "query failed: %s" (:error result))))))))))))

(deftest recreate-example-content-test
  (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard :model/DashboardCard
                          :model/Dimension :model/Permissions]
    ;; Pre-create an unrelated database with tables/fields so the sample DB's synced table/field ids do
    ;; NOT coincide with the EDN ids - otherwise the remap would be an identity no-op and prove nothing.
    (mt/with-temp [:model/Database other {}
                   :model/Table    ot {:db_id (:id other)}]
      (doseq [i (range 120)]
        (t2/insert! :model/Field {:table_id (:id ot) :name (str "filler_" i) :base_type :type/Integer
                                  :database_type "INT" :position i}))
      (mt/with-temp [:model/Database db (sample-database-db)]
        (sync/sync-database! db)
        (example-content/recreate-example-content! (:id db))
        (let [cards     (t2/select :model/Card :database_id (:id db))
              coll-ids  (set (keep :collection_id cards))
              valid-fid (set (t2/select-fn-set :id :model/Field
                                               {:join  [[:metabase_table :t] [:= :t.id :metabase_field.table_id]]
                                                :where [:= :t.db_id (:id db)]}))
              valid-tid (set (t2/select-fn-set :id :model/Table :db_id (:id db)))]
          (testing "the example cards are recreated against the new sample database"
            (is (= 39 (count cards)))
            (is (every? #(= (:id db) (:database_id %)) cards)))
          (testing "every card lives in the example collection"
            (is (seq coll-ids))
            (is (every? :is_sample (t2/select :model/Collection :id [:in coll-ids]))))
          (testing "every field/table reference in every card resolves to a real column of the new database"
            (doseq [card cards]
              (let [q (:dataset_query card)]
                (doseq [fid (field-ids-in-query q)]
                  (is (contains? valid-fid fid)
                      (format "card %s references missing field %s" (:name card) fid)))
                (doseq [st (table-ids-in-query q)]
                  (is (contains? valid-tid st)
                      (format "card %s references missing table %s" (:name card) st))))))
          (testing "the dashboard and its dashcards are recreated and resolve to recreated cards"
            (let [dash      (t2/select-one :model/Dashboard :collection_id [:in coll-ids])
                  dashcards (t2/select :model/DashboardCard :dashboard_id (:id dash))
                  card-ids  (set (map :id cards))]
              (is (some? dash))
              (is (pos? (count dashcards)))
              (is (every? #(or (nil? (:card_id %)) (contains? card-ids (:card_id %))) dashcards))))
          (testing "a recreated card actually runs against the new sample database"
            (let [runnable (first (filter #(and (nil? (:source_card_id %))
                                                (= :question (:type %))
                                                (seq (table-ids-in-query (:dataset_query %))))
                                          cards))]
              (is (some? runnable))
              (is (pos? (count (mt/rows (qp/process-query (:dataset_query runnable)))))))))))))
