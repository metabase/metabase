(ns lint-migrations-file-test
  (:require
   [clojure.spec.alpha :as s]
   [clojure.test :refer :all]
   [lint-migrations-file :as lint-migrations-file]))

(defn mock-change-set
  "Returns a \"strict\" migration (id > switch to strict). If you want a non-strict migration send :id 1 in `keyvals`. "
  [& keyvals]
  {:changeSet
   (merge
    {:id      1000
     :author  "camsaul"
     :comment "Added x.37.0"
     :changes [{:whatever {}}]}
    (apply array-map keyvals))})

(defn mock-column [& keyvals]
  {:column (merge {:name "bird_count", :type "integer", :remarks "Whatever"}
                  (apply array-map keyvals))})

(defn- mock-add-column-changes [& keyvals]
  {:addColumn (merge {:tableName "my_table"
                      :columns   [(mock-column)]}
                     (apply array-map keyvals))})

(defn- mock-create-table-changes [& keyvals]
  {:createTable (merge {:tableName "my_table"
                        :columns   [(mock-column)]
                        :remarks   "Wow"}
                       (apply array-map keyvals))})

(defn- validate [& changes]
  (lint-migrations-file/validate-migrations
   {:databaseChangeLog changes}))

(defn- validate-ex-info [& changes]
  (try (lint-migrations-file/validate-migrations {:databaseChangeLog changes})
       (catch Exception e (ex-data e))))

(deftest require-unique-ids-test
  (testing "Make sure all migration IDs are unique"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"distinct-change-set-ids"
         (validate
          (mock-change-set :id "1")
          (mock-change-set :id 1))))))

(deftest require-migrations-in-order-test
  (testing "Migrations must be in order"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"change-set-ids-in-order"
         (validate
          (mock-change-set :id 2)
          (mock-change-set :id 1))))))

(deftest only-one-column-per-add-column-test
  (testing "we should only allow one column per addColumn change"
    (doseq [id [1 200]]
      (is (= :ok
             (validate
              (mock-change-set
               :id id
               :changes [(mock-add-column-changes)]))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Extra input"
           (validate
            (mock-change-set
             :id id
             :changes [(mock-add-column-changes :columns [(mock-column :name "A")
                                                          (mock-column :name "B")])])))))))

(deftest one-change-per-change-set-test
  (testing "[strict only] only allow one change per change set"
    (is (= :ok
           (validate
            (mock-change-set :id 1 :changes [(mock-add-column-changes) (mock-add-column-changes)]))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Extra input"
         (validate
          (mock-change-set :changes [(mock-add-column-changes) (mock-add-column-changes)]))))))

(deftest require-comment-test
  (testing "[strict only] require a comment for a change set"
    (is (= :ok
           (validate (dissoc (mock-change-set) :comment))))
    (is (= :ok
           (validate (mock-change-set :id 200, :comment "Added x.38.0"))))))

(deftest no-on-delete-in-constraints-test
  (testing "Make sure we don't use onDelete in constraints"
    (doseq [id         [1 200]
            change-set [(mock-change-set
                         :id id
                         :changes [(mock-add-column-changes
                                    :columns [(mock-column :constraints {:onDelete "CASCADE"})])])
                        (mock-change-set
                         :id id
                         :changes [(mock-create-table-changes
                                    :columns [(mock-column :constraints {:onDelete "CASCADE"})])])]]
      (testing (format "Change set =\n%s" (pr-str change-set))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"onDelete is only for addForeignKeyConstraints"
             (validate change-set)))))))

(deftest require-remarks-for-create-table-test
  (testing "[strict only] require remarks for newly created tables"
    (is (= :ok
           (validate
            (mock-change-set
             :id 1
             :changes [(update (mock-create-table-changes) :createTable dissoc :remarks)]))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":remarks"
         (validate
          (mock-change-set
           :id 200
           :changes [(update (mock-create-table-changes) :createTable dissoc :remarks)]))))))

(deftest allow-multiple-sql-changes-if-dbmses-are-different
  (testing "Allow multiple SQL changes if DBMSes are different"
    (is (= :ok
           (validate
            (mock-change-set
             :id 200
             :changes
             [{:sql {:dbms "h2", :sql "1"}}
              {:sql {:dbms "postgresql", :sql "2"}}
              {:sql {:dbms "mysql,mariadb", :sql "3"}}])))))

  (testing "should fail if *any* change is missing dbms"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":dbms"
         (validate
          (mock-change-set
           :id 200
           :changes
           [{:sql {:dbms "h2", :sql "1"}}
            {:sql {:sql "2"}}])))))

  (testing "should fail if a DBMS is repeated"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":changes"
         (validate
          (mock-change-set
           :id 200
           :changes
           [{:sql {:dbms "h2", :sql "1"}}
            {:sql {:dbms "postgresql,h2", :sql "2"}}]))))))

(deftest validate-id-test
  (letfn [(validate-id [id]
            (validate (mock-change-set :id id)))]
    (testing "Valid new-style ID"
      (is (= :ok
             (validate-id "v42.00-000"))))
    (testing "ID that's missing a zero should fail"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"new-style-id"
           (validate-id "v42.01-01"))))
    (testing "ID with an extra zero should fail"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"new-style-id"
           (validate-id "v42.01-0001"))))
    (testing "Has to start with v"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"new-style-id"
           (validate-id "42.01-001"))))))

(deftest prevent-text-types-test
  (testing "should allow \"${text.type}\" columns from being added"
    (is (= :ok
          (validate
           (mock-change-set
             :id "v42.00-001"
             :changes [(mock-add-column-changes :columns [(mock-column :type "${text.type")])]))))
    (doseq [problem-type ["blob" "text"]]
      (testing (format "should prevent \"%s\" columns from being added after ID 320" problem-type)
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo
              #"(?s)^.*no-bare-blob-or-text-types\\?.*$"
              (validate
                (mock-change-set
                  :id "v42.00-001"
                  :changes [(mock-add-column-changes :columns [(mock-column :type problem-type)])]))))))))

(deftest require-rollback-test
  (testing "change types with no automatic rollback support"
    (testing "missing rollback key fails"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"rollback-present-when-required"
           (validate (mock-change-set :id "v45.12-345" :changes [{:sql {:sql "select 1"}}])))))
    (testing "nil rollback is allowed"
      (is (= :ok (validate (mock-change-set :id "v45.12-345"
                                            :changes [{:sql {:sql "select 1"}}]
                                            :rollback nil)))))
    (testing "rollback values are allowed"
      (is (= :ok (validate (mock-change-set :id "v45.12-345"
                                            :changes [{:sql {:sql "select 1"}}]
                                            :rollback {:sql {:sql "select 1"}}))))))
  (testing "change types with automatic rollback support are allowed"
    (is (= :ok (validate (mock-change-set :id "v45.12-345" :changes [(mock-add-column-changes)]))))))

(deftest disallow-deletecascade-in-addcolumn-test
  (testing "addColumn with deleteCascade fails"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"disallow-delete-cascade"
         (validate (mock-change-set :id "v45.12-345"
                                    :changes [(mock-add-column-changes
                                               :columns [(mock-column :constraints {:deleteCascade true})])]))))))

(deftest custom-changes-test
  (let [change-set (mock-change-set
                    :changes
                    [{:customChange {:class "metabase.db.custom_migrations.ReversibleUppercaseCards"}}])]
    (is (= :ok
           (validate change-set))))
  (testing "missing value"
    (let [change-set (mock-change-set
                      :changes
                      [{:customChange {}}])
          ex-info    (validate-ex-info change-set)]
      (is (not= :ok ex-info))))
  (testing "invalid values"
    (doseq [bad-value [nil 3 ""]]
      (let [change-set (mock-change-set
                        :changes
                        [{:customChange {:class bad-value}}])
            ex-info    (validate-ex-info change-set)
            specific   (->> ex-info
                            ::s/problems
                            (some (fn [problem]
                                    (when (= (:val problem) bad-value)
                                      problem))))]
        (is (not= :ok ex-info))
        (is (= (take-last 2 (:via specific))
               [:change.strict/customChange :custom-change/class]))))))
