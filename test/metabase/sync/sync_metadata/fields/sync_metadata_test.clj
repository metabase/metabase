(ns metabase.sync.sync-metadata.fields.sync-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sync.core :as sync]
   [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]))

(defn- updates-that-will-be-performed!
  ([new-metadata-from-sync metadata-in-application-db]
   ;; use alphabetical field_order by default because the default, database, will update the position
   (updates-that-will-be-performed! new-metadata-from-sync metadata-in-application-db {:field_order :alphabetical}))
  ([new-metadata-from-sync metadata-in-application-db table]
   (updates-that-will-be-performed! new-metadata-from-sync metadata-in-application-db table {}))
  ([new-metadata-from-sync metadata-in-application-db table db-settings]
   (mt/with-temp [:model/Database db (cond-> {}
                                       (seq db-settings) (assoc :settings db-settings))
                  :model/Table table (assoc table :db_id (u/the-id db))]
     (let [update-operations (atom [])]
       (with-redefs [t2/update! (fn [model id updates]
                                  (swap! update-operations conj [(name model) id updates])
                                  (count updates))]
         (#'sync-metadata/update-field-metadata-if-needed!
          db
          table
          new-metadata-from-sync
          metadata-in-application-db)
         @update-operations)))))

(deftest database-type-changed-test
  (testing "test that if database-type changes we will update it in the DB"
    (is (= [["Field" 1 {:database_type "Integer"}]]
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment false}
            {:name                       "My Field"
             :database-type              "NULL"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :database-is-auto-increment false})))))

(def ^:private default-metadata
  {:name                       "My Field"
   :database-type              "Integer"
   :base-type                  :type/Integer
   :database-position          0
   :database-required          false
   :database-is-auto-increment false
   :database-partitioned       nil})

(deftest database-position-changed-test
  (testing "test that if database-position changes and table.field_order=database we will update the position too"
    (is (= [["Field" 1 {:database_position 1
                        :position          1}]]
           (updates-that-will-be-performed!
            (merge default-metadata {:database-position 1})
            (merge default-metadata {:database-position 0
                                     :position          0
                                     :id                1})
            {:field_order :database})))
    (testing "but not if the table's fields should not be sorted according to the database"
      (is (= [["Field" 1 {:database_position 1}]]
             (updates-that-will-be-performed!
              (merge default-metadata {:database-position 1})
              (merge default-metadata {:database-position 0
                                       :position          0
                                       :id                1})
              {:field_order :alphabetical}))))))

(deftest database-required-changed-test
  (testing "test that if database-required changes we will update it in the DB"
    (is (= [["Field" 1 {:database_required false}]]
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment false}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :id                         1
             :position                   0
             :database-position          0
             :database-required          true
             :database-is-auto-increment false})))))

(deftest database-is-auto-increment-changed-test
  (testing "test that if database-required changes we will update it in the DB"
    (is (= [["Field" 1 {:database_is_auto_increment true}]]
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment true}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :database-is-auto-increment false})))
    (is (= [["Field" 1 {:database_is_auto_increment false}]]
           (updates-that-will-be-performed!
            {:name              "My Field"
             :database-type     "Integer"
             :base-type         :type/Integer
             :database-position 0
             ;; no :database-is-auto-increment key to test case where describe-table does not not return it
             :database-required false}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :database-is-auto-increment true})))))

(deftest json-unfolding-test
  (testing "test that if json-unfolding changes the DB doesn't get updated"
    (is (= []
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :json-unfolding             true
             :database-is-auto-increment false}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :json-unfolding             false
             :database-is-auto-increment false})))))

(deftest no-op-test
  (testing "no changes should be made (i.e., no calls to `update!`) if nothing changes"
    (is (= []
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment true
             :json-unfolding             false}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :database-is-auto-increment true
             :json-unfolding             false})))))

(deftest update-database-partitioned-test
  (testing "update from nil -> boolean"
    (is (= [["Field" 1 {:database_partitioned false}]]
           (updates-that-will-be-performed!
            (merge default-metadata {:database-partitioned false})
            (merge default-metadata {:database-partitioned nil :id 1})))))

  (testing "flip the state"
    (is (= [["Field" 1 {:database_partitioned false}]]
           (updates-that-will-be-performed!
            (merge default-metadata {:database-partitioned false})
            (merge default-metadata {:database-partitioned true :id 1}))))))

(deftest nil-database-type-test
  (testing (str "test that if `database-type` comes back as `nil` in the metadata from the sync process, we won't try "
                "to set a `nil` value in the DB -- this is against the rules -- we should set `NULL` instead. See "
                "`TableMetadataField` schema.")
    (is (= [["Field" 1 {:database_type "NULL"}]]
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              nil
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment false
             :json-unfolding             false}
            {:name                       "My Field"
             :database-type              "Integer"
             :base-type                  :type/Integer
             :database-position          0
             :id                         1
             :database-required          false
             :database-is-auto-increment false
             :json-unfolding             false}))))

  (testing (str "if `database-type` comes back as `nil` and was already saved in application DB as `NULL` no changes "
                "should be made")
    (is (= []
           (updates-that-will-be-performed!
            {:name                       "My Field"
             :database-type              nil
             :base-type                  :type/Integer
             :database-position          0
             :database-required          false
             :database-is-auto-increment false
             :json-unfolding             false}
            {:name                       "My Field"
             :database-type              "NULL"
             :base-type                  :type/Integer
             :id                         1
             :database-position          0
             :database-required          false
             :database-is-auto-increment false
             :json-unfolding             false})))))

(deftest crufty-field-sets-preview-display-false-test
  (testing "When a field becomes crufty (matches auto-cruft pattern), preview_display should be set to false"
    (testing "field with preview_display=true should have it set to false when crufty"
      (is (= [["Field" 1 {:visibility_type :details-only
                          :preview_display false}]]
             (updates-that-will-be-performed!
              ;; new metadata from sync - field name matches auto-cruft pattern
              (merge default-metadata {:name "updated_at"})
              ;; existing field in application DB with preview_display=true
              (merge default-metadata {:name            "updated_at"
                                       :id              1
                                       :visibility-type :normal
                                       :preview-display true})
              {:field_order :alphabetical}
              ;; database settings with auto-cruft pattern matching "updated_at"
              {:auto-cruft-columns ["updated_at"]}))))
    (testing "field already with preview_display=false should not be updated again"
      (is (= [["Field" 1 {:visibility_type :details-only}]]
             (updates-that-will-be-performed!
              (merge default-metadata {:name "updated_at"})
              (merge default-metadata {:name            "updated_at"
                                       :id              1
                                       :visibility-type :normal
                                       :preview-display false})
              {:field_order :alphabetical}
              {:auto-cruft-columns ["updated_at"]}))))))

(deftest dont-overwrite-semantic-type-test
  (testing "We should not override non-nil `semantic_type`s"
    (is (= []
           (updates-that-will-be-performed!
            {:name              "My Field"
             :database-type     "Integer"
             :base-type         :type/Integer
             :semantic-type     nil
             :database-position 0
             :json-unfolding    false
             :database-required false
             :database-is-auto-increment false}
            {:name              "My Field"
             :database-type     "Integer"
             :base-type         :type/Integer
             :semantic-type     :type/Price
             :id                1
             :database-position 0
             :json-unfolding    false
             :database-required false
             :database-is-auto-increment false})))))

(deftest base-type-change-will-trigger-fingerprint-and-analyze-test
  (testing "A base type of a field changes only when the field is dropped then a new field with the name is created (#37047).
           In this case, we should make sure effective type is set to base type"
    (is (= [["FieldUserSettings"
             1
             {:effective_type      :type/Text
              :coercion_strategy   nil
              :semantic_type       nil}]
            ["Field"
             1
             {:base_type           :type/Text
              :effective_type      :type/Text
              :coercion_strategy   nil
              :fingerprint_version 0
              :fingerprint         nil
              :semantic_type       nil}]]
           (updates-that-will-be-performed!
            (merge default-metadata
                   {:id             1
                    :base-type      :type/Text
                    :effective-type :type/Text})
            (merge default-metadata
                   {:id             1
                    :base-type      :type/Integer
                    :effective-type :type/Integer}))))

    (testing "and sync will re-fingerprint and analyze this field"
      (mt/with-temp-test-data [["table"
                                [{:field-name "field"
                                  :base-type  :type/Text}]
                                [["ngoc@metabase.com"]]]]
        (try
          (sync/sync-table! (t2/select-one :model/Table (mt/id :table)))
          (let [original-field (t2/select-one :model/Field (mt/id :table :field))]
            (testing "sanity check: the original state"
              (is (=? {:semantic_type  :type/Email
                       :fingerprint    (mt/malli=? :map)
                       :base_type      :type/Text
                       :effective_type :type/Text}
                      original-field)))
           ;; drop the column and create a new one with the same name
            (sql-jdbc.execute/do-with-connection-with-options
             :h2
             (mt/db)
             {}
             (fn [conn]
               (doseq [sql ["ALTER TABLE \"TABLE\" DROP COLUMN \"FIELD\";"
                            "ALTER TABLE \"TABLE\" ADD COLUMN \"FIELD\" INTEGER;"
                            "INSERT INTO \"TABLE\"(field) VALUES(1);"]]
                 (next.jdbc/execute! conn [sql]))))
            (sync/sync-table! (t2/select-one :model/Table (mt/id :table)))
            (let [new-field (t2/select-one :model/Field (mt/id :table :field))]
              (testing "updated field is re-fingerprinted and analyzed"
                (is (=? {:semantic_type  nil
                         :fingerprint    (mt/malli=? :map)
                         :base_type      :type/Integer
                         :effective_type :type/Integer}
                        new-field))
                (is (not= (:fingerprint original-field) (:fingerprint new-field))))))
          (finally
            (t2/delete! :model/Database (mt/id))))))))

(deftest create-or-replace-table-updates-effective-type-test
  (testing "GHY-3388: when a column's database type changes in place (e.g. TEXT -> numeric via
           Snowflake's CREATE OR REPLACE TABLE AS SELECT TRY_TO_NUMBER(...)), sync should update
           effective_type to match the new base_type and clear any stale coercion_strategy/semantic_type.
           Reproduces the in-place update path (repro v1 from the Linear issue), where the field row
           is preserved and only updated — as opposed to being dropped and re-created (repro v2)."
    (mt/with-temp-test-data [["my_table"
                              [{:field-name "text_column"
                                :base-type  :type/Text}]
                              [["100"] ["200"] ["300"]]]]
      (try
        (sync/sync-database! (mt/db))
        (let [original-field (t2/select-one :model/Field (mt/id :my_table :text_column))]
          (testing "sanity check: original column is text"
            (is (=? {:base_type      :type/Text
                     :effective_type :type/Text}
                    original-field)))
          ;; Mimic Snowflake's CREATE OR REPLACE TABLE AS SELECT TRY_TO_NUMBER(text_column) —
          ;; the column is converted to a numeric type in place, preserving the field's identity
          ;; in Metabase's app DB (same name, same position). Snowflake's CREATE OR REPLACE does
          ;; not translate to H2, so we use ALTER COLUMN to achieve the same "in-place update" effect.
          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           (mt/db)
           {}
           (fn [conn]
             (doseq [sql ["DROP TABLE \"MY_TABLE\";"
                          "CREATE TABLE \"MY_TABLE\" (\"TEXT_COLUMN\" DECIMAL(38,2));"
                          "INSERT INTO \"MY_TABLE\"(text_column) VALUES(100.00),(200.00),(300.00);"]]
               (next.jdbc/execute! conn [sql]))))
          (sync/sync-database! (mt/db))
          (let [new-field (t2/select-one :model/Field (mt/id :my_table :text_column))]
            (testing "after sync, base_type and effective_type both reflect the new numeric column
                     and stale coercion/semantic type are cleared"
              (is (=? {:id                (:id original-field)
                       :base_type         :type/Decimal
                       :effective_type    :type/Decimal
                       :coercion_strategy nil
                       :semantic_type     nil}
                      new-field))))

          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           (mt/db)
           {}
           (fn [conn]
             (doseq [sql ["DROP TABLE \"MY_TABLE\";"]]
               (next.jdbc/execute! conn [sql]))))

          (t2/delete! :model/Table (:table_id original-field))
          (t2/delete! :model/Field :table_id (:table_id original-field))

          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           (mt/db)
           {}
           (fn [conn]
             (doseq [sql ["CREATE TABLE \"MY_TABLE\" (\"TEXT_COLUMN\" TEXT);"
                          "INSERT INTO \"MY_TABLE\"(text_column) VALUES('100'),('200'),('300');"]]
               (next.jdbc/execute! conn [sql]))))
          (sync/sync-database! (mt/db))
          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           (mt/db)
           {}
           (fn [conn]
             (doseq [sql ["DROP TABLE \"MY_TABLE\";"
                          "CREATE TABLE \"MY_TABLE\" (\"TEXT_COLUMN\" DECIMAL(38,2));"
                          "INSERT INTO \"MY_TABLE\"(text_column) VALUES(100.00),(200.00),(300.00);"]]
               (next.jdbc/execute! conn [sql]))))
          (sync/sync-database! (mt/db))

          (let [new-field (t2/select-one :model/Field :name "TEXT_COLUMN")]
            (testing "after sync, base_type and effective_type both reflect the new numeric column
                     and stale coercion/semantic type are cleared"
              (is (=? {:base_type         :type/Decimal
                       :effective_type    :type/Decimal
                       :coercion_strategy nil
                       :semantic_type     nil}
                      new-field))))
          )
        (finally
          (t2/delete! :model/Database (mt/id)))))))
