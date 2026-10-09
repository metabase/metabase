(ns metabase.sync.sync-metadata.metabase-metadata-test
  "Tests for the logic that syncs the `_metabase_metadata` Table."
  (:require
   [clojure.test :refer :all]
   [metabase.sync.sync-metadata.metabase-metadata :as metabase-metadata]
   [metabase.test :as mt]
   [metabase.test.mock.moviedb :as moviedb]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest sync-metabase-metadata-test
  (testing ":Test that the `_metabase_metadata` table can be used to populate values for things like descriptions"
    (letfn [(get-table-and-fields-descriptions [table-or-id]
              (-> (t2/select-one [:model/Table :id :name :description], :id (u/the-id table-or-id))
                  (t2/hydrate :fields)
                  (update :fields #(for [field %]
                                     (select-keys field [:name :description])))
                  mt/boolean-ids-and-timestamps))]
      (mt/with-temp [:model/Database db {:engine ::moviedb/moviedb}]
        ;; manually add in the movies table
        (let [table (first (t2/insert-returning-instances! :model/Table
                                                           :db_id  (u/the-id db)
                                                           :name   "movies"
                                                           :active true))]
          (t2/insert! :model/Field
                      :database_type "BOOL"
                      :base_type     :type/Boolean
                      :table_id      (u/the-id table)
                      :name          "filming")
          (testing "before"
            (is (= {:name        "movies"
                    :description nil
                    :id          true
                    :fields      [{:name "filming", :description nil}]}
                   (get-table-and-fields-descriptions table)))
            (is (nil? (:description (t2/select-one :model/Database :id (u/the-id db))))))
          (metabase-metadata/sync-metabase-metadata! db)
          (testing "after"
            (is (= {:name        "movies"
                    :description "A cinematic adventure."
                    :id          true
                    :fields      [{:name "filming", :description "If the movie is currently being filmed."}]}
                   (get-table-and-fields-descriptions table)))
            (is (= "Information about movies" (:description (t2/select-one :model/Database :id (u/the-id db)))))))))))

(deftest set-property-only-sets-descriptive-properties-test
  (testing "`_metabase_metadata` comes from the warehouse, so it can only set descriptive properties"
    (mt/with-temp [:model/Database db    {:engine ::moviedb/moviedb}
                   :model/Table    table {:db_id (u/the-id db), :name "movies", :active true}
                   :model/Field    field {:table_id (u/the-id table), :name "filming", :base_type :type/Boolean}]
      (let [set-property! (fn [keypath value]
                            (#'metabase-metadata/set-property! db (#'metabase-metadata/parse-keypath keypath) value))]
        (testing "descriptive properties are set"
          (is (true? (set-property! "caveats" "db caveat")))
          (is (true? (set-property! "movies.caveats" "table caveat")))
          (is (true? (set-property! "movies.filming.semantic_type" "type/Category")))
          (is (= "db caveat" (t2/select-one-fn :caveats :model/Database :id (u/the-id db))))
          (is (= "table caveat" (t2/select-one-fn :caveats :model/Table :id (u/the-id table))))
          (is (= :type/Category (t2/select-one-fn :semantic_type :model/Field :id (u/the-id field)))))
        (testing "admin-only properties are ignored"
          (are [keypath value] (false? (set-property! keypath value))
            "settings"                       "{\"database-enable-actions\":true}"
            "engine"                         "postgres"
            "details"                        "{}"
            "movies.db_id"                   "13371337"
            "movies.visibility_type"         "hidden"
            "movies.filming.visibility_type" "sensitive"
            "movies.filming.table_id"        "13371337"
            "movies.filming.field_type"      "type/Category")
          (let [db (t2/select-one :model/Database :id (u/the-id db))]
            (is (= ::moviedb/moviedb (:engine db)))
            (is (nil? (get-in db [:settings :database-enable-actions]))))
          (is (=? {:db_id (u/the-id db), :visibility_type nil}
                  (t2/select-one :model/Table :id (u/the-id table))))
          (is (=? {:table_id (u/the-id table), :visibility_type :normal}
                  (t2/select-one :model/Field :id (u/the-id field)))))))))
