(ns metabase.app-db.sqlite-feature-queries-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.sqlite-test :as sqlite-test]
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.collections.children :as children]
   [metabase.metabot.db :as metabot.db]
   [metabase.sync.db :as sync.db]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (java.time OffsetDateTime)
   (org.h2.util ScriptReader)))

(set! *warn-on-reflection* true)

(defn- with-baseline! [f]
  (#'sqlite-test/with-sqlite
   (fn [^Connection conn]
     (with-open [reader (doto (ScriptReader. (io/reader (io/resource "sqlite/baseline.sql")))
                          (.setSkipRemarks true))
                 statement (.createStatement conn)]
       (.setAutoCommit conn false)
       (loop []
         (when-let [sql (.readStatement reader)]
           (when-not (str/blank? sql) (.execute statement sql))
           (recur)))
       (.commit conn)
       (.setAutoCommit conn true))
     (f))))

(deftest collection-sorting-and-random-sampling-test
  (#'sqlite-test/with-sqlite
   (fn [_]
     (t2/query ["CREATE TABLE probe (id INTEGER PRIMARY KEY, name TEXT, type TEXT, last_edit_timestamp TEXT, last_edit_last_name TEXT, last_edit_first_name TEXT)"])
     (t2/insert! :probe [{:id 1 :name "first" :last_edit_timestamp "2026-09-02" :last_edit_last_name "Z"}
                         {:id 2 :name "never edited"}
                         {:id 3 :name "third" :last_edit_timestamp "2026-09-01" :last_edit_last_name "A"}])
     (doseq [column [:last-edited-at :last-edited-by]
             [direction expected] [[:asc [3 1 2]] [:desc [1 3 2]]]]
       (is (= expected
              (mapv :id (t2/query {:select [:id]
                                   :from [:probe]
                                   :order-by (children/children-sort-clause
                                              {:sort-column column :sort-direction direction} :sqlite)})))))
     (is (= #{1 2 3} (set (map :id (t2/query {:select [:id]
                                              :from [:probe]
                                              :order-by (#'metabot.db/prompt-sample-order-by)}))))))))

(deftest sqlite-bookmark-query-test
  (with-baseline!
    (fn []
      (is (empty? (bookmarks.db/bookmark-rows-for-user 12345 {:current-user-id 12345 :is-superuser? true}))))))

(deftest sqlite-foreign-key-sync-query-test
  (with-baseline!
    (fn []
      (let [timestamps {:created_at (OffsetDateTime/parse "2026-09-24T00:00:00Z")
                        :updated_at (OffsetDateTime/parse "2026-09-24T00:00:00Z")}]
        (t2/insert! :metabase_database (merge timestamps {:id 12345 :name "probe" :engine "sqlite" :details "{}"}))
        (t2/insert! :metabase_table (mapv #(merge timestamps %)
                                          [{:id 12345 :name "orders" :active true :db_id 12345}
                                           {:id 12346 :name "people" :active true :db_id 12345}]))
        (t2/insert! :metabase_field (mapv #(merge timestamps {:base_type "type/Integer" :database_type "INTEGER"} %)
                                          [{:id 12345 :table_id 12345 :name "person_id" :has_field_values "auto-list"}
                                           {:id 12346 :table_id 12346 :name "id"}])))
      (is (= 1 (sync.db/mark-fk! 12345 nil "orders" "person_id" nil "people" "id")))
      (is (= {:fk_target_field_id 12346 :semantic_type "type/FK" :has_field_values nil}
             (select-keys (t2/select-one :metabase_field :id 12345)
                          [:fk_target_field_id :semantic_type :has_field_values])))
      (is (zero? (sync.db/mark-fk! 12345 nil "orders" "person_id" nil "people" "id"))
          "syncing an unchanged foreign key is a no-op"))))
