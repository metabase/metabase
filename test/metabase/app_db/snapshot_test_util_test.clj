(ns metabase.app-db.snapshot-test-util-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.server :as server]
   [metabase.test :as mt]
   [metabase.util.encryption-test :as encryption-test]))

(set! *warn-on-reflection* true)

(deftest flavors-agree-test
  (testing "every flavor has a dumper, and every flavor but H2 a pinned server to dump it from"
    (is (= snapshot/flavors
           (set (keys @#'generate/flavor->dumper))))
    (is (= (disj snapshot/flavors :h2)
           (set (keys @#'server/flavor->server))))))

(deftest statements-test
  (testing "a snapshot file's statements come back without its comment header, ignoring a separator inside a line"
    (let [written ["INSERT INTO t VALUES ('a;\n--;; not a separator')" "SELECT 2"]]
      (is (= ["INSERT INTO t VALUES ('a;\n--;; not a separator');"
              "SELECT 2;"]
             (snapshot/statements (#'generate/file-content snapshot/snapshot-version :h2 written))))))
  (testing "a statement that opens with a comment line is kept"
    (is (= ["-- why\nSELECT 1"]
           (snapshot/statements "-- why\nSELECT 1\n--;;\n-- only a comment")))))

(deftest load-order-test
  (let [stmts ["CREATE TABLE a (id INT)"
               "CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v` AS SELECT 1"
               "INSERT INTO a VALUES (1)"
               "CREATE OR REPLACE SQL SECURITY DEFINER VIEW `w` AS SELECT 2"]]
    (testing "the MySQL family creates its views once the session guards are off, in their original order"
      (is (= [["CREATE TABLE a (id INT)"
               "INSERT INTO a VALUES (1)"]
              ["CREATE OR REPLACE SQL SECURITY INVOKER VIEW `v` AS SELECT 1"
               "CREATE OR REPLACE SQL SECURITY DEFINER VIEW `w` AS SELECT 2"]]
             (#'snapshot/load-order :mariadb stmts))))
    (testing "other flavors run everything in order under the guards"
      (is (= [stmts []]
             (#'snapshot/load-order :postgres stmts))))))

(deftest load-snapshot-restores-session-guards-test
  (testing "a failing guard still runs the statements that undo the guards, so the connection is not left relaxed"
    (impl/with-temp-empty-app-db [conn :h2]
      (mt/with-dynamic-fn-redefs [snapshot/session-guards (fn [_flavor]
                                                            [["SET @MB_RELAXED = 1" "NOT VALID SQL"]
                                                             ["SET @MB_RESTORED = 1"]])]
        (is (thrown? Exception (snapshot/load-snapshot! conn :h2))))
      (is (= [{:restored 1}]
             (jdbc/query {:connection conn} ["SELECT @MB_RESTORED AS restored"]))))))

(deftest load-snapshot-keeps-the-first-failure-test
  (testing "when restoring the guards fails too, the error that stopped the load is the one thrown"
    (impl/with-temp-empty-app-db [conn :h2]
      (mt/with-dynamic-fn-redefs [snapshot/session-guards (fn [_flavor]
                                                            [["NOT VALID SQL"]
                                                             ["ALSO NOT VALID"]])]
        (let [e (try
                  (snapshot/load-snapshot! conn :h2)
                  nil
                  (catch Exception e e))]
          (is (=? {:message    #"(?s).*NOT VALID SQL.*"
                   :suppressed [{:message #"(?s).*ALSO NOT VALID.*"}]}
                  {:message    (ex-message e)
                   :suppressed (mapv (fn [^Throwable s] {:message (ex-message s)})
                                     (.getSuppressed ^Throwable e))})))))))

(deftest load-snapshot-keeps-the-first-failure-on-a-dead-connection-test
  (testing "when the connection dies before autocommit is restored, the error that stopped the load is the one thrown"
    (impl/with-temp-empty-app-db [conn :h2]
      (mt/with-dynamic-fn-redefs [snapshot/session-guards (fn [_flavor]
                                                            [["NOT VALID SQL"]
                                                             ["SHUTDOWN IMMEDIATELY"]])]
        (let [e (try
                  (snapshot/load-snapshot! conn :h2)
                  nil
                  (catch Exception e e))]
          (is (=? {:message    #"(?s).*NOT VALID SQL.*"
                   :suppressed [#"(?s).*Database is already closed.*"]}
                  {:message    (ex-message e)
                   :suppressed (mapv ex-message (.getSuppressed ^Throwable e))})))))))

(deftest usable-for-start?-test
  (impl/with-temp-empty-app-db [conn :h2]
    (let [ids             (map first (snapshot/changesets conn))
          before-boundary (first ids)
          after-boundary  (last ids)]
      (testing "the snapshot can stand in for a start after its boundary, and not for one before it"
        ;; without a key whatever the environment sets, since a key alone makes the snapshot unusable
        (encryption-test/with-secret-key nil
          (is (true? (snapshot/usable-for-start? conn :h2 after-boundary)))
          (is (not (snapshot/usable-for-start? conn :h2 before-boundary)))))
      (testing "it is never used with an encryption key, since it was generated without one"
        (encryption-test/with-secret-key "dont-tell-anyone-about-this"
          (is (not (snapshot/usable-for-start? conn :h2 after-boundary))))))))
