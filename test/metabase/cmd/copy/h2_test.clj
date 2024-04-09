(ns metabase.cmd.copy.h2-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.copy.h2 :as copy.h2]
   [metabase.db.data-source :as mdb.data-source]))

(deftest ^:parallel h2-data-source-test
  (testing "works without file: schema"
    (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:h2:file:/path/to/metabase.db")
           (copy.h2/h2-data-source "/path/to/metabase.db"))))

  (testing "works with file: schema"
    (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:h2:file:/path/to/metabase.db")
           (copy.h2/h2-data-source "file:/path/to/metabase.db"))))

  (testing "works with .mv.db suffix"
    (is (= (mdb.data-source/raw-connection-string->DataSource "jdbc:h2:file:/path/to/metabase.db")
           (copy.h2/h2-data-source "file:/path/to/metabase.db.mv.db")))))
