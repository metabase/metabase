(ns metabase.app-db.general-schema-tests
  "General tests to make sure our app DB schema is sane."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel no-tiny-int-columns
  (when (= (mdb/db-type) :mysql)
    (testing "All boolean columns in mysql, mariadb should be bit(1)"
      (is (= [] (t2/query
                 {:select [:table_name :column_name]
                  :from   [:information_schema.columns]
                  :where  [:and
                           [:like :data_type "tinyint%"]
                           [:= :table_schema (with-open [conn (-> (mdb/app-db) .getConnection)]
                                               (.getCatalog conn))]]}))))))

(deftest ^:parallel fks-are-indexed-test
  (when (= (mdb/db-type) :postgres)
    (let [excluded-fks #{{:table_name  "data_app"
                          :column_name "creator_id"}
                         ;; this column only exists on release 64: a v65 migration drops it, so it doesn't need an index
                         {:table_name  "data_app"
                          :column_name "permission_group_id"}}
          indexed-fks  (t2/query
                        {:select   [[[:cast [:cast :c.conrelid :regclass] :text] :table_name]
                                    [:a.attname :column_name]]
                         :from     [[:pg_constraint :c]]
                         :join     [[:pg_attribute :a] [:and
                                                        [:= :a.attnum [:any :c.conkey]]
                                                        [:= :a.attrelid :c.conrelid]]]
                         :where    [:and
                                    [:= :c.contype "f"]
                                    [:not-exists ^:allow-subquery {:select [[[:inline 1] :one]]
                                                                   :from   [[:pg_index :i]]
                                                                   :where  [:and
                                                                            [:= :i.indrelid :c.conrelid]
                                                                            [:= :a.attnum [:any :i.indkey]]]}]]
                         :order-by [:table_name :column_name]})]
      (doseq [fk indexed-fks]
        (testing (format "Consider adding an index on %s.%s or add it to the excluded-fks set" (:table_name fk) (:column_name fk))
          (is (contains? excluded-fks fk)))))))
