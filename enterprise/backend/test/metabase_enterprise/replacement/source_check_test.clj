(ns metabase-enterprise.replacement.source-check-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.replacement.source-check :as replacement.source-check]
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

(deftest table-not-replaceable-with-itself-test
  (testing "Table cannot be replaced with itself"
    (mt/dataset test-data
      (is (=? {:success false}
              (replacement.source-check/check-replace-source [:table (mt/id :orders)] [:table (mt/id :orders)]))))))

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
                  (is (=? {:success true}
                          (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)]))))
                ;; table -> card is blocked for tables with incoming FKs (implicit joins check)
                ;; so we only assert success false for tables with incoming FKs
                (testing "table -> card"
                  (let [result (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)])]
                    (if (t2/exists? :model/Field
                                    :fk_target_field_id [:in (t2/select-pks-set :model/Field :table_id (:id table) :active true)]
                                    :active true)
                      (is (=? {:errors #(some #{:incompatible-implicit-joins} %)} result))
                      (is (=? {:success true} result)))))))))))))

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
                (is (=? {:success true}
                        (replacement.source-check/check-replace-source [:card (:id card-a)] [:card (:id card-b)]))))
              (testing "card-b -> card-a"
                (is (=? {:success true}
                        (replacement.source-check/check-replace-source [:card (:id card-b)] [:card (:id card-a)])))))))))))

(deftest card-with-expression-reports-extra-column-test
  (testing "A card with an added expression column reports missing columns in the card→table direction"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id :orders))
            query (as-> (lib/query mp table) q
                    (lib/expression q "expr" (lib/* (m/find-first #(= "TOTAL" (:name %))
                                                                  (lib/expressionable-columns q nil))
                                                    2)))]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (testing "table -> card with expression: no missing columns (card is a superset)"
            (is (=? {:success true}
                    (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)]))))
          (testing "card with expression -> table: expression column is missing"
            (is (=? {:success false}
                    (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)])))))))))

(deftest card-with-subset-of-fields-reports-missing-columns-test
  (testing "A card selecting a subset of fields reports missing columns in the table→card direction"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            table (lib.metadata/table mp (mt/id :products))
            query (as-> (lib/query mp table) q
                    (lib/with-fields q (mapv lib/ref (take 2 (lib/fieldable-columns q)))))]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (testing "table -> card with fewer fields: dropped columns are missing from new source"
            (is (=? {:success         false
                     :column_mappings #(some (fn [m] (and (:source m) (not (:target m)))) %)}
                    (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)]))))
          (testing "card with fewer fields -> table: no missing columns (table is a superset)"
            (is (=? {:success true}
                    (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)])))))))))

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
          (is (=? {:success false
                   :errors  #(some #{:incompatible-implicit-joins} %)}
                  (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)])))))))
  (testing "table→card without incoming FKs does not report :incompatible-implicit-joins"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            ;; REVIEWS has no incoming FKs
            table (lib.metadata/table mp (mt/id :reviews))
            query (lib/query mp table)]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (is (=? {:success true}
                  (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)])))))))
  (testing "card→table does not trigger implicit joins check"
    (mt/dataset test-data
      (let [mp    (mt/metadata-provider)
            ;; PEOPLE has incoming FKs, but card→table should not trigger the check
            table (lib.metadata/table mp (mt/id :people))
            query (lib/query mp table)]
        (mt/with-temp [:model/Card card {:dataset_query query
                                         :database_id   (mt/id)
                                         :type          :question}]
          (is (=? {:success true}
                  (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)])))))))
  (testing "table→table with incoming FKs reports :incompatible-implicit-joins"
    (mt/dataset test-data
      ;; PEOPLE has incoming FKs (ORDERS.USER_ID → PEOPLE.ID)
      (is (=? {:success false
               :errors  #(some #{:incompatible-implicit-joins} %)}
              (replacement.source-check/check-replace-source [:table (mt/id :people)] [:table (mt/id :products)]))))))

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
                  (testing "table -> native card: not swappable"
                    (is (=? {:success         false
                             :column_mappings #(some (fn [{:keys [errors]}] (some #{:missing-foreign-key} errors)) %)}
                            (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)]))))
                  (testing "native card -> table: swappable"
                    (is (=? {:success true}
                            (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)])))))))))))))

(deftest native-card-swappable-with-table-test
  ;; We only test tables without FK columns because native query result_metadata
  ;; (as computed by the QP) does not include :type/FK semantic types or
  ;; :fk-target-field-id. Tables with FK columns would produce fk-mismatch errors.
  ;;
  ;; We also exclude tables with hidden columns (e.g. USERS.PASSWORD) because
  ;; `SELECT *` returns all columns while `lib/returned-columns` omits hidden ones.
  (testing "A native query card with matching result_metadata is swappable with its table (no-FK tables only)"
    (mt/dataset places-cam-likes
      (let [mp           (mt/metadata-provider)
            table        (lib.metadata/table mp (mt/id :places))
            native-query (lib/native-query mp (str "SELECT * FROM " (:name table) " LIMIT 1"))]
        (mt/with-model-cleanup [:model/Card]
          (let [card (card/create-card! {:name                   (str "Native " (:name table))
                                         :display                :table
                                         :visualization_settings {}
                                         :dataset_query          native-query}
                                        {:id (mt/user->id :rasta)})
                _    (wait-for-result-metadata (:id card))]
            (testing (str "table: " (:name table))
              (testing "table -> native card"
                (is (=? {:success true}
                        (replacement.source-check/check-replace-source [:table (:id table)] [:card (:id card)]))))
              (testing "native card -> table"
                (is (=? {:success true}
                        (replacement.source-check/check-replace-source [:card (:id card)] [:table (:id table)])))))))))))
