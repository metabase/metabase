(ns metabase.sync.sync-metadata.fields.sync-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.table :refer [Table]]
   [metabase.sync.sync-metadata.fields.sync-metadata :as sync-metadata]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- updates-that-will-be-performed
  ([new-metadata-from-sync metadata-in-application-db]
   ;; use alphabetical field_order by default because the default, database, will update the position
   (updates-that-will-be-performed new-metadata-from-sync metadata-in-application-db {:field_order :alphabetical}))
  ([new-metadata-from-sync metadata-in-application-db table]
   (t2.with-temp/with-temp [Table table table]
     (let [update-operations (atom [])]
       (with-redefs [t2/update! (fn [model id updates]
                                  (swap! update-operations conj [(name model) id updates])
                                  (count updates))]
         (#'sync-metadata/update-field-metadata-if-needed!
          table
          new-metadata-from-sync
          metadata-in-application-db)
         @update-operations)))))

(deftest database-type-changed-test
  (testing "test that if database-type changes we will update it in the DB"
    (is (= [["Field" 1 {:database_type "Integer"}]]
           (updates-that-will-be-performed
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
   :database-is-auto-increment false})

(deftest database-position-changed-test
  (testing "test that if database-position changes and table.field_order=database we will update the position too"
    (is (= [["Field" 1 {:database_position 1
                        :position          1}]]
           (updates-that-will-be-performed
            (merge default-metadata {:database-position 1})
            (merge default-metadata {:database-position 0
                                     :position          0
                                     :id                1})
            {:field_order :database})))
    (testing "but not if the table's fields should not be sorted according to the database"
      (is (= [["Field" 1 {:database_position 1}]]
             (updates-that-will-be-performed
              (merge default-metadata {:database-position 1})
              (merge default-metadata {:database-position 0
                                       :position          0
                                       :id                1})
              {:field_order :alphabetical}))))))

(deftest database-required-changed-test
  (testing "test that if database-required changes we will update it in the DB"
    (is (= [["Field" 1 {:database_required false}]]
           (updates-that-will-be-performed
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
           (updates-that-will-be-performed
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
           (updates-that-will-be-performed
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
           (updates-that-will-be-performed
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
           (updates-that-will-be-performed
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

(deftest nil-database-type-test
  (testing (str "test that if `database-type` comes back as `nil` in the metadata from the sync process, we won't try "
                "to set a `nil` value in the DB -- this is against the rules -- we should set `NULL` instead. See "
                "`TableMetadataField` schema.")
    (is (= [["Field" 1 {:database_type "NULL"}]]
           (updates-that-will-be-performed
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
           (updates-that-will-be-performed
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

(deftest dont-overwrite-semantic-type-test
  (testing "We should not override non-nil `semantic_type`s"
    (is (= []
           (updates-that-will-be-performed
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
