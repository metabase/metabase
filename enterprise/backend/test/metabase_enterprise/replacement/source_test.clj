(ns metabase-enterprise.replacement.source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- wait-for-result-metadata
  "Poll until `result_metadata` is populated on the card, up to `timeout-ms` (default 5000)."
  ([card-id] (wait-for-result-metadata card-id 5000))
  ([card-id timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
         (if (seq metadata)
           metadata
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 200)
                 (recur))
             (throw (ex-info "Timed out waiting for result_metadata" {:card-id card-id})))))))))

(deftest table-replaceable-with-itself-test
  (testing "Every table in test-data is replaceable with itself"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables]
          (testing (str "table: " (:name table))
            (is (empty? (replacement.source/check-replace-source mp table table)))))))))

(deftest card-swappable-with-underlying-table-test
  (testing "A card built on a table is swappable with that table in both directions"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                legacy? [true false]]
          (let [query (cond-> (lib/query mp table)
                        legacy? lib.convert/->legacy-MBQL)]
            (mt/with-temp [:model/Card card {:dataset_query query
                                             :database_id   (mt/id)
                                             :type          :question}]
              (let [card-meta (lib.metadata/card mp (:id card))]
                (testing (str "table: " (:name table))
                  (testing "card -> table"
                    (is (empty? (replacement.source/check-replace-source mp card-meta table))))
                  (testing "table -> card"
                    (is (empty? (replacement.source/check-replace-source mp table card-meta)))))))))))))

(deftest two-cards-on-same-table-swappable-test
  (testing "Two cards built on the same table are swappable in both directions"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                legacy-original? [true false]
                legacy-replacement? [true false]]
          (mt/with-temp [:model/Card card-a {:dataset_query (cond-> (lib/query mp table)
                                                              legacy-original? lib.convert/->legacy-MBQL)
                                             :database_id   (mt/id)
                                             :type          :question}
                         :model/Card card-b {:dataset_query (cond-> (lib/query mp table)
                                                              legacy-replacement? lib.convert/->legacy-MBQL)
                                             :database_id   (mt/id)
                                             :type          :question}]
            (let [meta-a (lib.metadata/card mp (:id card-a))
                  meta-b (lib.metadata/card mp (:id card-b))]
              (testing (str "table: " (:name table))
                (testing "card-a -> card-b"
                  (is (empty? (replacement.source/check-replace-source mp meta-a meta-b))))
                (testing "card-b -> card-a"
                  (is (empty? (replacement.source/check-replace-source mp meta-b meta-a))))))))))))

(defn- table-has-fks?
  "Returns true if any column of `table` has :type/FK semantic type."
  [mp table]
  (some #(= :type/FK (:semantic-type %))
        (lib/returned-columns (lib/query mp table))))

(defn- table-has-hidden-columns?
  "Returns true if the table has columns that are hidden (not returned by `lib/returned-columns`)
  but would still appear in a `SELECT *` native query."
  [mp table]
  (let [visible-count (count (lib/returned-columns (lib/query mp table)))
        total-count   (t2/count :model/Field :table_id (:id table) :active true)]
    (not= visible-count total-count)))

(deftest native-card-swappable-with-table-test
  ;; We only test tables without FK columns because native query result_metadata
  ;; (as computed by the QP) does not include :type/FK semantic types or
  ;; :fk-target-field-id. Tables with FK columns would produce fk-mismatch errors.
  ;;
  ;; We also exclude tables with hidden columns (e.g. USERS.PASSWORD) because
  ;; `SELECT *` returns all columns while `lib/returned-columns` omits hidden ones.
  (testing "A native query card with matching result_metadata is swappable with its table (no-FK tables only)"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                :when (and (not (table-has-fks? mp table))
                           (not (table-has-hidden-columns? mp table)))]
          (let [native-query (lib/native-query mp (str "SELECT * FROM " (:name table) " LIMIT 1"))]
            (mt/with-model-cleanup [:model/Card]
              (let [card      (card/create-card! {:name                   (str "Native " (:name table))
                                                  :display                :table
                                                  :visualization_settings {}
                                                  :dataset_query          native-query}
                                                 {:id (mt/user->id :rasta)})
                    _         (wait-for-result-metadata (:id card))
                    card-meta (lib.metadata/card mp (:id card))]
                (testing (str "table: " (:name table))
                  (testing "table -> native card"
                    (is (empty? (replacement.source/check-replace-source mp table card-meta))))
                  (testing "native card -> table"
                    (is (empty? (replacement.source/check-replace-source mp card-meta table)))))))))))))
