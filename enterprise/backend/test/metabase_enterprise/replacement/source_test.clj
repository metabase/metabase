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
            (is (empty? (replacement.source/check-replace-source [:table (:id table)] [:table (:id table)])))))))))

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
              (testing (str "table: " (:name table))
                (testing "card -> table"
                  (is (empty? (replacement.source/check-replace-source [:card (:id card)] [:table (:id table)]))))
                ;; table -> card is blocked for tables with incoming FKs (implicit joins check)
                ;; so we only assert empty for tables without incoming FKs
                (testing "table -> card"
                  (let [result (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)])]
                    (if (t2/exists? :model/Field
                                    :fk_target_field_id [:in (t2/select-pks-set :model/Field :table_id (:id table) :active true)]
                                    :active true)
                      (is (some #{:incompatible-implicit-joins} (:errors result)))
                      (is (empty? result)))))))))))))

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
            (testing (str "table: " (:name table))
              (testing "card-a -> card-b"
                (is (empty? (replacement.source/check-replace-source [:card (:id card-a)] [:card (:id card-b)]))))
              (testing "card-b -> card-a"
                (is (empty? (replacement.source/check-replace-source [:card (:id card-b)] [:card (:id card-a)])))))))))))

(deftest card-with-expression-reports-extra-column-test
  (testing "A card with an added expression column reports :missing-column in the card→table direction"
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
          (testing "table -> card with expression: no missing columns (card is a superset)"
            (let [errors (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)])]
              (is (empty? errors))))
          (testing "card with expression -> table: expression column is missing"
            (let [reverse-errors (replacement.source/check-replace-source [:card (:id card)] [:table (:id table)])]
              (is (some #(= :missing-column (:type %)) reverse-errors))
              (is (some (fn [err]
                          (and (= :missing-column (:type err))
                               (some #(= "double_price" (:name %)) (:columns err))))
                        reverse-errors)))))))))

(deftest card-with-subset-of-fields-reports-missing-columns-test
  (testing "A card selecting a subset of fields reports :missing-column in the table→card direction"
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
          (let [dropped-names (set (map #(or (:lib/desired-column-alias %) (:name %)) (drop 2 cols)))
                errors        (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)])]
            (testing "table -> card with fewer fields: dropped columns are missing from new source"
              (is (some #(= :missing-column (:type %)) errors))
              (is (some (fn [err]
                          (and (= :missing-column (:type err))
                               (every? #(contains? dropped-names (:name %)) (:columns err))))
                        errors)))
            (testing "card with fewer fields -> table: no missing columns (table is a superset)"
              (let [reverse-errors (replacement.source/check-replace-source [:card (:id card)] [:table (:id table)])]
                (is (empty? reverse-errors))))))))))

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

(deftest implicit-joins-check-test
  (testing "table→card with incoming FKs reports :incompatible-implicit-joins"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            ;; PEOPLE has incoming FKs (ORDERS.USER_ID → PEOPLE.ID)
            table (lib.metadata/table mp (mt/id :people))
            query (lib/query mp table)]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (let [result (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)])]
            (is (false? (:success result)))
            (is (some #{:incompatible-implicit-joins} (:errors result))))))))
  (testing "table→card without incoming FKs does not report :incompatible-implicit-joins"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            ;; REVIEWS has no incoming FKs
            table (lib.metadata/table mp (mt/id :reviews))
            query (lib/query mp table)]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (let [result (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)])]
            (is (true? (:success result)))
            (is (not (some #{:incompatible-implicit-joins} (:errors result)))))))))
  (testing "table→table does not trigger implicit joins check"
    (mt/dataset test-data
      ;; PEOPLE has incoming FKs, but table→table swap should not trigger the check
      ;; Use two different tables to avoid the same-ref early return
      (let [result (replacement.source/check-replace-source [:table (mt/id :people)] [:table (mt/id :products)])]
        (is (not (some #{:incompatible-implicit-joins} (:errors result))))))))

(deftest native-card-on-fk-table-reports-fk-mismatch-test
  ;; Native query result_metadata does not include :type/FK semantic types or
  ;; :fk-target-field-id, so a native card on a table with FK columns should
  ;; produce fk-mismatch errors.
  ;;
  ;; Note: native queries DO preserve :type/PK semantic types, so PK columns
  ;; are not a problem — only FKs are lost.
  (testing "A native card on a table with FK columns reports :missing-foreign-key"
    (mt/dataset test-data
      (let [mp     (mt/metadata-provider)
            tables (lib.metadata/tables mp)]
        (doseq [table tables
                :when (and (table-has-fks? mp table)
                           (not (table-has-hidden-columns? mp table)))]
          (let [native-query (lib/native-query mp (str "SELECT * FROM " (:name table) " LIMIT 1"))]
            (mt/with-model-cleanup [:model/Card]
              (let [card (card/create-card! {:name                   (str "Native FK " (:name table))
                                             :display                :table
                                             :visualization_settings {}
                                             :dataset_query          native-query}
                                            {:id (mt/user->id :rasta)})
                    _    (wait-for-result-metadata (:id card))]
                (testing (str "table: " (:name table))
                  (testing "table -> native card: missing-foreign-key reported"
                    (is (some #(= :missing-foreign-key (:type %))
                              (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)]))))
                  ;; TODO: check-replace-source doesn't detect the reverse — native card→table
                  ;; returns [] because the native card has no FK metadata, so there are no FK
                  ;; columns in the old source to be "missing" from the new. Ideally this should
                  ;; also flag the incompatibility.
                  (testing "native card -> table: missing-foreign-key reported"
                    (is (some #(= :missing-foreign-key (:type %))
                              (replacement.source/check-replace-source [:card (:id card)] [:table (:id table)])))))))))))))

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
              (let [card (card/create-card! {:name                   (str "Native " (:name table))
                                             :display                :table
                                             :visualization_settings {}
                                             :dataset_query          native-query}
                                            {:id (mt/user->id :rasta)})
                    _    (wait-for-result-metadata (:id card))]
                (testing (str "table: " (:name table))
                  (testing "table -> native card"
                    (is (empty? (replacement.source/check-replace-source [:table (:id table)] [:card (:id card)]))))
                  (testing "native card -> table"
                    (is (empty? (replacement.source/check-replace-source [:card (:id card)] [:table (:id table)])))))))))))))
