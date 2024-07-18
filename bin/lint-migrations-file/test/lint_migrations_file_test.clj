(ns lint-migrations-file-test
  (:require
   [clojure.spec.alpha :as s]
   [clojure.test :refer :all]
   [lint-migrations-file :as lint-migrations-file]))

(defn- mock-change-set
  [& keyvals]
  {:changeSet
   (merge
    {:id      "v49.2024-01-01T10:30:00"
     :author  "camsaul"
     :comment "Added x.49.0"
     :changes [{:whatever {}}]
     :rollback []}
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
  (#'lint-migrations-file/validate-migrations
   {:databaseChangeLog changes}))

(defn- validate-ex-info [& changes]
  (try (#'lint-migrations-file/validate-migrations {:databaseChangeLog changes})
       (catch Exception e (ex-data e))))

(defmacro is-thrown-with-error-info? [msg info & body]
  `(let [exception# (try (do ~@body)
                         nil
                         (catch clojure.lang.ExceptionInfo e# e#)
                         (catch Throwable t#
                           (throw (ex-info "An unexpected exception type was thrown"
                                           {:expected clojure.lang.ExceptionInfo
                                            :actual t#}))))]
     (is (instance? clojure.lang.ExceptionInfo exception#)
         "Expected clojure.lang.ExceptionInfo but caught different type.")
     (is (not (nil? exception#))
         "No exception was thrown.")
     (is (::lint-migrations-file/validation-error (ex-data exception#))
         "The exception was not a validation error.")
     (let [ex-msg# (.getMessage exception#)
           ex-data# (dissoc (ex-data exception#) ::lint-migrations-file/validation-error)]
       (is (= ~msg ex-msg#)
           "Error message does not match expected.")
       (is (= ~info ex-data#)
           "Error info does not match expected."))))

(deftest require-unique-ids-test
  (testing "Make sure all migration IDs are unique"
    (is-thrown-with-error-info?
     "Change set IDs are not distinct."
     {:duplicates ["v49.2024-01-01T10:30:00"]}
     (validate
      (mock-change-set :id "v49.2024-01-01T10:30:00")
      (mock-change-set :id "v49.2024-01-01T10:30:00")))))

(deftest require-migrations-in-order-test
  (testing "Migrations must be in order"
    (is-thrown-with-error-info?
     "Change set IDs are not in order"
     {:out-of-order-ids [["v45.00-002" "v45.00-001"]]}
     (validate
      (mock-change-set :id "v45.00-002")
      (mock-change-set :id "v45.00-001")))

    (is-thrown-with-error-info?
     "Change set IDs are not in order"
     {:out-of-order-ids [["v49.2023-12-14T08:54:54"
                          "v49.2023-12-14T08:54:53"]]}
     (validate
      (mock-change-set :id "v49.2023-12-14T08:54:54")
      (mock-change-set :id "v49.2023-12-14T08:54:53")))))

(deftest only-one-column-per-add-column-test
  (testing "we should only allow one column per addColumn change"
    (doseq [id [1 200]]
      (is (= :ok
             (validate
              (mock-change-set
               :id (format "v45.00-%03d" id)
               :changes [(mock-add-column-changes)]))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid change set\."
           (validate
            (mock-change-set
             :id id
             :changes [(mock-add-column-changes :columns [(mock-column :name "A")
                                                          (mock-column :name "B")])])))))))

(deftest one-change-per-change-set-test
  (testing "only allow one change per change set"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate
          (mock-change-set :changes [(mock-add-column-changes) (mock-add-column-changes)]))))))

(deftest require-comment-test
  (testing "require a comment for a change set"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate (update (mock-change-set) :changeSet dissoc :comment))))
    (is (= :ok
           (validate (mock-change-set :id "v49.2024-01-01T10:30:00", :comment "Added x.45.0"))))))

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
             #"Invalid change set\."
             (validate change-set)))))))

(deftest require-remarks-for-create-table-test
  (testing "require remarks for newly created tables"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate
          (mock-change-set
           :id 200
           :changes [(update (mock-create-table-changes) :createTable dissoc :remarks)]))))))

(deftest allow-multiple-sql-changes-if-dbmses-are-different
  (testing "Allow multiple SQL changes if DBMSes are different"
    (is (= :ok
           (validate
            (mock-change-set
             :changes
             [{:sql {:dbms "h2", :sql "1"}}
              {:sql {:dbms "postgresql", :sql "2"}}
              {:sql {:dbms "mysql,mariadb", :sql "3"}}])))))

  (testing "should fail if *any* change is missing dbms"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate
          (mock-change-set
           :changes
           [{:sql {:dbms "h2", :sql "1"}}
            {:sql {:sql "2"}}])))))

  (testing "should fail if a DBMS is repeated"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate
          (mock-change-set
           :changes
           [{:sql {:dbms "h2", :sql "1"}}
            {:sql {:dbms "postgresql,h2", :sql "2"}}]))))))

(deftest validate-id-test
  (letfn [(validate-id [id]
            (validate (mock-change-set :id id)))]
    (testing "Valid old-style ID"
      (is (= :ok
             (validate-id "v42.00-000"))))
    (testing "Valid new-style ID"
      (is (= :ok
             (validate-id "v49.2024-01-01T10:30:00"))))

    (testing "invalid date components should throw an error"
      (are [msg id]
          (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid change set\."
           (validate-id "v49.2024-30-01T10:30:00")
           msg)
        "invalid month"  "v49.2024-13-01T10:30:00"
        "invalid day"    "v49.2024-01-32T10:30:00"
        "invalid hour"   "v49.2024-01-01T25:30:00"
        "invalid minute" "v49.2024-01-01T10:60:00"
        "invalid second" "v49.2024-01-01T10:30:60"))))

(deftest prevent-text-types-test
  (testing "should allow \"${text.type}\" columns from being added"
    (is (= :ok
           (validate
            (mock-change-set
             :id "v49.2024-01-01T10:30:00"
             :changes [(mock-add-column-changes :columns [(mock-column :type "${text.type}")])]))))
    (doseq [problem-type ["blob" "text"]]
      (testing (format "should prevent \"%s\" columns from being added after ID 320" problem-type)
        (is-thrown-with-error-info?
         "Migration(s) ['v49.2024-01-01T10:30:00'] uses invalid types (in 'blob','text')"
         {:invalid-ids ["v49.2024-01-01T10:30:00"]
          :target-types #{"blob" "text"}}
         (validate
          (mock-change-set
           :id "v49.2024-01-01T10:30:00"
           :changes [(mock-add-column-changes :columns [(mock-column :type problem-type)])])))))))

(deftest prevent-bare-boolean-type-test
  (testing "should allow adding \"${boolean.type}\" columns"
    (is (= :ok
           (validate
            (mock-change-set
             :id "v49.00-033"
             :changes [(mock-add-column-changes :columns [(mock-column :type "${boolean.type}")])]))))
    (testing "should prevent \"boolean\" columns from being added after ID v49.00-033"
      (is-thrown-with-error-info?
       "Migration(s) ['v49.00-033'] uses invalid types (in 'boolean')"
       {:invalid-ids ["v49.00-033"]
        :target-types #{"boolean"}}
       (validate (mock-change-set
                  :id "v49.00-033"
                  :changes [(mock-add-column-changes :columns [(mock-column :type "boolean")])]))))))

(deftest require-rollback-test
  (testing "change types with no automatic rollback support"
    (testing "missing rollback key fails"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid change set\."
           (validate (update (mock-change-set :id "v49.2024-01-01T10:30:00" :changes [{:sql {:sql "select 1"}}])
                             :changeSet dissoc :rollback)))))
    (testing "nil rollback is allowed"
      (is (= :ok (validate (mock-change-set :id "v49.2024-01-01T10:30:00"
                                            :changes [{:sql {:sql "select 1"}}]
                                            :rollback nil)))))
    (testing "rollback values are allowed"
      (is (= :ok (validate (mock-change-set :id "v49.2024-01-01T10:30:00"
                                            :changes [{:sql {:sql "select 1"}}]
                                            :rollback {:sql {:sql "select 1"}}))))))
  (testing "change types with automatic rollback support are allowed"
    (is (= :ok (validate (mock-change-set :id "v49.2024-01-01T10:30:00" :changes [(mock-add-column-changes)]))))))

(deftest require-precondition-test
  (testing "certain change types require preConditions"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set\."
         (validate (mock-change-set
                    :id "v51.2024-01-01T10:30:00"
                    :changes [(mock-create-table-changes)])))))

  (testing "other change types are exempt"
    (is (= :ok
           (validate
            (mock-change-set
             :changes
             [{:sql {:dbms "h2", :sql "1"}}])))))

  (testing "nil preConditions is allowed"
    (is (= :ok
           (validate (mock-change-set
                      :id "v51.2024-01-01T10:30:00"
                      :changes [(mock-create-table-changes)]
                      :preConditions nil)))))

  (testing "changeSets prior to v51 are exempt"
    (is (= :ok
           (validate (mock-change-set
                      :id "v50.2024-01-01T10:30:00"
                      :changes [(mock-create-table-changes)]))))))

(deftest disallow-deletecascade-in-addcolumn-test
  (testing "addColumn with deleteCascade fails"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid change set."
         (validate (mock-change-set :id "v49.2024-01-01T10:30:00"
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

(deftest forbidden-new-types-test
  (testing "should throw if changes contains text type"
    (is (is-thrown-with-error-info?
         "Migration(s) ['v45.12-345'] uses invalid types (in 'blob','text')"
         {:invalid-ids ["v45.12-345"]
          :target-types #{"blob" "text"}}
         (validate (mock-change-set :id "v45.12-345"
                                    :changes [{:modifyDataType {:newDataType "text"}}]
                                    :rollback nil))))
    (is-thrown-with-error-info?
     "Migration(s) ['v45.12-345'] uses invalid types (in 'blob','text')"
     {:invalid-ids ["v45.12-345"]
      :target-types #{"blob" "text"}}
     (validate (mock-change-set :id "v45.12-345"
                                :changes [{:createTable {:tableName "my_table"
                                                         :remarks "meow"
                                                         :columns [{:column {:name "foo"
                                                                             :remarks "none"
                                                                             :type "text"}}]}}]
                                :rollback nil))))

  (testing "should throw if changes contains boolean type"
    (is-thrown-with-error-info?
     "Migration(s) ['v49.00-033'] uses invalid types (in 'boolean')"
     {:invalid-ids ["v49.00-033"]
      :target-types #{"boolean"}}
     (validate (mock-change-set :id "v49.00-033"
                                :changes [{:modifyDataType {:newDataType "boolean"}}]
                                :rollback nil)))

    (is-thrown-with-error-info?
     "Migration(s) ['v49.00-033'] uses invalid types (in 'boolean')"
     {:invalid-ids ["v49.00-033"]
      :target-types #{"boolean"}}
     (validate (mock-change-set :id "v49.00-033"
                                :changes [{:createTable {:tableName "my_table"
                                                         :remarks "meow"
                                                         :columns [{:column {:name "foo"
                                                                             :remarks "none"
                                                                             :type "boolean"}}]}}])))
    (testing "does not throw for older migrations"
      (is (validate (mock-change-set :id "v45.00-033"
                                     :changes [{:createTable {:tableName "my_table"
                                                              :remarks "meow"
                                                              :columns [{:column {:name "foo"
                                                                                  :remarks "none"
                                                                                  :type "boolean"}}]}}])))))

  (testing "should throw if changes contains datetime type"
    (is-thrown-with-error-info?
     "Migration(s) ['v49.00-033'] uses invalid types (in 'timestamp','timestamp without time zone','datetime')"
     {:invalid-ids ["v49.00-033"]
      :target-types #{"timestamp" "timestamp without time zone" "datetime"}}
     (validate (mock-change-set :id "v49.00-033"
                                :changes [{:modifyDataType {:newDataType "datetime"}}]
                                :rollback nil)))

    (testing "(but not if it's an older migration)"
      (is (validate (mock-change-set :id "v45.12-345"
                                     :changes [{:createTable {:tableName "my_table"
                                                              :remarks "meow"
                                                              :columns [{:column {:name "foo"
                                                                                  :remarks "none"
                                                                                  :type "timestamp with time zone"}}]}}]
                                     :rollback nil))))))
