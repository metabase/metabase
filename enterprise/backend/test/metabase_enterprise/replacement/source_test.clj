(ns metabase-enterprise.replacement.source-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
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
            (is (empty? (replacement.source/check-replace-source mp table table (mt/id) (mt/id))))))))))

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
                    (is (empty? (replacement.source/check-replace-source mp card-meta table (mt/id) (mt/id)))))
                  (testing "table -> card"
                    (is (empty? (replacement.source/check-replace-source mp table card-meta (mt/id) (mt/id))))))))))))))

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
                  (is (empty? (replacement.source/check-replace-source mp meta-a meta-b (mt/id) (mt/id)))))
                (testing "card-b -> card-a"
                  (is (empty? (replacement.source/check-replace-source mp meta-b meta-a (mt/id) (mt/id)))))))))))))

(deftest card-with-expression-reports-extra-column-test
  (testing "A card with an added expression column reports :column-mismatch with :extra_columns"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id :products))
            query (-> (lib/query mp table)
                      (lib/expression "double_price" (lib/* (lib/ref (m/find-first #(= "PRICE" (:name %))
                                                                                   (lib/returned-columns (lib/query mp table))))
                                                            2)))]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (let [card-meta (lib.metadata/card mp (:id card))
                errors    (replacement.source/check-replace-source mp table card-meta (mt/id) (mt/id))]
            (testing "table -> card with expression: extra column reported"
              (is (some #(= :column-mismatch (:type %)) errors))
              (is (some (fn [err]
                          (and (= :column-mismatch (:type err))
                               (some #(= "double_price" (:name %)) (:extra_columns err))))
                        errors)))
            (testing "card with expression -> table: missing column reported"
              (let [reverse-errors (replacement.source/check-replace-source mp card-meta table (mt/id) (mt/id))]
                (is (some #(= :column-mismatch (:type %)) reverse-errors))
                (is (some (fn [err]
                            (and (= :column-mismatch (:type err))
                                 (some #(= "double_price" (:name %)) (:missing_columns err))))
                          reverse-errors))))))))))

(deftest card-with-subset-of-fields-reports-missing-columns-test
  (testing "A card selecting a subset of fields reports :column-mismatch with :missing_columns"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id :products))
            query (lib/query mp table)
            cols  (lib/returned-columns query)
            ;; Select only the first two columns
            query (lib/with-fields query (mapv lib/ref (take 2 cols)))]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (let [card-meta     (lib.metadata/card mp (:id card))
                dropped-names (set (map #(or (:lib/desired-column-alias %) (:name %)) (drop 2 cols)))
                errors        (replacement.source/check-replace-source mp table card-meta (mt/id) (mt/id))]
            (testing "table -> card with fewer fields: extra columns reported (card is missing them)"
              (is (some #(= :column-mismatch (:type %)) errors))
              (is (some (fn [err]
                          (and (= :column-mismatch (:type err))
                               (every? #(contains? dropped-names (:name %)) (:missing_columns err))))
                        errors)))
            (testing "card with fewer fields -> table: extra columns reported"
              (let [reverse-errors (replacement.source/check-replace-source mp card-meta table (mt/id) (mt/id))]
                (is (some #(= :column-mismatch (:type %)) reverse-errors))
                (is (some (fn [err]
                            (and (= :column-mismatch (:type err))
                                 (every? #(contains? dropped-names (:name %)) (:extra_columns err))))
                          reverse-errors))))))))))

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

(deftest native-card-on-fk-table-reports-fk-mismatch-test
  ;; Native query result_metadata does not include :type/FK semantic types or
  ;; :fk-target-field-id, so a native card on a table with FK columns should
  ;; produce fk-mismatch errors.
  ;;
  ;; Note: native queries DO preserve :type/PK semantic types, so PK columns
  ;; are not a problem — only FKs are lost.
  (testing "A native card on a table with FK columns reports :fk-mismatch"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                :when (and (table-has-fks? mp table)
                           (not (table-has-hidden-columns? mp table)))]
          (let [native-query (lib/native-query mp (str "SELECT * FROM " (:name table) " LIMIT 1"))]
            (mt/with-model-cleanup [:model/Card]
              (let [card      (card/create-card! {:name                   (str "Native FK " (:name table))
                                                  :display                :table
                                                  :visualization_settings {}
                                                  :dataset_query          native-query}
                                                 {:id (mt/user->id :rasta)})
                    _         (wait-for-result-metadata (:id card))
                    card-meta (lib.metadata/card mp (:id card))]
                (testing (str "table: " (:name table))
                  (testing "table -> native card: fk-mismatch reported"
                    (is (some #(= :fk-mismatch (:type %))
                              (replacement.source/check-replace-source mp table card-meta (mt/id) (mt/id)))))
                  (testing "native card -> table: fk-mismatch reported"
                    (is (some #(= :fk-mismatch (:type %))
                              (replacement.source/check-replace-source mp card-meta table (mt/id) (mt/id))))))))))))))

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
                    (is (empty? (replacement.source/check-replace-source mp table card-meta (mt/id) (mt/id)))))
                  (testing "native card -> table"
                    (is (empty? (replacement.source/check-replace-source mp card-meta table (mt/id) (mt/id))))))))))))))
