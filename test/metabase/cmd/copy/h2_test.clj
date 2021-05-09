(ns metabase.cmd.copy.h2-test
  (:require [metabase.cmd.copy.h2 :as copy.h2]
            [clojure.test :refer :all]))

(deftest h2-jdbc-spec-test
  (testing "works without file: schema"
    (is (= {:classname   "org.h2.Driver"
            :subprotocol "h2"
            :subname     "file:/path/to/metabase.db"}
           (copy.h2/h2-jdbc-spec "/path/to/metabase.db"))))

  (testing "works with file: schema"
    (is (= {:classname "org.h2.Driver"
            :subprotocol "h2"
            :subname     "file:/path/to/metabase.db"}
           (copy.h2/h2-jdbc-spec "file:/path/to/metabase.db"))))

  (testing "works with .mv.db suffix"
    (is (= {:classname "org.h2.Driver"
            :subprotocol "h2"
            :subname     "file:/path/to/metabase.db"}
           (copy.h2/h2-jdbc-spec "file:/path/to/metabase.db.mv.db")))))
