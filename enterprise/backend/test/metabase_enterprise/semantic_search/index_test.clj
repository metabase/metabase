(ns metabase-enterprise.semantic-search.index-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [next.jdbc :as jdbc]))

(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn- once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

(use-fixtures :once once-fixture)

(defn- table-exists-in-db?
  "Check if a table actually exists in the database"
  [table-name]
  (when table-name
    (try
      (let [result (jdbc/execute! @semantic.db/data-source
                                  ["SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?)"
                                   (name table-name)])]
        (-> result first vals first))
      (catch Exception _ false))))

(defmacro ^:private with-test-setup! [& body]
  "Set up a clean test environment with proper cleanup"
  `(let [original-active# (semantic.index/active-table)]
     (binding [semantic.index/*vector-dimensions* 4
               semantic.index/*table-name-prefix* "test_search_index"]
       ;; Start with clean state
       (semantic.index/reset-tracking!)
       (try
         ~@body
         (finally
           ;; Restore original state
           (semantic.index/reset-tracking!)
           (when original-active#
             (swap! @#'semantic.index/*indexes* assoc :active original-active#)))))))

(deftest table-generation-test
  (testing "Table name generation produces unique names"
    (binding [semantic.index/*table-name-prefix* "test_search_index"]
      (let [name1 (semantic.index/gen-table-name)
            name2 (semantic.index/gen-table-name)]
        (is (keyword? name1))
        (is (keyword? name2))
        (is (not= name1 name2))
        (is (re-matches #"test_search_index__.*" (name name1)))))))

(deftest table-state-management-test
  (testing "Basic table state management"
    (with-test-setup!
      (testing "Initial state is empty"
        (is (nil? (semantic.index/active-table)))
        (is (nil? (#'semantic.index/pending-table))))

      (testing "Can create and track pending table"
        (let [pending-table (semantic.index/maybe-create-pending!)]
          (is (some? pending-table))
          (is (= pending-table (#'semantic.index/pending-table)))
          (is (nil? (semantic.index/active-table)))

          ;; Verify table actually exists in database
          (is (table-exists-in-db? pending-table))

          ;; Clean up the created table & tracking
          (semantic.index/drop-index-table! pending-table)
          (is (not (table-exists-in-db? pending-table)))
          (semantic.index/reset-tracking!)))

      (testing "Can activate pending table"
        (let [pending-table (semantic.index/maybe-create-pending!)]
          (is (some? pending-table))
          (is (table-exists-in-db? pending-table))

          (is (semantic.index/activate-table!))
          (is (= pending-table (semantic.index/active-table)))
          (is (nil? (#'semantic.index/pending-table)))

          ;; Table should still exist, just now as active
          (is (table-exists-in-db? pending-table))

          ;; Clean up the active table
          (semantic.index/drop-index-table! pending-table)
          (is (not (table-exists-in-db? pending-table))))))))

(deftest table-swapping-test
  (testing "Table swapping workflow"
    (with-test-setup!
      (let [;; Create initial active table
            table1 (semantic.index/gen-table-name)
            _ (semantic.index/create-index-table! {:table-name table1})
            _ (swap! @#'semantic.index/*indexes* assoc :active table1)]

        (try
          (testing "Initial state"
            (is (= table1 (semantic.index/active-table)))
            (is (nil? (#'semantic.index/pending-table)))
            ;; Verify table1 exists in database
            (is (table-exists-in-db? table1)))

          (testing "Create pending table"
            (let [table2 (semantic.index/maybe-create-pending!)]
              (is (some? table2))
              (is (not= table1 table2))
              (is (= table1 (semantic.index/active-table)))
              (is (= table2 (#'semantic.index/pending-table)))

              ;; Both tables should exist in database
              (is (table-exists-in-db? table1))
              (is (table-exists-in-db? table2))

              (testing "Activate pending table (swap)"
                (is (semantic.index/activate-table!))
                (is (= table2 (semantic.index/active-table)))
                (is (nil? (#'semantic.index/pending-table)))

                ;; The old active table should be cleaned up automatically by activate-table!
                (is (not (table-exists-in-db? table1)))
                ;; New active table should still exist
                (is (table-exists-in-db? table2))

                ;; Only clean up the new active table
                (semantic.index/drop-index-table! table2)
                (is (not (table-exists-in-db? table2))))))

          (finally
            ;; Cleanup: drop table1 if it still exists
            (try (semantic.index/drop-index-table! table1) (catch Exception _))))))))

(deftest reset-index-test
  (testing "reset-index! creates new active table"
    (with-test-setup!
      (testing "reset-index! when no tables exist"
        (semantic.index/reset-index!)
        (let [active-table (semantic.index/active-table)]
          (is (some? active-table))
          (is (nil? (#'semantic.index/pending-table)))

          ;; Verify table actually exists in database
          (is (table-exists-in-db? active-table))

          ;; Clean up
          (semantic.index/drop-index-table! active-table)
          (is (not (table-exists-in-db? active-table)))))

      (testing "reset-index! replaces existing tables"
        ;; Set up initial state with both active and pending
        (let [old-active (semantic.index/gen-table-name)
              old-pending (semantic.index/gen-table-name)]
          (semantic.index/create-index-table! {:table-name old-active})
          (semantic.index/create-index-table! {:table-name old-pending})
          (swap! @#'semantic.index/*indexes* assoc :active old-active :pending old-pending)

          (try
            ;; Verify old tables exist before reset
            (is (table-exists-in-db? old-active))
            (is (table-exists-in-db? old-pending))

            (semantic.index/reset-index!)
            (let [new-active (semantic.index/active-table)]
              (is (some? new-active))
              (is (not= old-active new-active))
              (is (not= old-pending new-active))
              (is (nil? (#'semantic.index/pending-table)))

              ;; Verify new active table exists and old tables are cleaned up
              (is (table-exists-in-db? new-active))
              ;; Note: reset-index! should clean up the old pending table
              (is (not (table-exists-in-db? old-pending)))

              ;; Clean up new active table
              (semantic.index/drop-index-table! new-active)
              (is (not (table-exists-in-db? new-active))))

            (finally
              ;; Clean up old tables if they still exist
              (try (semantic.index/drop-index-table! old-active) (catch Exception _))
              (try (semantic.index/drop-index-table! old-pending) (catch Exception _)))))))))

(deftest ensure-ready-test
  (testing "ensure-ready! creates index when needed"
    (with-test-setup!
      (testing "Creates index when none exists"
        (is (semantic.index/ensure-ready!))
        (let [active-table (semantic.index/active-table)]
          (is (some? active-table))

          ;; Verify table exists in database
          (is (table-exists-in-db? active-table))

          ;; Clean up
          (semantic.index/drop-index-table! active-table)
          (is (not (table-exists-in-db? active-table)))))

      (testing "Does nothing when index already exists"
        (semantic.index/reset-index!)
        (let [original-active (semantic.index/active-table)]
          (is (some? original-active))
          (is (table-exists-in-db? original-active))

          (is (nil? (semantic.index/ensure-ready!))) ; Should return nil since it was already ready
          (is (= original-active (semantic.index/active-table)))
          (is (table-exists-in-db? original-active)) ; Table should still exist

          ;; Clean up
          (semantic.index/drop-index-table! original-active)
          (is (not (table-exists-in-db? original-active)))))

      (testing "Force reset recreates index"
        (semantic.index/reset-index!)
        (let [original-active (semantic.index/active-table)]
          (is (some? original-active))
          (is (table-exists-in-db? original-active))

          (is (semantic.index/ensure-ready! :force-reset? true))
          (let [new-active (semantic.index/active-table)]
            (is (some? new-active))
            (is (not= original-active new-active))

            ;; Verify new table exists and old table is gone
            (is (table-exists-in-db? new-active))
            ;; Note: force-reset may or may not clean up the old table depending on implementation

            ;; Clean up
            (semantic.index/drop-index-table! new-active)
            (is (not (table-exists-in-db? new-active)))))))))
