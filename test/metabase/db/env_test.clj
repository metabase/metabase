(ns metabase.db.env-test
  (:require [clojure.test :refer :all]
            [metabase.db.env :as mdb.env]))

(deftest raw-connection-string->type-test
  (are [s expected] (= expected (#'mdb.env/raw-connection-string->type s))
    "jdbc:postgres:wow"   :postgres
    "postgres:wow"        :postgres
    "jdbc:postgresql:wow" :postgres
    "postgresql:wow"      :postgres))
