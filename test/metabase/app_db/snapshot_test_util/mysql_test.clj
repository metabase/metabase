(ns metabase.app-db.snapshot-test-util.mysql-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.snapshot-test-util.mysql :as snapshot.mysql]))

(deftest drop-version-gated-blocks-test
  (testing "version-gated blocks are dropped whether they end on their first line or a later one"
    (is (= ["CREATE TABLE `t` ("
            "  `id` int"
            ");"
            "INSERT INTO `t` VALUES (1);"]
           (#'snapshot.mysql/drop-version-gated-blocks
            ["/*!40101 SET @saved_cs_client = @@character_set_client */;"
             "CREATE TABLE `t` ("
             "  `id` int"
             ");"
             "/*!50001 CREATE VIEW `v` AS SELECT"
             "  1 AS `id` */;"
             "INSERT INTO `t` VALUES (1);"])))))

(deftest drop-sandbox-directive-test
  (testing "the sandbox directive mariadb-dump opens with is dropped, and nothing else"
    (is (= ["CREATE TABLE `t` (`id` int);"]
           (#'snapshot.mysql/drop-sandbox-directive
            ["/*M!999999\\- enable the sandbox mode */"
             "CREATE TABLE `t` (`id` int);"])))))
